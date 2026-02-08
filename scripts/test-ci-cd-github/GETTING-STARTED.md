# Getting Started with GitHub Actions Testing

## Quick Start

### 1. Prerequisites Check

**PowerShell:**
```powershell
.\test-ci-cd-github.ps1 -VerifyOnly
```

**Bash:**
```bash
VERIFY_ONLY=1 ./test-ci-cd-github.sh
```

**Expected Output:**
```
[2026-02-08 13:00:00] ==================================================
[2026-02-08 13:00:00] Dependency Check
[2026-02-08 13:00:00] ==================================================
[2026-02-08 13:00:00] ✅ git - Version control
[2026-02-08 13:00:00] ✅ gh - GitHub CLI
[2026-02-08 13:00:00] ✅ gh - Authenticated
[2026-02-08 13:00:00]
[2026-02-08 13:00:00] All required dependencies are available.
```

### 2. Run Your First Test

**Test a single branch without waiting:**

```bash
# PowerShell
.\test-ci-cd-github.ps1 -Branches frontend

# Bash
BRANCHES="frontend" ./test-ci-cd-github.sh
```

This will:
1. Create a test commit on the `frontend` branch
2. Ask for confirmation before pushing
3. Push the commit to trigger workflows
4. Fetch the workflow run information
5. Exit (without waiting for completion)

### 3. Monitor Workflow Completion

**Test with automatic waiting:**

```bash
# PowerShell
.\test-ci-cd-github.ps1 -Branches frontend -WaitForWorkflows

# Bash
BRANCHES="frontend" WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

This will wait for the workflow to complete and show real-time status updates:
```
[2026-02-08 13:05:00] Waiting for workflow run 12345678 to complete (timeout: 60 min)...
[2026-02-08 13:05:30]   [00:30] Status: in_progress, Conclusion: null
[2026-02-08 13:06:00]   [01:00] Status: in_progress, Conclusion: null
[2026-02-08 13:08:45]   [03:45] Status: completed, Conclusion: success
[2026-02-08 13:08:45] ✅ Workflow completed successfully
```

### 4. Test Branch Policies (Dry Run)

**Simulate PR creation without actually creating PRs:**

```bash
# PowerShell
.\test-ci-cd-github.ps1 -SkipComponentTrunks -WaitForWorkflows

# Bash
SKIP_COMPONENT_TRUNKS=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

This shows what PRs would be created:
```
[2026-02-08 13:10:00] ==================================================
[2026-02-08 13:10:00] PHASE 2.3: Branch Policy Validation
[2026-02-08 13:10:00] ==================================================
[2026-02-08 13:10:00] DRY RUN MODE: No PRs will be created
[2026-02-08 13:10:00] Set CREATE_PRS=1 to actually create test PRs
[2026-02-08 13:10:00]
[2026-02-08 13:10:00] Testing branch policy: frontend -> integration
[2026-02-08 13:10:00] DRY RUN: Would create PR: frontend -> integration
[2026-02-08 13:10:00]   Title: test(ci): Branch policy validation - frontend -> integration
```

### 5. Full Validation with PR Creation

**When you're ready to test actual branch policies:**

```bash
# PowerShell
.\test-ci-cd-github.ps1 -SkipComponentTrunks -CreatePRs -WaitForWorkflows

# Bash
SKIP_COMPONENT_TRUNKS=1 CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

⚠️ **Warning**: This will create and close real PRs in your repository.

## Understanding the Output

### Log Files

Logs are saved to `build-logs/test-ci-cd-github/` with inverse timestamps:

```
build-logs/test-ci-cd-github/
├── inv79731023-104614__2026-02-08_13-13-45__test-ci-cd-github.log
├── inv79731023-110000__2026-02-08_13-00-00__test-ci-cd-github.log
└── workflow-results.json
```

**Why inverse timestamps?**
- Files are automatically sorted with newest first
- Easier to find recent logs
- `inv79731023` = `2026-02-08` inverted

### Results JSON

After running, check `workflow-results.json`:

```json
{
  "timestamp": "2026-02-08 13:13:45",
  "repository": "cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3",
  "branches": {
    "frontend": {
      "commit": "abc123def456...",
      "workflowRun": {
        "id": "12345678",
        "status": "completed",
        "conclusion": "success",
        "url": "https://github.com/..."
      },
      "result": "success"
    }
  },
  "summary": {
    "totalWorkflows": 1,
    "passedWorkflows": 1,
    "failedWorkflows": 0,
    "timedOutWorkflows": 0
  }
}
```

## Common Scenarios

### Scenario 1: Test All Component Branches

```bash
# PowerShell
.\test-ci-cd-github.ps1 -WaitForWorkflows -TimeoutMinutes 90

