@echo off
REM -----------------------------------------------------------------------------
REM scripts\ci\trivy-scan-images.bat
REM
REM Builds Docker images for all Java backend services and scans each one with
REM Trivy using the same settings enforced in the CD pipeline.
REM
REM Usage:
REM   trivy-scan-images.bat [OPTIONS]
REM
REM Options:
REM   --severity LEVELS     Comma-separated severities (default: HIGH,CRITICAL)
REM   --exit-code N         1=fail on findings, 0=report only  (default: 1)
REM   --no-ignore-unfixed   Include vulnerabilities with no fix yet (default: ignored)
REM   --format FORMAT       table | json | sarif                (default: table)
REM   --service NAME        agent | client | transaction        (default: all)
REM
REM Examples:
REM   Exact same gate as the CD pipeline (fails on findings):
REM     trivy-scan-images.bat
REM
REM   Debug mode - full report, no failure exit:
REM     trivy-scan-images.bat --exit-code 0
REM
REM   Include MEDIUM findings while debugging:
REM     trivy-scan-images.bat --severity MEDIUM,HIGH,CRITICAL --exit-code 0
REM
REM   Scan one service only:
REM     trivy-scan-images.bat --service agent --exit-code 0
REM
REM Install Trivy first if not present:
REM   winget install aquasecurity.trivy
REM   scoop install trivy
REM -----------------------------------------------------------------------------
setlocal EnableDelayedExpansion

REM ── Defaults (match CD pipeline) ─────────────────────────────────────────────
set "SEVERITY=HIGH,CRITICAL"
set "EXIT_CODE=1"
set "IGNORE_UNFIXED=--ignore-unfixed"
set "FORMAT=table"
set "TARGET_SERVICE="

REM ── Root dir: two levels up from this script ──────────────────────────────────
set "ROOT_DIR=%~dp0..\.."

REM ── Argument parsing ──────────────────────────────────────────────────────────
:parse_args
if "%~1"=="" goto check_deps
if /i "%~1"=="--severity"          ( set "SEVERITY=%~2"       & shift & shift & goto parse_args )
if /i "%~1"=="--exit-code"         ( set "EXIT_CODE=%~2"      & shift & shift & goto parse_args )
if /i "%~1"=="--no-ignore-unfixed" ( set "IGNORE_UNFIXED="    & shift         & goto parse_args )
if /i "%~1"=="--format"            ( set "FORMAT=%~2"         & shift & shift & goto parse_args )
if /i "%~1"=="--service"           ( set "TARGET_SERVICE=%~2" & shift & shift & goto parse_args )
echo [ERROR] Unknown option: %~1
exit /b 1

REM ── Dependency checks ─────────────────────────────────────────────────────────
:check_deps
where docker >nul 2>&1 || (
  echo [ERROR] docker is not installed or not on PATH.
  exit /b 1
)
where trivy >nul 2>&1 || (
  echo [ERROR] trivy is not installed or not on PATH.
  echo   Install:  winget install aquasecurity.trivy
  echo             scoop install trivy
  echo             https://aquasecurity.github.io/trivy/latest/getting-started/installation/
  exit /b 1
)

REM ── Validate service arg if provided ─────────────────────────────────────────
if not "%TARGET_SERVICE%"=="" (
  if /i not "%TARGET_SERVICE%"=="agent" (
    if /i not "%TARGET_SERVICE%"=="client" (
      if /i not "%TARGET_SERVICE%"=="transaction" (
        echo [ERROR] Unknown service '%TARGET_SERVICE%'. Valid: agent ^| client ^| transaction
        exit /b 1
      )
    )
  )
)

REM ── Banner ───────────────────────────────────────────────────────────────────
for /f "tokens=*" %%v in ('trivy --version 2^>^&1') do set "TRIVY_VER=%%v"
echo.
echo --------------------------------------------------------------
echo   Trivy local image scan
echo   %TRIVY_VER%
echo   Severity : %SEVERITY%
echo   Exit code: %EXIT_CODE%  (1=fail on findings, 0=report only)
if "%IGNORE_UNFIXED%"=="" ( echo   Unfixed  : included ) else ( echo   Unfixed  : ignored )
echo   Format   : %FORMAT%
if "%TARGET_SERVICE%"=="" ( echo   Services : agent client transaction ) else ( echo   Services : %TARGET_SERVICE% )
echo --------------------------------------------------------------

REM ── Build + Scan ─────────────────────────────────────────────────────────────
set "OVERALL_STATUS=0"
set "SERVICES=agent client transaction"
if not "%TARGET_SERVICE%"=="" set "SERVICES=%TARGET_SERVICE%"

for %%S in (%SERVICES%) do call :scan_service %%S

if not "%OVERALL_STATUS%"=="0" (
  echo.
  echo [FAIL] One or more services failed the Trivy scan.
  echo   Tip: re-run with --exit-code 0 to see all findings without stopping.
  exit /b 1
)

echo.
echo [PASS] All scanned images are clean.
endlocal
goto :eof

REM =============================================================================
REM :scan_service  <service-name>
REM   Builds the jar + Docker image then runs Trivy against it.
REM =============================================================================
:scan_service
set "SVC=%~1"
set "SVC_DIR="
set "IMG_TAG="
if /i "%SVC%"=="agent"       set "SVC_DIR=services\backend\agent"       & set "IMG_TAG=agent:dev"
if /i "%SVC%"=="client"      set "SVC_DIR=services\backend\client"      & set "IMG_TAG=client:dev"
if /i "%SVC%"=="transaction" set "SVC_DIR=services\backend\transaction" & set "IMG_TAG=transaction:dev"

echo.
pushd "%ROOT_DIR%\%SVC_DIR%"
call gradlew.bat clean bootJar -x test --no-daemon --console=plain
if errorlevel 1 (
  echo [FAIL] Gradle build failed for %SVC%
  popd
  set "OVERALL_STATUS=1"
  goto :eof
)
docker build -t %IMG_TAG% .
if errorlevel 1 (
  echo [FAIL] Docker build failed for %SVC%
  popd
  set "OVERALL_STATUS=1"
  goto :eof
)
popd

echo.
trivy image --format %FORMAT% --severity %SEVERITY% %IGNORE_UNFIXED% --exit-code %EXIT_CODE% %IMG_TAG%
if errorlevel 1 (
  echo [FAIL] Trivy found vulnerabilities in %IMG_TAG%
  set "OVERALL_STATUS=1"
)
echo --------------------------------------------------------------
goto :eof
