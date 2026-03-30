# Security Gap Analysis — Scrooge Global Bank CRM

**Date:** 2026-03-30
**Scope:** Production-ready security hardening across all backend services (user, client, transaction — Java/Spring Boot) and the log Lambda (Python).
**Auth modes in scope:** `cognito` (production), `hybrid`. The `local` dev mode is intentionally lenient and excluded unless noted.

---

## Summary Table

| # | Issue | Production Status | Gap Severity |
|---|-------|-------------------|--------------|
| 1 | Token Authenticity, RBAC, Resource Ownership, Zero-Trust | Mostly done — CORS fixed; JWT replay still pending | Medium |
| 2 | Backend Input Validation | Done — path/query/input guards and adversarial payload checks now cover Java + log Lambda routes | Low |
| 3 | PII / Sensitive Data in Logs | Mostly done — NRIC masking added | Medium |
| 4 | Negative & Adversarial Test Cases | Done — adversarial suites consolidated and expanded across Java services + log Lambda routes | Low |
| 5 | CSRF & Replay-Attack Protection | Partial — gaps below (infrastructure-dependent) | Medium |
| 6 | OpenAPI Security Alignment | Done — Springdoc + security annotations + CI drift gate implemented | Low |
| 7 | Detailed Errors Exposed to Users | Done — prod-mode validation sanitisation + frontend error-code mapping implemented | Low |

---

## Issue 1 — Weak Auth and Authorization Enforcement

### What Is Done

**Token Authenticity**
- All three Java services (user, client, transaction) have a `JwtAuthFilter` (extends `OncePerRequestFilter`) that intercepts every request, extracts the `Authorization: Bearer <token>` header, and validates the token via `JwtService.verifyAndParse()` before the request reaches any controller.
- In `cognito` mode, `JwtService` fetches the Cognito JWKS endpoint, verifies the RS256 signature, and validates `iss`, `aud`, and `exp` claims. JWKS responses are cached for 300 s (configurable via `COGNITO_JWKS_CACHE_TTL_SECONDS`).
- The log Lambda (`services/backend/log/app/auth.py`) implements equivalent JWT validation in Python, supporting both HS256 (local) and RS256 (Cognito), including issuer, audience, and expiry checks.
- Other Lambdas (verification, aml, aml-consumer, audit-consumer, sftp-transaction-collector) are triggered by SNS, SQS, or EventBridge — they are not HTTP-accessible and are protected by IAM policies only. OAuth2 is not applicable to them.

**User Roles (RBAC)**
- Java services: roles (`admin`, `user`, `super_admin`) are extracted from the validated JWT and stored in Spring's `SecurityContext` as a `UsernamePasswordAuthenticationToken`.
- Programmatic role checks (`requireAnyRole()`, `validateHierarchyPermissions()`) are called at the service layer — not via `@PreAuthorize` — before any business logic executes.
- User service enforces a full role hierarchy: `super_admin` > `admin` > `user`. Root admin (`super_admin`) cannot be deleted, updated, or have password reset via the API.
- Log Lambda enforces `require_roles(user, {"admin", "user"})` per route immediately after token validation.

**Resource Ownership**
- `ClientEntity.assignedUserId` links every client record to the creating agent.
- `ClientServiceImpl.loadOwnedClient()` is called for every GET, PUT, DELETE, and verify-review operation. Non-admin users receive a `ClientNotFoundException` (404) if they attempt to access a client they do not own — the 404 masks the forbidden condition intentionally.
- `AccountServiceImpl.loadOwnedAccount()` verifies account ownership by traversing to the parent `ClientEntity`.
- Transaction service uses `ClientAccessValidator`, which calls the client service's `GET /api/clients/{clientId}` with the user's Bearer token forwarded. A 404 from client service is treated as forbidden in the transaction service.
- Log Lambda uses `ClientScopeAuthorizer` which also calls the client service to validate per-client access.

