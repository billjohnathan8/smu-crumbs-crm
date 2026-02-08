# Complete CI/CD Testing Orchestration

> **⚠️ DEPRECATED - Legacy Scripts**
>
> This directory contains legacy PowerShell/Bash scripts that have been superseded by
> unified cross-platform Python pipelines.
>
> **Use Instead:** `python scripts/pipelines/validate_ci_cd.py`
>
> **Migration Guide:** [docs/migration/pipeline-migration.md](../../docs/migration/pipeline-migration.md)
>
> **Removal Date:** August 8, 2026
>
> ---
>
> **Historical Documentation Below** (for reference only)

Orchestrates the full end-to-end CI/CD testing workflow across all phases.

## Overview

The [test-ci-cd-full.ps1](test-ci-cd-full.ps1) script ties together all CI/CD testing phases:

1. **Phase 1: Local Validation** (`test-ci-cd-local.ps1`)
   - Validates GitHub workflow syntax with actionlint
   - Runs complete local test pipeline
   - Catches issues before pushing to GitHub

2. **Phase 2: GitHub Actions Testing** (`test-ci-cd-github.ps1`)
   - Tests component trunk branch workflows
   - Tests integration and main branch workflows
   - Validates branch policy rules (optional)

3. **Phase 3: End-to-End Workflow** (optional)
   - Creates feature branch
   - Creates test PR to component trunk
   - Verifies branch policy enforcement
   - Tests merge cascade workflow

## Quick Start

```powershell
# Run full validation (Phases 1 & 2, no PRs)
.\test-ci-cd-full.ps1

# Run all phases including E2E workflow with PR creation
.\test-ci-cd-full.ps1 -CreatePRs -EndToEnd

# Only verify dependencies are installed
.\test-ci-cd-full.ps1 -VerifyOnly

# Only run local validation
.\test-ci-cd-full.ps1 -LocalOnly

# Only run GitHub Actions testing (skip local)
.\test-ci-cd-full.ps1 -GitHubOnly -CreatePRs
```

## Parameters

### Test Scope Control

| Parameter | Description |
|-----------|-------------|
| `-LocalOnly` | Only run Phase 1 (local validation), skip GitHub Actions and E2E |
| `-GitHubOnly` | Skip Phase 1, only run GitHub Actions and E2E testing |
| `-EndToEnd` | Run Phase 3 (end-to-end workflow test) after Phases 1 and 2 |

### Test Options

| Parameter | Description |
|-----------|-------------|
| `-CreatePRs` | Create actual test PRs (passed to `test-ci-cd-github.ps1`) |
| `-Keep` | Preserve kind cluster after tests (passed to `test-ci-cd-local.ps1`) |
| `-VerifyOnly` | Only verify dependencies are installed, don't run tests |
| `-TimeoutMinutes <int>` | Maximum time to wait for all phases (default: 120 minutes) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All phases passed successfully |
| 1-2 | Phase 1 (local validation) failed |
| 3-6 | Phase 2 (GitHub Actions) failed |
| 7 | Phase 3 (E2E workflow) failed |
| 8 | Timeout exceeded or fatal error |
| 9 | Dependency verification failed |

## Output

### Log Files

```
build-logs/test-ci-cd-full/
├── inv{timestamp}__{readable}__test-ci-cd-full.log  # Detailed log (3 most recent kept)
└── complete-test-report.html                        # HTML report
```

**Log Naming:** Uses inverse-timestamp pattern for automatic sorting (newest first).

### Consolidated Report

The script generates a comprehensive HTML report showing:
- Overall test status (PASSED/FAILED)
- Individual phase results and durations
- Exit codes and timestamps
- Full execution timeline

Open `build-logs/test-ci-cd-full/complete-test-report.html` in a browser to view.

## Usage Patterns

### Pre-Merge Validation

Run before creating PRs to catch issues locally:

```powershell
.\test-ci-cd-full.ps1 -LocalOnly
```

### Complete CI/CD Verification

Full validation including GitHub Actions (dry-run, no PRs):

```powershell
.\test-ci-cd-full.ps1
```

### Release Validation

Full testing including PR creation and E2E workflow:

```powershell
.\test-ci-cd-full.ps1 -CreatePRs -EndToEnd
```

### Development/Debugging

Keep cluster running for manual inspection:

```powershell
.\test-ci-cd-full.ps1 -LocalOnly -Keep
```

### CI/CD System Health Check

Verify all dependencies without running tests:

```powershell
.\test-ci-cd-full.ps1 -VerifyOnly
```

## Dependencies

### Phase 1 Requirements
- Docker (running daemon)
- kind CLI
- kubectl CLI
- actionlint (auto-installed to `.devtools/bin` if missing)

### Phase 2 Requirements
- gh CLI (GitHub CLI)
- Git CLI
- GitHub authentication (`gh auth login`)

