Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $env:SCRIPT_RUN_LOG_CAPTURED) {
    $scriptPath = $PSCommandPath
    $scriptName = [System.IO.Path]::GetFileNameWithoutExtension($scriptPath)
    $scriptDir = Split-Path -Parent $scriptPath
    $repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
    $logDir = Join-Path $repoRoot "build-logs\\build-and-test"
    $now = Get-Date
    $timestamp = $now.ToString("yyyyMMdd-HHmmss")
    $inverseTimestamp = "{0:D4}{1:D2}{2:D2}-{3:D2}{4:D2}{5:D2}" -f `
        (9999 - $now.Year), `
        (12 - $now.Month), `
        (31 - $now.Day), `
        (23 - $now.Hour), `
        (59 - $now.Minute), `
        (59 - $now.Second)
    $logFile = Join-Path $logDir "$scriptName-$inverseTimestamp-$timestamp.log"

    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir | Out-Null
    }

    $env:SCRIPT_RUN_LOG_CAPTURED = "1"
    $env:BUILD_LOG_FILE = $logFile

    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $hasNativePreference = $false
        $previousNativePreference = $null
        try {
            if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
                $hasNativePreference = $true
                $previousNativePreference = $PSNativeCommandUseErrorActionPreference
                $PSNativeCommandUseErrorActionPreference = $false
            }
            $ErrorActionPreference = "Continue"
            & (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File $scriptPath @args 2>&1 |
                ForEach-Object { $_.ToString() } |
                Tee-Object -FilePath $logFile
            $exitCode = $LASTEXITCODE
        }
        finally {
            if ($hasNativePreference) {
                $PSNativeCommandUseErrorActionPreference = $previousNativePreference
            }
            $ErrorActionPreference = $previousErrorActionPreference
        }
    }
    finally {
        Remove-Item Env:SCRIPT_RUN_LOG_CAPTURED -ErrorAction SilentlyContinue
        Remove-Item Env:BUILD_LOG_FILE -ErrorAction SilentlyContinue
    }

    exit $exitCode
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
}

if ($env:BUILD_LOG_FILE) {
    Write-Log "Build log file: $($env:BUILD_LOG_FILE)"
}

function Get-ServiceType {
    param([string]$ServicePath)

    if (Test-Path (Join-Path $ServicePath "gradlew.bat")) {
        return "gradle"
    }

    if (Test-Path (Join-Path $ServicePath "run-local-test-pipeline.py")) {
        return "python"
    }

    return $null
}

function Get-PythonCommand {
    foreach ($candidate in @("python", "py")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }

    return $null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$buildLogDir = Join-Path $repoRoot "build-logs\\build-and-test"
$backendRoot = Join-Path $repoRoot "services\backend"
$gradleUserHome = Join-Path $repoRoot ".gradle-user-home"

if (-not (Test-Path $backendRoot)) {
    Write-Log "Backend services directory not found: $backendRoot"
    exit 1
}

if (-not (Test-Path $gradleUserHome)) {
    New-Item -ItemType Directory -Path $gradleUserHome | Out-Null
}

$env:GRADLE_USER_HOME = $gradleUserHome

$services = @(Get-ChildItem -Path $backendRoot -Directory | ForEach-Object {
    $serviceType = Get-ServiceType -ServicePath $_.FullName
    if ($null -ne $serviceType) {
        [PSCustomObject]@{
            Name        = $_.Name
            FullName    = $_.FullName
            ServiceType = $serviceType
        }
    }
} | Sort-Object Name)

if (-not $services) {
    Write-Log "No supported backend services found under $backendRoot"
    exit 1
}

$pythonCommand = Get-PythonCommand
$pythonServices = @($services | Where-Object { $_.ServiceType -eq "python" })
if ($pythonServices.Count -gt 0 -and -not $pythonCommand) {
    Write-Log "Python service(s) detected but no Python runtime found in PATH."
    exit 1
}

Write-Log "Discovered $($services.Count) backend service(s):"
foreach ($service in $services) {
    Write-Log "  - $($service.Name) [$($service.ServiceType)]"
}

$results = @()
$hasFailures = $false

foreach ($service in $services) {
    $serviceName = $service.Name
    $servicePath = $service.FullName
    $serviceType = $service.ServiceType
    $status = "PASS"

    Write-Log "==> Service: $serviceName [$serviceType]"

    Push-Location $servicePath
    try {
        if ($serviceType -eq "gradle") {
            & .\gradlew.bat localTestPipeline --no-daemon --console=plain --gradle-user-home "$gradleUserHome"
            if ($LASTEXITCODE -ne 0) {
                throw "localTestPipeline failed"
            }
        }
        elseif ($serviceType -eq "python") {
            & $pythonCommand "run-local-test-pipeline.py"
            if ($LASTEXITCODE -ne 0) {
                throw "run-local-test-pipeline.py failed"
            }
        }
        else {
            throw "Unsupported service type '$serviceType'"
        }

        Write-Log "[$serviceName] Local pipeline passed"
    }
    catch {
        $status = "FAIL"
        $hasFailures = $true
        Write-Log "[$serviceName] Local pipeline failed: $($_.Exception.Message)"
    }
    finally {
        Pop-Location
    }

    $results += [PSCustomObject]@{
        Service = $serviceName
        Runtime = $serviceType
        Status  = $status
    }
}

Write-Host ""
Write-Log "Backend local test pipeline summary"
$results | Format-Table -AutoSize

try {
    $coverageIndexGenerator = Join-Path $repoRoot "scripts\build-and-test\generate-coverage-index.py"
    if (Test-Path $coverageIndexGenerator) {
        $pythonForReport = $pythonCommand
        if (-not $pythonForReport) {
            $pythonForReport = Get-PythonCommand
        }

        if ($pythonForReport) {
            Write-Log "Generating aggregated coverage report (build-logs/build-and-test/index.html)"
            $oldNoBytecode = $env:PYTHONDONTWRITEBYTECODE
            $env:PYTHONDONTWRITEBYTECODE = "1"
            $oldBuildLogDir = $env:BUILD_LOG_DIR
            $env:BUILD_LOG_DIR = $buildLogDir
            & $pythonForReport $coverageIndexGenerator
            $env:BUILD_LOG_DIR = $oldBuildLogDir
            $env:PYTHONDONTWRITEBYTECODE = $oldNoBytecode
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Coverage index generation failed (exitCode=$LASTEXITCODE)."
            }
        }
        else {
            Write-Log "Skipping aggregated coverage report generation: Python not available."
        }
    }
}
catch {
    Write-Log "Coverage index generation failed: $($_.Exception.Message)"
}

if ($hasFailures) {
    Write-Log "One or more services failed local pipeline checks."
    exit 1
}

Write-Log "All backend services passed lint, build, tests, and coverage report generation."
exit 0
