# Coding Standards & Contribution Guidelines (CS301 ITSA CRM)

This document defines **how we write code**, **how we structure changes**, and **how we ship safely** for the CS301 ITSA CRM project (Kubernetes-first, AWS-realistic, OpenAPI-first).

> **Applies to:** `/services/*`, `/platform/*`, `/tests/*`, and `/docs/*`  
> **Primary goals:** maintainability, security, repeatability, and reviewability.

---

## 1) Golden Rules

1. **OpenAPI-first:** API changes start in `/docs/api-contracts/openapi/<service>.yaml`, then implementation follows.
2. **No secrets in Git:** never commit credentials, tokens, `.env`, kubeconfig, private keys.
3. **Small, reviewable PRs:** prefer frequent, small merges over “big bang” PRs.
4. **Consistency > preference:** if the formatter/linter disagrees with you, you lose.
5. **Everything must be reproducible:** builds, tests, deployments should work from a clean checkout.

---

## 2) Repository Structure (Expected)

```
/services                 # application code (frontend + microservices)
/platform
  /terraform              # AWS infra as code
  /k8s
    /infra                # cluster add-ons (ingress, monitoring, etc.)
    /apps                 # app manifests + env overlays (Kustomize)
/tests
  /e2e                    # Playwright e2e tests
/docs
  /architectural-decisions-record   # architecture decision records
  /main-diagrams          # diagrams, flows
  /api-contracts/openapi  # OpenAPI specs per service (source of truth)
```

---

## 3) Git Workflow

### 3.1 Branching Model
We use a **feature-branch** workflow:
- `main` is always deployable.
- Work happens in short-lived branches, merged via Pull Request (PR).

**Branch naming**
- `feature/<short-name>` — new feature work
- `fix/<short-name>` — bugfix
- `chore/<short-name>` — maintenance tasks
- `docs/<short-name>` — documentation-only
- `ci/<short-name>` — pipeline changes

Examples:
- `feature/client-profile-edit`
- `fix/sftp-parser-null-guard`
- `chore/update-deps`
- `docs/adr-auth-decision`

### 3.2 Keep Main Up-to-Date
Before starting and before opening a PR:
```bash
git checkout main
git pull origin main
git checkout feature/your-branch
git merge main   # or rebase main if the team agrees
```

---

## 4) Commit Message Standards (Conventional Commits)

We follow **Conventional Commits**:

```
<type>[optional scope]: <description>
[optional body]
[optional footer(s)]
```

**Common types**
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `test:` tests only
- `refactor:` code change that neither fixes a bug nor adds a feature
- `perf:` performance improvement
- `build:` build system changes (Gradle, Docker, Vite, etc.)
- `ci:` CI pipeline changes
- `chore:` routine chores (dependency bumps, formatting, etc.)

**Scopes (recommended)**
Use a scope when it helps locate the change:
- `feat(users-service): add role-based guards`
- `fix(frontend): prevent empty client save`
- `docs(adr): add decision for db-migrations`

**Breaking changes**
- Add `!` after type/scope, or use footer `BREAKING CHANGE: ...`

Examples:
- `feat(api)!: rename /clients/search to /clients/query`
- `BREAKING CHANGE: removes legacy clientId field`

---

## 5) Pull Requests (PRs)

### 5.1 PR Requirements
A PR is mergeable only when:
- All required CI checks pass
- At least one reviewer approves (or team rule)
- The PR description includes **What / Why / How to test**
- Any impacted docs/OpenAPI specs are updated

### 5.2 PR Template (Use This Structure)

**Title:** concise, action-oriented  
Example: `feat(clients-service): add account summary endpoint`

**Description:**
- **Summary:** what changed
- **Motivation:** why it changed
- **How to test:** commands + steps
- **Screenshots:** for UI changes
- **Risk/rollout:** if relevant

### 5.3 PR Size Guidance
- Prefer **≤ 400 lines** net change for normal PRs.
- Split large work into stacked PRs (OpenAPI specs → backend → frontend → infra).

### 5.4 Merge Strategy
Default: **Squash and merge** to keep history readable (unless team chooses otherwise).

---

## 6) Code Review Expectations

Reviewers look for:
- Correctness + edge cases
- Clarity and naming
- Minimal coupling between services
- Security: authZ/authN correctness, no secrets
- Tests: new behavior covered
- API contract alignment

Authors should:
- Respond to comments, push follow-up commits
- Keep discussion in the PR (avoid DMs for decisions)
- Update docs/OpenAPI specs if behavior changed

---

## 7) Language & Formatting Standards

