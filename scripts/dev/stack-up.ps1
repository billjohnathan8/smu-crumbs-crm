# PowerShell wrapper for stack-up.sh
# Ensures bash scripts run properly from PowerShell terminal

$ErrorActionPreference = "Stop"

# Find bash executable (Git Bash, WSL, etc.)
$bashCmd = $null
$bashPaths = @(
    "bash",                                                    # If in PATH
    "C:\Program Files\Git\bin\bash.exe",                       # Standard Git for Windows
    "C:\Program Files (x86)\Git\bin\bash.exe",                 # 32-bit Git
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"              # User install
)

foreach ($path in $bashPaths) {
    if (Get-Command $path -ErrorAction SilentlyContinue) {
        $bashCmd = $path
        break
    }
}

if (-not $bashCmd) {
    Write-Error "Bash not found. Please install Git for Windows from https://git-scm.com/download/win"
    exit 1
}

Write-Host "Using bash: $bashCmd" -ForegroundColor Cyan

# Run the bash script from repository root
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
    & $bashCmd "scripts/dev/stack-up.sh"
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
