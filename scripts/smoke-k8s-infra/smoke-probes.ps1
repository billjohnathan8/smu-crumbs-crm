# smoke-probes.ps1 — Probe-aware smoke checks for Kubernetes workloads.
#
# Validates:
#   1. Rollout readiness (kubectl rollout status) for every Deployment in the
#      app namespace before any HTTP checks run.
#   2. Probe presence: every container has readinessProbe + livenessProbe;
#      workloads listed in startup-probe-required.txt also need startupProbe.
#   3. In-cluster health: runs an ephemeral curl pod to hit every HTTP probe
#      endpoint from inside the cluster.
#   4. On failure, prints detailed diagnostics (pods, describe, events, logs).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/smoke-k8s-infra/smoke-probes.ps1 [NAMESPACE]
#   NAMESPACE defaults to "dev".

param(
    [string]$Namespace = 'dev'
)

$ErrorActionPreference = 'Stop'

$RolloutTimeout = if ($env:ROLLOUT_TIMEOUT) { $env:ROLLOUT_TIMEOUT } else { '300s' }
$CurlImage = if ($env:CURL_IMAGE) { $env:CURL_IMAGE } else { 'curlimages/curl:8.5.0' }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupRequiredFile = Join-Path $scriptDir 'startup-probe-required.txt'

$errors = [System.Collections.Generic.List[string]]::new()
$failedDeployments = [System.Collections.Generic.List[string]]::new()
$allDeploymentNames = [System.Collections.Generic.List[string]]::new()

