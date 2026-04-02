param(
    [string]$CsvPath = ".\sftp\mocked_transactions.csv",
    [string]$SshKeyPath = "$HOME\.ssh\crm-sftp-partner1",
    [string]$SftpEndpoint = "",
    [string]$SftpUsername = "",
    [string]$BucketName = "",
    [string]$BucketPrefix = "incoming/",
    [string]$CollectorFunctionName = "",
    [string]$ApiBaseUrl = "https://api.itsag2t3.com",
    [string]$AuthHeader = "",
    [string]$BearerToken = "",
    [string]$TerraformDir = ".\platform\terraform",
    [string]$AwsRegion = "ap-southeast-1",
    [int]$S3CheckRetries = 20,
    [int]$S3CheckDelaySeconds = 3,
    [switch]$GenerateCsv,
    [int]$RowCount = 120,
    [int]$Seed = 301,
    [switch]$SkipBlankImportCheck,
    [switch]$TemporarilyAllowCurrentIp,
    [string]$SftpSecurityGroupId = "",
    [string]$PublicIpLookupUrl = "https://checkip.amazonaws.com"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Fail {
    param([string]$Message)
    throw $Message
}

function Get-TerraformOutputRaw {
    param(
        [string]$OutputName,
        [string]$TfDir
    )
    $result = terraform -chdir="$TfDir" output -raw $OutputName 2>$null
    if ($LASTEXITCODE -ne 0) {
        return ""
    }
    return ($result | Out-String).Trim()
}

function Ensure-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "Required command '$Name' not found in PATH."
    }
}

function Get-PublicIpv4 {
    param([string]$LookupUrl)
    try {
        $value = (Invoke-RestMethod -Uri $LookupUrl -Method Get -TimeoutSec 10 | Out-String).Trim()
    }
    catch {
        Fail "Unable to determine public IP from '$LookupUrl'."
    }
    if ($value -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
        Fail "Public IP lookup returned an unexpected value: '$value'"
    }
    return $value
}

function Resolve-SftpSecurityGroupId {
    param(
        [string]$ExplicitGroupId,
        [string]$Endpoint,
        [string]$Region
    )
    if (-not [string]::IsNullOrWhiteSpace($ExplicitGroupId)) {
        return $ExplicitGroupId.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($Endpoint)) {
        return ""
    }

    $candidateIps = [System.Collections.Generic.List[string]]::new()
    $trimmedEndpoint = $Endpoint.Trim()
    if ($trimmedEndpoint -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $candidateIps.Add($trimmedEndpoint)
    }
    else {
        try {
            $resolved = Resolve-DnsName -Name $trimmedEndpoint -ErrorAction Stop |
                Where-Object { $_.Type -eq "A" -and $_.IPAddress } |
                Select-Object -ExpandProperty IPAddress -Unique
            foreach ($ip in $resolved) {
                $candidateIps.Add($ip)
            }
        }
        catch {
            return ""
        }
    }

    foreach ($ip in $candidateIps) {
        $sgId = aws ec2 describe-network-interfaces `
            --region $Region `
            --filters "Name=association.public-ip,Values=$ip" `
            --query "NetworkInterfaces[0].Groups[0].GroupId" `
            --output text 2>$null
        if ($LASTEXITCODE -eq 0) {
            $value = ($sgId | Out-String).Trim()
            if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne "None") {
                return $value
            }
        }
    }
    return ""
}

Ensure-Command "aws"
Ensure-Command "sftp"
Ensure-Command "terraform"
Ensure-Command "python"

$env:AWS_REGION = $AwsRegion
$env:AWS_DEFAULT_REGION = $AwsRegion

$temporaryIngressAdded = $false
$temporaryIngressCidr = ""
$temporaryIngressSgId = ""