**Zero-Trust**
- All service endpoints (except health checks and auth flows) require a valid JWT. There are no internal trust relationships between services — every service-to-service call forwards the originating user's Bearer token.
- Sessions are stateless (`SessionCreationPolicy.STATELESS`) — no server-side session state exists.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| **JWT replay after logout** | All Java services + log Lambda | JWTs are stateless — there is no `jti` (JWT ID) claim tracked server-side. After a user logs out, their token remains cryptographically valid until expiry. If a token is intercepted, it can be replayed. |
| ~~**`VITE_BYPASS_AUTH=true` has no production guard**~~ | ~~`services/frontend/crm-ui`~~ | **Not a gap** — `AuthContext.tsx` line 12 already guards with `import.meta.env.DEV &&`, which Vite sets to `false` in all production builds regardless of the env var value. No fix required. |
| ~~**Wildcard CORS origin**~~ | ~~All Java `SecurityConfig.java`~~ | **Fixed (2026-03-29)**: All three services now read allowed origins from `app.cors.allowed-origins`, populated via `CORS_ALLOWED_ORIGINS` env var. Defaults to `*` in dev. Use `setAllowedOriginPatterns()` to support wildcard subdomains. |
| **JWT validation code is duplicated across 3 services** | `user/security/JwtService.java`, `client/security/JwtService.java`, `transaction/security/JwtService.java` | Each service maintains its own copy of `JwtService`, `JwtAuthFilter`, and `SecurityConfig`. A security fix applied to one service may not be applied to the others, creating inconsistency risk. |
| **`POST /api/clients/{id}/upload-verify` is publicly accessible** | `ClientController.java` | This endpoint is intentionally public (clients upload their own ID docs without a CRM login). It is protected only by a short-lived verification token. There is no rate limiting and no guard against token brute-forcing. |

### What To Implement

1. **JWT replay / logout invalidation**: Add a `jti` claim to issued tokens and maintain a short-lived server-side deny-list (Redis or DynamoDB TTL table) for tokens that have been explicitly logged out. On each request, check the `jti` against the deny-list before accepting the token.
2. **Production guard for `VITE_BYPASS_AUTH`**: Add a CI check or Vite build plugin that fails the build if `VITE_BYPASS_AUTH=true` and `NODE_ENV=production`.
3. **CORS restriction**: Replace `allowedOriginPatterns: ["*"]` with an environment variable (`CORS_ALLOWED_ORIGINS`) defaulting to `*` in dev and set to the exact frontend URL in production deployments.
4. **Centralise JWT validation**: Extract `JwtService`, `JwtAuthFilter`, and `SecurityConfig` base classes into a shared `crm-security-common` Maven module so all Java services inherit a single implementation.
5. **Rate-limit `upload-verify`**: Add a rate-limiting filter (Spring or API Gateway) on `POST /api/clients/{id}/upload-verify` and enforce verification token expiry and single-use semantics.

---

## Issue 2 — Missing Backend Validation

### What Is Done

- All Java controller methods annotate request body parameters with `@Valid`, triggering Hibernate Validator.
- Request DTOs use `@NotBlank`, `@NotNull`, `@Size`, `@Email`, `@Pattern`, `@DecimalMin` as appropriate.
- A custom `@ValidDateOfBirth` annotation validates that the client age is between 18 and 100 years.
- JPA/Hibernate uses parameterized queries throughout — SQL injection via ORM layer is not possible.
- A global `@RestControllerAdvice` in each service catches `MethodArgumentNotValidException` and returns structured 400 responses.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| ~~**Path variable validation**~~ | ~~All controllers~~ | **Fixed (2026-03-29)**: All `@PathVariable` parameters in all 4 controllers (User, Client, Account, Transactions) now have `@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$")`. All controllers are annotated `@Validated`. |
| ~~**Log Lambda Pydantic strict mode**~~ | ~~`services/backend/log/app/schemas.py`~~ | **Not a gap** — All request schemas already set `model_config = ConfigDict(extra="forbid")`. No fix required. |
| ~~**No explicit SQL injection test cases in log Lambda routes**~~ | ~~Log Lambda~~ | **Fixed (2026-03-30)**: Added route-level adversarial tests in `services/backend/log/tests/test_api.py` for malformed JSON and injection/path-traversal-style client identifiers. Assertions enforce controlled 4xx responses (never unhandled failures/500s). |
| ~~**`@Validated` not confirmed on controller class**~~ | ~~All Java controllers~~ | **Fixed (2026-03-29)**: Confirmed and added `@Validated` to all controller classes. |