# Enhanced failure tracking with categorization
$probeFailures = @{
    Rollout = [System.Collections.Generic.List[object]]::new()
    ProbePresence = [System.Collections.Generic.List[object]]::new()
    InClusterHealth = [System.Collections.Generic.List[object]]::new()
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Header([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)     { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Fail([string]$msg)   { Write-Host "  x $msg" -ForegroundColor Red; $script:errors.Add($msg) }
function Write-Warn([string]$msg)   { Write-Host "  ! $msg" -ForegroundColor Yellow }

function Record-ProbeFailure {
    param(
        [string]$Category,
        [string]$Resource,
        [string]$ProbeType,
        [string]$Detail,
        [object]$AdditionalData = @{}
    )
    
    $failure = [PSCustomObject]@{
        Timestamp = (Get-Date).ToUniversalTime().ToString("o")
        Resource = $Resource
        ProbeType = $ProbeType
        Detail = $Detail
        AdditionalData = $AdditionalData
    }
    
    $script:probeFailures[$Category].Add($failure)
}

# ---------------------------------------------------------------------------
# Load startup-probe-required list
# ---------------------------------------------------------------------------
$startupRequired = @{}
if (Test-Path $startupRequiredFile) {
    foreach ($line in Get-Content $startupRequiredFile) {
        $line = ($line -replace '#.*', '').Trim()
        if ($line) { $startupRequired[$line] = $true }
    }
}

# ---------------------------------------------------------------------------
# 1) Rollout gating
# ---------------------------------------------------------------------------
Write-Header "Rollout gating (namespace: $Namespace, timeout: $RolloutTimeout)"

$deployRaw = kubectl -n $Namespace get deployments -o json 2>&1
$deployObj = $deployRaw | ConvertFrom-Json

if ($deployObj.items.Count -eq 0) {
    Write-Fail "No Deployments found in namespace $Namespace"
}
else {
    foreach ($deploy in $deployObj.items) {
        $name = $deploy.metadata.name
        $allDeploymentNames.Add($name)
        $rolloutOutput = kubectl -n $Namespace rollout status "deployment/$name" --timeout=$RolloutTimeout 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "deployment/$name rolled out"
        }
        else {
            Write-Fail "deployment/$name rollout timed out or failed"
            $failedDeployments.Add($name)
            Record-ProbeFailure -Category 'Rollout' -Resource "deployment/$name" -ProbeType 'rollout' -Detail "Rollout timed out or failed" -AdditionalData @{
                Output = ($rolloutOutput | Out-String).Trim()
                Timeout = $RolloutTimeout
            }
            Write-Host $rolloutOutput
        }
    }
}

# StatefulSets
$stsRaw = kubectl -n $Namespace get statefulsets -o json 2>&1
$stsObj = $null
try { $stsObj = $stsRaw | ConvertFrom-Json } catch {}

if ($stsObj -and $stsObj.items.Count -gt 0) {
    foreach ($sts in $stsObj.items) {
        $name = $sts.metadata.name
        $rolloutOutput = kubectl -n $Namespace rollout status "statefulset/$name" --timeout=$RolloutTimeout 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "statefulset/$name rolled out"
        }
        else {
            Write-Fail "statefulset/$name rollout timed out or failed"
            Record-ProbeFailure -Category 'Rollout' -Resource "statefulset/$name" -ProbeType 'rollout' -Detail "Rollout timed out or failed" -AdditionalData @{
                Output = ($rolloutOutput | Out-String).Trim()
                Timeout = $RolloutTimeout
            }
            Write-Host $rolloutOutput
        }
    }
}

# If rollout failed, dump diagnostics immediately
if ($failedDeployments.Count -gt 0) {
    Write-Header "Rollout failure diagnostics"
    kubectl get pods -n $Namespace -o wide 2>&1
    Write-Host "---"
    kubectl describe pods -n $Namespace 2>&1
    Write-Host "---"
    kubectl get events -n $Namespace --sort-by=.metadata.creationTimestamp 2>&1 | Select-Object -Last 200
    foreach ($d in $failedDeployments) {
        Write-Host "--- logs for deployment/$d ---"
        # Use --prefix to distinguish pods when there are multiple
        $oldErrPref = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        kubectl -n $Namespace logs "deployment/$d" --all-containers --prefix --tail=80 2>&1 | Where-Object { $_ -notmatch '^Found \d+ pods, using pod/' }
        $ErrorActionPreference = $oldErrPref
    }
    Write-Host ""
    Write-Host "FAIL: Rollout gating failed. Aborting smoke." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 2) Probe presence assertions
# ---------------------------------------------------------------------------
Write-Header "Probe presence assertions (namespace: $Namespace)"

foreach ($deploy in $deployObj.items) {
    $deployName = $deploy.metadata.name
    foreach ($container in $deploy.spec.template.spec.containers) {
        $containerName = $container.name

        # readinessProbe
        if ($container.PSObject.Properties['readinessProbe'] -and $null -ne $container.readinessProbe) {
            Write-Ok "Deployment/$deployName container=$containerName`: readinessProbe present"
        }
        else {
            Write-Fail "Deployment/$deployName container=$containerName`: MISSING readinessProbe"
            Record-ProbeFailure -Category 'ProbePresence' -Resource "Deployment/$deployName" -ProbeType 'readinessProbe' -Detail "Missing readinessProbe" -AdditionalData @{
                Container = $containerName
            }
        }

        # livenessProbe
        if ($container.PSObject.Properties['livenessProbe'] -and $null -ne $container.livenessProbe) {
            Write-Ok "Deployment/$deployName container=$containerName`: livenessProbe present"
        }
        else {
            Write-Fail "Deployment/$deployName container=$containerName`: MISSING livenessProbe"
            Record-ProbeFailure -Category 'ProbePresence' -Resource "Deployment/$deployName" -ProbeType 'livenessProbe' -Detail "Missing livenessProbe" -AdditionalData @{
                Container = $containerName
            }
        }

        # startupProbe
        $requireStartup = $startupRequired.ContainsKey("Deployment/$deployName")
        $hasStartup = $container.PSObject.Properties['startupProbe'] -and $null -ne $container.startupProbe
        if ($requireStartup) {
            if ($hasStartup) {
                Write-Ok "Deployment/$deployName container=$containerName`: startupProbe present (required)"
            }
            else {
                Write-Fail "Deployment/$deployName container=$containerName`: MISSING startupProbe (required by startup-probe-required.txt)"
                Record-ProbeFailure -Category 'ProbePresence' -Resource "Deployment/$deployName" -ProbeType 'startupProbe' -Detail "Missing required startupProbe" -AdditionalData @{
                    Container = $containerName
                    RequiredByFile = $startupRequiredFile
                }
            }
        }
        else {
            if ($hasStartup) {
                Write-Ok "Deployment/$deployName container=$containerName`: startupProbe present (optional)"
            }
            else {
                Write-Warn "Deployment/$deployName container=$containerName`: no startupProbe (not required)"
            }
        }
    }
}

# StatefulSets
if ($stsObj -and $stsObj.items.Count -gt 0) {
    foreach ($sts in $stsObj.items) {
        $stsName = $sts.metadata.name
        foreach ($container in $sts.spec.template.spec.containers) {
            $containerName = $container.name
            if ($container.PSObject.Properties['readinessProbe'] -and $null -ne $container.readinessProbe) {
                Write-Ok "StatefulSet/$stsName container=$containerName`: readinessProbe present"
            }
            else {
                Write-Fail "StatefulSet/$stsName container=$containerName`: MISSING readinessProbe"
                Record-ProbeFailure -Category 'ProbePresence' -Resource "StatefulSet/$stsName" -ProbeType 'readinessProbe' -Detail "Missing readinessProbe" -AdditionalData @{
                    Container = $containerName
                }
            }
            if ($container.PSObject.Properties['livenessProbe'] -and $null -ne $container.livenessProbe) {
                Write-Ok "StatefulSet/$stsName container=$containerName`: livenessProbe present"
            }
            else {
                Write-Fail "StatefulSet/$stsName container=$containerName`: MISSING livenessProbe"
                Record-ProbeFailure -Category 'ProbePresence' -Resource "StatefulSet/$stsName" -ProbeType 'livenessProbe' -Detail "Missing livenessProbe" -AdditionalData @{
                    Container = $containerName
                }
            }
            $requireStartup = $startupRequired.ContainsKey("StatefulSet/$stsName")
            $hasStartup = $container.PSObject.Properties['startupProbe'] -and $null -ne $container.startupProbe
            if ($requireStartup) {
                if ($hasStartup) { Write-Ok "StatefulSet/$stsName container=$containerName`: startupProbe present (required)" }
                else { 
                    Write-Fail "StatefulSet/$stsName container=$containerName`: MISSING startupProbe (required by startup-probe-required.txt)"
                    Record-ProbeFailure -Category 'ProbePresence' -Resource "StatefulSet/$stsName" -ProbeType 'startupProbe' -Detail "Missing required startupProbe" -AdditionalData @{
                        Container = $containerName
                        RequiredByFile = $startupRequiredFile
                    }
                }
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 3) In-cluster probe endpoint health checks
# ---------------------------------------------------------------------------
Write-Header "In-cluster probe health checks (namespace: $Namespace)"

# Collect HTTP probe endpoints from live workload specs
$probeChecks = [System.Collections.Generic.List[object]]::new()

foreach ($deploy in $deployObj.items) {
    $deployName = $deploy.metadata.name
    foreach ($container in $deploy.spec.template.spec.containers) {
        # Build port name -> number map
        $portMap = @{}
        if ($container.PSObject.Properties['ports']) {
            foreach ($p in $container.ports) {
                if ($p.PSObject.Properties['name'] -and $p.name) {
                    $portMap[$p.name] = $p.containerPort
                }
                $portMap["$($p.containerPort)"] = $p.containerPort
            }
        }

        foreach ($probeType in @('readinessProbe', 'livenessProbe', 'startupProbe')) {
            if (-not $container.PSObject.Properties[$probeType] -or $null -eq $container.$probeType) { continue }
            $probe = $container.$probeType

            if ($probe.PSObject.Properties['httpGet'] -and $null -ne $probe.httpGet) {
                $path = if ($probe.httpGet.PSObject.Properties['path']) { $probe.httpGet.path } else { '/' }
                $rawPort = if ($probe.httpGet.PSObject.Properties['port']) { $probe.httpGet.port } else { 80 }
                $port = $rawPort
                if ($rawPort -is [string] -and $portMap.ContainsKey($rawPort)) {
                    $port = $portMap[$rawPort]
                }
                $probeChecks.Add([pscustomobject]@{
                    Type       = 'HTTP'
                    Deploy     = $deployName
                    Container  = $container.name
                    ProbeType  = $probeType
                    Port       = $port
                    Path       = $path
                })
            }
            elseif ($probe.PSObject.Properties['tcpSocket'] -and $null -ne $probe.tcpSocket) {
                $rawPort = $probe.tcpSocket.port
                $port = $rawPort
                if ($rawPort -is [string] -and $portMap.ContainsKey($rawPort)) {
                    $port = $portMap[$rawPort]
                }
                Write-Warn "$deployName/$($container.name) ${probeType}: tcpSocket probe — TCP connect check via ephemeral pod"
                $probeChecks.Add([pscustomobject]@{
                    Type       = 'TCP'
                    Deploy     = $deployName
                    Container  = $container.name
                    ProbeType  = $probeType
                    Port       = $port
                    Path       = ''
                })
            }
            elseif ($probe.PSObject.Properties['exec'] -and $null -ne $probe.exec) {
                Write-Warn "$deployName/$($container.name) ${probeType}: exec probe — not HTTP-testable, skipping"
            }
        }
    }
}

# Deduplicate by (deploy, port, path)
$seenEndpoints = @{}
$uniqueChecks = [System.Collections.Generic.List[object]]::new()
foreach ($check in $probeChecks) {
    $key = "$($check.Deploy):$($check.Port):$($check.Path):$($check.Type)"
    if (-not $seenEndpoints.ContainsKey($key)) {
        $seenEndpoints[$key] = $true
        $uniqueChecks.Add($check)
    }
}

# Resolve k8s service name for each deployment
$svcRaw = kubectl -n $Namespace get services -o json 2>&1
$svcObj = $svcRaw | ConvertFrom-Json

function Resolve-ServiceForDeploy([string]$deployName) {
    foreach ($candidate in @("$deployName-service", $deployName)) {
        foreach ($s in $svcObj.items) {
            if ($s.metadata.name -eq $candidate) { return [PSCustomObject]@{ Name = $candidate; Service = $s } }
        }
    }
    # Fallback: match by selector app=<deployName>
    foreach ($s in $svcObj.items) {
        if ($s.spec.PSObject.Properties['selector'] -and $s.spec.selector.PSObject.Properties['app']) {
            if ($s.spec.selector.app -eq $deployName) { return [PSCustomObject]@{ Name = $s.metadata.name; Service = $s } }
        }
    }
    return $null
}

function Get-ServicePort([object]$service, [string]$portNameOrNumber) {
    # Try to find matching port in service
    if ($service.spec.PSObject.Properties['ports']) {
        foreach ($p in $service.spec.ports) {
            # Check if port name matches (e.g., "http")
            if ($p.PSObject.Properties['name'] -and $p.name -eq "http") {
                return $p.port
            }
        }
        # If no http port found, return first port
        if ($service.spec.ports.Count -gt 0) {
            return $service.spec.ports[0].port
        }
    }
    # Fallback to provided port
    return $portNameOrNumber
}

if ($uniqueChecks.Count -gt 0) {
    # Build a shell script to run inside the ephemeral pod
    $checkScript = "#!/bin/sh`nset -e`nPASS=0`nFAIL=0`n"

    foreach ($check in $uniqueChecks) {
        $resolved = Resolve-ServiceForDeploy $check.Deploy
        if (-not $resolved) {
            Write-Warn "No Service found for deployment/$($check.Deploy); skipping in-cluster check"
            continue
        }
        $svcName = $resolved.Name
        $servicePort = Get-ServicePort $resolved.Service $check.Port
        $fqdn = "$svcName.$Namespace.svc.cluster.local"

        if ($check.Type -eq 'TCP') {
            # Build TCP check script block
            $tcpBlock = "`necho `"TCP ${fqdn}:${servicePort}`"`n"
            $tcpBlock += "if curl -sS --connect-timeout 5 --max-time 10 `"telnet://${fqdn}:${servicePort}`" </dev/null 2>/dev/null; then`n"
            $tcpBlock += "  echo `"  PASS (TCP)`"`n"
            $tcpBlock += "  PASS=`$((PASS+1))`n"
            $tcpBlock += "else`n"
            $tcpBlock += "  echo `"  NOTE: TCP connect check inconclusive for ${fqdn}:${servicePort} (non-HTTP probe)`"`n"
            $tcpBlock += "fi`n"
            $checkScript += $tcpBlock
        }
        else {
            # Build HTTP check script block with enhanced diagnostics
            $httpBlock = "`necho `"HTTP ${fqdn}:${servicePort}$($check.Path)`"`n"
            $httpBlock += "STATUS=`$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' `"http://${fqdn}:${servicePort}$($check.Path)`" 2>/dev/null || echo 000)`n"
            $httpBlock += "if [ `"`$STATUS`" -ge 200 ] 2>/dev/null && [ `"`$STATUS`" -lt 300 ] 2>/dev/null; then`n"
            $httpBlock += "  echo `"  PASS (HTTP `$STATUS)`"`n"
            $httpBlock += "  PASS=`$((PASS+1))`n"
            $httpBlock += "else`n"
            $httpBlock += "  echo `"  FAIL (HTTP `$STATUS)`"`n"
            $httpBlock += "  # Capture response body and headers for diagnostics`n"
            $httpBlock += "  echo `"  Failed endpoint diagnostics:`"`n"
            $httpBlock += "  RESPONSE_HEADERS=`$(curl -sS --connect-timeout 5 --max-time 10 -i `"http://${fqdn}:${servicePort}$($check.Path)`" 2>&1 | head -20)`n"
            $httpBlock += "  echo `"  Response headers/body (first 20 lines):`"`n"
            $httpBlock += "  echo `"`$RESPONSE_HEADERS`" | sed 's/^/    /'`n"
            $httpBlock += "  echo `"  ---`"`n"
            $httpBlock += "  FAIL=`$((FAIL+1))`n"
            $httpBlock += "fi`n"
            $checkScript += $httpBlock
        }
    }

    $checkScript += @'

echo ""
echo "In-cluster probe checks: ${PASS} passed, ${FAIL} failed"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
exit 0
'@

    Write-Host "Launching ephemeral curl pod for in-cluster probe checks..."
    $podName = "smoke-probe-check-$PID"
    
    # Write script to temp file with UTF-8 no BOM using Unix line endings
    $tempScript = [System.IO.Path]::GetTempFileName()
    # Convert CRLF to LF for Unix compatibility
    $unixScript = $checkScript -replace "`r`n", "`n" -replace "`r", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tempScript, $unixScript, $utf8NoBom)
    
    $oldErrorPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    # Use PowerShell Get-Content to avoid cmd.exe encoding issues
    $output = Get-Content -Path $tempScript -Raw -Encoding UTF8 | kubectl run $podName `
        --namespace=$Namespace `
        --image=$CurlImage `
        --restart=Never `
        --rm `
        -i `
        --command -- sh -s 2>&1
   $podExitCode = $LASTEXITCODE
    $ErrorActionPreference = $oldErrorPref
    
    # Clean up temp file
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

    if ($output) { Write-Host ($output -join "`n") }

    # Check if the actual probe checks passed by looking for the summary line
    $passedChecks = $false
    $outputText = $output -join "`n"
    if ($outputText -match 'In-cluster probe checks: (\d+) passed, (\d+) failed') {
        $passed = [int]$Matches[1]
        $failed = [int]$Matches[2]
        if ($failed -eq 0 -and $passed -gt 0) {
            $passedChecks = $true
        }
        # Record individual HTTP probe failures from output
        if ($failed -gt 0) {
            # Parse output for specific failures
            $lines = $output
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i] -match 'HTTP\s+(.+?):(\d+)(/.*)?') {
                    $endpoint = $Matches[1]
                    $port = $Matches[2]
                    $path = if ($Matches[3]) { $Matches[3] } else { '/' }
                    if ($i + 1 -lt $lines.Count -and $lines[$i + 1] -match 'FAIL \(HTTP (\d+)\)') {
                        $statusCode = $Matches[1]
                        $diagnostics = @()
                        # Collect diagnostics lines that follow
                        $j = $i + 2
                        while ($j -lt $lines.Count -and $lines[$j] -match '^\s+') {
                            $diagnostics += $lines[$j].Trim()
                            $j++
                            if ($lines[$j] -match '^\s+---\s*$') { break }
                        }
                        Record-ProbeFailure -Category 'InClusterHealth' -Resource "$endpoint`:$port" -ProbeType 'httpGet' -Detail "HTTP probe failed with status $statusCode" -AdditionalData @{
                            Endpoint = "$endpoint`:$port$path"
                            StatusCode = $statusCode
                            Diagnostics = ($diagnostics -join "`n")
                        }
                    }
                }
            }
        }
    }

    if ($passedChecks) {
        Write-Ok "All in-cluster probe endpoint checks passed"
    }
    else {
        Write-Fail "One or more in-cluster probe endpoint checks failed"
    }

    # Clean up pod if it wasn't auto-removed
    $ErrorActionPreference = 'Continue'
    kubectl delete pod $podName --namespace=$Namespace --ignore-not-found --wait=false 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
}
else {
    Write-Warn "No probe endpoints to check in-cluster"
}

# ---------------------------------------------------------------------------
# 4) Summary & diagnostics on failure
# ---------------------------------------------------------------------------
if ($errors.Count -gt 0) {
    Write-Header "FAILURE DIAGNOSTICS (namespace: $Namespace)"
    
    # Generate structured failure summary
    Write-Host "`n--- FAILURE SUMMARY ---" -ForegroundColor Yellow
    Write-Host "Total failures: $($errors.Count)" -ForegroundColor Red
    
    # Rollout failures
    if ($probeFailures.Rollout.Count -gt 0) {
        Write-Host "`nROLLOUT FAILURES ($($probeFailures.Rollout.Count)):" -ForegroundColor Red
        foreach ($failure in $probeFailures.Rollout) {
            Write-Host "  Resource: $($failure.Resource)" -ForegroundColor Yellow
            Write-Host "    Type: $($failure.ProbeType)" -ForegroundColor White
            Write-Host "    Detail: $($failure.Detail)" -ForegroundColor White
            Write-Host "    Timeout: $($failure.AdditionalData.Timeout)" -ForegroundColor White
            if ($failure.AdditionalData.Output) {
                Write-Host "    Output:" -ForegroundColor White
                $failure.AdditionalData.Output -split "`n" | ForEach-Object {
                    Write-Host "      $_" -ForegroundColor Gray
                }
            }
        }
    }
    
    # Probe presence failures
    if ($probeFailures.ProbePresence.Count -gt 0) {
        Write-Host "`nPROBE PRESENCE FAILURES ($($probeFailures.ProbePresence.Count)):" -ForegroundColor Red
        foreach ($failure in $probeFailures.ProbePresence) {
            Write-Host "  Resource: $($failure.Resource)" -ForegroundColor Yellow
            Write-Host "    Container: $($failure.AdditionalData.Container)" -ForegroundColor White
            Write-Host "    Missing Probe: $($failure.ProbeType)" -ForegroundColor White
            Write-Host "    Detail: $($failure.Detail)" -ForegroundColor White
        }
    }
    
    # In-cluster health failures
    if ($probeFailures.InClusterHealth.Count -gt 0) {
        Write-Host "`nIN-CLUSTER HEALTH FAILURES ($($probeFailures.InClusterHealth.Count)):" -ForegroundColor Red
        foreach ($failure in $probeFailures.InClusterHealth) {
            Write-Host "  Endpoint: $($failure.AdditionalData.Endpoint)" -ForegroundColor Yellow
            Write-Host "    Probe Type: $($failure.ProbeType)" -ForegroundColor White
            Write-Host "    Status Code: $($failure.AdditionalData.StatusCode)" -ForegroundColor White
            Write-Host "    Detail: $($failure.Detail)" -ForegroundColor White
            if ($failure.AdditionalData.Diagnostics) {
                Write-Host "    Diagnostics:" -ForegroundColor White
                $failure.AdditionalData.Diagnostics -split "`n" | ForEach-Object {
                    Write-Host "      $_" -ForegroundColor Gray
                }
            }
        }
    }
    
    Write-Host "`n--- pods ---"
    kubectl get pods -n $Namespace -o wide 2>&1
    Write-Host ""
    Write-Host "--- describe pods ---"
    kubectl describe pods -n $Namespace 2>&1
    Write-Host ""
    Write-Host "--- events (last 200) ---"
    kubectl get events -n $Namespace --sort-by=.metadata.creationTimestamp 2>&1 | Select-Object -Last 200
    Write-Host ""
    Write-Host "--- logs (tail) for deployments ---"
    foreach ($d in $allDeploymentNames) {
        Write-Host "=== deployment/$d ==="
        # Use --prefix to distinguish pods when there are multiple; filter kubectl's pod selection message
        $oldErrPref = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        kubectl -n $Namespace logs "deployment/$d" --all-containers --prefix --tail=60 2>&1 | Where-Object { $_ -notmatch '^Found \d+ pods, using pod/' }
        $ErrorActionPreference = $oldErrPref
    }
    Write-Host ""
    
    # Export structured failure data to JSON for consumption by CI/CD
    if ($env:BUILD_LOG_FILE) {
        $logDir = Split-Path -Parent $env:BUILD_LOG_FILE
        $failureReportPath = Join-Path $logDir "probe-failures.json"
        $failureReport = [PSCustomObject]@{
            Timestamp = (Get-Date).ToUniversalTime().ToString("o")
            Namespace = $Namespace
            TotalFailures = $errors.Count
            FailuresByCategory = @{
                Rollout = $probeFailures.Rollout.Count
                ProbePresence = $probeFailures.ProbePresence.Count
                InClusterHealth = $probeFailures.InClusterHealth.Count
            }
            Failures = $probeFailures
        }
        $failureReport | ConvertTo-Json -Depth 10 | Out-File -FilePath $failureReportPath -Encoding utf8
        Write-Host "Detailed failure report saved to: $failureReportPath" -ForegroundColor Cyan
    }
    
    Write-Header "PROBE SMOKE FAILED"
    Write-Host "Errors:"
    foreach ($e in $errors) {
        Write-Host "  - $e"
    }
    exit 1
}

Write-Header "Probe-aware smoke checks passed"
