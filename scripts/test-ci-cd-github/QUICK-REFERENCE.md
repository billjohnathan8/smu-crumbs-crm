# Quick Reference: PowerShell vs Bash

## Command Comparison

### Common Tasks

| Task | PowerShell | Bash |
|------|------------|------|
| **Verify dependencies** | `.\test-ci-cd-github.ps1 -VerifyOnly` | `VERIFY_ONLY=1 ./test-ci-cd-github.sh` |
| **Test with wait** | `.\test-ci-cd-github.ps1 -WaitForWorkflows` | `WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh` |
| **Create PRs** | `.\test-ci-cd-github.ps1 -CreatePRs -WaitForWorkflows` | `CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh` |
| **Custom timeout** | `.\test-ci-cd-github.ps1 -TimeoutMinutes 90` | `TIMEOUT_MINUTES=90 ./test-ci-cd-github.sh` |
| **Specific branches** | `.\test-ci-cd-github.ps1 -Branches frontend,agent-backend` | `BRANCHES="frontend agent-backend" ./test-ci-cd-github.sh` |

### All Configuration Options

#### PowerShell
```powershell
.\test-ci-cd-github.ps1 `
    -Branches frontend,agent-backend `
    -SkipComponentTrunks `
    -SkipIntegration `
    -SkipMain `
    -SkipBranchPolicy `
    -CreatePRs `
    -WaitForWorkflows `
    -VerifyOnly `
    -TimeoutMinutes 60
```

#### Bash
```bash
BRANCHES="frontend agent-backend" \
SKIP_COMPONENT_TRUNKS=1 \
SKIP_INTEGRATION=1 \
SKIP_MAIN=1 \
SKIP_BRANCH_POLICY=1 \
CREATE_PRS=1 \
WAIT_FOR_WORKFLOWS=1 \
VERIFY_ONLY=1 \
TIMEOUT_MINUTES=60 \
./test-ci-cd-github.sh
```

## Syntax Differences

### Boolean Flags

**PowerShell**: Use switch parameters
```powershell
-CreatePRs          # Enable
# (omit to disable)
```

**Bash**: Use 0 (false) or 1 (true)
```bash
CREATE_PRS=1        # Enable
CREATE_PRS=0        # Disable (or omit)
```

### List Separators

**PowerShell**: Comma-separated
```powershell
-Branches frontend,agent-backend,log-backend
```

**Bash**: Space-separated (quoted)
```bash
BRANCHES="frontend agent-backend log-backend"
```

## Which Version Should I Use?

### Use PowerShell If:
- You're on Windows
- You prefer typed parameters
- You want parameter validation
- You're already using PowerShell scripts

### Use Bash If:
- You're on Linux/macOS
- You're in WSL
- You prefer Unix-style scripts
- You're integrating with shell pipelines

## Functional Equivalence

Both versions provide identical functionality:
- ✅ Same exit codes
- ✅ Same log file naming (inverse timestamp)
- ✅ Same JSON output structure
- ✅ Same gh CLI commands
- ✅ Same workflow and PR handling
- ✅ Same error messages and logging

## Tips

### PowerShell
- Use tab completion: `.\test-ci-cd-github.ps1 -<Tab>`
- Get help: `Get-Help .\test-ci-cd-github.ps1 -Full`
- Check syntax: `pwsh -File test-ci-cd-github.ps1 -WhatIf` (if implemented)

### Bash
- Check syntax: `bash -n test-ci-cd-github.sh`
- Set defaults in profile: `export WAIT_FOR_WORKFLOWS=1`
- Use with make: `make test-ci-cd-github` (if Makefile target exists)

## Common Workflows

### 1. Quick Dependency Check

```bash
# PowerShell
.\test-ci-cd-github.ps1 -VerifyOnly

# Bash
VERIFY_ONLY=1 ./test-ci-cd-github.sh
```

### 2. Test Single Branch

```bash
# PowerShell
.\test-ci-cd-github.ps1 -Branches frontend -WaitForWorkflows

# Bash
BRANCHES="frontend" WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

### 3. Full Validation (Dry-Run PRs)

```bash
# PowerShell
.\test-ci-cd-github.ps1 -WaitForWorkflows

# Bash
WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

### 4. Full Validation (Create PRs)

```bash
# PowerShell
.\test-ci-cd-github.ps1 -CreatePRs -WaitForWorkflows -TimeoutMinutes 90

# Bash
CREATE_PRS=1 WAIT_FOR_WORKFLOWS=1 TIMEOUT_MINUTES=90 ./test-ci-cd-github.sh
```

### 5. Skip Policy Tests

```bash
# PowerShell
.\test-ci-cd-github.ps1 -SkipBranchPolicy -WaitForWorkflows

# Bash
SKIP_BRANCH_POLICY=1 WAIT_FOR_WORKFLOWS=1 ./test-ci-cd-github.sh
```

## Output Location

Both versions output to the same locations:

```
build-logs/test-ci-cd-github/
├── inv{timestamp}__{readable}__test-ci-cd-github.log
└── workflow-results.json
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - all workflows passed |
| 1 | Failure - one or more workflows failed |
| 2 | Policy violation - branch policy checks failed |
| 3 | Dependency error - gh CLI not available/authenticated |
| 4 | Timeout - workflows did not complete in time |

## Examples for CI/CD Integration

### GitHub Actions (Bash)
```yaml
- name: Test GitHub workflows
  run: |
    WAIT_FOR_WORKFLOWS=1 \
    TIMEOUT_MINUTES=30 \
    ./scripts/test-ci-cd-github/test-ci-cd-github.sh
```

### Azure Pipelines (PowerShell)
```yaml
- task: PowerShell@2
  inputs:
    filePath: 'scripts/test-ci-cd-github/test-ci-cd-github.ps1'
    arguments: '-WaitForWorkflows -TimeoutMinutes 30'
```

### Jenkins (Bash)
```groovy
sh '''
  export WAIT_FOR_WORKFLOWS=1
  export TIMEOUT_MINUTES=30
  ./scripts/test-ci-cd-github/test-ci-cd-github.sh
'''
```
