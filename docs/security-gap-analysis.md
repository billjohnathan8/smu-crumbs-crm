# Security Gap Analysis — Scrooge Global Bank CRM

**Date:** 2026-03-29
**Scope:** Production-ready security hardening across all backend services (user, client, transaction — Java/Spring Boot) and the log Lambda (Python).
**Auth modes in scope:** `cognito` (production), `hybrid`. The `local` dev mode is intentionally lenient and excluded unless noted.

---

## Summary Table

| # | Issue | Production Status | Gap Severity |
|---|-------|-------------------|--------------|
| 1 | Token Authenticity, RBAC, Resource Ownership, Zero-Trust | Mostly done — specific gaps below | Medium |
| 2 | Backend Input Validation | Mostly done — specific gaps below | Low–Medium |
| 3 | PII / Sensitive Data in Logs | Mostly done — specific gaps below | Medium |
| 4 | Negative & Adversarial Test Cases | Partial — gaps below | Medium |
| 5 | CSRF & Replay-Attack Protection | Partial — gaps below | Medium |
| 6 | OpenAPI Security Alignment | Not implemented | High |
| 7 | Detailed Errors Exposed to Users | Mostly done — one gap | Low |

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
| **Wildcard CORS origin** | All Java `SecurityConfig.java` | `allowedOriginPatterns: ["*"]` is set in all three Java services. In production, this should be restricted to the known frontend origin. |
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
| **Path variable validation** | All controllers | `@PathVariable String clientId / accountId / transactionId` are not validated with `@Pattern` or length constraints at the controller level. A malformed or unexpectedly long ID is passed directly to the service layer. |
| ~~**Log Lambda Pydantic strict mode**~~ | ~~`services/backend/log/app/schemas.py`~~ | **Not a gap** — All request schemas already set `model_config = ConfigDict(extra="forbid")`. No fix required. |
| **No explicit SQL injection test cases** | All Java services, log Lambda | ORM protects against standard SQL injection, but there are no test cases that send injection payloads to verify the protection is observable and documented. |
| **`@Validated` not confirmed on controller class** | All Java controllers | `@Validated` must be on the controller class (or a Spring `MethodValidationPostProcessor` bean registered) for `@PathVariable` constraint annotations to be processed. This has not been confirmed. |

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
- Log records stored in DynamoDB contain only pre-masked `beforeValue` and `afterValue` strings sent by the client service.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| **NRIC not explicitly masked** | `PiiMasker.java`, client service | NRIC (National Registration ID Card) is collected during client identity verification (`UploadVerificationDocsRequest`). It is not in `PiiMasker`'s masked field list. If NRIC appears in an `attributeName`, `beforeValue`, or `afterValue` log field, it would be stored unmasked. |
| **Account identifiers in transaction logs** | Transaction service | `TransactionsController` does not route through `PiiMasker`. Account IDs appear in log entries without masking review. |
| **`toEmail` stored in communication records** | Log Lambda `schemas.py` line 74 | `CreateCommunicationRequest.toEmail` stores a full email address in the communications DynamoDB table. While necessary for sending, at-rest encryption and access control on this table should be confirmed. |
| **CloudWatch log verbosity not audited** | All services | Structured logging format (Logback/SLF4J in Java, Python logging in Lambda) has not been audited to confirm no DEBUG-level statements accidentally log full request/response bodies containing PII. |

### What To Implement

1. **Add NRIC to `PiiMasker`**: Add `nric` / `nricNumber` to the PII field list with masking pattern (e.g., show only last 3 characters: `****567A`).
2. **Transaction log review**: Audit all log calls in `TransactionsController` and `TransactionsService` to confirm account IDs are treated as non-PII or are appropriately masked.
3. **CloudWatch log audit**: Set log level to `INFO` in all production deployments. Add a Checkstyle/lint rule that flags `log.debug()` calls containing variable names matching `email`, `nric`, `phone`, `address`, `password`.
4. **DynamoDB at-rest encryption**: Confirm the `communications` DynamoDB table has AWS-managed or customer-managed KMS encryption enabled in the Terraform module.

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
| **Expired JWT test** | All Java services | No test sends a token with an `exp` claim in the past and asserts 401. |
| **Tampered JWT test** | All Java services | No test sends a valid token with a modified payload (e.g., role changed from `user` to `admin` without re-signing) and asserts 401. |
| **IDOR (Insecure Direct Object Reference) test** | Client + transaction services | No test sends a valid agent JWT and attempts to access a client owned by a different agent, asserting 404. |
| **SQL injection payloads** | All Java services | No test sends `' OR '1'='1` or `; DROP TABLE users` in string fields and asserts 400 (not 500). |
| **Malformed JSON** | All Java services | No test sends a request with a missing required field, wrong type (e.g., number where string expected), or extra unknown field, and asserts 400. |
| **Oversized input** | All Java services | No test sends a string exceeding `@Size(max=...)` constraint and asserts 400 with an appropriate error. |
| **Token replay after logout** | All Java services | No test logs out, then re-uses the old token and asserts 401. (Depends on implementing token deny-list from Issue 1.) |

