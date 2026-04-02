param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,

    [string]$UserPoolId = "ap-southeast-1_xQy22Zmyi",
    [string]$Region = "ap-southeast-1",
    [string]$OutputCredentialsMarkdownPath = "",
    [switch]$ResetTempPasswordForExisting,
    [switch]$DryRun,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-AwsJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$SilenceStderr
    )

    if ($SilenceStderr) {
        $raw = & aws @Arguments 2>$null
    } else {
        $raw = & aws @Arguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')"
    }
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }
    return $raw | ConvertFrom-Json
}

function Normalize-RoleToGroup {
    param(
        [string]$Role
    )

    if ([string]::IsNullOrWhiteSpace($Role)) {
        return "USER"
    }

    switch ($Role.Trim().ToUpperInvariant()) {
        "SUPER_ADMIN" { return "SUPER_ADMIN" }
        "ADMIN" { return "ADMIN" }
        "USER" { return "USER" }
        default { return "USER" }
    }
}

function New-TemporaryPassword {
    $guid = [Guid]::NewGuid().ToString("N")
    $special = "!"
    return "Tmp$special$($guid.Substring(0, 8))Aa1$($guid.Substring(8, 4))"
}

$resolvedCsvPath = Resolve-Path -LiteralPath $CsvPath
$rows = Import-Csv -LiteralPath $resolvedCsvPath

if (-not $rows -or $rows.Count -eq 0) {
    throw "CSV is empty: $resolvedCsvPath"
}

Write-Host "Loaded $($rows.Count) user row(s) from $resolvedCsvPath"
Write-Host "Target user pool: $UserPoolId ($Region)"
if ($DryRun) {
    Write-Host "Dry-run mode enabled: no changes will be made."
}

$created = 0
$skippedExisting = 0
$failed = 0
$credentialRows = @()

