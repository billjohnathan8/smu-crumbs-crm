# Branch Strategy & Guardrails

## Branch Hierarchy

```
main                          (production-ready, protected)
  └── integration             (staging — all component trunks merge here first)
        ├── frontend
        ├── agent-backend
        ├── client-backend
        ├── transaction-backend
        ├── log-backend
        ├── xfactor-backend
        └── infrastructure
              └── feat/*  fix/*  chore/*  hotfix/*   (short-lived work branches)
```

## Merge Direction Rules

| Target (base) | Allowed source (head) | Example |
|---|---|---|
| `main` | `integration` only | `integration → main` |
| `integration` | Component trunks + `feat/*`, `fix/*`, `chore/*`, `hotfix/*` | `frontend → integration` |
| Component trunk | `feat/*`, `fix/*`, `chore/*`, `hotfix/*` | `feat/login-page → frontend` |

### Branch Naming

Work branches must use one of these prefixes:

| Prefix | Use case |
|---|---|
| `feat/` | New features or enhancements |
| `fix/` | Bug fixes |
| `chore/` | Maintenance, dependency updates, tooling |
| `hotfix/` | Urgent production fixes |

## Enforcement

Since this is a GitHub Classroom org, we cannot use branch protection rules. Instead we use **soft enforcement**:

### 1. CI Workflow — `.github/workflows/branch-policy.yml`

A GitHub Actions workflow that runs on every PR and **fails the check** if the merge direction violates the rules above. The check status appears in the PR Checks tab.

### 2. CODEOWNERS — `.github/CODEOWNERS`

Automatically requests reviews from the team that owns the changed files. While not enforced (no "required reviews from code owners" setting), it provides visibility.

### 3. PR Template — `.github/pull_request_template.md`

Every new PR gets a checklist reminding contributors to:
- Run local tests
- Follow branch naming conventions
- Update docs if needed
- Run `make k8s-validate` for infra changes

### 4. Local Git Hooks — `.githooks/pre-push`

Blocks direct pushes to `main` and `integration` from the developer's machine.

**Setup (one-time per clone):**

```bash
git config core.hooksPath .githooks
```

**Bypass (rare, intentional only):**

```bash
ALLOW_DIRECT_PUSH=1 git push
```

On Windows (PowerShell):

```powershell
$env:ALLOW_DIRECT_PUSH = "1"; git push
```

## Typical Workflow

1. Create a work branch from the component trunk:
   ```bash
   git checkout frontend
   git checkout -b feat/login-page
   ```

2. Do your work, commit, push:
   ```bash
   git push -u origin feat/login-page
   ```

3. Open a PR: `feat/login-page → frontend`

4. Once merged, the trunk owner opens a PR: `frontend → integration`

5. When integration is stable, open a PR: `integration → main`

## FAQ

**Q: I accidentally pushed to `main` / `integration`. What do I do?**
A: If you haven't set up the git hooks, do so now: `git config core.hooksPath .githooks`. For the accidental push, coordinate with the team to revert if needed.

**Q: My PR check says "BRANCH POLICY VIOLATION". What now?**
A: Read the error message — it tells you which branch you should be targeting. Close the PR and re-open against the correct base branch.

**Q: Can I merge a feature branch directly into `integration`?**
A: Yes, for cross-cutting work that spans multiple components. The policy allows `feat/*`, `fix/*`, `chore/*`, and `hotfix/*` branches into `integration`.
