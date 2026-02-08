# GitHub Actions Workflow Testing Script

> **⚠️ DEPRECATED - Legacy Scripts**
>
> This directory contains legacy PowerShell/Bash scripts that have been superseded by
> unified cross-platform Python pipelines.
>
> **Use Instead:** `python scripts/pipelines/test_github_workflows.py`
>
> **Migration Guide:** [docs/migration/pipeline-migration.md](../../docs/migration/pipeline-migration.md)
>
> **Removal Date:** August 8, 2026
>
> ---
>
> **Historical Documentation Below** (for reference only)

Automates Phase 2 of the CI/CD testing plan: GitHub Actions workflow validation and monitoring.

## Overview

This script helps validate GitHub Actions workflows by:
1. Creating test commits on component trunk branches
2. Pushing commits to trigger workflows
3. Monitoring workflow runs via gh CLI
4. Creating test PRs for branch policy validation
5. Generating JSON reports of workflow results

**Available Versions:**
- **PowerShell**: `test-ci-cd-github.ps1` (Windows, Linux, macOS)
- **Bash**: `test-ci-cd-github.sh` (Linux, macOS, WSL)

## Prerequisites

- **gh CLI** - GitHub CLI must be installed and authenticated
  - Install: https://cli.github.com/
  - Authenticate: `gh auth login`
- **git** - Git version control
- **jq** (optional for Bash version) - JSON processor for better formatting

## Usage

### PowerShell Version

#### Basic Usage

```powershell
# Check dependencies only
.\test-ci-cd-github.ps1 -VerifyOnly

# Push test commits (with confirmation prompts)
.\test-ci-cd-github.ps1

# Push and wait for workflows to complete
.\test-ci-cd-github.ps1 -WaitForWorkflows

# Create test PRs and validate branch policies
.\test-ci-cd-github.ps1 -CreatePRs -WaitForWorkflows
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `-Branches` | string[] | Component trunk branches to test (default: all 6) |
| `-SkipComponentTrunks` | switch | Skip testing component trunk branches |
| `-SkipIntegration` | switch | Skip testing integration branch |
| `-SkipMain` | switch | Skip testing main branch |
| `-SkipBranchPolicy` | switch | Skip branch policy validation |
| `-CreatePRs` | switch | Actually create PRs (default: dry-run) |
| `-WaitForWorkflows` | switch | Wait for workflows to complete |
| `-VerifyOnly` | switch | Only check dependencies |
| `-TimeoutMinutes` | int | Workflow timeout (default: 60 min) |

#### Examples

```powershell
# Test only frontend and agent-backend branches
.\test-ci-cd-github.ps1 -Branches frontend,agent-backend -WaitForWorkflows

# Full validation with PR creation
.\test-ci-cd-github.ps1 -CreatePRs -WaitForWorkflows -TimeoutMinutes 90

# Skip branch policy tests
.\test-ci-cd-github.ps1 -SkipBranchPolicy -WaitForWorkflows
```

### Bash Version

#### Basic Usage

```bash
# Check dependencies only
VERIFY_ONLY=1 ./test-ci-cd-github.sh

# Push test commits (with confirmation prompts)
./test-ci-cd-github.sh

# Push and wait for workflows to complete
WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh

# Create test PRs and validate branch policies
CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

#### Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `BRANCHES` | string | Space-separated branches (default: all 6) |
| `SKIP_COMPONENT_TRUNKS` | 0/1 | Skip testing component trunk branches |
| `SKIP_INTEGRATION` | 0/1 | Skip testing integration branch |
| `SKIP_MAIN` | 0/1 | Skip testing main branch |
| `SKIP_BRANCH_POLICY` | 0/1 | Skip branch policy validation |
| `CREATE_PRS` | 0/1 | Actually create PRs (default: 0 = dry-run) |
| `WAIT_FOR_WORKFLOWS` | 0/1 | Wait for workflows to complete |
| `VERIFY_ONLY` | 0/1 | Only check dependencies |
| `TIMEOUT_MINUTES` | int | Workflow timeout (default: 60 min) |

#### Examples