for ($i = 0; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    $email = "$($row.email)".Trim().ToLowerInvariant()
    $firstName = "$($row.first_name)".Trim()
    $lastName = "$($row.last_name)".Trim()
    $group = Normalize-RoleToGroup -Role "$($row.role)"
    $status = "$($row.status)".Trim().ToUpperInvariant()

    if ([string]::IsNullOrWhiteSpace($email)) {
        Write-Warning "Row $($i + 1): missing email. Skipping."
        $failed++
        continue
    }

    if ([string]::IsNullOrWhiteSpace($firstName)) { $firstName = "Unknown" }
    if ([string]::IsNullOrWhiteSpace($lastName)) { $lastName = "User" }
    $fullName = "$firstName $lastName".Trim()

    Write-Host ""
    Write-Host "[$($i + 1)/$($rows.Count)] $email | role=$group | status=$status"

    if (-not $NonInteractive -and -not $DryRun) {
        $answer = Read-Host "Create/ensure this Cognito user? (y/N)"
        if ($answer -notin @("y", "Y", "yes", "YES")) {
            Write-Host "Skipped by operator."
            continue
        }
    }

    try {
        $existing = $null
        try {
            $existing = Invoke-AwsJson -Arguments @(
                "cognito-idp", "admin-get-user",
                "--region", $Region,
                "--user-pool-id", $UserPoolId,
                "--username", $email,
                "--output", "json"
            ) -SilenceStderr
        } catch {
            $existing = $null
        }

        if ($existing) {
            Write-Host "User already exists in Cognito, skipping create."
            $skippedExisting++
            $existingTempPassword = ""
            $existingNotes = "No new password generated."
            $existingResult = "already_exists"

            if ($ResetTempPasswordForExisting) {
                $existingTempPassword = New-TemporaryPassword
                $setPwdArgs = @(
                    "cognito-idp", "admin-set-user-password",
                    "--region", $Region,
                    "--user-pool-id", $UserPoolId,
                    "--username", $email,
                    "--password", $existingTempPassword,
                    "--no-permanent"
                )
                if ($DryRun) {
                    Write-Host "[dry-run] aws $($setPwdArgs -join ' ')"
                } else {
                    & aws @setPwdArgs | Out-Null
                    if ($LASTEXITCODE -ne 0) {
                        throw "Failed admin-set-user-password for existing user $email"
                    }
                    Write-Host "Set new temporary password for existing user."
                }
                $existingResult = "existing_temp_password_reset"
                $existingNotes = "Temporary password reset; user must change password at first Cognito sign-in."
            }

            $credentialRows += [PSCustomObject]@{
                Email             = $email
                Group             = $group
                SourceStatus      = $status
                Result            = $existingResult
                TemporaryPassword = $existingTempPassword
                Notes             = $existingNotes
            }
        } else {
            $tempPassword = New-TemporaryPassword
            $createArgs = @(
                "cognito-idp", "admin-create-user",
                "--region", $Region,
                "--user-pool-id", $UserPoolId,
                "--username", $email,
                "--temporary-password", $tempPassword,
                "--message-action", "SUPPRESS",
                "--user-attributes",
                "Name=email,Value=$email",
                "Name=email_verified,Value=true",
                "Name=name,Value=$fullName",
                "--output", "json"
            )

            if ($DryRun) {
                Write-Host "[dry-run] aws $($createArgs -join ' ')"
            } else {
                Invoke-AwsJson -Arguments $createArgs | Out-Null
                Write-Host "Created Cognito user (SUPPRESS invite)."
                $created++
                $credentialRows += [PSCustomObject]@{
                    Email             = $email
                    Group             = $group
                    SourceStatus      = $status
                    Result            = "created"
                    TemporaryPassword = $tempPassword
                    Notes             = "User must set/reset password before normal sign-in."
                }
            }
        }

        $addGroupArgs = @(
            "cognito-idp", "admin-add-user-to-group",
            "--region", $Region,
            "--user-pool-id", $UserPoolId,
            "--username", $email,
            "--group-name", $group
        )
        if ($DryRun) {
            Write-Host "[dry-run] aws $($addGroupArgs -join ' ')"
        } else {
            & aws @addGroupArgs | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Failed add-to-group for $email -> $group"
            }
            Write-Host "Ensured group membership: $group"
        }

        if ($status -in @("DISABLED", "INACTIVE", "DELETED")) {
            $disableArgs = @(
                "cognito-idp", "admin-disable-user",
                "--region", $Region,
                "--user-pool-id", $UserPoolId,
                "--username", $email
            )
            if ($DryRun) {
                Write-Host "[dry-run] aws $($disableArgs -join ' ')"
            } else {
                & aws @disableArgs | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed disable-user for $email"
                }
                Write-Host "Disabled user to match source status."
            }
        }
    } catch {
        Write-Error "Failed row $($i + 1) ($email): $_"
        $failed++
    }
}

Write-Host ""
Write-Host "Backfill summary"
Write-Host "Created:          $created"
Write-Host "Skipped existing: $skippedExisting"
Write-Host "Failed:           $failed"
if ($DryRun) {
    Write-Host "Dry-run complete."
}

if ([string]::IsNullOrWhiteSpace($OutputCredentialsMarkdownPath)) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputCredentialsMarkdownPath = "scripts/aws/backfill-cognito-credentials-$timestamp.md"
}

$reportDir = Split-Path -Path $OutputCredentialsMarkdownPath -Parent
if (-not [string]::IsNullOrWhiteSpace($reportDir) -and -not (Test-Path -LiteralPath $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Cognito Backfill Credentials Report")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- Generated at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
[void]$sb.AppendLine("- User pool: $UserPoolId")
[void]$sb.AppendLine("- Region: $Region")
[void]$sb.AppendLine("- DryRun: $DryRun")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Email | Group | Source Status | Result | Temporary Password | Notes |")
[void]$sb.AppendLine("|---|---|---|---|---|---|")

foreach ($r in $credentialRows) {
    $pw = if ([string]::IsNullOrWhiteSpace($r.TemporaryPassword)) { "N/A" } else { $r.TemporaryPassword }
    [void]$sb.AppendLine("| $($r.Email) | $($r.Group) | $($r.SourceStatus) | $($r.Result) | $pw | $($r.Notes) |")
}

if ($credentialRows.Count -eq 0) {
    [void]$sb.AppendLine("| (none) |  |  |  |  | No users processed. |")
}

Set-Content -LiteralPath $OutputCredentialsMarkdownPath -Value $sb.ToString() -Encoding UTF8
Write-Host "Credentials report written to: $OutputCredentialsMarkdownPath"
