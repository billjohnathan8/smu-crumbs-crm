# Contributing to CS301-ITSA-Scroogebank-CRM

Thank you for contributing to the project! This guide will help you understand our development workflow, standards, and best practices.

---

## 🎯 Quick Start for Contributors

1. **Setup your environment:** [New Developer Setup](docs/onboarding/new-dev-setup.md)
2. **Confirm Python prerequisite:** [Python Requirement Guide](docs/prerequisites/PYTHON-REQUIREMENT.md)
3. **Read the coding standards:** [Coding Standards](docs/coding-standards/coding-standards.md)
4. **Understand the architecture:** [System Architecture](docs/README.md#architecture-overview)
5. **Run tests locally:** [Testing Guide](docs/testing/TESTING-GUIDE.md)
6. **Follow the PR process:** [Pull Request Process](#pull-request-process)

---

## 📋 Table of Contents

- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Branch Strategy](#branch-strategy)
- [Git Hooks Setup](#git-hooks-setup)
- [Code Review Guidelines](#code-review-guidelines)
- [Documentation Standards](#documentation-standards)

---

## 🔄 Development Workflow

### 1. Create a Feature Branch

```bash
# Update main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-feature-name
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/fixes
- `chore/` - Maintenance tasks

### 2. Make Your Changes

- Write clean, maintainable code following our [coding standards](docs/coding-standards/coding-standards.md)
- Add tests for new functionality
- Update documentation as needed
- Keep commits atomic and meaningful

### 3. Run Tests Locally

**Before committing, always run:**

```bash
# Run all tests
python scripts/pipelines/test_all.py

# Or run specific test suites
python scripts/pipelines/test_backend.py    # Backend only
python scripts/pipelines/test_frontend.py   # Frontend only
python scripts/pipelines/test_terraform.py  # Terraform only (isolated wrapper)
```

On Linux/macOS/WSL, if `python` is not available, use `python3` for the same commands.


### 4. Commit Your Changes

```bash
# Stage changes
git add <files>

# Commit with descriptive message (see commit message format below)
git commit -m "feat: add user authentication endpoint"
```

### 5. Push and Create Pull Request

```bash
# Push to your branch
git push origin feature/your-feature-name

# Create PR on GitHub using the PR template
```

---

## 📝 Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring (no functional changes)
- `test` - Adding or updating tests
- `chore` - Maintenance tasks (dependencies, tooling)
- `perf` - Performance improvements
- `ci` - CI/CD changes

**Examples:**

```bash
feat(user): add CRUD endpoints for user management
fix(client): resolve null pointer exception in client service
docs: update local deployment guide
test(transaction): add integration tests for transaction service
refactor(log): simplify logging configuration
chore: update dependencies to latest versions
```

---

## 🎨 Coding Standards

### General Principles

- **Write clean, self-documenting code** - Code should be readable without excessive comments
- **Follow SOLID principles** - Especially Single Responsibility and Dependency Inversion
- **Keep it simple** - Avoid over-engineering; implement what's needed, not what might be needed
- **Test your code** - All new functionality must have tests
- **No secrets in code** - Use environment variables and config files

### Language-Specific Standards

#### Java (Backend Services)

**Style Guide:** [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)

**Tools:**
- **Checkstyle** - Enforced in build pipeline
- **PMD** - Static code analysis
- **SpotBugs** - Bug detection

**Conventions:**
- Package names: lowercase, no underscores (`com.scroogebank.crm.user`)
- Class names: PascalCase (`UserService`, `ClientController`)
- Method names: camelCase (`getUserById`, `createClient`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT`)

**Testing:**
- Unit tests: JUnit 5 + Mockito
- Test class naming: `<ClassName>Test` (e.g., `UserServiceTest`)
- Test method naming: `<methodName>_<scenario>_<expectedResult>`
  ```java
  @Test
  void getUserById_whenAgentExists_returnsAgent() { ... }
  ```

**Coverage requirements:**
- Line coverage: ≥ 80%
- Branch coverage: ≥ 75%

#### Python (Log Service)

**Style Guide:** [PEP 8](https://pep8.org/)

**Tools:**
- **black** - Code formatter (enforced)
- **flake8** - Linter
- **mypy** - Type checker (recommended)

**Conventions:**
- Module names: lowercase_with_underscores (`log_service.py`)
- Class names: PascalCase (`LogService`, `AuditEvent`)
- Function names: lowercase_with_underscores (`get_logs_by_client_id`)
- Constants: UPPER_SNAKE_CASE (`MAX_LOG_ENTRIES`, `DEFAULT_PORT`)

**Testing:**
- Unit tests: pytest
- Test file naming: `test_<module_name>.py`
- Test function naming: `test_<function>_<scenario>`
  ```python
  def test_get_logs_when_client_exists_returns_logs():
      ...
  ```

**Coverage requirements:**
- Line coverage: ≥ 80%
- Branch coverage: ≥ 75%

**Type hints:**
```python
def get_log_by_id(log_id: int) -> Optional[LogEntry]:
    ...
```

#### TypeScript/React (Frontend)

**Style Guide:** [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)

**Tools:**
- **ESLint** - Linter (enforced)
- **Prettier** - Code formatter (enforced)
- **TypeScript** - Strict mode enabled

**Conventions:**
- Component names: PascalCase (`UserList`, `ClientForm`)
- File names: PascalCase for components (`UserList.tsx`)
- Hook names: camelCase starting with `use` (`useAgents`, `useClientData`)
- Utility files: kebab-case (`api-client.ts`, `date-utils.ts`)

**Component structure:**
```tsx
import { useState } from 'react';

interface UserListProps {
  onUserSelect: (userId: string) => void;
}

export function UserList({ onUserSelect }: UserListProps) {
  const [users, setAgents] = useState([]);

  // Component logic...

  return (
    // JSX...
  );
}
```

**Testing:**
- Unit tests: Vitest + React Testing Library
- E2E tests: Playwright (manual execution)
- Test file naming: `<ComponentName>.test.tsx`

**Coverage requirements:**
- Lines: ≥ 55%
- Branches: ≥ 56%
- Functions: ≥ 33%
- Statements: ≥ 54%

---

## 🧪 Testing Requirements

### Test Before You Commit

**Minimum requirements:**
1. All tests pass locally
2. No linting errors
3. Code formatted according to project standards
4. Coverage thresholds met (if adding new code)

**Run full test suite:**

```bash
python scripts/pipelines/test_all.py
```

`scripts/pipelines/test_all.py` automatically reads repo-root `.env.local` as default values for local credentials/secrets (DB, JWT, seeded users). Variables already exported in your shell still win (for example `INFRACOST_API_KEY`).

On Linux/macOS/WSL, run `python3 scripts/pipelines/test_all.py` when `python` is unavailable.

**Expected output:**
- ✅ All backend tests pass
- ✅ All frontend tests pass
- ✅ Coverage reports generated
- ✅ Exit code 0

### Test Coverage

**Where to find coverage reports:**

- **Aggregated:** `build-logs/test-all/index.html`
- **Backend:** `build-logs/test-backend/index.html`
- **Frontend:** `services/frontend/crm-ui/coverage/index.html`
- **Per-service:** `services/backend/<service>/build/reports/jacoco/test/html/index.html`

**Coverage expectations:**

| Component | Line Coverage | Branch Coverage |
|-----------|---------------|-----------------|
| Java Services | ≥ 80% | ≥ 75% |
| Python Service | ≥ 80% | ≥ 75% |
| Frontend | ≥ 55% | ≥ 56% |

**Adding tests:**

- **Unit tests:** Test individual functions/methods in isolation
- **Integration tests:** Test interactions between components
- **E2E tests:** Test complete user flows (Playwright for frontend)

---

## 📤 Pull Request Process

### 1. Use the PR Template

When creating a PR, the [PR template](.github/pull_request_template.md) will auto-populate. Fill out all sections:

- **What**: Describe the changes
- **Why**: Explain the motivation
- **How**: Explain the approach
- **Testing**: List what you tested
- **Screenshots**: Add for UI changes
- **Checklist**: Complete all items

### 2. PR Checklist (Required)

Before requesting review, ensure:

- [ ] Tests pass locally: `python scripts/pipelines/test_all.py`
- [ ] Code follows coding standards
- [ ] Frontend code formatted: `npm run format` in `services/frontend/crm-ui/`
- [ ] New code has tests
- [ ] Coverage thresholds met
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow convention
- [ ] No merge conflicts with target branch
- [ ] PR description is clear and complete

### 3. Request Review

- Tag relevant reviewers based on [CODEOWNERS](.github/CODEOWNERS)
- Respond to feedback promptly
- Make requested changes in new commits (don't force-push during review)
- Re-request review after addressing feedback

### 4. Merge

Once approved:
- Squash and merge (preferred) OR merge commit (for feature branches)
- Delete the feature branch after merge
- Verify CI/CD passes on the target branch

---

## 🌿 Branch Strategy

We use a **component trunk** strategy with branch policies:

### Branch Types

| Branch | Purpose | Who Can Push | Merge From |
|--------|---------|--------------|------------|
| `main` | Production-ready code | Maintainers only (via PR) | `integration` |
| `integration` | Integration testing | Maintainers only (via PR) | Component trunks |
| `frontend` | Frontend development | Frontend team | Feature branches |
| `user-backend` | User service | Backend team | Feature branches |
| `client-backend` | Client service | Backend team | Feature branches |
| `transaction-backend` | Transaction service | Backend team | Feature branches |
| `log-backend` | Log service | Backend team | Feature branches |
| `feature/*` | Individual features | Creator | N/A (merge into component trunks) |

### Merge Direction (Enforced by CI)

```
feature/* → component-trunk → integration → main
```

**Example:**
```
feature/add-auth → frontend → integration → main
```

### Branch Protection

We use **soft branch protection** via CI checks (GitHub Classroom doesn't support true branch protection):

- **Branch policy CI** - Fails PRs that violate merge rules
- **Required reviews** - 1+ approvals from CODEOWNERS
- **Status checks** - All tests and validation must pass

**Full details:** [Branch Strategy Guide](docs/testing/ci/branch-strategy.md)

---

## 🪝 Git Hooks Setup

We provide client-side git hooks to prevent common mistakes.

### Setup (One-Time Per Clone)

```bash
git config core.hooksPath .githooks
```

### Available Hooks

**pre-push:**
- Blocks direct pushes to `main` and `integration`
- Forces you to use PRs for protected branches

**pre-commit (optional):**
- Runs linters on staged files
- Auto-formats code (if configured)

### Bypass Hooks (Emergency Only)

```bash
git push --no-verify  # Skip pre-push hook (use with caution!)
```

⚠️ **Warning:** Only bypass hooks if absolutely necessary (e.g., fixing a broken CI build). Your PR will still need to pass all CI checks.

---

## 👀 Code Review Guidelines

### For Authors

- **Keep PRs small** - Aim for < 500 lines of code
- **One concern per PR** - Don't mix features, fixes, and refactoring
- **Provide context** - Fill out the PR template completely
- **Respond promptly** - Address feedback within 1-2 days
- **Don't take it personally** - Code review is about the code, not you

### For Reviewers

- **Review within 1-2 days** - Don't block progress
- **Be constructive** - Suggest improvements, don't just criticize
- **Focus on important issues** - Distinguish between "must fix" and "nice to have"
- **Approve when ready** - Don't nitpick after multiple rounds
- **Test locally if needed** - For complex changes, checkout and test

**What to look for:**
- Code correctness and logic errors
- Test coverage and quality
- Adherence to coding standards
- Security vulnerabilities
- Performance issues
- Documentation completeness

---

## 📖 Documentation Standards

### When to Update Documentation

Update docs when you:
- Add a new feature
- Change an API
- Modify deployment process
- Fix a common issue (add to troubleshooting)
- Change configuration options

### Documentation Locations

| Type | Location |
|------|----------|
| **Architecture** | `docs/README.md#architecture-overview` |
| **API specs** | `docs/api-contracts/openapi/*.yaml` |
| **Service README** | `services/<backend|frontend>/<service>/README.md` |
| **User guide** | `docs/` with appropriate subdirectory |
| **ADRs** | `docs/architectural-decisions-record/` |

### Markdown Style

- Use relative links: `[text](../path/to/file.md)`
- Use code fences with language: ` ```bash `
- Use tables for structured data
- Use collapsible sections for long content: `<details><summary>Title</summary>...</details>`
- Keep lines < 120 characters (soft limit)

**Example:**

```markdown
## Section Title

Brief introduction.

### Subsection

Content with [link](path/to/doc.md).

```bash
code example
` ``

| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |
```

---

## 🚫 What Not to Commit

### Never commit:
- Secrets, passwords, API keys
- AWS credentials or tokens
- Database connection strings (except for local dev with placeholders)
- Personal IDE settings (`.idea/`, `.vscode/` already in `.gitignore`)
- Build artifacts (`build/`, `dist/`, `node_modules/`)
- Log files (`*.log`, `build-logs/` already gitignored)

### Check before committing:
- Commented-out code (remove it; use git history if needed later)
- Debug print statements (`console.log`, `System.out.println`)
- TODO comments without issue references

---

## ❓ Questions or Issues?

**Need help with:**
- **Setup issues:** [New Developer Setup](docs/onboarding/new-dev-setup.md)
- **Testing failures:** [Testing Guide](docs/testing/TESTING-GUIDE.md)
- **General issues:** [Troubleshooting Guide](docs/troubleshooting.md)

**Can't find the answer?**
- Check [documentation hub](docs/README.md)
- Ask in team chat
- Open a GitHub issue

---

## 🙏 Thank You!

Your contributions make this project better. Thank you for following these guidelines and maintaining high standards!

**Happy coding! 🚀**

