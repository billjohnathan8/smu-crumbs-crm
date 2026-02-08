# CI Architecture

## Overview

The CI pipeline is built from **reusable workflow building blocks** under `.github/workflows/_reusable/` and a **shared composite action** for failure diagnostics. Entry workflows (in `.github/workflows/`) compose these blocks into full pipelines.

## Reusable Workflows

### `_reusable/changes.yml` - Changed-Files Detection

**Purpose**: Computes boolean outputs per scope so downstream jobs can skip unaffected components.

**How it works**: Uses [dorny/paths-filter](https://github.com/dorny/paths-filter) to compare the PR diff (or push diff) against path patterns derived from the repo structure.

**Outputs**:

| Output | Paths Watched |
|--------|--------------|
| `backend-agent` | `services/backend/agent/**` |
| `backend-client` | `services/backend/client/**` |
| `backend-transaction` | `services/backend/transaction/**` |
| `backend-log` | `services/backend/log/**` |
| `frontend` | `services/frontend/crm-ui/**` |
| `k8s-manifests` | `platform/k8s/apps/**` |
| `k8s-infra` | `platform/k8s/infra/**` |
| `scripts` | `scripts/**`, `Makefile` |
| `ci-config` | `.github/workflows/**`, `.github/actions/**` |
| `any-backend` | (aggregate: any backend service) |
| `any-service` | (aggregate: any backend or frontend) |
| `any-k8s` | (aggregate: manifests or infra) |

**Usage**:
```yaml
jobs:
  changes:
    uses: ./.github/workflows/_reusable/changes.yml

  my-job:
    needs: changes
    if: needs.changes.outputs.backend-agent == 'true'
    # ...
```

### `_reusable/lint.yml` - Lint / Format / Typecheck

**Purpose**: Runs all static analysis checks across the repo. Designed for fail-fast - cheapest checks first with tight timeouts.

**Inputs**:

| Input | Type | Description |
|-------|------|-------------|
| `run-backend-java` | boolean | Run Checkstyle for Java services (agent, client, transaction as a matrix) |
| `run-backend-python` | boolean | Run Black + Flake8 for the log service |
| `run-frontend` | boolean | Run ESLint + Prettier + TypeScript typecheck for crm-ui |

**What it runs**:
- **Java**: `./gradlew checkstyleMain checkstyleTest` (3 services in parallel via matrix)
- **Python**: `black --check app tests` + `flake8 --jobs 1 app tests`
- **Frontend**: `npm run typecheck` + `npm run lint` + `npm run format:check`

### `_reusable/test-component.yml` - Generic Test Runner

**Purpose**: Runs tests for a single component with automatic runtime setup, caching, and failure artifact upload.

**Inputs**:

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `component` | string | yes | Component name (used in artifact names) |
| `runtime` | string | yes | `java`, `python`, or `node` |
| `working-directory` | string | yes | Path to component directory |
| `test-command` | string | yes | Shell command to run tests |
| `timeout-minutes` | number | no | Job timeout (default: 10) |
| `artifact-paths` | string | no | Glob paths to upload on failure |

**Example - testing the agent service**:
```yaml
uses: ./.github/workflows/_reusable/test-component.yml
with:
  component: agent
  runtime: java
  working-directory: services/backend/agent
  test-command: |
    chmod +x gradlew
    ./gradlew test jacocoTestReport --no-daemon --console=plain
  artifact-paths: services/backend/agent/build/reports/**
```

**Example - testing the frontend**:
```yaml
uses: ./.github/workflows/_reusable/test-component.yml
with:
  component: frontend
  runtime: node
  working-directory: services/frontend/crm-ui
  test-command: npm run test:coverage
  artifact-paths: services/frontend/crm-ui/coverage/**
```

### `_reusable/k8s-validate.yml` - Kubernetes Manifest Validation

**Purpose**: Validates K8s manifests offline (no cluster required). Runs helm template rendering + kubeconform validation via the existing `scripts/validate-k8s/validate.sh`.

**Inputs**:

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `run-smoke-preflight` | boolean | true | Also run smoke manifest preflight (SMOKE_VALIDATE_ONLY=1) |

**What it runs**:
1. `make k8s-validate` (helm template + kubeconform for infra charts + kustomize overlay)
2. Smoke manifest preflight (validates smoke script can parse manifests without a cluster)

### `_reusable/kind-smoke.yml` - Full Integration Deploy + Smoke

**Purpose**: Creates a kind cluster, deploys all services, and runs in-cluster smoke tests. Uses the existing `scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh` script.

**Inputs**:

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `kind-cluster-name` | string | cs301-crm | kind cluster name |
| `namespace` | string | dev | K8s namespace |
| `timeout-minutes` | number | 45 | Job timeout |

**On failure**: Automatically runs the `k8s-debug` composite action (see below).

## Shared Composite Action

### `.github/actions/k8s-debug/action.yml` - K8s Debug Diagnostics

**Purpose**: Captures comprehensive Kubernetes diagnostics when a deploy or smoke test fails.

**What it captures**:
- Pod status across all namespaces
- Services and ingress across all namespaces
- Recent events (last 200)
- Pod descriptions in the target namespace
- Container logs (tail 200) for all pods in the target namespace
- StatefulSet status
- Node status
- Helm releases

**Usage in a workflow**:
```yaml
- name: Capture diagnostics on failure
  if: failure()
  uses: ./.github/actions/k8s-debug
  with:
    namespace: dev
```

## How to Add a New Component

1. **Add the component directory** under `services/backend/<name>/` or `services/frontend/<name>/`.

2. **Add a path filter** in `_reusable/changes.yml`:
   ```yaml
   backend-newservice:
     - 'services/backend/newservice/**'
   ```
   Also update the `any-backend` aggregate in the `Compute aggregate flags` step.

3. **Add lint checks** (if applicable):
   - For Java: Add the service name to the `matrix.service` array in `_reusable/lint.yml`
   - For Python: Add a new job or extend the existing `python-lint` job
   - For Node: Add a new job similar to `frontend-lint`

4. **Wire up test-component** in `ci-main.yml`:
   ```yaml
   test-newservice:
     needs: [changes, lint]                                  # lint gates tests
     if: >-
       needs.changes.outputs.backend-newservice == 'true'
       || needs.changes.outputs.ci-config == 'true'          # safety net
     uses: ./.github/workflows/_reusable/test-component.yml
     with:
       component: newservice
       runtime: java  # or python, node
       working-directory: services/backend/newservice
       test-command: ./gradlew test --no-daemon
   ```
   Then add the new job to the `needs:` list of `k8s-validate` so it gates downstream.

5. **Update kind-smoke** if the new service needs to be deployed to the cluster (add Dockerfile, K8s manifests, update Makefile `build-images`/`kind-load` targets).

## Job DAG and Gating Rules

The entry workflow (`ci-main.yml`) enforces a strict layered DAG where cheap jobs gate expensive ones:

```
changes  (5s)
   |
   v
 lint    (3-5 min, only scopes that changed)
   |
   +---> test-agent           \
   +---> test-client           |  parallel, each gated by its scope
   +---> test-transaction      |
   +---> test-log              |
   +---> test-frontend        /
   |
   v
k8s-validate  (needs ALL tests, gated by k8s/scripts/ci-config scope)
   |
   v
kind-smoke    (needs k8s-validate, push-to-main or workflow_dispatch ONLY)
```

### Gating Rules

| Rule | Implementation |
|------|---------------|
| Lint gates everything | All test jobs have `needs: [changes, lint]` |
| Tests gate k8s-validate | `k8s-validate` has `needs:` on all 5 test jobs |
| Failed test blocks downstream | `k8s-validate` uses `if: !failure() && !cancelled()` |
| Skipped tests don't block | GitHub Actions treats `skipped` as passable for `needs` |
| kind-smoke requires k8s-validate | `kind-smoke` has `needs: k8s-validate` |
| kind-smoke never runs on PRs | `if: github.event_name == 'push' \|\| github.event_name == 'workflow_dispatch'` |
| ci-config is a safety net | All `if:` conditions include `\|\| needs.changes.outputs.ci-config == 'true'` |

### Scope-to-Job Mapping

Each job runs only when its scope (or the `ci-config` safety net) is flagged as changed:

| Job | Runs when these scopes are true |
|-----|-------------------------------|
| lint (Java checkstyle) | `any-backend` OR `ci-config` |
| lint (Python) | `backend-log` OR `ci-config` |
| lint (Frontend) | `frontend` OR `ci-config` |
| test-agent | `backend-agent` OR `ci-config` |
| test-client | `backend-client` OR `ci-config` |
| test-transaction | `backend-transaction` OR `ci-config` |
| test-log | `backend-log` OR `ci-config` |
| test-frontend | `frontend` OR `ci-config` |
| k8s-validate | `any-k8s` OR `scripts` OR `ci-config` |
| kind-smoke | (always, when event is push/dispatch and upstream passed) |

### How `!failure() && !cancelled()` Works

Jobs downstream of optional (skippable) jobs use this pattern:

```yaml
k8s-validate:
  needs: [changes, lint, test-agent, test-client, test-transaction, test-log, test-frontend]
  if: >-
    !failure() && !cancelled()
    && (needs.changes.outputs.any-k8s == 'true' || ...)
```

- If a test job is **skipped** (scope didn't change): downstream runs normally.
- If a test job **fails**: `!failure()` is false, downstream is skipped.
- If a test job is **cancelled**: `!cancelled()` is false, downstream is skipped.

This ensures infrastructure validation never runs if application tests are broken, but isn't blocked by tests that were simply not needed.

## Changed-Files Detection

The `changes.yml` workflow is the foundation for path-filtered CI. It runs first and produces boolean outputs that downstream jobs use in `if:` conditions.

**How it works**:
- On `pull_request`: Compares the PR branch against the base branch
- On `push`: Compares the push commit(s) against the previous HEAD
- On `workflow_dispatch`: All outputs default to `true` (runs everything)

### How to Update Filters

1. **Add a new scope**: Edit `_reusable/changes.yml`:
   - Add a new entry under `filters:` in the `dorny/paths-filter` step
   - Add matching `outputs:` at both the job and workflow level
   - Update aggregate flags if the new scope belongs to an existing group

2. **Change watched paths**: Edit the path patterns in the `filters:` block. Patterns follow [minimatch](https://github.com/isaacs/minimatch) syntax.

3. **Wire the new scope**: In `ci-main.yml`, add `if:` conditions that reference `needs.changes.outputs.<new-scope>`.

**Safety net**: If `ci-config` is true (workflow files changed), all jobs run regardless of other path filters. This prevents CI changes from silently breaking the pipeline.

## Speed & Fail-Fast Defaults

| Setting | Value | Where Applied |
|---------|-------|---------------|
| `concurrency.cancel-in-progress` | `true` on PRs, `false` on main | `ci-main.yml` |
| `concurrency.group` | `ci-main-${{ github.ref }}` | `ci-main.yml` |
| Lint timeout | 3-5 min | `_reusable/lint.yml` |
| Test timeout | 10 min (default) | `_reusable/test-component.yml` |
| K8s validate timeout | 5 min | `_reusable/k8s-validate.yml` |
| Kind deploy timeout | 45 min | `_reusable/kind-smoke.yml` |
| Artifact upload | On failure only | All reusable workflows (except deploy logs: always) |
| Permissions | `contents: read` | All reusable workflows + `ci-main.yml` |
| Matrix fail-fast | `true` | `_reusable/lint.yml` Java checkstyle matrix |

## Caching Strategy

| Runtime | Setup Action | Cache Key Source |
|---------|-------------|-----------------|
| Java/Gradle | `actions/setup-java@v4` with `cache: gradle` | `**/build.gradle`, wrapper properties |
| Node/npm | `actions/setup-node@v4` with `cache: npm` | `package-lock.json` |
| Python/pip | `actions/setup-python@v5` with `cache: pip` | `requirements.txt` |

## Branch Policy & Guardrails

For details on the branch strategy, merge direction rules, CODEOWNERS, PR templates, and local git hooks, see **[branch-strategy.md](branch-strategy.md)**.