try {
    if ($GenerateCsv) {
        Write-Step "Generating CSV fixture via sftp/mock_transactions.py"
        $generatorArgs = @(
            ".\sftp\mock_transactions.py",
            "--output", $CsvPath,
            "--row-count", "$RowCount",
            "--seed", "$Seed"
        )
        & python @generatorArgs
        if ($LASTEXITCODE -ne 0) {
            Fail "CSV generation failed."
        }
        Write-Ok "CSV generated at '$CsvPath'"
    }

    if (-not (Test-Path -LiteralPath $CsvPath)) {
        Fail "CSV file not found: $CsvPath"
    }
    if (-not (Test-Path -LiteralPath $SshKeyPath)) {
        Fail "SSH key file not found: $SshKeyPath"
    }

    Write-Step "Resolving runtime values (explicit args -> Terraform outputs)"
    if ([string]::IsNullOrWhiteSpace($SftpEndpoint)) {
        $SftpEndpoint = Get-TerraformOutputRaw -OutputName "sftp_endpoint" -TfDir $TerraformDir
    }
    if ([string]::IsNullOrWhiteSpace($SftpUsername)) {
        $SftpUsername = Get-TerraformOutputRaw -OutputName "sftp_username" -TfDir $TerraformDir
    }
    if ([string]::IsNullOrWhiteSpace($BucketName)) {
        $BucketName = Get-TerraformOutputRaw -OutputName "transaction_sftp_bucket_name" -TfDir $TerraformDir
    }
    if ([string]::IsNullOrWhiteSpace($CollectorFunctionName)) {
        $CollectorFunctionName = Get-TerraformOutputRaw -OutputName "sftp_transaction_collector_name" -TfDir $TerraformDir
    }

    if ([string]::IsNullOrWhiteSpace($SftpEndpoint)) { Fail "Unable to resolve SFTP endpoint." }
    if ([string]::IsNullOrWhiteSpace($SftpUsername)) { Fail "Unable to resolve SFTP username." }
    if ([string]::IsNullOrWhiteSpace($BucketName)) { Fail "Unable to resolve transaction S3 bucket." }
    if ([string]::IsNullOrWhiteSpace($CollectorFunctionName)) { Fail "Unable to resolve collector Lambda function name." }

    if (-not $BucketPrefix.EndsWith("/")) {
        $BucketPrefix = "$BucketPrefix/"
    }

    if ($TemporarilyAllowCurrentIp) {
        $currentIp = Get-PublicIpv4 -LookupUrl $PublicIpLookupUrl
        $resolvedSgId = Resolve-SftpSecurityGroupId -ExplicitGroupId $SftpSecurityGroupId -Endpoint $SftpEndpoint -Region $AwsRegion
        if ([string]::IsNullOrWhiteSpace($resolvedSgId)) {
            Fail "Unable to resolve SFTP security group ID. Provide -SftpSecurityGroupId explicitly."
        }

        $temporaryIngressSgId = $resolvedSgId
        $temporaryIngressCidr = "$currentIp/32"
        Write-Step "Temporarily allowing current IP '$temporaryIngressCidr' on SFTP SG '$temporaryIngressSgId' (tcp/22)"

        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $authOut = aws ec2 authorize-security-group-ingress `
            --group-id $temporaryIngressSgId `
            --region $AwsRegion `
            --protocol tcp `
            --port 22 `
            --cidr $temporaryIngressCidr 2>&1
        $ErrorActionPreference = $previousPreference

        if ($LASTEXITCODE -ne 0) {
            $authText = ($authOut | Out-String)
            if ($authText -match "InvalidPermission\.Duplicate") {
                Write-Warn "Ingress rule for $temporaryIngressCidr already exists. Continuing without temporary rule tracking."
            }
            else {
                Fail "Failed to authorize temporary SFTP ingress: $authText"
            }
        }
        else {
            $temporaryIngressAdded = $true
            Write-Ok "Temporary ingress added."
        }
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $remoteFileName = "transactions-$timestamp.csv"
    $s3Key = "$BucketPrefix$remoteFileName"

    Write-Host "  SFTP endpoint:      $SftpEndpoint"
    Write-Host "  SFTP username:      $SftpUsername"
    Write-Host "  S3 bucket:          $BucketName"
    Write-Host "  S3 key:             $s3Key"
    Write-Host "  Collector function: $CollectorFunctionName"

    Write-Step "Uploading CSV to SFTP"
    $batchFile = New-TemporaryFile
    try {
        Set-Content -LiteralPath $batchFile -Value @(
            "put `"$CsvPath`" `"$remoteFileName`"",
            "bye"
        ) -Encoding ascii

        & sftp -i $SshKeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -b $batchFile "$SftpUsername@$SftpEndpoint"
        if ($LASTEXITCODE -ne 0) {
            Fail "SFTP upload failed."
        }
    }
    finally {
        Remove-Item -LiteralPath $batchFile -Force -ErrorAction SilentlyContinue
    }
    Write-Ok "SFTP upload completed"

    Write-Step "Verifying object appears in s3://$BucketName/$s3Key"
    $found = $false
    for ($i = 1; $i -le $S3CheckRetries; $i++) {
        aws s3api head-object --bucket $BucketName --key $s3Key *> $null
        if ($LASTEXITCODE -eq 0) {
            $found = $true
            break
        }
        Start-Sleep -Seconds $S3CheckDelaySeconds
    }
    if (-not $found) {
        Fail "Object did not appear in S3 after $S3CheckRetries retries."
    }
    Write-Ok "Object exists in S3"

    $logStartMs = [int64]([DateTimeOffset]::UtcNow.AddSeconds(-5).ToUnixTimeMilliseconds())

    Write-Step "Invoking collector Lambda once"
    $invokeOut = Join-Path $env:TEMP "collector-invoke-$timestamp.json"
    aws lambda invoke --function-name $CollectorFunctionName --payload '{}' $invokeOut --cli-binary-format raw-in-base64-out | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Fail "Collector Lambda invocation failed."
    }
    $collectorResultRaw = Get-Content -LiteralPath $invokeOut -Raw
    try {
        $collectorResult = $collectorResultRaw | ConvertFrom-Json
    }
    catch {
        Fail "Collector invoke output was not valid JSON: $collectorResultRaw"
    }
    Write-Ok "Collector invoked (statusCode=$($collectorResult.statusCode))"

    Write-Step "Checking collector logs for selected CSV + import API response"
    Start-Sleep -Seconds 4
    $logGroup = "/aws/lambda/$CollectorFunctionName"
    $logsRaw = aws logs filter-log-events --log-group-name $logGroup --start-time $logStartMs --query "events[].message" --output text
    if ($LASTEXITCODE -ne 0) {
        Fail "Failed to read collector logs from $logGroup"
    }
    $logsText = ($logsRaw | Out-String)

    if ($logsText -notmatch [regex]::Escape($remoteFileName)) {
        Fail "Collector logs do not reference uploaded file '$remoteFileName'."
    }
    if ($logsText -notmatch "Latest CSV selected") {
        Fail "Collector logs do not show 'Latest CSV selected'."
    }
    if ($logsText -notmatch "Import API response status=") {
        Fail "Collector logs do not show import API response status."
    }
    Write-Ok "Collector logs confirm selection + import call"

    if (-not $SkipBlankImportCheck) {
        Write-Step "Verifying blank-source manual import does not fail with 'failed to read source'"
        $headers = @{ "Content-Type" = "application/json" }
        if (-not [string]::IsNullOrWhiteSpace($AuthHeader)) {
            $headers["Authorization"] = $AuthHeader
        }
        elseif (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
            $headers["Authorization"] = "Bearer $BearerToken"
        }
        else {
            Write-Warn "No auth token/header provided. Skipping blank import API check."
            $SkipBlankImportCheck = $true
        }
    }

    if (-not $SkipBlankImportCheck) {
        $importUrl = "$($ApiBaseUrl.TrimEnd('/'))/api/transactions/import"
        $importResponse = Invoke-RestMethod -Uri $importUrl -Method Post -Headers $headers -Body "{}"
        if (-not $importResponse.importBatchId) {
            Fail "Import API did not return importBatchId."
        }
        $batchId = $importResponse.importBatchId
        Write-Host "  importBatchId: $batchId"

        $batchUrl = "$($ApiBaseUrl.TrimEnd('/'))/api/transactions/imports/$batchId"
        $batch = $null
        for ($attempt = 1; $attempt -le 10; $attempt++) {
            $batch = Invoke-RestMethod -Uri $batchUrl -Method Get -Headers $headers
            if ($batch.status -ne "running") { break }
            Start-Sleep -Seconds 2
        }
        if ($null -eq $batch) {
            Fail "Unable to fetch import batch status."
        }
        if ($batch.status -eq "failed" -and $batch.errorMessage -eq "failed to read source") {
            Fail "Blank source import still fails with 'failed to read source'."
        }
        Write-Ok "Blank source import check passed (status=$($batch.status), error=$($batch.errorMessage))"
    }

    Write-Host ""
    Write-Host "[SUCCESS] End-to-end SFTP -> S3 -> collector verification completed." -ForegroundColor Green
    Write-Host "  Uploaded file:   $remoteFileName"
    Write-Host "  S3 object:       s3://$BucketName/$s3Key"
    Write-Host "  Collector logs:  $logGroup"
}
catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($temporaryIngressAdded -and `
        -not [string]::IsNullOrWhiteSpace($temporaryIngressSgId) -and `
        -not [string]::IsNullOrWhiteSpace($temporaryIngressCidr)) {
        Write-Step "Revoking temporary SFTP ingress '$temporaryIngressCidr' from SG '$temporaryIngressSgId'"
        aws ec2 revoke-security-group-ingress `
            --group-id $temporaryIngressSgId `
            --region $AwsRegion `
            --protocol tcp `
            --port 22 `
            --cidr $temporaryIngressCidr *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Temporary ingress revoked."
        }
        else {
            Write-Warn "Failed to revoke temporary ingress automatically. Revoke manually: aws ec2 revoke-security-group-ingress --group-id $temporaryIngressSgId --region $AwsRegion --protocol tcp --port 22 --cidr $temporaryIngressCidr"
        }
    }
}