### What To Implement

1. **Path variable constraints**: Add `@Pattern(regexp = "^[A-Za-z0-9_-]{1,64}$")` (or equivalent) to all `@PathVariable` parameters. Enable `@Validated` at the controller class level.
2. **Log Lambda strict Pydantic config**: Set `model_config = ConfigDict(strict=True, extra="forbid")` on all request schema classes in `schemas.py`.
3. **SQL injection test cases**: Add parameterized test cases in each service that send `' OR '1'='1`, `; DROP TABLE`, and similar payloads as field values and assert that the response is a 400 or 404, never a 500.

---

## Issue 3 — Sensitive Data Exposure in Logs

### What Is Done

- `PiiMasker.java` (`services/backend/client/src/main/java/.../logging/PiiMasker.java`) masks PII before writing audit log entries:
  - `emailAddress` → first character + `***@domain.com`
  - `phoneNumber` → first 3 digits + `****` + last 4 digits
  - `address`, `city`, `state` → `[REDACTED]`
  - `postalCode` → last 3 digits visible
- Java service exception handlers log only a `requestId` correlation string — no PII in exception logs.
- The log Lambda does not log request or response bodies to CloudWatch.
- Log records are stored in PostgreSQL by the log service; audit entries contain pre-masked `beforeValue` and `afterValue` strings sent by the client service.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| ~~**NRIC not explicitly masked**~~ | ~~`PiiMasker.java`, client service~~ | **Fixed (2026-03-29)**: Added `nric` to `PiiMasker` with masking pattern (first char + `***` middle + last 3 chars, e.g. `S****567A`). `dateOfBirth` added to fully-redacted fields. Tests added in `PiiMaskerTest`. |
| **Account identifiers in transaction logs** | Transaction service | `TransactionsController` does not route through `PiiMasker`. Account IDs appear in log entries without masking review. |
| **`toEmail` stored in communication records** | Log service (`schemas.py` + SQL migration) | `CreateCommunicationRequest.toEmail` stores a full email address in the PostgreSQL `communications` table. While necessary for sending, at-rest encryption and access control should be confirmed. |
| **CloudWatch log verbosity not audited** | All services | Structured logging format (Logback/SLF4J in Java, Python logging in Lambda) has not been audited to confirm no DEBUG-level statements accidentally log full request/response bodies containing PII. |

### What To Implement

1. **Add NRIC to `PiiMasker`**: Add `nric` / `nricNumber` to the PII field list with masking pattern (e.g., show only last 3 characters: `****567A`).
2. **Transaction log review**: Audit all log calls in `TransactionsController` and `TransactionsService` to confirm account IDs are treated as non-PII or are appropriately masked.
3. **CloudWatch log audit**: Set log level to `INFO` in all production deployments. Add a Checkstyle/lint rule that flags `log.debug()` calls containing variable names matching `email`, `nric`, `phone`, `address`, `password`.
4. **Database at-rest encryption**: Confirm PostgreSQL storage encryption and access controls for the `communications` table in each deployment environment.

---

## Issue 4 — Lack of Negative and Adversarial Test Cases

### What Is Done

