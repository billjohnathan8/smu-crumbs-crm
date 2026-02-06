# Coding Standards & Contribution Guidelines (CS301 ITSA CRM)

This document defines **how we write code**, **how we structure changes**, and **how we ship safely** for the CS301 ITSA CRM project (Kubernetes-first, AWS-realistic, OpenAPI-first).

If there are any issues and you need help, please ping the **telegram** or **discord**.

> **Applies to:** `/services/*`, `/platform/*`, `/tests/*`, and `/docs/*`  
> **Primary goals:** maintainability, security, repeatability, and reviewability.

## Index

- [1) Golden Rules](#sec-1-golden-rules)
- [2) Repository Structure (WIP)](#sec-2-repo-structure)
- [3) Git Workflow](#sec-3-git-workflow)
  - [3.1 Branching Model](#sec-3-1-branching-model)
  - [3.2 Keep Main Up-to-Date](#sec-3-2-keep-main-up-to-date)
- [4) Commit Message Standards (Conventional Commits)](#sec-4-commit-messages)
- [5) Pull Requests (PRs)](#sec-5-pull-requests)
  - [5.1 PR Requirements](#sec-5-1-pr-requirements)
  - [5.2 PR Template (Use This Structure)](#sec-5-2-pr-template)
  - [5.3 PR Size Guidance](#sec-5-3-pr-size)
  - [5.4 Merge Strategy](#sec-5-4-merge-strategy)
- [6) Code Review Expectations](#sec-6-code-review)
- [7) Language & Formatting Standards](#sec-7-language-formatting)
  - [7.1 General Standards (All Code)](#sec-7-1-general)
  - [7.2 TypeScript / React (Frontend)](#sec-7-2-ts-react)
  - [7.3 Java 21 / Spring Boot (Backend Services)](#sec-7-3-java-spring)
  - [7.4 Kubernetes Manifests (YAML)](#sec-7-4-k8s-yaml)
  - [7.5 Terraform (AWS IaC)](#sec-7-5-terraform)
  - [7.6 OpenAPI Contracts](#sec-7-6-openapi)
- [8) Comments & Documentation Standards](#sec-8-comments-docs)
  - [8.1 Comments](#sec-8-1-comments)
  - [8.2 Docstrings / Javadoc](#sec-8-2-docstrings-javadoc)
  - [8.3 Documentation Artefacts (When to Update)](#sec-8-3-doc-artefacts)
- [9) Testing Standards](#sec-9-testing)
  - [9.1 Required Test Types](#sec-9-1-required-test-types)
  - [9.2 Coverage Expectations (Service-Aware, Practical Targets)](#sec-9-2-coverage-expectations)
  - [9.3 Test Hygiene](#sec-9-3-test-hygiene)
  - [9.4 Local Pipeline + Report Review (Required Before PR)](#sec-9-4-local-pipeline)
- [10) CI Quality Gates (What Must Pass)](#sec-10-ci-quality-gates)
- [11) Pre-Push / Pre-PR Checklist](#sec-11-pre-push-checklist)
- [12) Handling Review Feedback](#sec-12-review-feedback)
- [13) After Merge Cleanup](#sec-13-after-merge)
- [14) “When in Doubt” Rules](#sec-14-when-in-doubt)
- [Appendix A — Suggested Tooling (Recommended Defaults)](#sec-app-a-tooling)
- [Appendix B — Example Conventional Commits](#sec-app-b-conventional-commits)

---

<a id="sec-1-golden-rules"></a>
## 1) Golden Rules

1. **OpenAPI-first:** API changes start in `/docs/api-contracts/openapi/<service>.yaml`, then implementation follows.
2. **No secrets in Git:** never commit credentials, tokens, `.env`, kubeconfig, private keys.
3. **Small, reviewable PRs:** prefer frequent, small merges over “big bang” PRs.
4. **Consistency > preference:** if the formatter/linter disagrees with you, you lose.
5. **Everything must be reproducible:** builds, tests, deployments should work from a clean checkout.

---

<a id="sec-2-repo-structure"></a>
## 2) Repository Structure (WIP)

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

<a id="sec-3-git-workflow"></a>
## 3) Git Workflow

<a id="sec-3-1-branching-model"></a>
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

<a id="sec-3-2-keep-main-up-to-date"></a>
### 3.2 Keep Main Up-to-Date
Before starting and before opening a PR:
```bash
git checkout main
git pull origin main
git checkout feature/your-branch
git merge main   # or rebase main if the team agrees
```

---

<a id="sec-4-commit-messages"></a>
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

<a id="sec-5-pull-requests"></a>
## 5) Pull Requests (PRs)

<a id="sec-5-1-pr-requirements"></a>
### 5.1 PR Requirements
A PR is mergeable only when:
- All required CI checks pass
- At least one reviewer approves (or team rule)
- The PR description includes **What / Why / How to test**
- Any impacted docs/OpenAPI specs are updated

<a id="sec-5-2-pr-template"></a>
### 5.2 PR Template (Use This Structure)

**Title:** concise, action-oriented  
Example: `feat(client-service): add account summary endpoint`

**Description:**
- **Summary:** what changed
- **Motivation:** why it changed
- **How to test:** commands + steps
- **Screenshots:** for UI changes
- **Risk/rollout:** if relevant

<a id="sec-5-3-pr-size"></a>
### 5.3 PR Size Guidance
- Prefer **≤ 400 lines** net change for normal PRs.
- Split large work into stacked PRs (OpenAPI specs → backend → frontend → infra).

<a id="sec-5-4-merge-strategy"></a>
### 5.4 Merge Strategy
Default: **Squash and merge** to keep history readable (unless team chooses otherwise).

---

<a id="sec-6-code-review"></a>
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

<a id="sec-7-language-formatting"></a>
## 7) Language & Formatting Standards

<a id="sec-7-1-general"></a>
### 7.1 General Standards (All Code)
- Use clear names: `clientId`, `transactionBatch`, `retryCount` > `x`, `tmp`
- Prefer composition over duplication: extract helpers/utilities
- Keep functions small and single-purpose
- Avoid “magic numbers” / “magic strings”; centralize constants
- Remove debug logs before merging (or gate behind log levels)

<a id="sec-7-2-ts-react"></a>
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

<a id="sec-7-3-java-spring"></a>
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

<a id="sec-7-4-k8s-yaml"></a>
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

<a id="sec-7-5-terraform"></a>
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

<a id="sec-7-6-openapi"></a>
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

<a id="sec-8-comments-docs"></a>
## 8) Comments & Documentation Standards

<a id="sec-8-1-comments"></a>
### 8.1 Comments
- Comment **why**, not **what**
- Keep comments accurate and updated
- Avoid redundant comments (“increment i by 1”)

<a id="sec-8-2-docstrings-javadoc"></a>
### 8.2 Docstrings / Javadoc
- Public APIs and non-trivial functions/classes must be documented:
  - TypeScript: TSDoc style comments for public exports
  - Java: Javadoc for public classes/methods where behavior isn't obvious

<a id="sec-8-3-doc-artefacts"></a>
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

<a id="sec-9-testing"></a>
## 9) Testing Standards

<a id="sec-9-1-required-test-types"></a>
### 9.1 Required Test Types
- **Unit tests:** required for new logic
- **Integration tests:** for persistence + external dependencies (DB, SFTP parsing)
- **E2E tests (Playwright):** cover key user journeys

<a id="sec-9-2-coverage-expectations"></a>
### 9.2 Coverage Expectations (Service-Aware, Practical Targets)
Coverage is a **quality signal**, not the goal. We prioritize **meaningful coverage** of business rules, validation, and error handling over “coverage of boilerplate”.

#### A) Baseline gates (applies to every service)
These are the default CI/local pipeline thresholds **per service**:

- **Line/Instruction coverage ≥ 80%**
- **Branch coverage ≥ 70%**
- **No regression rule:** overall coverage must not drop vs `main`

> If a service is very small/new, these thresholds still apply, but you may temporarily use the “diff coverage gate” (below) while the service grows.

#### B) Tiered expectations (depending on what the service is)

**Tier 1 — Core business microservices**  
(e.g., `users-service`, `client-service`, `transaction-service`, anything implementing core CRM rules)
- **Overall:** Lines/Instructions ≥ **85%**, Branches ≥ **75%**
- **Business-logic packages** (e.g., `service/`, `domain/`, validators): Lines/Instructions ≥ **90%**, Branches ≥ **80%**
- Must include unit tests for decision logic + happy/edge cases (401/403/404/409/422/500 where relevant)

**Tier 2 — Integration/adapter microservices**  
(e.g., `log-service`, SFTP adapters, external API connectors)
- **Overall:** Lines/Instructions ≥ **75–80%**, Branches ≥ **65–70%**
- Stronger emphasis on **integration tests** (e.g., parsing, DB writes, HTTP client error handling)
- Unit tests still required for “decision points” (retries/backoff, mapping, filtering, dedupe)

**Tier 3 — Thin orchestration / wiring / gateway-like services**  
(thin controllers, config-heavy modules, minimal logic)
- **Overall:** Lines/Instructions ≥ **70–75%**, Branches ≥ **60–65%**
- Must satisfy the **diff coverage gate** and have smoke/integration tests covering the real paths

#### C) Diff coverage gate (best ROI; always enforce on PRs)
To ensure we don’t add untested code:
- **New/changed lines:** ≥ **90% line/instruction coverage**
- **New/changed branches:** ≥ **80% branch coverage** (for any new decision logic)

#### D) What counts as “meaningful” coverage (and what doesn’t)
Coverage gates should focus on code that can break production behavior:

**Include / prioritize**
- Business rules, validators, mapping logic with conditions
- Error handling branches (timeouts, retries, null/empty inputs)
- Security checks (authN/authZ boundaries)
- DB interaction logic (at least via integration tests)

**May be excluded from strict gates (unless they contain logic)**
- DTOs / pure POJOs / JPA entities with no logic
- Generated code
- Spring Boot `Application` main class and pure configuration
- Logging wrappers that only forward calls

> Rule: If it has conditionals, parsing, mapping rules, or error handling — it’s logic and should be tested.

#### E) When coverage is “low but acceptable”
Low coverage is only acceptable when:
- The code is provably boilerplate/wiring (see exclusions), AND
- The service still passes diff coverage, AND
- There are integration tests validating the real runtime path (API → service → DB/external)

<a id="sec-9-3-test-hygiene"></a>
### 9.3 Test Hygiene
- Tests must be deterministic (no flaky sleeps, no dependence on network)
- Prefer explicit fixtures and seed data
- Name tests clearly:
  - `shouldRejectRequestWhenTokenMissing`
  - `rendersClientListWhenSearchSucceeds`

<a id="sec-9-4-local-pipeline"></a>
### 9.4 Local Pipeline + Report Review (Required Before PR)
This is mandatory for onboarding and for all contributors.

Before opening a PR, run the local pipeline for every service you changed, then read the generated reports and act on them.

#### Step 1: Run pipelines
From repo root (all backend services):
- PowerShell: `.\scripts\build-and-test\build-and-test-backend.ps1`
- CMD: `.\scripts\build-and-test-backend.cmd`
- Bash: `bash ./scripts/build-and-test/build-and-test-backend.sh`

From each backend service root (single service):
- Java services (`user-service`, `client-service`):
  - Windows: `.\gradlew.bat localTestPipeline`
  - macOS/Linux: `./gradlew localTestPipeline`
- Python service (`log-service`):
  - Windows: `python run-local-test-pipeline.py`
  - macOS/Linux: `python3 run-local-test-pipeline.py`

#### Step 2: Open reports (what to check, where to find)
For the aggregated coverage hub `build-logs/build-and-test/index.html`:
- Open it directly in a normal browser window (`file:///...`).
- Do **not** use VS Code **Open Preview** for this file.

Java backend services (`services/backend/user-service`, `services/backend/client-service`):
- Checkstyle (lint):
  - `build/reports/checkstyle/main.html`
  - `build/reports/checkstyle/test.html`
- JUnit test report:
  - `build/reports/tests/test/index.html`
- JaCoCo coverage:
  - HTML: `build/reports/jacoco/test/html/index.html`
  - XML: `build/reports/jacoco/test/jacocoTestReport.xml`

Python backend service (`services/backend/log-service`):
- Black + Flake8 lint:
  - In terminal output and `build-logs/build-and-test/*.log` (when run via repo-root scripts)
- Pytest report:
  - `build/reports/tests/junit.xml`
- Coverage:
  - HTML: `build/reports/coverage/html/index.html`
  - XML: `build/reports/coverage/coverage.xml`

Cross-service aggregated report:
- Hub: `build-logs/build-and-test/index.html` (open in browser, then click report links)

#### Step 3: What to do before PR
- Fix all lint/style failures (Checkstyle, Black, Flake8)
- Add or improve tests when coverage is weak in changed/new logic
- Re-run pipelines until all checks pass
- Confirm reports reflect expected improvement (especially around new branches/edge cases)

---

<a id="sec-10-ci-quality-gates"></a>
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

<a id="sec-11-pre-push-checklist"></a>
## 11) Pre-Push / Pre-PR Checklist

Before pushing or opening a PR, you should be able to answer **YES**:

1. **Build & run**
- [ ] My changes compile/run locally

2. **Tests**
- [ ] I ran relevant unit tests and they pass
- [ ] I added tests for new behavior or bug fixes
- [ ] I reviewed lint and coverage reports for each changed service

3. **Lint/format**
- [ ] Formatters and linters pass (no warnings I’m ignoring)

4. **Contracts**
- [ ] If I changed an API, the OpenAPI spec is updated and validated

5. **Docs**
- [ ] If I changed behavior/architecture, I updated docs/ADRs

6. **Security**
- [ ] No secrets committed; authZ/authN checks remain correct

---

<a id="sec-12-review-feedback"></a>
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

<a id="sec-13-after-merge"></a>
## 13) After Merge Cleanup

```bash
git checkout main
git pull origin main
git branch -d feature/your-branch
```

---

<a id="sec-14-when-in-doubt"></a>
## 14) “When in Doubt” Rules

- If you’re unsure about an API: **update the contract first**
- If you’re unsure about a design: **write an ADR**
- If you’re unsure about correctness: **write a test**
- If you’re unsure about the build: **run CI locally (or the closest equivalent)**

---

<a id="sec-app-a-tooling"></a>
## Appendix A — Suggested Tooling (Recommended Defaults)

> The team may finalize exact tools in the repo (CI config + configs). This list is the recommended baseline.

- Frontend: `eslint`, `prettier`, `typescript`, `vitest`
- Backend: `spotless`, `checkstyle`/`spotbugs`, `junit`, `mockito`, `testcontainers`
- E2E: `playwright`
- Contracts: `openapi-cli`, `spectral`
- K8s: `kubeconform`, `helm lint`
- Terraform: `terraform fmt/validate`, `tflint`

---

<a id="sec-app-b-conventional-commits"></a>
## Appendix B — Example Conventional Commits

- `feat(users-service): add admin create-agent endpoint`
- `fix(transaction-service): handle empty SFTP file gracefully`
- `docs(adr): add decision for database migration strategy`
- `ci: add terraform validate job`
- `chore: bump frontend dependencies`

