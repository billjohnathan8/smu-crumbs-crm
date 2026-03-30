# Production-Like Security Validation Checklist

This checklist is the minimum manual complement to automated CI tests before production-like deployment.

## Browser OAuth, Session, Replay, CSRF
- Attempt `/auth/callback` with missing/mismatched `state`; verify login fails with generic message.
- Confirm callback URL query is cleared after load (`window.location.search` empty after callback processing).
- Confirm no token appears in URL query for verification links (`/verify-client#token=...` fragment only).
- Re-submit identical verification payload with same `Idempotency-Key`; verify second request returns `409`.
- Attempt cross-origin state-changing request with browser-managed credentials disabled; verify request is rejected or unauthenticated.

## Deployed Network, TLS, Routing, Edge Controls
- Verify `http://` edge endpoints redirect to `https://` only.
- Run TLS scan against edge hostnames; verify weak ciphers/protocols are disabled.
- Attempt direct origin access (ALB/API/Lambda internal URLs) from outside approved edge; verify denied.
- Validate route policies only expose intended public paths and methods.

## Monitoring, Backup Recovery, Log Redaction Runtime
- Trigger auth failure, verification failure, and validation errors; verify response bodies remain generic.
- Inspect application/Lambda logs during those flows; verify no NRIC/email/token/document filenames appear in clear text.
- Trigger an alertable failure and confirm monitoring/alert path is fired.
- Execute one backup restore drill for a DB-backed service path and document recovery time/result.
