param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$SetupArgs
)

$ErrorActionPreference = "Stop"

function Get-PythonCandidate {
    $candidates = @(
        @{ Command = "python"; Args = @() },
        @{ Command = "py"; Args = @("-3") }
    )

    foreach ($candidate in $candidates) {
        try {
            $cmd = Get-Command $candidate.Command -ErrorAction Stop
            $versionOutput = & $cmd.Source @($candidate.Args + @("--version")) 2>&1
            $versionText = ($versionOutput | Select-Object -First 1).ToString()
            $match = [regex]::Match($versionText, "(\d+)\.(\d+)\.(\d+)")
            if (-not $match.Success) {
                continue
            }

            $major = [int]$match.Groups[1].Value
            $minor = [int]$match.Groups[2].Value
            $patch = [int]$match.Groups[3].Value

            return @{
                Path = $cmd.Source
                Command = $candidate.Command
                Args = $candidate.Args
                Major = $major
                Minor = $minor
                Patch = $patch
                VersionText = "$major.$minor.$patch"
            }
        }
        catch {
            continue
        }
    }

    return $null
}

function Show-PythonInstallHelp {
    Write-Host ""
    Write-Host "[ERROR] Python 3.12+ is required before running setup."
    Write-Host "Install path (Windows):"
    Write-Host "  1) Run: winget install Python.Python.3.12"
    Write-Host "  2) Restart terminal"
    Write-Host "  3) Verify: python --version && python -m pip --version"
    Write-Host ""
    Write-Host "If Windows opens the Microsoft Store for python/python3:"
    Write-Host "  Settings > Apps > Advanced app settings > App execution aliases"
    Write-Host "  Disable python.exe and python3.exe aliases."
    Write-Host ""
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$setupScript = Join-Path $repoRoot "scripts/pipelines/setup_dev_env.py"

if (-not (Test-Path $setupScript)) {
    Write-Host "[ERROR] Missing setup script: $setupScript"
    exit 1
}

$python = Get-PythonCandidate
if ($null -eq $python) {
    Show-PythonInstallHelp
    exit 1
}

if ($python.Major -lt 3 -or ($python.Major -eq 3 -and $python.Minor -lt 12)) {
    Write-Host ""
    Write-Host "[ERROR] Found Python $($python.VersionText), but 3.12+ is required."
    Write-Host "Please upgrade Python and re-run this script."
    Show-PythonInstallHelp
    exit 1
}

Write-Host "[OK] Using Python $($python.VersionText) via '$($python.Command)'."
Write-Host "Running developer setup..."
& $python.Path @($python.Args + @($setupScript) + $SetupArgs)
exit $LASTEXITCODE
