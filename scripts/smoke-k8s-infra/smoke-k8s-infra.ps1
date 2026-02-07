param()

$ErrorActionPreference = 'Stop'

$baseUrl = $env:BASE_URL
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    $baseUrl = 'http://localhost'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '../..')
$manifestsDir = Join-Path $repoRoot 'platform/k8s/apps/base'
$ingressYaml = Join-Path $manifestsDir 'ingress.yaml'
$kustomizationYaml = Join-Path $manifestsDir 'kustomization.yaml'

$ingressPathByService = @{}
$probePathByService = @{}
$serviceChecks = New-Object System.Collections.Generic.List[object]
$ingressPaths = New-Object System.Collections.Generic.List[string]
$ingressHealthPaths = New-Object System.Collections.Generic.List[string]
$baseHealthPaths = New-Object System.Collections.Generic.List[string]
$servicePortForwards = @{}
$portForwardProcess = $null
$portForwardLogOut = $null
$portForwardLogErr = $null
$ingressPort = 18080
$curlBaseUrl = $baseUrl
$curlHostHeaders = @()

function Get-FreePort([int]$start, [int]$end) {
    for ($port = $start; $port -le $end; $port++) {
        $inUse = netstat -ano | Select-String -Pattern (":$port\s")
        if (-not $inUse) { return $port }
    }
    return $start
}

function Start-PortForward([string]$namespace, [string]$service, [int]$localPort, [int]$remotePort) {
    $logOut = [System.IO.Path]::GetTempFileName()
    $logErr = [System.IO.Path]::GetTempFileName()
    $args = @('-n', $namespace, 'port-forward', "svc/$service", "$localPort`:$remotePort")
    $proc = Start-Process -FilePath 'kubectl' -ArgumentList $args -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr
    return @{ Process = $proc; LogOut = $logOut; LogErr = $logErr; Args = $args }
}

function Stop-ProcessSafe($proc) {
    if ($null -eq $proc) { return }
    try { $proc | Stop-Process -Force } catch {}
}

function Parse-IngressPaths {
    if (-not (Test-Path $ingressYaml)) { return }
    $currentPath = ''
    $insideBackend = $false
    $insideService = $false
    foreach ($line in Get-Content $ingressYaml) {
        if ($line -match '^\s*-\s*path:\s*([^\s]+)') {
            $currentPath = $Matches[1]
            if (-not $ingressPaths.Contains($currentPath)) { $ingressPaths.Add($currentPath) | Out-Null }
            $insideBackend = $false
            $insideService = $false
            continue
        }
        if ($currentPath -and $line -match '^\s*backend:') { $insideBackend = $true; continue }
        if ($insideBackend -and $line -match '^\s*service:') { $insideService = $true; continue }
        if ($insideService -and $line -match '^\s*name:\s*([^\s]+)') {
            $ingressPathByService[$Matches[1]] = $currentPath
            $currentPath = ''
            $insideBackend = $false
            $insideService = $false
        }
    }
}

function Parse-Deployments {
    if (-not (Test-Path $kustomizationYaml)) { return }
    foreach ($line in Get-Content $kustomizationYaml) {
        if ($line -match '^\s*-\s*(.+-deployment\.yaml)\s*$') {
            $deploymentFile = Join-Path $manifestsDir $Matches[1]
            if (-not (Test-Path $deploymentFile)) { continue }

            $svcName = $null
            $readinessPath = $null
            $livenessPath = $null
            $inMeta = $false
            $inReadiness = $false
            $inLiveness = $false
            foreach ($dline in Get-Content $deploymentFile) {
                if ($dline -match "^metadata:\s*$") {
                    $inMeta = ($svcName -eq $null)
                    continue
                }
                if ($inMeta -and $dline -match "^\s{2}name:\s*([^\s]+)") {
                    $svcName = $Matches[1]
                    $inMeta = $false
                }
                if ($dline -match '^\s*readinessProbe:') { $inReadiness = $true; $inLiveness = $false; continue }
                if ($dline -match '^\s*livenessProbe:') { $inLiveness = $true; $inReadiness = $false; continue }
                if ($inReadiness -and $dline -match '^\s*path:\s*([^\s]+)') { $readinessPath = $Matches[1]; $inReadiness = $false }
                if ($inLiveness -and $dline -match '^\s*path:\s*([^\s]+)') { $livenessPath = $Matches[1]; $inLiveness = $false }
            }
            if ($svcName) {
                if ($readinessPath) { $probePathByService[$svcName] = $readinessPath }
                elseif ($livenessPath) { $probePathByService[$svcName] = $livenessPath }
                else { $probePathByService[$svcName] = '/health' }
            }
        }
    }
}

