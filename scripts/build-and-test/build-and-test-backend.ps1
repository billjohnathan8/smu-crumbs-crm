Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# Ensure native commands (docker/gradle) are handled via exit codes, not terminating errors.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$HealthyRunWindowSeconds = 20

function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
}

function Invoke-CommandChecked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw $ErrorMessage
    }
}

function Get-ServiceType {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServicePath
    )

    if (Test-Path (Join-Path $ServicePath "gradlew.bat")) {
        return "gradle"
    }

    if ((Test-Path (Join-Path $ServicePath "requirements.txt")) -and (Test-Path (Join-Path $ServicePath "tests"))) {
        return "python"
    }

    return $null
}

function Get-PythonCommand {
    $candidates = @("python", "py")
    foreach ($candidate in $candidates) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }

    return $null
}

function Get-DockerMappedPort {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ContainerName,
        [string]$ContainerPort = "8080/tcp"
    )

    $mapping = (& docker port $ContainerName $ContainerPort 2>$null | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($mapping)) {
        return $null
    }

    $parts = $mapping.Trim().Split(":")
    if ($parts.Count -lt 2) {
        return $null
    }

    return $parts[$parts.Count - 1]
}

function Wait-ForContainerHealthyWindow {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ContainerName,
        [int]$WindowSeconds = 20,
        [int]$NoHealthGraceSeconds = 8
    )

    $started = Get-Date
    $healthyObserved = $false

    while (((Get-Date) - $started).TotalSeconds -lt $WindowSeconds) {
        $elapsed = ((Get-Date) - $started).TotalSeconds
        $running = (& docker inspect -f "{{.State.Running}}" $ContainerName 2>$null).Trim()
        if ($running -ne "true") {
            return @{ Success = $false; Reason = "container stopped before ${WindowSeconds}s window elapsed" }
        }

        $health = (& docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" $ContainerName 2>$null).Trim()
        if ($health -eq "healthy") {
            $healthyObserved = $true
        }
        elseif ($health -eq "unhealthy") {
            return @{ Success = $false; Reason = "container reported unhealthy" }
        }
        elseif ($health -eq "none" -and $elapsed -ge $NoHealthGraceSeconds) {
            $healthyObserved = $true
        }

        Start-Sleep -Seconds 2
    }

    if (-not $healthyObserved) {
        return @{ Success = $false; Reason = "container never reached healthy/running criteria within ${WindowSeconds}s" }
    }

    return @{ Success = $true; Reason = "container stayed healthy/running for ${WindowSeconds}s" }
}

function Test-HttpHealthOnce {
    param(
        [Parameter(Mandatory = $true)]
        [int]$HostPort
    )

    $paths = @("/api/v1/health", "/actuator/health", "/health")
    foreach ($path in $paths) {
        try {
            $response = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}{1}" -f $HostPort, $path) -Method Get -UseBasicParsing -TimeoutSec 4
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return $true
            }
        }
        catch {
            # Best-effort probe only.
        }
    }

    return $false
}

function Test-RequiresPostgres {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServicePath,
        [Parameter(Mandatory = $true)]
        [string]$ServiceType
    )

    $buildGradle = Join-Path $ServicePath "build.gradle"
    $applicationYaml = Join-Path $ServicePath "src\main\resources\application.yaml"
    $requirementsTxt = Join-Path $ServicePath "requirements.txt"
    $configPy = Join-Path $ServicePath "app\config.py"

    if ($ServiceType -eq "gradle" -and (Test-Path $buildGradle)) {
        if (Select-String -Path $buildGradle -Pattern "postgresql" -SimpleMatch -Quiet) {
            return $true
        }
    }

    if ($ServiceType -eq "gradle" -and (Test-Path $applicationYaml)) {
        if (Select-String -Path $applicationYaml -Pattern "datasource|postgresql" -Quiet) {
            return $true
        }
    }

    if ($ServiceType -eq "python" -and (Test-Path $requirementsTxt)) {
        if (Select-String -Path $requirementsTxt -Pattern "psycopg|postgres" -Quiet) {
            return $true
        }
    }

    if ($ServiceType -eq "python" -and (Test-Path $configPy)) {
        if (Select-String -Path $configPy -Pattern "DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD" -Quiet) {
            return $true
        }
    }

    return $false
}