- `JwtAuthFilterTest` in all three Java services: tests missing `Authorization` header, non-Bearer scheme, invalid token, and confirms security context is not populated.
- `ApiExceptionHandlerTest` in all three Java services: tests `UnauthorizedException` → 401, `ForbiddenException` → 403, `IllegalArgumentException` → 400.
- `UserControllerTest` / `ClientControllerTest` / `TransactionsControllerTest`: tests that an agent role receives 403 on admin-only endpoints.
- `DateOfBirthValidatorTest`: boundary tests for ages 16, 17, 18, 100, 101.
- `ClientAccessValidatorTest`: tests cross-service 404 → forbidden delegation.
- Log Lambda `tests/test_auth.py`: bearer token parsing and verification tests.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| ~~**Expired JWT test**~~ | ~~All Java services~~ | **Fixed (2026-03-30)**: Added `JwtAuthFilterTest.expiredToken_leavesContextEmpty` in user/client/transaction services (expired bearer token is rejected by filter). |
| ~~**Tampered JWT test**~~ | ~~All Java services~~ | **Fixed (2026-03-30)**: Added payload-tampering role escalation tests in all 3 `JwtAuthFilterTest` classes (payload modified without re-signing is rejected). |
| ~~**`alg:none` / unsupported alg test**~~ | ~~All Java services~~ | **Fixed (2026-03-30)**: Added `alg:none` adversarial token tests in all 3 `JwtAuthFilterTest` classes (security context remains empty). |
| ~~**IDOR (Insecure Direct Object Reference) test**~~ | ~~Client + transaction services~~ | **Fixed (2026-03-30)**: Added explicit cross-owner IDOR coverage in client service (`get/update/delete` for non-owner returns `ClientNotFoundException` / masked 404 behavior) and transaction ownership-denial coverage remains asserted via `TransactionNotFoundException` mapping. |
| ~~**SQL injection payloads**~~ | ~~User + client + transaction services~~ | **Fixed (2026-03-30)**: Added SQL-injection style payload tests in user/client/transaction web/service tests; invalid IDs now reject with 400/validation paths (never 500). |
| ~~**Malformed JSON**~~ | ~~User + client + transaction services~~ | **Fixed (2026-03-30)**: Added malformed JSON tests in user/client/transaction web tests; user handler now maps unreadable JSON to 400 (`validation_error`). |
| ~~**Oversized input**~~ | ~~User + client + transaction services~~ | **Fixed (2026-03-30)**: Added oversized input test coverage in user/client/transaction request paths (e.g., overlength `firstName` / `clientId`). |
| **Token replay after logout** | All Java services | No test logs out, then re-uses the old token and asserts 401. (Depends on implementing token deny-list from Issue 1.) |
| ~~**Adversarial payload test duplication across Java services**~~ | ~~User/Client/Transaction web tests~~ | **Fixed (2026-03-30)**: Converted representative SQL-injection/path-query adversarial cases to parameterized tests in user/client/transaction controller test suites to broaden payload coverage and reduce duplication. |
| ~~**Missing route-level malformed/injection tests for Lambda router**~~ | ~~Log Lambda~~ | **Fixed (2026-03-30)**: Added parameterized adversarial route tests to `test_api.py` and tightened router handling for malformed JSON and invalid public IDs. |

### What To Implement

1. **Optional integration assertion**: Add endpoint-level MockMvc checks that invalid JWTs produce HTTP 401 on representative secured routes.

---

## Issue 5 — Missing CSRF and Replay-Attack Protection

### What Is Done

- CSRF is **correctly disabled** in all three Java `SecurityConfig.java` files (`.csrf(csrf -> csrf.disable())`). This is the correct approach for stateless REST APIs using Bearer tokens — CSRF attacks require session cookies, which this system does not use.
- `SessionCreationPolicy.STATELESS` is set in all services.
- Communication dispatch via the log service uses an `idempotencyKey` field in `CreateCommunicationRequest`, which is persisted and queryable, preventing duplicate email sends.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| **No JWT deny-list (token replay)** | All Java services + log Lambda | After logout, a stolen Bearer token remains valid until its `exp`. There is no `jti` claim and no server-side deny-list. |
| **No idempotency on critical write endpoints** | User, client, transaction services | `POST /api/clients`, `POST /api/accounts`, `POST /api/transactions` have no idempotency key support. A duplicate network retry could create duplicate records. |
| **No token rotation on sensitive actions** | User service | After password reset or role change, the existing token is still valid. There is no forced re-authentication. |