function Build-HealthChecks {
    Parse-IngressPaths
    Parse-Deployments

    foreach ($candidate in @('/health', '/api/v1/health')) {
        if ($ingressPaths.Contains($candidate) -and -not $baseHealthPaths.Contains($candidate)) {
            $baseHealthPaths.Add($candidate) | Out-Null
        }
    }

    foreach ($svc in $probePathByService.Keys) {
        $probePath = $probePathByService[$svc]
        $ingressPath = $null
        if ($ingressPathByService.ContainsKey($svc)) {
            $ingressPath = $ingressPathByService[$svc]
        }

        $ingressHealthPath = $null
        if ($ingressPath) {
            if ($probePath -and ($probePath -eq $ingressPath -or $probePath.StartsWith($ingressPath))) {
                $ingressHealthPath = $probePath
            }
            elseif ($ingressPath -match '/health$') {
                $ingressHealthPath = $ingressPath
            }
            else {
                $ingressHealthPath = $null
            }
            if ($ingressHealthPath -and -not $ingressHealthPaths.Contains($ingressHealthPath)) {
                $ingressHealthPaths.Add($ingressHealthPath) | Out-Null
            }
        }

        $serviceChecks.Add([pscustomobject]@{
            Service = $svc
            ProbePath = $probePath
            IngressPath = $ingressPath
            IngressHealthPath = $ingressHealthPath
        }) | Out-Null
    }
}

function Add-Curl-TimeoutArgs {
    param([string[]]$CurlArgs)
    $hasMax = $false
    $hasConnect = $false
    for ($i = 0; $i -lt $CurlArgs.Count; $i++) {
        if ($CurlArgs[$i] -eq '--max-time') { $hasMax = $true }
        if ($CurlArgs[$i] -eq '--connect-timeout') { $hasConnect = $true }
    }
    $prefix = @()
    if (-not $hasConnect) { $prefix += @('--connect-timeout', '2') }
    if (-not $hasMax) { $prefix += @('--max-time', '8') }
    if ($prefix.Count -eq 0) { return $CurlArgs }
    return $prefix + $CurlArgs
}

function Invoke-Curl {
    param(
        [string[]]$CurlArgs,
        [switch]$CaptureOutput,
        [switch]$CaptureError
    )
    $CurlArgs = Add-Curl-TimeoutArgs -CurlArgs $CurlArgs
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $errFile = $null
    $errContent = $null
    try {
        if ($CaptureError) { $errFile = [System.IO.Path]::GetTempFileName() }
        if ($CaptureOutput) {
            if ($CaptureError) {
                $output = & curl.exe @CurlArgs 2> $errFile
            } else {
                $output = & curl.exe @CurlArgs 2>$null
            }
        } else {
            if ($CaptureError) {
                & curl.exe @CurlArgs 2> $errFile | Out-Null
            } else {
                & curl.exe @CurlArgs 2>$null | Out-Null
            }
            $output = $null
        }
        if ($CaptureError -and $errFile -and (Test-Path $errFile)) {
            $errContent = (Get-Content $errFile -Raw)
        }
        return @{ ExitCode = $LASTEXITCODE; Output = $output; Error = $errContent }
    } finally {
        $ErrorActionPreference = $oldPreference
        if ($errFile) { Remove-Item -Force $errFile -ErrorAction SilentlyContinue }
    }
}

function Curl-Ok([string]$url, [string[]]$headers = @()) {
    $args = @('-fsS', '--max-time', '4')
    foreach ($h in $headers) { $args += @('-H', $h) }
    $args += $url
    $result = Invoke-Curl -CurlArgs $args
    return $result.ExitCode -eq 0
}

