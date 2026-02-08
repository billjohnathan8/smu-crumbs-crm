#!/usr/bin/env pwsh
# Stage 4: Move old scripts to legacy folder (preserving Git history)
# This script uses 'git mv' to preserve file history

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Migration Stage: Archive Old Scripts" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will move old script directories to scripts/legacy/"
Write-Host "Git history will be preserved using 'git mv'"
Write-Host ""

# Check if we're in a git repository
if (-not (Test-Path (Join-Path $repoRoot ".git"))) {
    Write-Host "ERROR: Not in a git repository!" -ForegroundColor Red
    exit 1
}

# List of directories to move
$directoriesToMove = @(
    "scripts\build-and-test-backend"
    "scripts\build-and-test-frontend"
    "scripts\build-and-test-all"
    "scripts\build-and-deploy-k8s"
    "scripts\dev-setup"
    "scripts\test-ci-cd-full"
    "scripts\test-ci-cd-github"
    "scripts\test-and-spinup-all"
    "scripts\test-ci-cd-local"
)

# Extract Python report generators first (before moving)
Write-Host "[1/3] Extracting Python report generators..." -ForegroundColor Yellow
$reportGenerators = @(
    @{Source = "scripts\build-and-test-backend\generate-coverage-index.py"; Dest = "scripts\pipelines\generate_backend_report.py"}
    @{Source = "scripts\build-and-test-frontend\generate-frontend-index.py"; Dest = "scripts\pipelines\generate_frontend_report.py"}
    @{Source = "scripts\build-and-test-all\generate-aggregated-coverage-index.py"; Dest = "scripts\pipelines\generate_all_report.py"}
    @{Source = "scripts\build-and-deploy-k8s\generate-k8s-deploy-summary.py"; Dest = "scripts\pipelines\generate_k8s_report.py"}
)

foreach ($gen in $reportGenerators) {
    $srcPath = Join-Path $repoRoot $gen.Source
    $destPath = Join-Path $repoRoot $gen.Dest
    
    if (Test-Path $srcPath) {
        Write-Host "  Copying: $($gen.Source) -> $($gen.Dest)" -ForegroundColor Gray
        Copy-Item $srcPath $destPath -Force
    }
}

Write-Host "  ✓ Report generators extracted" -ForegroundColor Green
Write-Host ""

# Move directories to legacy
Write-Host "[2/3] Moving old script directories to legacy..." -ForegroundColor Yellow
$movedCount = 0

foreach ($dir in $directoriesToMove) {
    $srcPath = Join-Path $repoRoot $dir
    $dirName = Split-Path $dir -Leaf
    $destPath = Join-Path $repoRoot "scripts\legacy\$dirName"
    
    if (Test-Path $srcPath) {
        Write-Host "  Moving: $dir -> scripts\legacy\$dirName" -ForegroundColor Gray
        
        # Use git mv to preserve history
        Push-Location $repoRoot
        try {
            git mv $dir "scripts\legacy\$dirName"
            $movedCount++
        } catch {
            Write-Host "    WARNING: Failed to git mv $dir : $_" -ForegroundColor Yellow
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  Skipping: $dir (not found)" -ForegroundColor DarkGray
    }
}

Write-Host "  ✓ Moved $movedCount directories" -ForegroundColor Green
Write-Host ""

# Show git status
Write-Host "[3/3] Git status after move:" -ForegroundColor Yellow
Push-Location $repoRoot
try {
    git status --short scripts/
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Stage 4 Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review changes: git status"
Write-Host "  2. Test new pipelines work"
Write-Host "  3. Commit changes: git commit -m 'Archive old scripts to legacy'"
Write-Host ""