### Phase 3 Requirements
- Same as Phase 2
- Write access to repository

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   DEPENDENCY VERIFICATION                       │
│  • Check Docker, kind, kubectl (if not -GitHubOnly)            │
│  • Check gh CLI, git (if not -LocalOnly)                       │
│  • Verify gh authentication (if not -LocalOnly)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 1: LOCAL VALIDATION (optional)               │
│  • Run actionlint on GitHub workflows                           │
│  • Execute test-and-spinup-all.ps1                              │
│  • Verify local environment                                     │
│  ✗ FAIL → Exit with code 1-2                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│           PHASE 2: GITHUB ACTIONS TESTING (optional)            │
│  • Push test commits to component trunk branches                │
│  • Monitor workflow runs                                        │
│  • Validate branch policy (if -CreatePRs)                       │
│  ✗ FAIL → Exit with code 3-6                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│         PHASE 3: END-TO-END WORKFLOW (if -EndToEnd)             │
│  • Create feat/* test branch                                    │
│  • Create PR to component trunk                                 │
│  • Verify branch policy enforcement                             │
│  • Wait for status checks                                       │
│  • Cleanup test PR and branch                                   │
│  ✗ FAIL → Exit with code 7                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              CONSOLIDATED REPORTING & SUMMARY                   │
│  • Generate HTML report                                         │
│  • Display phase results                                        │
│  • Show total duration                                          │
│  ✓ SUCCESS → Exit with code 0                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling

The script follows a **fail-fast** approach:
- Phase 1 failure → Abort, don't run Phase 2
- Phase 2 failure → Abort, don't run Phase 3
- Exit codes propagate from child scripts

Each phase captures:
- Exit code
- Duration
- Start/end times
- Status (Passed/Failed/Error/Not Run)

## Integration with Other Scripts

### Called Scripts

```powershell
# Phase 1
.\scripts\test-ci-cd-local\test-ci-cd-local.ps1 [-Keep] [-VerifyOnly]

# Phase 2
.\scripts\test-ci-cd-github\test-ci-cd-github.ps1 [-CreatePRs] [-WaitForWorkflows] [-TimeoutMinutes <int>]

# Phase 3 (inline)
# Uses gh CLI and git CLI directly
```

### Logging Pattern

Follows standard repository patterns:
- UTF-8 encoding (no BOM)
- Inverse-timestamp log naming
- Log rotation (keep 3 most recent)
- ANSI code stripping for file logs
- Timestamped console output

## Troubleshooting

### "Dependency verification failed"

Run verification mode to see which dependencies are missing:

```powershell
.\test-ci-cd-full.ps1 -VerifyOnly
```

Install missing tools:
- Docker Desktop: https://www.docker.com/products/docker-desktop
- kind: `choco install kind` or https://kind.sigs.k8s.io/
- kubectl: `choco install kubernetes-cli` or https://kubernetes.io/docs/tasks/tools/
- gh CLI: `choco install gh` or https://cli.github.com/

### "gh CLI is not authenticated"

Authenticate with GitHub:

```powershell
gh auth login
```

Follow the prompts to authenticate with your GitHub account.

### Phase 1 fails with Docker errors

Ensure Docker Desktop is running:
- Start Docker Desktop
- Wait for it to fully initialize
- Run `docker info` to verify

### Phase 3 cleanup issues

If test PR or branch isn't cleaned up automatically:

```powershell
# List test PRs
gh pr list --author "@me" | Select-String "test: E2E"

# Close PR and delete branch
gh pr close <branch-name> --delete-branch
```

## Best Practices

1. **Pre-Push Validation**: Always run `-LocalOnly` before pushing to catch issues early
2. **Periodic Full Validation**: Run full workflow (no `-CreatePRs`) regularly to verify CI/CD health
3. **Release Testing**: Use `-CreatePRs -EndToEnd` before major releases
4. **Keep Logs**: Log rotation keeps 3 most recent runs for debugging
5. **Check Reports**: Review HTML report for detailed phase analysis

## Related Documentation

- [CI/CD Workflows](../../docs/testing/ci-cd-workflows.md) - Overall testing strategy
- [test-ci-cd-local.ps1](../test-ci-cd-local/README.md) - Phase 1 documentation
- [test-ci-cd-github.ps1](../test-ci-cd-github/README.md) - Phase 2 documentation

## Examples

### Complete Pre-Release Validation

```powershell
# 1. Run local validation first
.\test-ci-cd-full.ps1 -LocalOnly
# Exit code 0? Good, proceed

# 2. Run GitHub Actions testing (dry-run)
.\test-ci-cd-full.ps1 -GitHubOnly
# Exit code 0? Good, proceed

# 3. Final validation with PR creation
.\test-ci-cd-full.ps1 -CreatePRs -EndToEnd
# Exit code 0? Ready to release!
```

### Quick Local Development Check

```powershell
# Fast local check, keep cluster running
.\test-ci-cd-full.ps1 -LocalOnly -Keep

# Make code changes...

# Re-run without tearing down cluster (faster)
.\scripts\test-and-spinup-all\test-and-spinup-all.ps1 -SkipInfra -Keep
```

### CI/CD System Health Monitoring

```powershell
# Weekly validation (no PRs, just workflow testing)
.\test-ci-cd-full.ps1

# Check report
start build-logs\test-ci-cd-full\complete-test-report.html
```