function Curl-StatusDetail([string]$url, [string[]]$headers = @()) {
    $args = @('-sS', '-o', 'NUL', '-w', '%{http_code}')
    foreach ($h in $headers) { $args += @('-H', $h) }
    $args += $url
    $result = Invoke-Curl -CurlArgs $args -CaptureOutput -CaptureError
    if ($result.ExitCode -ne 0) {
        return [pscustomobject]@{
            StatusCode = 0
            ExitCode = $result.ExitCode
            Error = $result.Error
        }
    }
    $code = 0
    [int]::TryParse($result.Output.Trim(), [ref]$code) | Out-Null
    return [pscustomobject]@{
        StatusCode = $code
        ExitCode = $result.ExitCode
        Error = $result.Error
    }
}

function Invoke-Curl-Response {
    param([string[]]$CurlArgs)
    $bodyFile = [System.IO.Path]::GetTempFileName()
    try {
        $args = @('-sS', '-o', $bodyFile, '-w', '%{http_code}') + $CurlArgs
        $result = Invoke-Curl -CurlArgs $args -CaptureOutput -CaptureError
        $body = ''
        if (Test-Path $bodyFile) {
            $body = Get-Content $bodyFile -Raw
        }
        $code = 0
        if ($result.ExitCode -eq 0) {
            [int]::TryParse($result.Output.Trim(), [ref]$code) | Out-Null
        }
        return [pscustomobject]@{
            ExitCode = $result.ExitCode
            StatusCode = $code
            Body = $body
            Error = $result.Error
        }
    } finally {
        if ($bodyFile) { Remove-Item -Force $bodyFile -ErrorAction SilentlyContinue }
    }
}

function Test-HttpSuccess {
    param($Response)
    return ($Response.ExitCode -eq 0 -and $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 300)
}

function Show-HttpFailure {
    param(
        [string]$Action,
        $Response
    )
    Write-Host "$Action (status: $($Response.StatusCode), curl exit: $($Response.ExitCode))"
    if ($Response.Error) {
        $errSummary = ($Response.Error -split "(`r`n|`n|`r)")[0].Trim()
        if ($errSummary) { Write-Host "curl error: $errSummary" }
    }
    if ($Response.Body) {
        $body = $Response.Body
        if ($body.Length -gt 2000) { $body = $body.Substring(0, 2000) + '... (truncated)' }
        Write-Host "response body: $body"
    }
}

function Write-TempJsonFile {
    param([Parameter(Mandatory = $true)][string]$Json)
    $path = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $path -Value $Json -Encoding UTF8
    return $path
}

function Test-TcpConnection {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetHost,
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [int]$TimeoutMs = 500
    )
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($TargetHost, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
        $client.EndConnect($iar)
        return $true
    } catch {
        return $false
    } finally {
        try { $client.Close() } catch {}
    }
}

function Mint-Jwt {
    $secret = $env:JWT_HMAC_SECRET
    if ([string]::IsNullOrWhiteSpace($secret)) { $secret = 'dev-only-insecure-secret' }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $exp = $now + 3600
    $header = '{"alg":"HS256","typ":"JWT"}'
    $payload = "{""sub"":""agent-smoke"",""role"":""agent"",""iat"":$now,""exp"":$exp}"
    $headerB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($header)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $payloadB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $signingInput = "$headerB64.$payloadB64"
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
    $sig = $hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes($signingInput))
    $sigB64 = [Convert]::ToBase64String($sig).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    return "$signingInput.$sigB64"
}

function Ensure-IngressPortForward {
    if ($ingressPaths.Count -eq 0) {
        throw "No ingress health paths discovered; cannot validate ingress connectivity."
    }

    $script:ingressPort = Get-FreePort 18080 18100
    $pf = Start-PortForward -namespace 'ingress-nginx' -service 'ingress-nginx-controller' -localPort $script:ingressPort -remotePort 80
    $script:portForwardProcess = $pf.Process
    $script:portForwardLogOut = $pf.LogOut
    $script:portForwardLogErr = $pf.LogErr
    $script:curlBaseUrl = "http://localhost:$script:ingressPort"
    $script:curlHostHeaders = @('Host: localhost')

    for ($i = 0; $i -lt 20; $i++) {
        if ($script:portForwardProcess.HasExited) { break }
        if (Test-TcpConnection -TargetHost 'localhost' -Port $script:ingressPort -TimeoutMs 500) {
            Write-Host "Using kubectl port-forward fallback at $script:curlBaseUrl"
            if (-not (Can-Reach-Base)) {
                Write-Host "Port-forward established but base health check failed for $script:curlBaseUrl."
            }
            return
        }
        Start-Sleep -Seconds 1
    }

    if ($script:portForwardProcess -and $script:portForwardProcess.HasExited) {
        $log = ''
        if ($script:portForwardLogOut) { $log += (Get-Content $script:portForwardLogOut -Raw) }
        if ($script:portForwardLogErr) { $log += (Get-Content $script:portForwardLogErr -Raw) }
        if ($log) { Write-Host "Port-forward logs:`n$log" }
    }
    throw "Failed to establish ingress port-forward."
}