# Bash
WAIT_FOR_WORKFLOWS=1 TIMEOUT_MINUTES=90 ./test-ci-cd-github.sh
```

Tests all 6 component branches:
- frontend
- agent-backend
- log-backend
- client-backend
- transaction-backend
- infrastructure

### Scenario 2: Test Only Backend Services

```bash
# PowerShell
.\test-ci-cd-github.ps1 -Branches agent-backend,log-backend,client-backend,transaction-backend -WaitForWorkflows

# Bash
BRANCHES="agent-backend log-backend client-backend transaction-backend" WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

### Scenario 3: Validate Branch Protection Rules

```bash
# PowerShell
.\test-ci-cd-github.ps1 -SkipComponentTrunks -CreatePRs -WaitForWorkflows

# Bash
SKIP_COMPONENT_TRUNKS=1 CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

This tests that:
- Required checks are configured
- Branch protection is active
- Status checks must pass before merge

### Scenario 4: Quick Smoke Test

```bash
# PowerShell
.\test-ci-cd-github.ps1 -Branches frontend -TimeoutMinutes 10

# Bash
BRANCHES="frontend" TIMEOUT_MINUTES=10 ./test-ci-cd-github.sh
```

Fast test of a single branch with short timeout.

## Troubleshooting

### Problem: "gh CLI not authenticated"

**Solution:**
```bash
gh auth login
```

Follow the prompts to authenticate with GitHub.

### Problem: "No workflow runs found for branch"

**Possible causes:**
1. Branch doesn't have workflows defined in `.github/workflows/`
2. Workflow path filters don't match the test commit
3. GitHub API delay (wait 10-15 seconds and retry)

**Debug:**
```bash
# Check workflow files for this branch
ls .github/workflows/ci-*-backend.yml

# View workflow triggers
cat .github/workflows/ci-frontend.yml | grep -A 5 "on:"
```

### Problem: "Failed to create test commit"

**Possible causes:**
1. Branch doesn't exist locally
2. No write permission
3. Working directory is dirty

**Solution:**
```bash
# Fetch all branches
git fetch --all

# Check branch exists
git branch -a | grep frontend

# Clean working directory
git status
```

### Problem: Workflow times out

**Cause:** Workflow takes longer than the timeout period.

**Solutions:**
1. Increase timeout: `-TimeoutMinutes 120` or `TIMEOUT_MINUTES=120`
2. Check workflow logs for hangs
3. Skip waiting: don't use `-WaitForWorkflows` / `WAIT_FOR_WORKFLOWS=1`

## Best Practices

### 1. Start Small
Test one branch before testing all:
```bash
BRANCHES="frontend" WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

### 2. Verify Dependencies First
Always run dependency check on new machines:
```bash
VERIFY_ONLY=1 ./test-ci-cd-github.sh
```

### 3. Use Dry-Run for PRs
Test PR logic without creating real PRs:
```bash
# Omit CREATE_PRS flag - defaults to dry-run
WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

### 4. Monitor First Runs
Watch the first workflow completion to ensure it's working:
```bash
BRANCHES="frontend" WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

### 5. Clean Up Test Commits
Remove test files periodically:
```bash
git log --oneline --grep="test(ci): workflow validation"
git rm .github/.test-commit-*
git commit -m "chore: clean up test commit files"
```

## Exit Codes Reference

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | All workflows passed ✅ |
| 1 | Workflow failure | Check workflow logs ❌ |
| 2 | Policy violation | Review branch protection ❌ |
| 3 | Dependency error | Install/authenticate gh CLI ❌ |
| 4 | Timeout | Increase timeout or check for hangs ⏱️ |

## Next Steps

After testing workflows, you can:
1. Review workflow results in `workflow-results.json`
2. Analyze failed workflows in GitHub Actions UI
3. Adjust workflows based on test results
4. Document workflow changes
5. Run full integration tests

## Related Documentation

- [README.md](./README.md) - Full documentation
- [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) - PowerShell vs Bash comparison
- [../../docs/testing/ci-cd-workflows.md](../../docs/testing/ci-cd-workflows.md) - Overall CI/CD testing plan

## Need Help?

1. Check the logs: `build-logs/test-ci-cd-github/*.log`
2. Review workflow results: `build-logs/test-ci-cd-github/workflow-results.json`
3. Check GitHub Actions UI: `https://github.com/cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3/actions`
4. Review script documentation: `README.md`