```bash
# Test only frontend and agent-backend branches
BRANCHES="frontend agent-backend" WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh

# Full validation with PR creation
CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 TIMEOUT_MINUTES=90 ./test-ci-cd-github.sh

# Skip branch policy tests
SKIP_BRANCH_POLICY=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

## Key Differences Between Versions

| Feature | PowerShell | Bash |
|---------|-----------|------|
| **Configuration** | Command-line parameters | Environment variables |
| **Branch Separator** | Comma (`,`) | Space (` `) |
| **Boolean Flags** | `-Switch` syntax | `0` or `1` values |
| **JSON Output** | Native PowerShell | `jq` (preferred) or manual |
| **Platforms** | Windows, Linux, macOS | Linux, macOS, WSL |

Both versions produce identical:
- Log file format and naming
- JSON results structure
- Exit codes
- Console output

## Safety Features

### Dry-Run Mode
By default, the script runs in **dry-run mode** for PR creation:
- Test commits are created and pushed
- Workflow runs are monitored
- **PRs are NOT created** unless `-CreatePRs` flag is used

### Confirmation Prompts
Before pushing each test commit, the script prompts:
```
Ready to push commit <sha> to origin/<branch>
This will trigger GitHub Actions workflows.
Continue? (Y/n)
```

### Commit Tracking
All test commits are tracked and logged for potential cleanup:
```json
{
  "branch": "frontend",
  "sha": "abc123..."
}
```

## Output

### Log Files
Logs are saved to `build-logs/test-ci-cd-github/` with inverse-timestamp naming:
```
inv{timestamp}__{readable-timestamp}__test-ci-cd-github.log
```

Log rotation keeps the 3 most recent logs.

### Results File
Workflow results are saved to:
```
build-logs/test-ci-cd-github/workflow-results.json
```

#### Results Schema
```json
{
  "timestamp": "2026-02-08 12:00:00",
  "repository": "cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3",
  "branches": {
    "frontend": {
      "commit": "abc123...",
      "workflowRun": {
        "id": 123456,
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/..."
      },
      "result": "success"
    }
  },
  "prs": {
    "frontend": {
      "url": "https://github.com/.../pull/123",
      "number": 123,
      "checks": [
        {
          "name": "actionlint",
          "status": "completed",
          "conclusion": "success"
        }
      ]
    }
  },
  "summary": {
    "totalWorkflows": 6,
    "passedWorkflows": 5,
    "failedWorkflows": 1,
    "timedOutWorkflows": 0,
    "totalPRs": 6,
    "passedPRs": 5,
    "failedPRs": 1
  }
}
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | All workflows passed |
| 1 | One or more workflows failed |
| 2 | Branch policy violations detected |
| 3 | gh CLI not available or not authenticated |
| 4 | Timeout waiting for workflows |

## Workflow

### Phase 2.1: Component Trunk Workflows
For each component trunk branch:
1. Create test commit with timestamp
2. Prompt for confirmation
3. Push commit to trigger workflow
4. Fetch latest workflow run
5. (Optional) Wait for completion

### Phase 2.2: Integration/Main Workflows
Test integration and main branch workflows (currently TODO).

### Phase 2.3: Branch Policy Validation
For each component branch:
1. Create test PR: `<branch> -> integration`
2. Wait for PR checks to run
3. Validate required checks pass
4. Close test PR (don't merge)

## gh CLI Commands Used

```bash
# Check authentication
gh auth status

# List workflow runs
gh run list --branch <branch> --limit 1 --json databaseId,status,conclusion

# View workflow run
gh run view <run-id> --json status,conclusion,url

# Create PR
gh pr create --base <base> --head <head> --title "..." --body "..."

# Get PR checks
gh pr checks <pr-url>

# Close PR
gh pr close <pr-number>
```

## Troubleshooting

### gh CLI Not Authenticated
```
ERROR: gh CLI not authenticated
Run: gh auth login
```
**Solution**: Run `gh auth login` and follow the prompts.

### Workflow Run Not Found
```
WARNING: No workflow runs found for branch <branch>
```
**Possible causes**:
- Branch doesn't have workflows configured
- Push didn't trigger workflows (check `.github/workflows/` patterns)
- GitHub API delay (wait a few seconds)

### PR Creation Failed
```
ERROR: Failed to create PR
```
**Possible causes**:
- No commits between head and base branch
- Branch protection prevents PR creation
- Authentication issues

## Integration with CI/CD Testing Plan

This script is **Phase 2** of the CI/CD testing plan:

1. **Phase 1** (Local): `scripts/test-ci-cd-local/test-ci-cd-local.ps1`
   - actionlint validation
   - Local test pipeline

2. **Phase 2** (GitHub): `scripts/test-ci-cd-github/test-ci-cd-github.ps1` ← **This script**
   - GitHub Actions workflows
   - Branch policy validation

3. **Phase 3** (Reporting): Generate comprehensive reports from JSON results

## Best Practices

### Before Running
1. Run local validation first: `.\scripts\test-ci-cd-local\test-ci-cd-local.ps1`
2. Ensure all local tests pass
3. Verify gh CLI authentication: `.\test-ci-cd-github.ps1 -VerifyOnly`

### Recommended Workflow
```powershell
# 1. Verify dependencies
.\test-ci-cd-github.ps1 -VerifyOnly

# 2. Test specific branches first
.\test-ci-cd-github.ps1 -Branches frontend -WaitForWorkflows

# 3. Full validation (dry-run PRs)
.\test-ci-cd-github.ps1 -WaitForWorkflows

# 4. Full validation with PR creation
.\test-ci-cd-github.ps1 -CreatePRs -WaitForWorkflows
```

### Cleanup Test Commits
After testing, you may want to clean up test commits:

```bash
# View test commits (from log output)
git log --oneline --grep="test(ci): workflow validation"

# Remove test files (if needed)
git rm .github/.test-commit-*
git commit -m "chore: remove test commit files"
```

## Related Documentation

- [CI/CD Workflows](../../docs/testing/ci-cd-workflows.md)
- [GitHub Actions Configuration](../../.github/workflows/)
- [Local Testing Script](../test-ci-cd-local/)