function Ensure-ServicePortForward {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Service,
        [Parameter(Mandatory = $true)]
        [string]$ProbePath,
        [Parameter(Mandatory = $false)]
        [string]$Namespace = 'dev'
    )

    if ($servicePortForwards.ContainsKey($Service)) {
        $existing = $servicePortForwards[$Service]
        if ($existing.Process -and -not $existing.Process.HasExited) {
            return $existing
        }
        Stop-ProcessSafe $existing.Process
        $servicePortForwards.Remove($Service) | Out-Null
    }

    $localPort = Get-FreePort 18110 18220
    $pf = Start-PortForward -namespace $Namespace -service $Service -localPort $localPort -remotePort 80
    $entry = [pscustomobject]@{
        Service = $Service
        Port = $localPort
        ProbePath = $ProbePath
        Process = $pf.Process
        LogOut = $pf.LogOut
        LogErr = $pf.LogErr
    }
    $servicePortForwards[$Service] = $entry

    $connected = $false
    $tcpAttempts = 60
    for ($i = 0; $i -lt $tcpAttempts; $i++) {
        if ($entry.Process.HasExited) { break }
        if (Test-TcpConnection -TargetHost 'localhost' -Port $localPort -TimeoutMs 500) {
            $connected = $true
            break
        }
        Start-Sleep -Seconds 1
    }

    if ($connected) {
        $lastStatus = 0
        $lastExit = 0
        $lastError = $null
        $healthAttempts = 60
        for ($i = 0; $i -lt $healthAttempts; $i++) {
            if ($entry.Process.HasExited) { break }
            $detail = Curl-StatusDetail "http://localhost:$localPort$ProbePath"
            $lastStatus = $detail.StatusCode
            $lastExit = $detail.ExitCode
            $lastError = $detail.Error
            if ($lastStatus -ge 200 -and $lastStatus -lt 300) { return $entry }
            if ($i -in 9, 19, 39, 59) {
                $errSummary = $null
                if ($lastError) {
                    $errSummary = ($lastError -split "(`r`n|`n|`r)")[0].Trim()
                }
                if ($errSummary) {
                    Write-Host "Waiting for $Service health at $ProbePath (status: $lastStatus, curl exit: $lastExit, error: $errSummary)..."
                }
                else {
                    Write-Host "Waiting for $Service health at $ProbePath (status: $lastStatus, curl exit: $lastExit)..."
                }
            }
            Start-Sleep -Seconds 1
        }
        if ($entry.Process -and -not $entry.Process.HasExited) {
            $errSuffix = ''
            if ($lastError) {
                $errSummary = ($lastError -split "(`r`n|`n|`r)")[0].Trim()
                if ($errSummary) { $errSuffix = " curl error: $errSummary" }
            }
            throw "Port-forward established but health check failed for service '$Service' (last status: $lastStatus, curl exit: $lastExit).$errSuffix"
        }
    }

    $log = ''
    if ($entry.LogOut) { $log += (Get-Content $entry.LogOut -Raw) }
    if ($entry.LogErr) { $log += (Get-Content $entry.LogErr -Raw) }
    if ($log) { Write-Host "Port-forward logs for ${Service}:`n$log" }
    throw "Failed to establish port-forward for service '$Service'."
}

function Can-Reach-Base {
    $pathsToCheck = $baseHealthPaths
    if ($pathsToCheck.Count -eq 0) { $pathsToCheck = $ingressHealthPaths }
    foreach ($path in $pathsToCheck) {
        if (Curl-Ok "$script:curlBaseUrl$path" $script:curlHostHeaders) { return $true }
    }
    return $false
}

