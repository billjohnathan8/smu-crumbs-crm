<#
.SYNOPSIS
    Clean local environment to simulate a fresh developer machine.

.DESCRIPTION
    Removes portable tools, kind cluster, and build artifacts to test setup scripts
    as if running on a fresh machine. Keeps system-installed tools (Docker, Java, Node).

.PARAMETER FullClean
    Also removes Docker images and build artifacts (more thorough).

.EXAMPLE
    .\scripts\dev-setup\test\clean-for-testing.ps1
    Clean portable tools and kind cluster

.EXAMPLE
    .\scripts\dev-setup\test\clean-for-testing.ps1 -FullClean
    Deep clean including Docker images
#>

[CmdletBinding()]
param(
    [switch]$FullClean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Clean Environment for Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Track what was cleaned
$cleaned = @()

# 1. Remove portable tools directory
$devtoolsPath = Join-Path $RepoRoot ".devtools"
if (Test-Path $devtoolsPath) {
    Write-Host "[1/6] Removing .devtools/ directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $devtoolsPath
    $cleaned += ".devtools/"
    Write-Host "      [+] Removed portable tools" -ForegroundColor Green
} else {
    Write-Host "[1/6] .devtools/ not found (already clean)" -ForegroundColor Gray
}

# 2. Delete kind cluster
Write-Host "[2/6] Deleting kind cluster cs301-crm..." -ForegroundColor Yellow
try {
    $kindPath = Get-Command kind -ErrorAction SilentlyContinue
    if ($kindPath) {
        kind delete cluster --name cs301-crm 2>$null
        if ($LASTEXITCODE -eq 0) {
            $cleaned += "kind cluster cs301-crm"
            Write-Host "      [+] Deleted cluster" -ForegroundColor Green
        } else {
            Write-Host "      - Cluster does not exist or already deleted" -ForegroundColor Gray
        }
    } else {
        Write-Host "      - kind not found (cluster may not exist)" -ForegroundColor Gray
    }
} catch {
    Write-Host "      - Could not delete cluster (may not exist)" -ForegroundColor Gray
}

# 3. Remove k8s validation temp directory
$k8sValidateTmpPath = Join-Path $RepoRoot ".k8s-validate-tmp"
if (Test-Path $k8sValidateTmpPath) {
    Write-Host "[3/6] Removing .k8s-validate-tmp/ directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $k8sValidateTmpPath
    $cleaned += ".k8s-validate-tmp/"
    Write-Host "      [+] Removed validation temp files" -ForegroundColor Green
} else {
    Write-Host "[3/6] .k8s-validate-tmp/ not found (already clean)" -ForegroundColor Gray
}

# 4. Clean old build logs (>7 days)
$buildLogsPath = Join-Path $RepoRoot "build-logs"
if (Test-Path $buildLogsPath) {
    Write-Host "[4/6] Cleaning old build logs (>7 days)..." -ForegroundColor Yellow
    $cutoffDate = (Get-Date).AddDays(-7)
    $oldLogs = @(Get-ChildItem -Path $buildLogsPath -Recurse -File | Where-Object { $_.LastWriteTime -lt $cutoffDate })
    
    if ($oldLogs.Count -gt 0) {
        $oldLogs | Remove-Item -Force
        $cleaned += "$($oldLogs.Count) old build log(s)"
        Write-Host "      [+] Removed $($oldLogs.Count) file(s)" -ForegroundColor Green
    } else {
        Write-Host "      - No old logs to clean" -ForegroundColor Gray
    }
} else {
    Write-Host "[4/6] build-logs/ not found" -ForegroundColor Gray
}

# 5. Full clean: Docker images (optional)
if ($FullClean) {
    Write-Host "[5/6] Removing Docker images (--FullClean)..." -ForegroundColor Yellow
    
    # Remove project-specific images
    $images = @(
        "crm-frontend:latest",
        "crm-notification-service:latest",
        "crm-log-service:latest",
        "crm-gateway:latest",
        "setup-test-fresh",
        "setup-test-partial"
    )
    
    $removedCount = 0
    foreach ($img in $images) {
        try {
            docker rmi $img 2>$null
            if ($LASTEXITCODE -eq 0) {
                $removedCount++
            }
        } catch {
            # Image does not exist, continue
        }
    }
    
    if ($removedCount -gt 0) {
        $cleaned += "$removedCount Docker image(s)"
        Write-Host "      [+] Removed $removedCount image(s)" -ForegroundColor Green
    } else {
        Write-Host "      - No project images to remove" -ForegroundColor Gray
    }
    
    # Prune dangling images
    Write-Host "      Pruning dangling images..." -ForegroundColor Yellow
    docker image prune -f | Out-Null
    Write-Host "      [+] Pruned dangling images" -ForegroundColor Green
} else {
    Write-Host "[5/6] Skipping Docker images (use -FullClean to remove)" -ForegroundColor Gray
}

# 6. Full clean: node_modules and build artifacts (optional)
if ($FullClean) {
    Write-Host "[6/6] Removing build artifacts (--FullClean)..." -ForegroundColor Yellow
    
    # Frontend node_modules
    $frontendNodeModules = Join-Path $RepoRoot "services\frontend\node_modules"
    if (Test-Path $frontendNodeModules) {
        Remove-Item -Recurse -Force $frontendNodeModules
        $cleaned += "frontend/node_modules"
        Write-Host "      [+] Removed frontend/node_modules" -ForegroundColor Green
    }
    
    # Backend build directories
    $backendDirs = @(
        "services\backend\crm-gateway\build",
        "services\backend\crm-notification-service\build"
    )
    
    foreach ($dir in $backendDirs) {
        $fullPath = Join-Path $RepoRoot $dir
        if (Test-Path $fullPath) {
            Remove-Item -Recurse -Force $fullPath
            $cleaned += $dir
            Write-Host "      [+] Removed $dir" -ForegroundColor Green
        }
    }
} else {
    Write-Host "[6/6] Skipping build artifacts (use -FullClean to remove)" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cleanup Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($cleaned.Count -gt 0) {
    Write-Host ""
    Write-Host "Cleaned:" -ForegroundColor Green
    foreach ($item in $cleaned) {
        Write-Host "  [+] $item" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "Nothing to clean - environment was already fresh!" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "What is KEPT (system tools):" -ForegroundColor Cyan
Write-Host "  - Docker Desktop" -ForegroundColor Gray
Write-Host "  - Java (system installation)" -ForegroundColor Gray
Write-Host "  - Node.js (system installation)" -ForegroundColor Gray
Write-Host "  - Git, Make" -ForegroundColor Gray
Write-Host "  - WSL" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run bootstrap: .\scripts\wrappers\bootstrap-setup.cmd --doctor" -ForegroundColor White
Write-Host "  2. If all good:   .\scripts\wrappers\bootstrap-setup.cmd" -ForegroundColor White
Write-Host ""