### 7.1 General Standards (All Code)
- Use clear names: `clientId`, `transactionBatch`, `retryCount` > `x`, `tmp`
- Prefer composition over duplication: extract helpers/utilities
- Keep functions small and single-purpose
- Avoid “magic numbers” / “magic strings”; centralize constants
- Remove debug logs before merging (or gate behind log levels)

### 7.2 TypeScript / React (Frontend)
**Tools**
- TypeScript strict mode (recommended)
- ESLint + Prettier
- (Optional) style rules: `eslint-config-airbnb` or `@typescript-eslint`

**Rules**
- Prefer functional components + hooks
- No `any` unless justified (use `unknown` + narrowing)
- Centralize API client code (e.g., `src/api/`)
- Validate user input at UI boundaries
- Keep components focused; extract reusable UI components

**Naming**
- Components: `PascalCase` (e.g., `ClientProfileCard.tsx`)
- Hooks: `useSomething` (e.g., `useClientSearch.ts`)
- Variables/functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` when truly constant

### 7.3 Java 21 / Spring Boot (Backend Services)
**Tools**
- Formatter: Spotless (recommended) or equivalent
- Lint/static analysis: Checkstyle / PMD / SpotBugs (choose at least one)
- Testing: JUnit + Mockito (+ Testcontainers for integration tests)

**Rules**
- Controllers should be thin: validation + orchestration only
- Business logic belongs in `service` layer
- Persistence logic in `repository` layer
- Use DTOs for API boundaries (don’t expose JPA entities directly)
- Prefer constructor injection
- Validate inputs (Bean Validation annotations)

**Naming**
- Classes: `PascalCase`
- Methods/fields: `camelCase`
- Packages: `lowercase`
- Test classes: `*Test` / `*IT` for integration tests

### 7.4 Kubernetes Manifests (YAML)
**Rules**
- Use Kustomize overlays for environments (`dev`, `staging`, `prod`)
- Always set resource requests/limits for services (baseline)
- Add readiness/liveness probes
- Do not hardcode secrets (use Secrets or External Secrets)
- Keep manifests minimal; avoid duplication via Kustomize patches

**Validation**
- Run manifest validation in CI (e.g., kubeconform/kubeval)
- Prefer pinned image tags (commit SHA), not `latest`

### 7.5 Terraform (AWS IaC)
**Rules**
- One module per responsibility (network, eks, rds, cognito, ecr)
- Avoid copy/paste between environments; use variables/workspaces
- Use remote state + locking for teams
- Never commit `.tfstate` or `.tfstate.backup`

**Required checks**
- `terraform fmt -check`
- `terraform validate`
- (Recommended) `tflint`

### 7.6 OpenAPI Contracts
**Rules**
- OpenAPI in `/docs/api-contracts/openapi/<service>.yaml` is the **source of truth**
- Keep schemas DRY via `$ref`
- Document error responses (400/401/403/404/409/422/500 as applicable)
- Include examples for requests/responses
- Version your base path (`/api/v1/...`)

**Validation**
- Validate OpenAPI in CI (`openapi-cli validate` or Spectral lint)

**Swagger UI verification (required stage)**

Before implementing an API change (and before opening a PR that changes `/docs/api-contracts/openapi/<service>.yaml`), you **must** render the spec in **Swagger UI** and confirm it reads correctly end-to-end.

**Step-by-step (Docker; recommended)**
1. From the repo root, choose the spec you edited:
   - `docs/api-contracts/openapi/<service>.yaml`
2. Run Swagger UI pointing at that file:
   - macOS/Linux/WSL:
     ```bash
     SPEC="docs/api-contracts/openapi/<service>.yaml"
     docker run --rm -p 8080:8080 \
       -e SWAGGER_JSON=/spec/openapi.yaml \
       -v "$(pwd)/$SPEC":/spec/openapi.yaml \
       swaggerapi/swagger-ui
     ```
   - Windows (PowerShell):
     ```powershell
     $spec = "docs/api-contracts/openapi/<service>.yaml"
     $root = $PWD.Path.Replace('\','/')
     docker run --rm -p 8080:8080 `
       -e SWAGGER_JSON=/spec/openapi.yaml `
       -v "$root/$spec:/spec/openapi.yaml" `
       swaggerapi/swagger-ui
     ```
3. Open Swagger UI in your browser:
   - `http://localhost:8080`
4. Verify (minimum checks):
   - All endpoints are present and grouped as expected (tags)
   - Request/response bodies render with the correct schemas and examples
   - Auth scheme(s) display correctly (e.g., `bearerAuth`), and required security is applied to protected routes
   - Common error responses (400/401/403/404/409/422/500) are documented where relevant
   - The versioned base path is correct (e.g., `/api/v1/...`)

> If Swagger UI can’t render the spec cleanly, treat it as a contract bug and fix the OpenAPI file before implementing the backend/frontend change.

---

## 8) Comments & Documentation Standards

### 8.1 Comments
- Comment **why**, not **what**
- Keep comments accurate and updated
- Avoid redundant comments (“increment i by 1”)

### 8.2 Docstrings / Javadoc
- Public APIs and non-trivial functions/classes must be documented:
  - TypeScript: TSDoc style comments for public exports
  - Java: Javadoc for public classes/methods where behavior isn't obvious

### 8.3 Documentation Artefacts (When to Update)
You **must** update documentation when you:
- Add a major feature or service
- Change an API contract (especially breaking changes)
- Change authentication/authorization behavior
- Introduce a new integration (SFTP, third-party API, etc.)
- Make an architectural decision (add an ADR)

**Doc locations**
- `/docs/architectural-decisions-record` — decisions and rationale
- `/docs/main-diagrams` — diagrams, sequences, comms
- `/docs/api-contracts/openapi` — API contracts (source of truth)

**Naming**
- Use `kebab-case` and version where appropriate:
  - `docs/main-diagrams/system-context-v1.md`
  - `docs/api-contracts/openapi/client.yaml`
  - `docs/architectural-decisions-record/adr-0003-example.md`

---

## 9) Testing Standards

### 9.1 Required Test Types
- **Unit tests:** required for new logic
- **Integration tests:** for persistence + external dependencies (DB, SFTP parsing)
- **E2E tests (Playwright):** cover key user journeys

### 9.2 Coverage Expectations (Practical Targets)
- New or changed logic should be **highly covered**
  - Aim: ~100% of the lines you touched where practical
  - Branch coverage target: **≥ 80%** for new decision logic
- Do not chase meaningless coverage; test important behaviors and edge cases

### 9.3 Test Hygiene
- Tests must be deterministic (no flaky sleeps, no dependence on network)
- Prefer explicit fixtures and seed data
- Name tests clearly:
  - `shouldRejectRequestWhenTokenMissing`
  - `rendersClientListWhenSearchSucceeds`

---

## 10) CI Quality Gates (What Must Pass)

CI should fail if any of these fail (tooling may vary by implementation):
- **Frontend**
  - Typecheck
  - ESLint
  - Prettier format check
  - Unit tests
- **Backend**
  - Build (Gradle)
  - Unit tests + integration tests
  - Static analysis (Checkstyle/SpotBugs/etc.)
- **Contracts**
  - OpenAPI validation/lint
- **Kubernetes**
  - Manifest validation (kubeconform)
- **Terraform**
  - fmt + validate (+ optional tflint)
- **E2E**
  - Playwright suite (at least on main or nightly; ideally on PRs)

---

## 11) Pre-Push / Pre-PR Checklist

Before pushing or opening a PR, you should be able to answer **YES**:

1. **Build & run**
- [ ] My changes compile/run locally

2. **Tests**
- [ ] I ran relevant unit tests and they pass
- [ ] I added tests for new behavior or bug fixes

3. **Lint/format**
- [ ] Formatters and linters pass (no warnings I’m ignoring)

4. **Contracts**
- [ ] If I changed an API, the OpenAPI spec is updated and validated

5. **Docs**
- [ ] If I changed behavior/architecture, I updated docs/ADRs

6. **Security**
- [ ] No secrets committed; authZ/authN checks remain correct

---

## 12) Handling Review Feedback

To update your PR after feedback:
```bash
git checkout feature/your-branch
# make changes
git add .
git commit -m "fix: address review feedback for <topic>"
git push
```

---

## 13) After Merge Cleanup

```bash
git checkout main
git pull origin main
git branch -d feature/your-branch
```

---

## 14) “When in Doubt” Rules

- If you’re unsure about an API: **update the contract first**
- If you’re unsure about a design: **write an ADR**
- If you’re unsure about correctness: **write a test**
- If you’re unsure about the build: **run CI locally (or the closest equivalent)**

---

## Appendix A — Suggested Tooling (Recommended Defaults)

> The team may finalize exact tools in the repo (CI config + configs). This list is the recommended baseline.

- Frontend: `eslint`, `prettier`, `typescript`, `vitest`
- Backend: `spotless`, `checkstyle`/`spotbugs`, `junit`, `mockito`, `testcontainers`
- E2E: `playwright`
- Contracts: `openapi-cli`, `spectral`
- K8s: `kubeconform`, `helm lint`
- Terraform: `terraform fmt/validate`, `tflint`

---

## Appendix B — Example Conventional Commits

- `feat(users-service): add admin create-agent endpoint`
- `fix(transactions-service): handle empty SFTP file gracefully`
- `docs(adr): add decision for database migration strategy`
- `ci: add terraform validate job`
- `chore: bump frontend dependencies`