function Post-LogEvent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClientId
    )
    $token = Mint-Jwt
    $authHeader = "Authorization: Bearer $token"
    $logBody = @{
        action = 'COMMUNICATION'
        attributeName = 'smoke-test'
        afterValue = 'smoke test completed'
        agentId = 'agent-smoke'
        clientId = $ClientId
        correlationId = 'smoke-test'
    } | ConvertTo-Json -Compress
    $logBodyFile = Write-TempJsonFile -Json $logBody

    try {
        if ($ingressPathByService.ContainsKey('log')) {
            $logPath = $ingressPathByService['log']
            $args = @('-fsS', '-X', 'POST', "$script:curlBaseUrl$logPath", '-H', 'Content-Type: application/json', '-H', $authHeader)
            foreach ($h in $script:curlHostHeaders) { $args += @('-H', $h) }
            $args += @('--data-binary', "@$logBodyFile")
            $result = Invoke-Curl-Response -CurlArgs $args
            if (Test-HttpSuccess $result) { return }
        }

        $probePath = '/health'
        if ($probePathByService.ContainsKey('log')) {
            $probePath = $probePathByService['log']
        }
        $pf = Ensure-ServicePortForward -Service 'log' -ProbePath $probePath
        $args = @('-X', 'POST', "http://localhost:$($pf.Port)/api/logs", '-H', 'Content-Type: application/json', '-H', $authHeader)
        $args += @('--data-binary', "@$logBodyFile")
        $result = Invoke-Curl-Response -CurlArgs $args
        if (-not (Test-HttpSuccess $result)) {
            Show-HttpFailure "Failed to post log event." $result
            throw "Failed to post log event."
        }
    }
    finally {
        if ($logBodyFile) { Remove-Item -Force $logBodyFile -ErrorAction SilentlyContinue }
    }
}

