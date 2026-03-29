param(
    [string]$ApiKey = "",
    [string]$TerraformPath = "platform/terraform",
    [string]$UsageFile = "",
    [int]$TopResources = 20,
    [string]$OutputMarkdown = "platform/terraform/.infracost/infracost-report.md"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pythonScript = Join-Path $repoRoot "scripts\pipelines\infracost_local_report.py"

if (-not (Test-Path -LiteralPath $pythonScript)) {
    throw "Python report script not found: $pythonScript"
}

if ($ApiKey) {
    $env:INFRACOST_API_KEY = $ApiKey
}

$python = Get-Command python -ErrorAction SilentlyContinue
$usePyLauncher = $false
if (-not $python) {
    $python = Get-Command py -ErrorAction SilentlyContinue
    $usePyLauncher = $true
}
if (-not $python) {
    throw "Python was not found in PATH. Install Python 3 and retry."
}

$args = @(
    $pythonScript,
    "--terraform-path", $TerraformPath,
    "--top-resources", "$TopResources",
    "--output-markdown", $OutputMarkdown
)

if ($UsageFile) {
    $args += @("--usage-file", $UsageFile)
}

if ($usePyLauncher) {
    & $python.Source -3 @args
}
else {
    & $python.Source @args
}

exit $LASTEXITCODE
