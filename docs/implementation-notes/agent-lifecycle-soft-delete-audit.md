# Implementation Notes: Agent Lifecycle, Soft Deletion, Audit Logging, and Access Control

## Overview

This document describes the features implemented across the client-service, user-service, transaction-service, and CRM frontend to support:

1. **Agent lifecycle management** (disable → transfer → delete)
2. **Client and account soft deletion** (with cascading)
3. **User-service audit logging**
4. **Transaction access control** (agent-only viewing)

---

## 1. Agent Lifecycle: Disable → Transfer → Delete

### How It Works

Agents cannot be deleted directly. The enforced flow is:

1. **Disable** the agent (sets `status = disabled` in user-service)
2. **Transfer** all assigned clients to another active agent
3. **Delete** only becomes available once the agent has zero assigned clients

### Backend

- **User Service** (`UserAccountService`): `disableUser()` sets `UserStatus.disabled`. `deleteUser()` sets `UserStatus.deleted`. Login is blocked for disabled users in `AuthService`.
- **Client Service** (`ClientController`): `POST /api/clients/reassign` moves all clients from one agent to another. `GET /api/clients/count?assignedUserId=X` returns the number of non-deleted clients assigned to an agent.
- **Client Repository**: `reassignClients(@Param fromUserId, @Param toUserId)` bulk-updates `assigned_user_id`. `countByAssignedUserIdAndDeletedFalse(String)` counts active clients.

### Frontend (`AdminUserManagementPage.tsx`)

- Active agents show a **Disable** button.
- Disabled agents show:
  - A **Transfer (N)** button (N = number of assigned clients) if they have clients.
  - A **Delete** button only when client count is 0.
  - A message "Transfer clients to enable delete" if clients remain.
- The transfer modal lets the admin pick a target agent; on success the client count refreshes.

### Key Files

| File | Change |
|------|--------|
| `user-service/service/UserAccountService.java` | `disableUser()`, `deleteUser()` |
| `client-service/controller/ClientController.java` | `POST /reassign`, `GET /count` |
| `client-service/repository/ClientRepository.java` | `reassignClients`, `countByAssignedUserIdAndDeletedFalse` |
| `frontend/pages/AdminUserManagementPage.tsx` | Conditional delete/transfer UI |
| `frontend/api/clients.ts` | `reassignClients()`, `countClientsByAgent()` |

---

## 2. Client and Account Soft Deletion

### How It Works

Deleting a client or account sets a `deleted` boolean flag to `true` instead of removing the row. Soft-deleted records are excluded from all list, search, and count queries.

When a client is soft-deleted, **all of its accounts are cascade-soft-deleted** in the same transaction.

### Database Migration

**`V2__add_soft_delete.sql`** (client-service):

```sql
ALTER TABLE clients ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_clients_deleted ON clients(deleted);
CREATE INDEX idx_accounts_deleted ON accounts(deleted);
```

### Entity Changes

- `ClientEntity.java`: Added `@Column(name = "deleted") private boolean deleted = false` with getter/setter.
- `AccountEntity.java`: Same pattern.

### Repository Changes

- `ClientRepository.java`: All `@Query` methods include `c.deleted = false`. Spring Data derived query `countByAssignedUserIdAndDeletedFalse` added. Uniqueness-check queries (`existsByEmailAddressIgnoreCase`, `existsByPhoneNumber`) rewritten as `@Query` to exclude deleted records.
- `AccountRepository.java`: `findByClientId` filters `a.deleted = false`. New `softDeleteByClientId(@Param clientId)` performs `UPDATE AccountEntity SET deleted = true WHERE client.id = :clientId`.

### Service Changes

- `ClientServiceImpl.deleteClient()`:
  ```java
  entity.setDeleted(true);
  clientRepository.save(entity);
  accountRepository.softDeleteByClientId(entity.getId());  // cascade
  ```
- `ClientServiceImpl.loadOwnedClient()`: Throws `ClientNotFoundException` if `entity.isDeleted()`.
- `AccountServiceImpl.deleteAccount()`:
  ```java
  entity.setDeleted(true);
  accountRepository.save(entity);
  ```
- `AccountServiceImpl.loadOwnedAccount()`: Throws `AccountNotFoundException` if `entity.isDeleted()`.

### Key Files

| File | Change |
|------|--------|
| `client/resources/db/migration/V2__add_soft_delete.sql` | New migration |
| `client/entity/ClientEntity.java` | `deleted` column |
| `client/entity/AccountEntity.java` | `deleted` column |
| `client/repository/ClientRepository.java` | All queries filter `deleted = false` |
| `client/repository/AccountRepository.java` | Filter + `softDeleteByClientId` |
| `client/service/ClientServiceImpl.java` | Soft delete + cascade |
| `client/service/AccountServiceImpl.java` | Soft delete |