### What To Implement

1. **JWT `jti` + deny-list**: On token issuance, embed a random `jti` UUID. On logout (`POST /api/auth/logout`), write the `jti` + expiry to a DynamoDB TTL table (or ElastiCache). In `JwtService.verifyAndParse()`, reject tokens whose `jti` appears in the deny-list.
2. **Idempotency keys for write endpoints**: Accept an optional `Idempotency-Key` header on `POST /api/clients`, `POST /api/accounts`, and `POST /api/transactions`. Cache the response for the key for 24 hours (DynamoDB TTL). Return the cached response on duplicate key submission.
3. **Force re-auth on sensitive operations**: After a successful password reset or role change, revoke all active tokens for that user by invalidating their `jti` entries.

---

## Issue 6 — OpenAPI Security Alignment

### What Is Done

- Contract OpenAPI specs already exist under `docs/api-contracts/openapi/` (`user.yaml`, `client.yaml`, `transaction.yaml`, `log.yaml`, `aml.yaml`).
- All three Java services now include `org.springdoc:springdoc-openapi-starter-webmvc-ui`.
- Each Java service now defines a global bearer scheme via `OpenApiConfig` with:
  - `@SecurityScheme(name = "bearerAuth", type = HTTP, scheme = "bearer", bearerFormat = "JWT")`
  - `@OpenAPIDefinition` service metadata.
- Secured Java controllers are annotated with `@SecurityRequirement(name = "bearerAuth")`.
- Public endpoint `POST /api/clients/{id}/upload-verify` is explicitly marked as no-security (`@SecurityRequirements`) in OpenAPI.
- Java controllers now include OpenAPI operation summaries and standard response documentation via `@Operation` and `@ApiResponses`.
- Swagger routes (`/v3/api-docs/**`, `/swagger-ui/**`, `/swagger-ui.html`) are now permitted in all Java `SecurityConfig` classes.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| ~~**No OpenAPI dependency**~~ | ~~All Java `build.gradle`~~ | **Fixed (2026-03-30)**: Added `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.6` to user/client/transaction services. |
| ~~**No bearer auth security scheme**~~ | ~~All Java services~~ | **Fixed (2026-03-30)**: Added `OpenApiConfig` with global `bearerAuth` `@SecurityScheme` in all 3 Java services. |
| ~~**No security requirement on controllers**~~ | ~~All Java controllers~~ | **Fixed (2026-03-30)**: Added `@SecurityRequirement(name = "bearerAuth")` to secured controllers; public upload-verify endpoint marked as no-security in docs. |
| ~~**No response documentation**~~ | ~~All Java controllers~~ | **Fixed (2026-03-30)**: Added `@Operation` and class-level `@ApiResponses` coverage for secured and auth controllers. |
| ~~**Log Lambda has no API spec**~~ | ~~`services/backend/log`~~ | **Not a gap** — `docs/api-contracts/openapi/log.yaml` already documents API routes. |
| ~~**No CI drift gate between runtime-generated Java specs and committed contract files**~~ | ~~CI/workflow~~ | **Fixed (2026-03-30)**: CI now boots each Java service, fetches `/v3/api-docs`, and runs a drift checker against committed contracts (`user.yaml`, `client.yaml`, `transaction.yaml`). |

### What To Implement

1. **Contract harmonisation**: Continue aligning runtime-generated OpenAPI output with `docs/api-contracts/openapi/*.yaml` naming and examples to reduce intentional drift.
2. **Optional hardening**: Disable Swagger UI in production by setting `SPRINGDOC_SWAGGER_UI_ENABLED=false` in production environments.

---

## Issue 7 — Detailed Errors Exposed to Users

### What Is Done