try {
    Build-HealthChecks
    if ($serviceChecks.Count -eq 0) { throw "No health checks discovered from $manifestsDir." }

    if ($ingressPaths.Count -gt 0) {
        if (-not (Can-Reach-Base)) {
            Write-Host "Initial health check against $baseUrl failed; attempting kubectl port-forward fallback..."
            Ensure-IngressPortForward
        }
    }
    else {
        Write-Host "No ingress-exposed services discovered; skipping ingress base check."
    }

    Write-Host "Checking health endpoints..."
    foreach ($check in $serviceChecks) {
        $svc = $check.Service
        $probePath = $check.ProbePath
        $ingressHealthPath = $check.IngressHealthPath
        $healthy = $false

        if ($ingressHealthPath) {
            if (Curl-Ok "$script:curlBaseUrl$ingressHealthPath" $script:curlHostHeaders) {
                Write-Host "Healthy (ingress): $svc ($ingressHealthPath)"
                $healthy = $true
            }
            else {
                Write-Host "Ingress health check failed for $svc ($ingressHealthPath); trying direct port-forward..."
            }
        }
        else {
            Write-Host "No ingress path for $svc; using direct port-forward..."
        }

        if (-not $healthy) {
            $pf = Ensure-ServicePortForward -Service $svc -ProbePath $probePath
            if (Curl-Ok "http://localhost:$($pf.Port)$probePath") {
                Write-Host "Healthy (port-forward): $svc ($probePath)"
                $healthy = $true
            }
        }

        if (-not $healthy) { throw "Unhealthy: $svc ($probePath)" }
    }

    if ($probePathByService.ContainsKey('transaction')) {
        Write-Host "Listing transactions..."
        $token = Mint-Jwt
        $authHeader = "Authorization: Bearer $token"
        $transactionsBase = $script:curlBaseUrl
        $transactionsHeaders = $script:curlHostHeaders
        if (-not $ingressPathByService.ContainsKey('transaction')) {
            $probePath = $probePathByService['transaction']
            $pf = Ensure-ServicePortForward -Service 'transaction' -ProbePath $probePath
            $transactionsBase = "http://localhost:$($pf.Port)"
            $transactionsHeaders = @()
        }
        $txArgs = @("$transactionsBase/api/transactions?limit=1", '-H', $authHeader)
        foreach ($h in $transactionsHeaders) { $txArgs += @('-H', $h) }
        $txResp = Invoke-Curl-Response -CurlArgs $txArgs
        if (-not (Test-HttpSuccess $txResp)) {
            Show-HttpFailure "Failed to list transactions." $txResp
            throw "Failed to list transactions."
        }
    }

    Write-Host "Creating client..."
    $token = Mint-Jwt
    $authHeader = "Authorization: Bearer $token"
    $createBody = @{
        firstName = 'Jordan'
        lastName = 'Taylor'
        dateOfBirth = '1990-01-15'
        gender = 'Male'
        emailAddress = 'jordan.taylor@example.com'
        phoneNumber = '+15551234567'
        address = '123 Main Street'
        city = 'Springfield'
        state = 'Illinois'
        country = 'United States'
        postalCode = '62704'
    } | ConvertTo-Json -Compress
    $createBodyFile = Write-TempJsonFile -Json $createBody
    $createArgs = @('-X', 'POST', "$script:curlBaseUrl/api/clients", '-H', 'Content-Type: application/json', '-H', $authHeader)
    foreach ($h in $script:curlHostHeaders) { $createArgs += @('-H', $h) }
    $createArgs += @('--data-binary', "@$createBodyFile")
    try {
        $createResp = Invoke-Curl-Response -CurlArgs $createArgs
        if (-not (Test-HttpSuccess $createResp)) {
            Show-HttpFailure "Failed to create client." $createResp
            throw "Failed to create client."
        }
        $createResponse = $createResp.Body
    }
    finally {
        if ($createBodyFile) { Remove-Item -Force $createBodyFile -ErrorAction SilentlyContinue }
    }
    $clientId = [regex]::Match($createResponse, '"clientId"\s*:\s*"([^"]+)"').Groups[1].Value
    if (-not $clientId) { throw "Could not parse clientId from create response: $createResponse" }

    Write-Host "Reading client $clientId..."
    $readArgs = @("$script:curlBaseUrl/api/clients/$clientId", '-H', $authHeader)
    foreach ($h in $script:curlHostHeaders) { $readArgs += @('-H', $h) }
    $readResp = Invoke-Curl-Response -CurlArgs $readArgs
    if (-not (Test-HttpSuccess $readResp)) {
        Show-HttpFailure "Failed to read client $clientId." $readResp
        throw "Failed to read client $clientId."
    }

    Write-Host "Updating client $clientId..."
    $updateBody = @{
        firstName = 'Jordan'
        lastName = 'Taylor'
        dateOfBirth = '1990-01-15'
        gender = 'Male'
        emailAddress = 'jordan.taylor@example.com'
        phoneNumber = '+15551234567'
        address = '99 Updated Street'
        city = 'Springfield'
        state = 'Illinois'
        country = 'United States'
        postalCode = '62704'
    } | ConvertTo-Json -Compress
    $updateBodyFile = Write-TempJsonFile -Json $updateBody
    $updateArgs = @('-X', 'PUT', "$script:curlBaseUrl/api/clients/$clientId", '-H', 'Content-Type: application/json', '-H', $authHeader)
    foreach ($h in $script:curlHostHeaders) { $updateArgs += @('-H', $h) }
    $updateArgs += @('--data-binary', "@$updateBodyFile")
    try {
        $updateResp = Invoke-Curl-Response -CurlArgs $updateArgs
        if (-not (Test-HttpSuccess $updateResp)) {
            Show-HttpFailure "Failed to update client $clientId." $updateResp
            throw "Failed to update client $clientId."
        }
    }
    finally {
        if ($updateBodyFile) { Remove-Item -Force $updateBodyFile -ErrorAction SilentlyContinue }
    }

    Write-Host "Deleting client $clientId..."
    $deleteArgs = @('-X', 'DELETE', "$script:curlBaseUrl/api/clients/$clientId", '-H', $authHeader)
    foreach ($h in $script:curlHostHeaders) { $deleteArgs += @('-H', $h) }
    $deleteResp = Invoke-Curl-Response -CurlArgs $deleteArgs
    if (-not (Test-HttpSuccess $deleteResp)) {
        Show-HttpFailure "Failed to delete client $clientId." $deleteResp
        throw "Failed to delete client $clientId."
    }

    Write-Host "Posting a direct log event..."
    Post-LogEvent -ClientId $clientId

    Write-Host "Smoke tests passed."
}
finally {
    Stop-ProcessSafe $portForwardProcess
    foreach ($entry in $servicePortForwards.Values) {
        Stop-ProcessSafe $entry.Process
    }
}