function Test-DockerServiceHealthy {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServiceName,
        [Parameter(Mandatory = $true)]
        [string]$ServicePath,
        [Parameter(Mandatory = $true)]
        [string]$ServiceType
    )

    $safeName = ($ServiceName.ToLower() -replace "[^a-z0-9]+", "-").Trim("-")
    $suffix = Get-Date -Format "yyyyMMddHHmmss"
    $imageTag = "local/${safeName}:ci-$suffix"
    $appContainer = "ci-$safeName-app-$suffix"
    $networkName = "ci-$safeName-net-$suffix"
    $dbContainer = "ci-$safeName-db-$suffix"
    $dbName = $safeName -replace "-", "_"
    $requiresPostgres = Test-RequiresPostgres -ServicePath $ServicePath -ServiceType $ServiceType
    $port = $null

    try {
        if ($requiresPostgres) {
            Write-Log "[$ServiceName] Docker dependency: starting PostgreSQL sidecar"
            Invoke-CommandChecked -ErrorMessage "Failed to create Docker network" -Command { docker network create $networkName | Out-Null }
            Invoke-CommandChecked -ErrorMessage "Failed to start PostgreSQL container" -Command {
                docker run -d --name $dbContainer --network $networkName `
                    -e POSTGRES_USER=postgres `
                    -e POSTGRES_PASSWORD=postgres `
                    -e POSTGRES_DB=$dbName `
                    postgres:16-alpine | Out-Null
            }

            $dbReady = $false
            for ($i = 0; $i -lt 30; $i++) {
                & docker exec $dbContainer pg_isready -U postgres -d $dbName | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $dbReady = $true
                    break
                }
                Start-Sleep -Seconds 2
            }

            if (-not $dbReady) {
                throw "PostgreSQL sidecar did not become ready in time"
            }
        }

        Write-Log "[$ServiceName] Docker image build started"
        Push-Location $ServicePath
        try {
            Invoke-CommandChecked -ErrorMessage "Docker image build failed" -Command {
                docker build -t $imageTag .
            }
        }
        finally {
            Pop-Location
        }
        Write-Log "[$ServiceName] Docker image build passed"

        Write-Log "[$ServiceName] Docker container run started"
        if ($requiresPostgres) {
            if ($ServiceType -eq "gradle") {
                $datasourceUrl = "jdbc:postgresql://${dbContainer}:5432/$dbName"
                Invoke-CommandChecked -ErrorMessage "Docker container start failed" -Command {
                    docker run -d --name $appContainer --network $networkName -P `
                        -e "SPRING_DATASOURCE_URL=$datasourceUrl" `
                        -e "SPRING_DATASOURCE_USERNAME=postgres" `
                        -e "SPRING_DATASOURCE_PASSWORD=postgres" `
                        $imageTag | Out-Null
                }
            }
            elseif ($ServiceType -eq "python") {
                Invoke-CommandChecked -ErrorMessage "Docker container start failed" -Command {
                    docker run -d --name $appContainer --network $networkName -P `
                        -e "DB_HOST=$dbContainer" `
                        -e "DB_PORT=5432" `
                        -e "DB_NAME=$dbName" `
                        -e "DB_USER=postgres" `
                        -e "DB_PASSWORD=postgres" `
                        $imageTag | Out-Null
                }
            }
            else {
                throw "Unsupported service type for PostgreSQL wiring: $ServiceType"
            }
        }
        else {
            Invoke-CommandChecked -ErrorMessage "Docker container start failed" -Command {
                docker run -d --name $appContainer -P $imageTag | Out-Null
            }
        }

        $windowResult = Wait-ForContainerHealthyWindow -ContainerName $appContainer -WindowSeconds $HealthyRunWindowSeconds
        if (-not $windowResult.Success) {
            $exitCode = (& docker inspect -f "{{.State.ExitCode}}" $appContainer 2>$null | Select-Object -First 1).Trim()
            $stateError = (& docker inspect -f "{{.State.Error}}" $appContainer 2>$null | Select-Object -First 1).Trim()
            $logTail = (& docker logs --tail 60 $appContainer 2>&1) -join [Environment]::NewLine
            if ([string]::IsNullOrWhiteSpace($exitCode)) { $exitCode = "unknown" }
            if ([string]::IsNullOrWhiteSpace($stateError)) { $stateError = "none" }
            throw "Docker container health/run check failed ($($windowResult.Reason), exitCode=$exitCode, stateError=$stateError). Recent logs: $logTail"
        }
        Write-Log "[$ServiceName] $($windowResult.Reason)"

        $port = Get-DockerMappedPort -ContainerName $appContainer
        if ($port) {
            Write-Log "[$ServiceName] Docker container exposed on localhost:$port"
            if (Test-HttpHealthOnce -HostPort ([int]$port)) {
                Write-Log "[$ServiceName] HTTP health endpoint passed"
            }
            else {
                Write-Log "[$ServiceName] HTTP health endpoint not detected (best-effort probe)"
            }
        }
        else {
            Write-Log "[$ServiceName] No mapped HTTP port found, container is running and stable"
        }
    }
    finally {
        $oldEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & docker inspect $appContainer 1>$null 2>$null
            if ($LASTEXITCODE -eq 0) {
                & docker rm -f $appContainer 1>$null 2>$null
            }

            & docker inspect $dbContainer 1>$null 2>$null
            if ($LASTEXITCODE -eq 0) {
                & docker rm -f $dbContainer 1>$null 2>$null
            }

            & docker network inspect $networkName 1>$null 2>$null
            if ($LASTEXITCODE -eq 0) {
                & docker network rm $networkName 1>$null 2>$null
            }
        }
        finally {
            $ErrorActionPreference = $oldEap
        }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$backendRoot = Join-Path $repoRoot "services\backend"
