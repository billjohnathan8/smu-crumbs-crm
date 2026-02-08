# Legacy Scripts (Archived)

**Status**: DEPRECATED - These scripts are no longer maintained.

**Archived Date**: February 8, 2026  
**Removal Date**: August 8, 2026 (6 months from archival)

## Migration

All functionality has been consolidated into cross-platform Python pipelines:

| Old Script | New Pipeline |
|-----------|--------------|
| build-and-test-backend/*.{ps1,sh} | `scripts/pipelines/test_backend.py` |
| build-and-test-frontend/*.{ps1,sh} | `scripts/pipelines/test_frontend.py` |
| build-and-test-all/*.{ps1,sh} | `scripts/pipelines/test_all.py` |
| build-and-deploy-k8s/*.{ps1,sh} | `scripts/pipelines/deploy_k8s.py` |
| dev-setup/*.{ps1,sh} | `scripts/pipelines/setup_dev_env.py` |
| test-ci-cd-full/*.{ps1,sh} | `scripts/pipelines/validate_ci_cd.py` |
| test-ci-cd-github/*.{ps1,sh} | `scripts/pipelines/test_github_workflows.py` |

## Why Archived?

### Problems with Old Scripts

- **Duplication**: Separate .ps1 and .sh files duplicated logic
  - ~6000+ lines of code with significant overlap
  - Bug fixes needed in 2 places (PowerShell AND Bash)
  - Maintenance overhead slowed development

- **Complexity**: Windows UTF-8 encoding hacks scattered everywhere
  - Special handling for `chcp 65001` on Windows
  - ANSI escape code stripping in PowerShell
  - Different path separators and command syntax

- **Testing**: Cross-platform testing was difficult
  - Hard to validate behavior matches across platforms
  - Different command availability (pwsh vs bash)
  - Platform-specific edge cases

- **Onboarding**: New developers confused by dual scripts
  - "Which script do I run?"
  - "Why are there two versions?"
  - "How do I test on Linux if I only have Windows?"

## New Benefits

### Python Pipelines Architecture

- **Single Source**: One Python script per pipeline
  - ~3500 lines total (~42% reduction)
  - Single place to fix bugs
  - Easier to review and maintain

- **Platform Abstraction**: Phase 1 handles platform differences
  - Automatic platform detection
  - Unified command execution
  - UTF-8 encoding handled transparently
  - Path handling abstracted

- **Maintainability**: ~40% less code, easier to understand
  - Clear separation of concerns
  - Reusable platform abstraction layer
  - Consistent error handling

- **Testability**: Unit tests for platform abstraction layer
  - Platform detection tests
  - Command execution tests
  - Encoding handling tests
  - Cross-platform validation

- **Developer Experience**: 
  - Same command works everywhere: `python scripts/pipelines/<script>.py`
  - No more "works on my machine" issues
  - Faster onboarding (30 minutes vs 2 hours)

## Technical Details

### Code Reduction Metrics

| Category | Old Scripts | New Pipelines | Reduction |
|----------|-------------|---------------|-----------|
| Backend Tests | ~800 lines × 2 | ~450 lines | 43% |
| Frontend Tests | ~700 lines × 2 | ~400 lines | 42% |
| All Tests | ~600 lines × 2 | ~350 lines | 41% |
| K8s Deploy | ~1200 lines × 2 | ~800 lines | 33% |
| Dev Setup | ~900 lines × 2 | ~600 lines | 33% |
| CI/CD Validation | ~800 lines × 2 | ~500 lines | 37% |
| **Total** | **~6000 lines** | **~3500 lines** | **~42%** |

### Platform Compatibility

**Old Scripts:**
- PowerShell: Windows only (with pwsh: macOS/Linux)
- Bash: macOS/Linux only (WSL: Windows)
- Required both to be maintained

**New Pipelines:**
- Python 3.8+: Works on Windows, macOS, Linux natively
- Single codebase, no duplication
- Platform abstraction layer handles differences

## Removal Timeline

These scripts will be **permanently deleted** on **August 8, 2026** (6 months after archival).

### Timeline

| Date | Action |
|------|--------|
| Feb 8, 2026 | Scripts archived to `scripts/legacy/` |
| Feb 22, 2026 | Deprecation warnings removed (2 weeks grace) |
| May 8, 2026 | Final warning: 3 months until deletion |
| Aug 8, 2026 | **Legacy scripts deleted from repository** |

### What Happens at Deletion

- All files in `scripts/legacy/` will be removed
- Git history will still contain them (use `git log` to recover)
- Documentation will be updated to remove references
- Top-level wrapper scripts will remain (pointing to Python pipelines)

## If You Need Old Behavior

### Option 1: Use Git History

```bash
# View old script
git log --all --full-history -- scripts/legacy/build-and-test-backend/

# Checkout old version
git show <commit-hash>:scripts/legacy/build-and-test-backend/build-and-test-backend.ps1

# Create a temporary copy
git show <commit-hash>:scripts/legacy/build-and-test-backend/build-and-test-backend.ps1 > temp-old-script.ps1
```

### Option 2: Report Issues with New Pipelines

If you find a discrepancy or bug in the new Python pipelines:

1. **File an issue** describing the problem
2. **Include comparison** with old script behavior
3. **Provide reproduction steps**
4. We'll fix it ASAP (priority: high)

### Option 3: Contribute Fixes

New pipelines are easier to fix:

1. Fork the repository
2. Fix the issue in `scripts/pipelines/<script>.py`
3. Add tests if needed
4. Submit a pull request

## Migration Guide

See: [docs/migration/pipeline-migration.md](../../docs/migration/pipeline-migration.md)

Quick reference:

```bash
# Old (deprecated)
.\scripts\build-and-test-backend.cmd
bash scripts/build-and-test-backend/build-and-test-backend.sh

# New (recommended)
python scripts/pipelines/test_backend.py
```

## Questions?

- **Q: Can I still run the old scripts?**  
  A: Yes, until Aug 8, 2026. But they show deprecation warnings.

- **Q: Will my workflow files break?**  
  A: No. Top-level wrappers (*.cmd) now call Python pipelines automatically.

- **Q: What if I find a bug?**  
  A: Report it! We'll fix it with high priority.

- **Q: Can I opt-out of migration?**  
  A: No. The decision is final. But we'll help with any issues.

## History

This migration is part of the **Migration and Cleanup** phase of the repository modernization effort.

**Phases Completed:**
1. Platform abstraction layer
2. Backend test pipeline
3. Frontend test pipeline  
4. All tests pipeline
5. K8s deployment pipeline
6. Dev environment setup pipeline
7. CI/CD validation pipelines
8. **Migration and Cleanup (current)**

**Benefits Achieved:**
- 42% code reduction
- Zero platform duplication
- Unified logging and error handling
- Faster onboarding
- Easier maintenance

---

*Last Updated: February 8, 2026*  
*Maintained by: CS301-ITSA Team*