- All three Java services have a global `@RestControllerAdvice` (`ApiExceptionHandler`) that:
  - Maps `UnauthorizedException` / `JwtValidationException` → 401 with generic message `"Unauthorized"`.
  - Maps `ForbiddenException` → 403 with generic message `"Forbidden"`.
  - Maps unhandled `Exception` → 500 with generic message `"Internal error"` and logs the real error server-side using only the `requestId`.
- Error response format (`ErrorResponse` record) contains only: `error` (machine-readable code), `message` (human-readable text), `requestId` (correlation ID). No stack traces or internal field names.
- Log Lambda returns equivalent generic responses for `UnauthorizedError` and `ForbiddenError`.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| ~~**Validation error messages expose field names**~~ | ~~All Java services `ApiExceptionHandler`~~ | **Fixed (2026-03-29)**: All three `ApiExceptionHandler` classes now accept `boolean productionMode` (injected via `APP_PRODUCTION_MODE` env var, default `false`). When `true`, both `MethodArgumentNotValidException` and `ConstraintViolationException` handlers return `"Validation failed"`. Dev mode retains full field details. Tests added for both modes in all three services. |
| ~~**Frontend renders raw API error messages**~~ | ~~`services/frontend/crm-ui`~~ | **Fixed (2026-03-30)**: Added centralized `getUserFriendlyErrorMessage()` mapping and applied it in `api/client.ts` so API errors are normalised by error code before surfacing in UI state. Unknown codes now return a generic safe fallback message. |

### What To Implement

1. **Keep mapping in sync with backend error codes**: Add new codes to `errorMessages.ts` whenever backend introduces additional `error` values.
2. **Optional UI hardening**: Add per-page i18n/UX copy overrides while preserving centralized safe fallbacks.

---

## Next Steps

Remaining items in priority order:

1. **Issue 1 — JWT replay / deny-list** (requires new DynamoDB table + Terraform — deferred)
2. **Issue 5 — Idempotency keys + token revocation** (requires infrastructure — deferred)

---

## Implementation Log

### 2026-03-29 — Security hardening sprint