$gradleUserHome = Join-Path $repoRoot ".gradle-user-home"

if (-not (Test-Path $gradleUserHome)) {
    New-Item -ItemType Directory -Path $gradleUserHome | Out-Null
}

$env:GRADLE_USER_HOME = $gradleUserHome

if (-not (Test-Path $backendRoot)) {
    Write-Log "Backend services directory not found: $backendRoot"
    exit 1
}

$services = Get-ChildItem -Path $backendRoot -Directory | ForEach-Object {
    $serviceType = Get-ServiceType -ServicePath $_.FullName
    if ($null -ne $serviceType) {
        [PSCustomObject]@{
            Name        = $_.Name
            FullName    = $_.FullName
            ServiceType = $serviceType
        }
    }
} | Sort-Object Name

if (-not $services) {
    Write-Log "No supported backend services found under $backendRoot"
    exit 1
}

$results = @()
$hasFailures = $false

Write-Log "Discovered $($services.Count) backend service(s):"
foreach ($discoveredService in $services) {
    Write-Log "  - $($discoveredService.Name) [$($discoveredService.ServiceType)]"
}

$pythonCommand = $null
$pythonServices = @($services | Where-Object { $_.ServiceType -eq "python" })
$pythonVenvRoot = Join-Path $repoRoot ".python-build-test-venvs"
if ($pythonServices.Count -gt 0) {
    $pythonCommand = Get-PythonCommand
    if (-not $pythonCommand) {
        Write-Log "Python service(s) detected but no Python runtime found in PATH."
        exit 1
    }

    if (-not (Test-Path $pythonVenvRoot)) {
        New-Item -ItemType Directory -Path $pythonVenvRoot | Out-Null
    }
}

$dockerAvailable = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
        & docker info 1>$null 2>$null
        $dockerAvailable = ($LASTEXITCODE -eq 0)
    }
    catch {
        $dockerAvailable = $false
    }
}

if (-not $dockerAvailable) {
    Write-Log "Docker is not available or daemon is not running. Docker health checks will fail."
}

