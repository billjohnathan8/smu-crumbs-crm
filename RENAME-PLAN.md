# Project Rename Plan: CS301 ITSA CRM → CS301-ITSA-Scrogebank-CRM

**Target Name:** `CS301-ITSA-Scrogebank-CRM`

**Status:** ⚠️ PLAN ONLY - NO FILES MODIFIED YET

---

## Executive Summary

This document outlines the complete rename strategy for rebranding the project from "CS301 ITSA CRM" to "CS301-ITSA-Scrogebank-CRM". The plan strictly adheres to safety constraints:

- ✅ **DO NOT** rename the git repository or remote URLs
- ✅ **DO NOT** change Kubernetes runtime identifiers (cluster name, namespace, service names, image tags)
- ✅ **DO NOT** alter runtime behavior or infrastructure

---

## 1. Current Project Names Detected

### Primary Names in Use
| Location | Current Name | Occurrences |
|----------|-------------|-------------|
| **Documentation** | "CS301 ITSA CRM" | ~16 files (README, CONTRIBUTING, docs/*) |
| **Documentation** | "ITSA CRM system" / "ITSA CRM" | ~19 files |
| **Documentation** | "Insurance CRM" | ~3 files |
| **Java Packages** | `com.itsa.crm` | 186 Java files |
| **Frontend Package** | `crm-ui` | package.json |
| **Gradle Group** | `com.itsa.crm` | 3 build.gradle files |

### Runtime Identifiers (FORBIDDEN - DO NOT CHANGE)
| Type | Identifier | Location | Why Forbidden |
|------|-----------|----------|---------------|
| **Kind Cluster** | `cs301-crm` | Makefile, kind-config.yaml, scripts | Runtime cluster name |
| **K8s Namespace** | `dev` | All K8s manifests | Service discovery namespace |
| **K8s Service Names** | `agent`, `client`, `log`, `transaction`, `frontend` | K8s manifests | Service discovery DNS |
| **Docker Image Names** | `agent:dev`, `client:dev`, etc. | Makefile, scripts | Image references |
| **Ingress Host** | `localhost` | ingress.yaml | Runtime host mapping |

---

## 2. Rename Map

### A. String Replacements (SAFE - Documentation & Metadata)

These are **case-sensitive** exact string replacements:

| Old String | New String | Context | Files Affected |
|------------|------------|---------|----------------|
| `CS301 ITSA CRM` | `CS301-ITSA-Scrogebank-CRM` | Doc titles, headers | ~16 markdown files |
| `ITSA CRM system` | `Scrogebank CRM system` | Prose descriptions | ~10 markdown files |
| `ITSA CRM` | `Scrogebank CRM` | Inline mentions | ~19 files |
| `Insurance CRM` | `Scrogebank CRM` | Business context | ~3 files |

### B. Java Package Renaming (REVIEW - Code Namespace)

**⚠️ RECOMMENDATION: SKIP** - This is a code refactoring, not a branding change.

If required, would need:
- Rename `com.itsa.crm` → `com.scrogebank.crm` in **186 Java files**
- Update `group = 'com.itsa.crm'` in 3 build.gradle files
- Move directory structure: `src/main/java/com/itsa/crm/` → `src/main/java/com/scrogebank/crm/`
- **Risk:** Breaks imports, requires full rebuild, testing required

**Decision:** Unless you explicitly need this code-level change, I recommend **SKIPPING** Java package renaming and only doing documentation/metadata updates.

### C. File/Directory Renames (REVIEW - Non-Runtime Paths)

**⚠️ RECOMMENDATION: SKIP** - No obvious file/directory names need renaming.

Current service directory names (`agent`, `client`, `log`, `transaction`, `crm-ui`) are generic and appropriate.

---

## 3. Scoped Execution Strategy

### 3.1 Scope Boundaries

**INCLUDED in rename:**
- All `*.md` files (documentation)
- CONTRIBUTING.md, README.md
- GitHub Actions workflow comments (not job names)
- Python script docstrings/comments
- Shell script comments

**EXCLUDED from rename:**
- `node_modules/`, `.git/`, `build/`, `dist/`, `coverage/`, `.devtools/`
- Java source code (`.java` files) - unless you explicitly approve package renaming
- Build artifacts, logs, binaries
- Kubernetes manifests (runtime identifiers)
- Makefile variables (KIND_CLUSTER_NAME)
- Configuration files (application.yml, Dockerfile)

### 3.2 Search & Replace Tools

**Primary tool:** `ripgrep` (rg) + `git ls-files` for precise targeting

**Batch processing:**
1. Documentation first (lowest risk)
2. Code comments/docstrings (medium risk)
3. Metadata files (medium risk)

### 3.3 File Discovery Commands (NOT YET EXECUTED)

```bash
# Find all markdown files with "CS301 ITSA CRM"
git ls-files | grep '\.md$' | xargs grep -l "CS301 ITSA CRM"

# Find all files with "ITSA CRM" (excluding Java packages)
git ls-files | grep -E '\.(md|yaml|yml|py|sh|ps1|txt)$' | xargs grep -l "ITSA CRM"

# Find all files with "Insurance CRM"
git ls-files | grep -E '\.(md|yaml|yml|py|sh|ps1|txt)$' | xargs grep -li "insurance CRM"
```

---

## 4. Exact Commands to Execute (PLAN ONLY)

### Phase 1: Documentation String Replacements (SAFEST)

**Files affected:** ~16-20 markdown files

```bash
# Navigate to repo root
cd "c:\code\work\smu-cs301-project\project-2025-26-t2-project-2025-26t2-g2-t3"

# Backup before changes (recommended)
git status
git stash
git checkout -b feature/rename-scrogebank

# Replace "CS301 ITSA CRM" → "CS301-ITSA-Scrogebank-CRM" in markdown files
git ls-files | grep '\.md$' | xargs sed -i 's/CS301 ITSA CRM/CS301-ITSA-Scrogebank-CRM/g'

# Replace "ITSA CRM system" → "Scrogebank CRM system" in markdown files
git ls-files | grep '\.md$' | xargs sed -i 's/ITSA CRM system/Scrogebank CRM system/g'

# Replace standalone "ITSA CRM" → "Scrogebank CRM" in markdown files
git ls-files | grep '\.md$' | xargs sed -i 's/ITSA CRM/Scrogebank CRM/g'

# Replace "Insurance CRM" → "Scrogebank CRM" in markdown files
git ls-files | grep '\.md$' | xargs sed -i 's/Insurance CRM/Scrogebank CRM/g'
```

**⚠️ Windows Note:** If using PowerShell/Git Bash on Windows, replace `sed -i` with:
```powershell
# PowerShell alternative
Get-ChildItem -Recurse -Include *.md | ForEach-Object {
    (Get-Content $_.FullName) -replace 'CS301 ITSA CRM', 'CS301-ITSA-Scrogebank-CRM' | Set-Content $_.FullName
}
```

### Phase 2: Python Script Comments (SAFE)

**Files affected:** ~10-15 Python files in `scripts/`

```bash
# Replace in Python files (comments/docstrings only, not code)
git ls-files | grep '\.py$' | xargs sed -i 's/CS301 ITSA CRM/CS301-ITSA-Scrogebank-CRM/g'
git ls-files | grep '\.py$' | xargs sed -i 's/ITSA CRM/Scrogebank CRM/g'
```

### Phase 3: Shell Script Comments (SAFE)

**Files affected:** ~5-10 shell scripts

```bash
# Replace in shell scripts
git ls-files | grep -E '\.(sh|ps1)$' | xargs sed -i 's/CS301 ITSA CRM/CS301-ITSA-Scrogebank-CRM/g'
git ls-files | grep -E '\.(sh|ps1)$' | xargs sed -i 's/ITSA CRM/Scrogebank CRM/g'
```

### Phase 4: Verification & Commit

```bash
# Check what changed
git status
git diff

# Review each changed file
git diff README.md
git diff CONTRIBUTING.md
git diff docs/architecture.md
# ... etc

# If satisfied, commit
git add .
git commit -m "docs: rebrand project to CS301-ITSA-Scrogebank-CRM

- Updated all documentation references from 'CS301 ITSA CRM' to 'CS301-ITSA-Scrogebank-CRM'
- Updated 'ITSA CRM' to 'Scrogebank CRM' in prose
- Updated 'Insurance CRM' to 'Scrogebank CRM'
- No runtime identifiers changed (K8s cluster, services, images remain unchanged)
- No Java package names changed (com.itsa.crm preserved)

This is a documentation-only rename for branding purposes."
```

---

## 5. Acceptance Checks

### 5.1 String Occurrence Validation

Run these commands to verify no old names remain:

```bash
# Should return 0 results (or only in git history, node_modules, build artifacts)
git ls-files | grep '\.md$' | xargs grep "CS301 ITSA CRM"
git ls-files | grep '\.md$' | xargs grep "ITSA CRM" | grep -v "CS301-ITSA-Scrogebank-CRM"

# New name should appear in multiple files
git ls-files | grep '\.md$' | xargs grep "CS301-ITSA-Scrogebank-CRM" | wc -l
# Expected: 15+ occurrences
```

### 5.2 Runtime Identifiers Unchanged

Verify runtime identifiers were NOT changed:

```bash
# Kind cluster name should still be "cs301-crm"
grep "cs301-crm" Makefile platform/k8s/infra/kind-config.yaml
# Expected: Both files should contain "cs301-crm"

# K8s namespace should still be "dev"
grep "namespace: dev" platform/k8s/apps/base/*.yaml | wc -l
# Expected: 10+ lines

# Service names unchanged
grep "name: agent" platform/k8s/apps/base/agent-service.yaml
grep "name: client" platform/k8s/apps/base/client-service.yaml
# Expected: Names unchanged

# Java package unchanged (if skipped package rename)
grep "com.itsa.crm" services/backend/agent/build.gradle
# Expected: "group = 'com.itsa.crm'"
```

### 5.3 Build & Test Validation

**CRITICAL:** After renaming, run full test suite to ensure nothing broke:

```bash
# 1. Run all tests
python scripts/pipelines/test_all.py

# Expected: All tests PASS (no failures introduced by rename)

# 2. Validate K8s manifests
make k8s-validate

# Expected: EXIT 0 (manifests still valid)

# 3. (Optional) Deploy to local K8s to verify
python scripts/pipelines/deploy_k8s.py --keep-cluster

# Expected: All services deploy successfully, smoke tests pass
```

### 5.4 Documentation Consistency

Manually review key files for consistency:

- [ ] README.md - Title and description updated
- [ ] CONTRIBUTING.md - Project name consistent
- [ ] docs/README.md - Documentation hub updated
- [ ] docs/architecture.md - System name updated
- [ ] services/backend/*/README.md - Service descriptions updated

---

## 6. Rollback Plan

If issues arise:

```bash
# Rollback option 1: Git reset (if not pushed)
git reset --hard origin/main

# Rollback option 2: Revert commit (if pushed)
git revert <commit-hash>

# Rollback option 3: Restore from stash (if stashed before)
git stash pop
```

---

## 7. Risk Assessment

| Change Type | Risk Level | Impact | Mitigation |
|-------------|-----------|--------|------------|
| **Markdown docs** | 🟢 LOW | Documentation only | Review git diff before commit |
| **Python comments** | 🟢 LOW | Non-functional | Verify no code logic changed |
| **Shell comments** | 🟢 LOW | Non-functional | Verify no script logic changed |
| **Java packages** | 🔴 HIGH | Breaks imports, requires rebuild | SKIP unless explicitly needed |
| **K8s manifests** | 🔴 CRITICAL | Breaks deployment | FORBIDDEN - already excluded |

---

## 8. Time Estimate

| Phase | Estimated Time |
|-------|---------------|
| Preparation & backup | 5 minutes |
| Execute string replacements | 10 minutes |
| Review changes (git diff) | 15 minutes |
| Run validation checks | 20 minutes (test suite) |
| **Total** | **~50 minutes** |

---

## 9. Alternative: Java Package Rename (IF REQUESTED)

If you decide to rename Java packages from `com.itsa.crm` → `com.scrogebank.crm`:

### Additional Steps Required:

```bash
# 1. Update build.gradle files (3 files)
sed -i "s/group = 'com.itsa.crm'/group = 'com.scrogebank.crm'/g" services/backend/*/build.gradle

# 2. Update all Java package declarations (186 files)
find services/backend -name "*.java" -type f -exec sed -i 's/package com\.itsa\.crm/package com.scrogebank.crm/g' {} +
find services/backend -name "*.java" -type f -exec sed -i 's/import com\.itsa\.crm/import com.scrogebank.crm/g' {} +

# 3. Move directory structure
cd services/backend/agent/src/main/java
git mv com/itsa/crm com/scrogebank/crm
cd ../test/java
git mv com/itsa/crm com/scrogebank/crm

# Repeat for client, transaction services

# 4. Update META-INF/spring-configuration-metadata.json if present
# (Manual review needed)

# 5. CRITICAL: Full rebuild & test
./gradlew clean build
python scripts/pipelines/test_all.py
```

**⚠️ WARNING:** This is a major refactoring. Only proceed if you need code-level namespace changes.

---

## 10. Questions Before Proceeding

Before I execute any changes, please confirm:

1. ✅ **Documentation-only rename?** (Recommended)
   - Rename "CS301 ITSA CRM" → "CS301-ITSA-Scrogebank-CRM" in markdown, comments, docs ONLY
   - Skip Java package renaming (`com.itsa.crm` stays as-is)
   - **Impact:** Low risk, documentation only

2. ❌ **Full rename including Java packages?** (High effort, high risk)
   - Rename documentation + Java packages + directory structure
   - Requires full rebuild, extensive testing
   - **Impact:** High risk, code changes required

3. **Additional context:**
   - Is "Scrogebank" a real bank name for this academic project context?
   - Should it be "Scrooge Bank" (two words) or "Scrogebank" (one word)?
   - Any other naming preferences?

---

## Next Steps

**Current Status:** ⏸️ AWAITING YOUR APPROVAL

**To proceed:**
1. Review this plan thoroughly
2. Confirm which option you prefer (documentation-only vs. full rename)
3. Approve execution by responding "APPROVED" or provide modifications

**I will NOT execute any file changes until you explicitly approve this plan.**

---

**Plan generated:** 2026-02-08
**Repository:** project-2025-26-t2-project-2025-26t2-g2-t3
**Current branch:** main (assumption - verify with `git branch`)
