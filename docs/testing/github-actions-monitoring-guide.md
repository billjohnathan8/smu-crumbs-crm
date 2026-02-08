# GitHub Actions Monitoring & Optimization Guide

## Quick Links

- **Actions Dashboard**: https://github.com/cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3/actions
- **Workflow Insights**: Actions → Select workflow → "Insights" button

## Real-Time Monitoring

### 1. Watch Workflows in Real-Time

**Via GitHub Web UI:**
1. Go to Actions tab
2. Click on the running workflow
3. Live logs update automatically (refresh every few seconds)
4. Click on specific jobs to see step-by-step progress

**Via GitHub CLI (if installed):**
```bash
# List recent runs
gh run list --workflow ci-frontend.yml --limit 10

# Watch a specific run in real-time
gh run watch <run-id>

# View logs of completed run
gh run view <run-id> --log
```

### 2. Workflow Status Notifications

**Browser Notifications:**
1. Star your repository (top right)
2. Click profile icon → Settings → Notifications
3. Enable "Web and Mobile" notifications
4. Check "Actions" under "Watching"

**Email Notifications:**
- Automatically enabled for failed workflows on your branches
- Configure in: Settings → Notifications → Actions

**Mobile App:**
- Install GitHub mobile app
- Enable push notifications for workflow failures

---

## How to Make Workflows Fail Faster

### Current Timeout Configuration

| Workflow Component | Current Timeout | What It Does |
|-------------------|-----------------|--------------|
| **Checkout** | 2 min | Clone repository |
| **Setup (JDK/Node/Python)** | 2 min | Install runtime & cache |
| **Install dependencies** | 2-3 min | npm ci / pip install / gradle |
| **Lint steps** | 1-3 min each | ESLint, Checkstyle, Black, Flake8 |
| **Test job** | 10 min | Run all tests with coverage |
| **K8s validate** | 5 min | Helm render + kubeconform |
| **Kind smoke** | 45 min | Full cluster deploy + tests |

### Optimization Strategies

#### Strategy 1: Reduce Test Timeout (Currently: 10 min)

**Aggressive Mode** (Fast feedback, may timeout on slow runners):
```yaml
# In ci-frontend.yml, line 38
timeout-minutes: 5  # Down from 10
```

**When to use**:
- ✅ Tests typically finish in 2-3 minutes
- ❌ Don't use if tests are flaky or slow