foreach ($service in $services) {
    $servicePath = $service.FullName
    $serviceName = $service.Name
    $serviceType = $service.ServiceType
    $buildStatus = "PASS"
    $testStatus = "PASS"
    $dockerStatus = "PASS"

    Write-Log "==> Service: $serviceName [$serviceType]"

    Push-Location $servicePath
    try {
        if ($serviceType -eq "gradle") {
            Write-Log "[$serviceName] Build started"
            Invoke-CommandChecked -ErrorMessage "Build failed" -Command { .\gradlew.bat clean assemble --no-daemon --console=plain --gradle-user-home "$gradleUserHome" }
            Write-Log "[$serviceName] Build passed"

            Write-Log "[$serviceName] Unit tests started"
            Invoke-CommandChecked -ErrorMessage "Unit tests failed" -Command { .\gradlew.bat test --no-daemon --console=plain --gradle-user-home "$gradleUserHome" }
            Write-Log "[$serviceName] Unit tests passed"
        }
        elseif ($serviceType -eq "python") {
            $serviceVenvPath = Join-Path $pythonVenvRoot $serviceName
            $serviceVenvPython = Join-Path $serviceVenvPath "Scripts\python.exe"

            Write-Log "[$serviceName] Build started (Python environment setup)"
            Invoke-CommandChecked -ErrorMessage "Build failed" -Command { & $pythonCommand -m venv "$serviceVenvPath" }
            Invoke-CommandChecked -ErrorMessage "Build failed" -Command { & "$serviceVenvPython" -m pip install --upgrade pip }
            Invoke-CommandChecked -ErrorMessage "Build failed" -Command { & "$serviceVenvPython" -m pip install -r "requirements.txt" }
            Write-Log "[$serviceName] Build passed"

            Write-Log "[$serviceName] Unit tests started (pytest)"
            Invoke-CommandChecked -ErrorMessage "Unit tests failed" -Command { & "$serviceVenvPython" -m pytest -q }
            Write-Log "[$serviceName] Unit tests passed"
        }
        else {
            throw "Build failed: unsupported service type '$serviceType'"
        }
    }
    catch {
        $message = $_.Exception.Message
        if ($message -like "*Build failed*") {
            $buildStatus = "FAIL"
            $testStatus = "SKIP"
            $dockerStatus = "SKIP"
            Write-Log "[$serviceName] Build failed"
        }
        elseif ($message -like "*Unit tests failed*") {
            $testStatus = "FAIL"
            $dockerStatus = "SKIP"
            Write-Log "[$serviceName] Unit tests failed"
        }
        else {
            $buildStatus = "FAIL"
            $testStatus = "SKIP"
            $dockerStatus = "SKIP"
            Write-Log "[$serviceName] Unexpected error: $message"
        }
        $hasFailures = $true
    }
    finally {
        Pop-Location
    }

    if ($buildStatus -eq "PASS" -and $testStatus -eq "PASS") {
        $dockerfilePath = Join-Path $servicePath "Dockerfile"
        if (-not (Test-Path $dockerfilePath)) {
            $dockerStatus = "FAIL"
            $hasFailures = $true
            Write-Log "[$serviceName] Docker check failed: Dockerfile missing"
        }
        elseif (-not $dockerAvailable) {
            $dockerStatus = "FAIL"
            $hasFailures = $true
            Write-Log "[$serviceName] Docker check failed: Docker is unavailable"
        }
        else {
            try {
                Write-Log "[$serviceName] Docker health check started"
                Test-DockerServiceHealthy -ServiceName $serviceName -ServicePath $servicePath -ServiceType $serviceType
                Write-Log "[$serviceName] Docker health check passed"
            }
            catch {
                $dockerStatus = "FAIL"
                $hasFailures = $true
                Write-Log "[$serviceName] Docker health check failed: $($_.Exception.Message)"
            }
        }
    }

    $results += [PSCustomObject]@{
        Service = $serviceName
        Build   = $buildStatus
        Tests   = $testStatus
        Docker  = $dockerStatus
    }
}

Write-Host ""
Write-Log "Backend build/test summary"
$results | Format-Table -AutoSize

if ($hasFailures) {
    Write-Log "One or more services failed."
    exit 1
}

Write-Log "All backend services built, passed unit tests, and passed Docker health checks."
exit 0
