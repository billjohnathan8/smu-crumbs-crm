## Summary

<!-- What does this PR do? Keep it to 1-3 sentences. -->

## Changes

-

## Checklist

### All PRs

- [ ] Local tests pass: `bash scripts/build-and-test-all/build-and-test-all.sh`
- [ ] Branch naming follows convention (`feat/*`, `fix/*`, `chore/*`, `hotfix/*`)
- [ ] PR targets the correct base branch (see `docs/ci/branch-strategy.md`)

### If backend changes

- [ ] Gradle tests pass for affected service(s)
- [ ] Lint passes (`./gradlew checkstyleMain checkstyleTest` or `black --check` / `flake8`)

### If frontend changes

- [ ] `npm run test:coverage` passes in `services/frontend/crm-ui/`
- [ ] `npm run lint` and `npm run typecheck` pass

### If infrastructure / K8s changes

- [ ] `make k8s-validate` passes
- [ ] Tested with local kind deploy: `bash scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh`

### Documentation

- [ ] Docs updated (if user-facing behaviour changed)
- [ ] API contract updated (if endpoint changed) in `docs/api-contracts/openapi/`

## Test Plan

<!-- How did you verify this works? -->

## Related Issues

<!-- Link issues: Fixes #123, Relates to #456 -->