**Where to change**: [ci-frontend.yml:38](../.github/workflows/ci-frontend.yml#L38)

#### Strategy 2: Enable fail-fast on Tests

Currently, if one test fails, other tests still run to completion. To fail immediately:

**Add to test jobs** (not currently configured):
```yaml
# Example: In ci-integration.yml
jobs:
  test-agent:
    ...
  test-client:
    ...
  test-transaction:
    ...
  test-log:
    ...
  test-frontend:
    ...
    strategy:
      fail-fast: true  # Add this to stop all tests if one fails
```

**Trade-off**:
- ✅ Faster failure feedback
- ❌ Won't see all failures in one run (must fix and re-run)

#### Strategy 3: Fail Lint Before Starting Tests

**Already implemented!** Lint is configured as a gate:
```yaml
test:
  needs: lint  # Test won't start until lint passes
```

This means if linting fails (typically within 3-5 min), tests never start, saving 10+ minutes.

#### Strategy 4: Aggressive Step Timeouts

**Current configuration** (already optimized):
- Checkout: 2 min ✅
- Setup actions: 2 min ✅
- Individual lint steps: 1-3 min ✅

**To make even more aggressive**, reduce these in [reusable-lint.yml](../.github/workflows/reusable-lint.yml):
```yaml
# Lines 124-134: Frontend lint steps
- name: TypeScript typecheck
  timeout-minutes: 1  # Down from 2

- name: ESLint
  timeout-minutes: 1  # Down from 2
```

#### Strategy 5: Skip Expensive Operations on PRs

**Kind smoke already optimized:**
- On `ci-main.yml`: Only runs on manual dispatch with flag
- On `ci-integration.yml`: Runs on push, NOT on PRs

**Current behavior** (optimal for fast feedback):
```yaml
# ci-integration.yml
kind-smoke:
  if: github.event_name != 'pull_request'  # Skip on PRs
```

**Result**: PRs get feedback in ~10-15 min instead of ~30 min.

---

## Understanding Workflow Execution Time

### Typical Execution Times

**Component Workflows** (e.g., ci-frontend.yml):
```
Checkout:           ~20s
Setup Node + cache: ~30s
Install deps:       ~1-2 min (npm ci)
Lint:              ~2-3 min (typecheck + ESLint + Prettier)
Tests:             ~3-5 min (Vitest with coverage)
────────────────────────────
Total:             ~7-10 min
```

**Integration Workflow** (ci-integration.yml without kind):
```
Changes detection:  ~5s
Actionlint:        ~30s
Lint (parallel):   ~3-5 min
Tests (parallel):  ~8-12 min (longest: client backend)
K8s validate:      ~1-2 min
────────────────────────────
Total:             ~13-18 min
```

**Integration Workflow WITH kind-smoke**:
```
... (above) ...    ~15 min
Kind smoke:        ~20-30 min (cluster + deploy + tests)
────────────────────────────
Total:             ~35-45 min
```

### Where Time Is Spent

**Setup Phase** (~2-3 min):
- Git checkout: 20-30s
- Actions cache hit/miss: 10-20s
- Runtime installation: 30s-1min
- Dependency installation: 1-2min

**Execution Phase** (varies):
- Lint: 2-5 min (typically 3 min)
- Tests: 3-12 min (depends on component)
- K8s validation: 1-2 min
- Kind deploy: 20-30 min (rare, expensive)

**Optimization Priority**:
1. **Lint** - Already optimized with fail-fast
2. **Tests** - Can add fail-fast or reduce timeout
3. **Setup** - Already using caching (hard to improve)
4. **Kind smoke** - Already skipped on PRs

---

## Monitoring Specific Workflows

### Check Which Workflows Triggered

**After pushing to a branch:**
1. Go to Actions tab immediately (within 10 seconds)
2. Look for new workflow runs with status 🟡 (in progress)
3. Verify ONLY expected workflows appear

**Example: Push to `frontend` branch should trigger:**
- ✅ `CI - Frontend` (ci-frontend.yml)
- ❌ No other component workflows

**If wrong workflows trigger**, check:
- Workflow `on.push.branches` configuration
- Whether you pushed to the correct branch

### Monitor PR Checks

**On Pull Request page:**
1. Go to PR
2. Click "Checks" tab
3. See all triggered workflows

**Expected checks for `feat/* → frontend` PR:**
```
✅ Enforce branch strategy (branch-policy.yml)
🟡 lint / ESLint + Prettier + Typecheck (Frontend) (ci-frontend.yml)
🟡 test / Test - frontend (ci-frontend.yml)
```

**Timeline to completion:**
- Branch policy: ~15-30 seconds
- Lint: ~3-5 minutes
- Test: ~5-10 minutes (runs after lint passes)

### Track Workflow History

**View all runs:**
1. Actions → Select workflow (e.g., "CI - Frontend")
2. See run history with status indicators
3. Click "Insights" button for analytics:
   - Success rate
   - Average duration
   - Slowest jobs

**Filter runs:**
- By branch: Click branch dropdown
- By actor: Click user dropdown
- By status: Click status dropdown (success/failure/cancelled)
- By date: Use date picker

---

## Interpreting Status and Logs

### Workflow Status Icons

| Icon | Status | Meaning | Action |
|------|--------|---------|--------|
| 🟡 Yellow dot | Queued/In Progress | Workflow is running | Wait or watch logs |
| ✅ Green check | Success | All jobs passed | ✅ Good to merge |
| ❌ Red X | Failure | One or more jobs failed | Click to see logs |
| ⚪ Gray circle | Skipped | Job skipped due to conditions | Expected for scope-gated jobs |
| 🚫 Red circle | Cancelled | Manually cancelled or concurrency | Re-run if needed |
| 🔄 Gray loop | Action required | Waiting for approval | Approve or reject |

### Job Status Details

**Click on a workflow run to see:**
```
✅ changes (5s)
✅ lint (4m 23s)
  ├─ ✅ Checkstyle (Java) (3m 12s)
  ├─ ✅ Black + Flake8 (Python) (2m 45s)
  └─ ✅ ESLint + Prettier + Typecheck (Frontend) (4m 10s)
🟡 test-frontend (running, 2m 15s elapsed)
⚪ test-agent (skipped)
⚪ test-client (skipped)
```

**Click on a job to see individual steps:**
```
✅ Checkout code (23s)
✅ Set up Node.js 20 (18s)
✅ Install dependencies (1m 34s)
🟡 Run tests (running...)
```

### Reading Failure Logs

**When a job fails:**
1. Click on the failed job (red X)
2. Expand the failed step
3. Scroll to the bottom for error summary
4. Look for:
   - **Test failures**: `FAIL src/...` or `Expected X, got Y`
   - **Lint errors**: `error: ...` or `✖ X problems`
   - **Timeout**: `The job running on ... exceeded the maximum execution time`

**Example test failure:**
```
FAIL services/frontend/crm-ui/src/components/Dashboard.test.tsx
  × Dashboard renders correctly (234ms)

  Expected: "Welcome"
  Received: null

  at Dashboard.test.tsx:15:23
```

**Action**: Fix the issue locally, commit, and push to trigger re-run.

---

## Quick Failure Diagnosis

### Common Failure Patterns

| Failure Type | Typical Time to Fail | How to Identify | Fix |
|--------------|---------------------|-----------------|-----|
| **Lint error** | 3-5 min | ESLint/Checkstyle job red | Run `npm run lint` or `./gradlew checkstyle` locally |
| **Test failure** | 5-12 min | Test job red, specific test failure | Run `npm run test` or `./gradlew test` locally |
| **Timeout** | Exactly at timeout limit | "exceeded maximum execution time" | Optimize code or increase timeout |
| **Dependency install fail** | 2-3 min | "npm ci" or "pip install" step red | Check package.json/requirements.txt |
| **Branch policy fail** | 15-30 sec | "Enforce branch strategy" red on PR | Wrong base/head branch combination |

### Fast Feedback Loop

**Optimal workflow for catching issues early:**

1. **Before pushing:**
   ```bash
   # Run checks locally (fastest feedback)
   npm run lint          # Frontend
   npm run test          # Frontend
   ./gradlew checkstyle  # Java backend
   ./gradlew test        # Java backend
   python -m black --check app  # Python
   python -m pytest      # Python
   ```

2. **After pushing:**
   - Watch Actions tab for 1-2 minutes
   - If lint fails (3-5 min), fix immediately
   - Tests only run if lint passes (saves time)

3. **On PR:**
   - Branch policy fails in ~30 seconds (fastest signal)
   - Component CI runs (10-15 min)
   - Fix issues and push updates (triggers re-run)

---

## Advanced Monitoring

### Using GitHub CLI for Monitoring

```bash
# Install (if not already)
winget install GitHub.cli
gh auth login

# List recent runs
gh run list --limit 20

# List runs for specific workflow
gh run list --workflow ci-frontend.yml --limit 10

# Watch a run in real-time (auto-updates)
gh run watch 1234567890

# View run details
gh run view 1234567890

# View logs (after completion)
gh run view 1234567890 --log

# Re-run failed jobs
gh run rerun 1234567890 --failed

# Cancel a running workflow
gh run cancel 1234567890
```

### Workflow Insights (Analytics)

**Access workflow analytics:**
1. Actions → Select workflow → "Insights" button (top right)

**Metrics available:**
- **Success rate**: % of runs that pass
- **Average duration**: Mean execution time
- **Run timeline**: Visual timeline of runs
- **Top failures**: Most common failure points

**Use insights to:**
- Identify flaky tests (inconsistent success rate)
- Track performance degradation (increasing duration)
- Prioritize optimization efforts (slowest jobs)

### Artifacts and Logs

**Download artifacts after failure:**
1. Scroll to bottom of workflow run page
2. "Artifacts" section shows uploads
3. Click to download (ZIP format)

**Available artifacts:**
- `test-reports-frontend`: Vitest results, coverage
- `test-reports-agent`: JUnit XML, JaCoCo coverage
- `k8s-validation-failure`: Rendered manifests (debugging)
- `k8s-deploy-logs`: Full deployment logs with diagnostics

**Retention**: 7 days (tests), 14 days (deploy failures)

---

## Optimization Summary

### What's Already Optimized ✅

1. **Fail-fast linting** - Lint gates tests
2. **Tight timeouts** - Individual steps have 1-3 min limits
3. **Concurrency control** - Cancel in-progress runs on new PR push
4. **Smart change detection** - Only affected components run
5. **Caching** - Gradle, npm, pip caches enabled
6. **Skip expensive ops on PRs** - Kind smoke only on push/manual

### What You Can Optimize Further ⚡

1. **Reduce test timeout** to 5 min (if tests are fast/stable)
2. **Add fail-fast to test matrix** (stop all tests if one fails)
3. **Reduce lint step timeouts** to 1 min (if currently passing in <1 min)
4. **Run only affected tests** (requires test splitting setup)

### Recommended Configuration for Fast Feedback

**For development branches (fast iteration):**
- ✅ Keep lint as gate
- ✅ Reduce test timeout to 5 min
- ✅ Add fail-fast to tests
- ✅ Skip kind smoke
- **Result**: ~5-8 min to first failure

**For integration/main (comprehensive):**
- ✅ Keep current 10 min test timeout
- ✅ Run all tests to completion (no fail-fast)
- ✅ Run kind smoke on push (validate deployability)
- **Result**: ~15-45 min, but catches all issues

---

## Monitoring Checklist

### After Push to Branch
- [ ] Check Actions tab within 30 seconds
- [ ] Verify correct workflow(s) triggered
- [ ] Monitor for ~5 min to catch lint failures
- [ ] If lint passes, tests will run (check back in 10 min)

### After Creating PR
- [ ] Go to PR → Checks tab
- [ ] Verify branch policy check status (~30 sec)
- [ ] Verify component CI triggered
- [ ] Monitor until all checks complete (~10-15 min)
- [ ] Address any failures and push updates

### Weekly Health Check
- [ ] Check workflow insights for success rate trends
- [ ] Review average duration for performance degradation
- [ ] Check for recurring failures (flaky tests)
- [ ] Review timeout settings if workflows frequently timeout

---

## Quick Reference: Time to First Failure

| Check Type | Time to Fail | When It Runs |
|------------|--------------|--------------|
| Branch policy | 15-30 sec | Every PR |
| Actionlint | 30-45 sec | Integration PRs |
| Lint (single component) | 3-5 min | Component changes |
| Test (single component) | 8-12 min | Component changes (after lint) |
| K8s validate | 10-15 min | K8s/infra changes |
| Kind smoke | 20-30 min | Push to integration/main (not PRs) |

**Target for fast feedback**: <5 min to catch most issues (lint failures).

**Average PR feedback time**: 10-15 min (without kind smoke).

---

## Troubleshooting

### "Workflow not triggering"
- **Wait**: 10-15 seconds for GitHub to process
- **Check**: Workflow `on` configuration matches your branch
- **Verify**: Branch was actually pushed (`git log origin/branch`)

### "Workflow stuck on 'Queued'"
- **Cause**: GitHub Actions runners busy (free tier has limits)
- **Action**: Wait 1-2 minutes, or check GitHub Status
- **If persistent**: Contact GitHub support

### "All jobs skipped"
- **Cause**: Conditions not met (change detection filtered everything out)
- **Check**: `changes` job output to see what was detected
- **Expected**: If only docs changed, tests may be skipped

### "Timeout on every run"
- **Cause**: Tests/lints are slower than timeout
- **Action**: Increase timeout in workflow configuration
- **Or**: Optimize the actual test/lint performance

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Project CI/CD Documentation](./ci-cd-workflows.md)
- [Branch Strategy](./ci/branch-strategy.md)
- [CI Architecture](./ci/architecture.md)