### What To Implement

1. **Expired token test**: Generate a token with `exp = now - 1 second` and assert `GET /api/users/me` returns 401.
2. **Tampered token test**: Take a valid token, Base64-decode the payload, change `"role":"user"` to `"role":"admin"`, re-encode without re-signing, and assert 401.
3. **IDOR test**: Seed two agent users and two clients (one per agent). Log in as Agent A and `GET /api/clients/{clientBId}`. Assert 404.
4. **SQL injection tests**: Add a `@ParameterizedTest` with injection payloads for `firstName`, `email`, `query` search parameter. Assert 400 or 404, never 500.
5. **Malformed JSON tests**: Send `{}` (empty body), `{"firstName": 123}` (wrong type), and a body with a 500-character `firstName`. Assert 400 for each.

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

- Nothing. There is no OpenAPI/Swagger implementation in any service.
- No `springdoc-openapi` dependency in any `build.gradle`.
- No `@Operation`, `@SecurityRequirement`, `@ApiResponse`, or `@SecurityScheme` annotations in any controller.
- No OpenAPI yaml/json spec files under `docs/` or `services/`.

### What Is Missing / Gaps

| Gap | Location | Description |
|-----|----------|-------------|
| **No OpenAPI dependency** | All Java `build.gradle` | `org.springdoc:springdoc-openapi-starter-webmvc-ui` is not included. |
| **No bearer auth security scheme** | All Java services | No `@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")` defined. |
| **No security requirement on controllers** | All Java controllers | No `@SecurityRequirement(name = "bearerAuth")` on controller classes or methods. |
| **No response documentation** | All Java controllers | No `@ApiResponse` annotations documenting 401, 403, 400, 404 responses per endpoint. |
| **Log Lambda has no API spec** | `services/backend/log` | No OpenAPI spec documents the 18 routes exposed via API Gateway. |

### What To Implement

1. **Add springdoc-openapi** to all three Java services' `build.gradle`:
   ```
   implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.x'
   ```
2. **Define global security scheme** in a `@Configuration` class using `@SecurityScheme` for `bearerAuth`.
3. **Annotate all controllers** with `@SecurityRequirement(name = "bearerAuth")` at the class level (public endpoints override with `@SecurityRequirement` absent).
4. **Document standard responses** for each controller with `@ApiResponse` for 400, 401, 403, 404, 500.
5. **Log Lambda spec**: Write an `openapi.yaml` for the API Gateway-backed log Lambda routes and place it under `docs/api-contracts/`.
6. **CI gate**: Add a step that generates the OpenAPI spec and fails if the committed spec is out of sync with the generated one.

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
| **Validation error messages expose field names** | All Java services `ApiExceptionHandler` | `MethodArgumentNotValidException` handler currently returns per-field validation messages (e.g., `"firstName: size must be between 2 and 50"`). In production, field names and constraint details should not be leaked; return a generic `"Invalid request"` or strip to a count only. |
| **Frontend renders raw API error messages** | `services/frontend/crm-ui` | The React frontend passes API error `message` strings directly to toast notifications / UI elements. If a backend ever returns a more detailed message, it surfaces to the user. Frontend should map known error codes to user-friendly strings and show a generic fallback for unknown codes. |

### What To Implement

1. **Strip validation field details in production**: In each `ApiExceptionHandler`, change the `MethodArgumentNotValidException` handler to return a generic `"Validation failed"` message in `production` profile, while retaining full field details in `local`/`dev` profile (useful for developers). Use Spring's active profile check.
2. **Frontend error code mapping**: Create an `errorMessages.ts` map from known API `error` codes (e.g., `"unauthorized"`, `"forbidden"`, `"not_found"`, `"validation_failed"`) to user-friendly strings. For any unmapped code, display `"An unexpected error occurred. Please try again."`.

---

## Next Steps

Work should be prioritised in this order based on severity and production impact:

1. **Issue 6 — OpenAPI** (not implemented at all; required by project spec)
2. **Issue 1 — JWT replay + CORS + bypass guard** (medium severity, cross-cutting)
3. **Issue 5 — Idempotency + token revocation** (medium severity, data integrity)
4. **Issue 4 — Adversarial tests** (validates all other fixes are effective)
5. **Issue 3 — NRIC masking + CloudWatch audit** (compliance risk)
6. **Issue 2 — Path variable validation + Pydantic strict mode** (low severity, defence-in-depth)
7. **Issue 7 — Validation message stripping + frontend error mapping** (low severity, polish)