---

## 3. User-Service Audit Logging

### How It Works

All mutating user operations (create, update, delete, disable) publish audit events asynchronously to the **Log Service** via HTTP. This mirrors the pattern already used in the client-service.

### Architecture

```
UserController
  → extracts Authorization header + X-Request-Id
  → calls UserAccountService.createUser(..., authHeader, requestId)
    → performs DB operation
    → calls publishAuditSafe(...)
      → UserAuditLogger.logAuditEvent(...)  [@Async]
        → POST /api/logs on the Log Service (with original Authorization header forwarded)
```

### New Files in `user-service/logging/`

| File | Purpose |
|------|---------|
| `LogServiceClientConfig.java` | `@Configuration`: creates a `RestClient` bean pointed at `${app.log-service-url}` with 5s connect/read timeouts |
| `LogEventRequest.java` | `record` DTO matching the Log Service's expected payload: `action`, `attributeName`, `beforeValue`, `afterValue`, `userId`, `clientId`, `dateTime`, `correlationId` |
| `UserAuditLogger.java` | Interface with `logAuditEvent(...)` method |
| `HttpUserAuditLogger.java` | `@Component` implementation. Uses `@Async` so audit calls don't block the request. Failures are logged as warnings, never thrown to callers. |

### Supporting Config

| File | Change |
|------|--------|
| `config/AsyncConfig.java` | `@EnableAsync` with a `ThreadPoolTaskExecutor` (core=10, max=50, queue=200) |
| `resources/application.yaml` | Added `app.log-service-url: ${USER_LOG_SERVICE_URL:${LOG_SERVICE_URL:http://localhost:4566/...}}` |

### Audit Events Published

| Operation | Action | Attribute | Before | After |
|-----------|--------|-----------|--------|-------|
| Create user | `USER_CREATE` | `user` | (null) | `email (role)` |
| Update user | `USER_UPDATE` | field name | old value | new value |
| Delete user | `USER_DELETE` | `user` | `email (role/status)` | `deleted` |
| Disable user | `USER_DISABLE` | `status` | `active` | `disabled` |

For updates, each changed field (firstName, lastName, email, role) produces a separate audit event with before/after values.

### Controller Changes

`UserController.java` now extracts:
- `Authorization` header via `request.getHeader("Authorization")`
- Correlation ID via `request.getHeader("X-Request-Id")`

These are passed through to `UserAccountService` methods which forward them to `publishAuditSafe()`.

---

## 4. Transaction Access Control

### How It Works

**Admins can no longer view transactions.** Only agents (role `user`) can view transactions, and only for their own assigned clients.

### Changes in `TransactionsController.java`

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /api/transactions` | `requireAnyRole(user, "admin", "user")` | `requireAnyRole(user, "user")` |
| `GET /api/transactions/{id}` | `requireAnyRole(user, "admin", "user")` | `requireAnyRole(user, "user")` |
| `GET /api/clients/{clientId}/transactions` | `requireAnyRole(user, "admin", "user")` | `requireAnyRole(user, "user")` |
| `POST /api/transactions` | `requireAnyRole(user, "admin")` | unchanged |
| `PUT /api/transactions/{id}` | `requireAnyRole(user, "admin")` | unchanged |
| `DELETE /api/transactions/{id}` | `requireAnyRole(user, "admin")` | unchanged |
| `POST /api/transactions/import` | `requireAnyRole(user, "admin")` | unchanged |

Agents without a `clientId` parameter receive an empty result set (enforced by existing agent-scoping logic).

---

## 5. Additional Frontend Improvements

These were implemented in the same session:

| Feature | Details |
|---------|---------|
| **Agent name display** | Client lists and detail pages show the agent's full name instead of just the user ID. `ClientTable` and `ClientDetail` accept an `agentNameMap` / `agentName` prop. |
| **Dynamic conflict messages** | 409 responses now show the backend's specific message (e.g., "Email address already exists." or "Phone number already exists.") instead of a generic hardcoded string. |
| **Missing agent routes** | Added `/user/clients`, `/user/clients/:clientId`, `/user/clients/:clientId/edit`, `/user/clients/:clientId/accounts`, `/user/aml-alerts`, `/user/settings` routes for the agent role in `App.tsx`. |
| **Role label fixes** | "User" → "Agent" in the create-user dropdown; root admins display as "Root Admin" in user management. |

---

## Verification Summary

| Check | Result |
|-------|--------|
| Client-service `compileJava` | PASS |
| User-service `compileJava` | PASS |
| Transaction-service `compileJava` | PASS |
| Frontend typecheck (`tsc`) | PASS |
| Frontend tests (36 files, 417 tests) | ALL PASS |