| Task | What Was Done | Files Changed | Commit |
|------|---------------|---------------|--------|
| Correct false gaps | Marked `VITE_BYPASS_AUTH` guard and Pydantic `extra="forbid"` as already handled (not gaps) | `docs/security-gap-analysis.md` | `6ef5268` |
| CORS restriction (Issue 1) | Replaced hardcoded `"*"` with `CORS_ALLOWED_ORIGINS` env var in all 3 Java `SecurityConfig.java`. Added `app.cors.allowed-origins` property to all 3 `application.yaml`. Test yamls updated to prevent `PlaceholderResolutionException`. | `user/SecurityConfig.java`, `client/SecurityConfig.java`, `transaction/SecurityConfig.java`, all 3 `application.yaml` | `a45122d`, `94b9304`, `25e3b5d` |
| NRIC PII masking (Issue 3) | Added `nric` field to `PiiMasker` (shows first char + masked middle + last 3). Added `dateOfBirth` to fully-redacted fields. Added 4 new tests. | `client/PiiMasker.java`, `client/PiiMaskerTest.java` | `7ee64b6` |
| Validation sanitisation (Issue 7) | All 3 `ApiExceptionHandler` classes now take `boolean productionMode` via `@Value("${app.production-mode:false}")`. `handleValidation` and `handleConstraintViolation` return `"Validation failed"` in prod mode. `APP_PRODUCTION_MODE` env var added to all 3 `application.yaml`. Prod/dev mode tests added to all 3 `ApiExceptionHandlerTest`. | 3× `ApiExceptionHandler.java`, 3× `application.yaml`, 3× `ApiExceptionHandlerTest.java` | `950907b`, `1ac2c34`, `e176152` |
| Path variable constraints (Issue 2) | Added `@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$")` to all `@PathVariable` parameters in all 4 controllers. Confirmed `@Validated` on all controller classes. | `UserController.java`, `ClientController.java`, `AccountController.java`, `TransactionsController.java` | `668b5f8` |
| OpenAPI security alignment (Issue 6) | Added springdoc dependency to all Java services; added global `OpenApiConfig` with `bearerAuth`; added controller `@SecurityRequirement`, `@Operation`, and `@ApiResponses`; marked public upload-verify as no-security; allowed `/v3/api-docs` and Swagger UI routes in all Java `SecurityConfig`; added `springdoc` env toggles in all Java `application.yaml`. | 3× `build.gradle`, 3× `OpenApiConfig.java`, `AuthController.java`, `UserController.java`, `ClientController.java`, `AccountController.java`, `TransactionsController.java`, 3× `SecurityConfig.java`, 3× `application.yaml`, `docs/security-gap-analysis.md` | pending |
| Adversarial JWT filter tests (Issue 4) | Added expired token, payload tampering (role escalation), and `alg:none` adversarial token tests in all 3 `JwtAuthFilterTest` classes to ensure invalid tokens do not populate `SecurityContext`. | 3× `JwtAuthFilterTest.java`, `docs/security-gap-analysis.md` | pending |
| Input-adversarial controller tests (Issue 4) | Added SQL-injection-style, malformed JSON, wrong-type, and oversized-input tests to user/client controller web tests; added unreadable-body 400 handler in user `ApiExceptionHandler` to avoid 500 on malformed JSON. | `user/UserControllerTest.java`, `client/ClientControllerTest.java`, `user/ApiExceptionHandler.java`, `docs/security-gap-analysis.md` | pending |
| Frontend error-code mapping (Issue 7) | Added centralized error-code to user-facing message mapping and integrated it in `api/client.ts` so backend raw messages are not directly surfaced. Added unit tests for mapping and updated API client tests. | `crm-ui/src/utils/errorMessages.ts`, `crm-ui/src/api/client.ts`, `crm-ui/src/utils/__tests__/errorMessages.test.ts`, `crm-ui/src/api/__tests__/client.test.ts`, `docs/security-gap-analysis.md` | pending |
| IDOR + transaction adversarial expansion (Issue 4) | Added client-service cross-owner IDOR tests for `get/update/delete`; added transaction request validation hardening (`clientId` constraints) plus transaction web tests for SQL-injection-style IDs, malformed JSON, and oversized IDs. | `client/ClientServiceImplTest.java`, `transaction/CreateTransactionRequest.java`, `transaction/TransactionsController.java`, `transaction/UserControllerTest.java`, `docs/security-gap-analysis.md` | pending |
| OpenAPI CI drift gate (Issue 6 follow-up) | Added runtime-vs-contract OpenAPI drift gate in reusable CI lint workflow: boots each Java service, fetches `/v3/api-docs`, and compares normalized paths/methods/security requirements against committed contracts using `scripts/ci/check_openapi_drift.py`. | `.github/workflows/reusable-lint.yml`, `scripts/ci/check_openapi_drift.py`, `docs/security-gap-analysis.md` | pending |
| Adversarial suite consolidation + Lambda route hardening (Issue 4 follow-up) | Converted adversarial Java controller tests to parameterized suites (user/client/transaction), added log Lambda malformed JSON + injection/path traversal route tests, and hardened Lambda router error handling/path validation to return controlled 4xx responses. | `user/UserControllerTest.java`, `client/ClientControllerTest.java`, `transaction/UserControllerTest.java`, `log/tests/test_api.py`, `log/app/lambda_router.py`, `docs/security-gap-analysis.md` | pending |

### Deferred (requires infrastructure changes)

| Item | Reason Deferred |
|------|-----------------|
| JWT `jti` deny-list | Requires new DynamoDB TTL table + Terraform + `POST /api/auth/logout` endpoint |
| Idempotency keys on write endpoints | Requires DynamoDB or Redis cache + API contract changes |
| Token revocation after password reset | Depends on jti deny-list implementation |
| Rate limiting on `upload-verify` | Requires API Gateway WAF rule or Spring filter + Redis counter |
