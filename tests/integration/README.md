# Integration Test Inventory (Current)

This folder contains the Playwright live fullstack integration specs (UI + real backend APIs via `PLAYWRIGHT_BASE_URL`).
Mocked protected-route coverage is maintained in `services/frontend/crm-ui/e2e/auth/protected-routes.spec.ts`.

## account-management.spec.ts (5)
Services/APIs: Auth, User, Client, Account, Log (`/api/auth/login`, `/api/users`, `/api/clients`, `/api/accounts`, `/api/clients/{clientId}/accounts`, `/api/logs`).

1. `should create a bank account for a client`: API flow is admin login -> create agent -> agent login -> create client -> create account; validates account creation, client linkage, and response shape.
2. `should list accounts for a specific client`: creates an account then calls `/api/clients/{clientId}/accounts`; validates list scope to the client.
3. `should retrieve a single account by ID`: creates account then calls `/api/accounts/{accountId}`; validates record lookup and fields.
4. `should delete a bank account`: creates then deletes account via `/api/accounts/{accountId}`; validates deleted account is no longer retrievable.
5. `account creation should generate an audit log entry`: creates account then polls `/api/logs?clientId=...`; validates asynchronous CREATE log emission.

## admin-flows.spec.ts (8)
Services/APIs: UI-driven auth and user-management flows (indirect backend calls from `/login`, `/admin`, `/admin/users`, `/admin/users/new`).

1. `should login as root admin and see admin dashboard`: user flow is root admin login -> dashboard widgets render.
2. `root admin should navigate to user management page`: root admin login -> open `/admin/users`; validates route and page render.
3. `root admin should create a new admin`: root admin creates admin user in UI; validates success toast.
4. `root admin should logout successfully`: root admin logout path from dashboard; validates redirect to login.
5. `new admin should login and access user management`: newly created admin signs in and accesses `/admin/users`.
6. `should create a new agent account and verify it appears in the list`: normal admin creates role=`user` account via UI create-user flow.
7. `normal admin should not be able to create admin role in UI`: normal admin opens create-user page; validates admin role option is hidden.
8. `admin should logout successfully`: normal admin logout path; validates redirect to login.

## api-error-handling.spec.ts (8)
Services/APIs: UI-driven auth, authorization, client form, admin pages, transactions; plus browser offline simulation.

1. `should handle 401 Unauthorized when auth token expires`: submits bad credentials; validates login failure state/message.
2. `should handle permission errors when user tries unauthorized actions`: logs in as user then opens `/admin`; validates redirect or access-denied behavior.
3. `should handle validation errors when submitting invalid data`: user opens create-client and submits empty form; validates required-field errors.
4. `should handle invalid email format`: user submits invalid client email; validates email format error messaging.
5. `should handle network errors gracefully when backend is unreachable`: browser set offline before login submit; validates resilient error/login state.
6. `should handle slow API responses`: admin loads `/admin/accounts`; validates page eventually resolves within timeout.
7. `should properly display server error messages`: user opens transactions page; validates app shows a valid state (data/empty/error/loading).
8. `should handle duplicate email validation`: admin attempts create flow using existing email; validates duplicate/conflict handling if form path is present.

## audit-logging.spec.ts (7)
Services/APIs: Auth, User, Client, Log (`/api/auth/login`, `/api/users`, `/api/clients`, `/api/logs`, `/api/clients/{clientId}/logs`).

1. `should create a log entry via API`: creates explicit log row with action metadata; validates persisted log payload.
2. `should retrieve logs filtered by clientId`: calls `/api/logs?clientId=...`; validates filter and pagination contract.
3. `should retrieve a single log entry by ID`: create then fetch by `/api/logs/{logId}`.
4. `should update a log entry via API`: create log then admin updates `/api/logs/{logId}`; validates updated fields.
5. `should delete a log entry via API`: create then delete log; validates 404/410 on follow-up read.
6. `should retrieve logs for a specific client via /api/clients/{clientId}/logs`: validates client-scoped log endpoint contract.
7. `client profile create should auto-generate an audit log`: creates client then polls logs; validates system-generated CREATE audit trail.

## client-profile-management.spec.ts (6)
Services/APIs: Auth, User, Client, Log (`/api/auth/login`, `/api/users`, `/api/clients`, `/api/clients/{id}`, `/api/clients/{id}/upload-verify`, `/api/logs`).

1. `agent should create a client profile via UI and receive a client ID`: agent logs in, submits create-client form, and returns to dashboard.
2. `should retrieve a client profile by ID via API`: create client then fetch `/api/clients/{clientId}`; validates identity fields.
3. `should update a client profile via API`: create then update `/api/clients/{clientId}`; validates changed profile fields.
4. `should submit public verification documents via API`: calls `/api/clients/{clientId}/upload-verify` with tokenized payload; validates transition to `pending`.
5. `should delete a client profile via API`: delete via `/api/clients/{clientId}`; validates post-delete unavailability.
6. `client CRUD operations should generate audit log entries`: create/update client then poll `/api/logs`; validates CREATE and UPDATE audit events.

## communication-tracking.spec.ts (5)
Services/APIs: Auth, User, Client, Communication (`/api/auth/login`, `/api/users`, `/api/clients`, `/api/communications`, `/api/clients/{clientId}/communications`, `/api/communications/queued`, `/api/communications/{id}/status`).

1. `should create a communication record via API`: agent creates outbound communication linked to client.
2. `should retrieve a communication by ID`: create then fetch `/api/communications/{communicationId}`.
3. `should list communications for a specific client`: validates client-scoped communications listing endpoint.
4. `should list queued communications`: admin queries queued communication workload endpoint.
5. `should update communication status`: create communication then admin PATCHes status to `sent`.

## forgot-password.spec.ts (2)
Services/APIs: Auth + test helper (`/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/test/password-reset/latest-token`).

1. `should request reset, reset password with token, and login with new password`: UI flow is login -> forgot password -> fetch test token -> reset password -> login with new password.
2. `should restore original password after reset flow`: repeats reset flow using new password session, then restores original admin password.

## real-fullstack.spec.ts (2)
Services/APIs: Full cross-service live path across Auth, User, Client, Log, AML, Transactions, plus UI route transitions.

1. `admin can sign in and load manage accounts from live backend`: admin UI login and navigation into admin account-management area.
2. `user can create client and exercise cross-service APIs without mocks`: API flow is admin login -> create user -> user UI login -> create client via UI -> fetch created client -> verify CREATE audit log -> create AML alert -> review AML alert -> list client transactions -> open transactions UI.

## transaction-management.spec.ts (8)
Services/APIs: Auth, User, Client, Transaction (`/api/auth/login`, `/api/users`, `/api/clients`, `/api/transactions`, `/api/transactions/{id}`, `/api/clients/{clientId}/transactions`, `/api/transactions/import`).

1. `should list all transactions via API`: validates paginated `/api/transactions` list contract.
2. `should list transactions for a specific client`: validates `/api/clients/{clientId}/transactions` contract.
3. `admin should create a transaction via API`: creates transaction record and validates fields.
4. `should retrieve a single transaction by ID`: create then read `/api/transactions/{id}`.
5. `admin should delete a transaction via API`: create -> delete -> verify 404/410 on read.
6. `agent should view transactions page via UI`: user login and navigation to transactions UI view.
7. `should filter transactions by status via API`: validates `status` query filtering behavior.
8. `transaction import endpoint should be accessible to admin`: calls import endpoint and validates endpoint reachability/response.

## user-flows.spec.ts (6)
Services/APIs: UI-driven user flows using live auth/client/transaction-backed pages.

1. `should login as user and view dashboard`: validates user login and dashboard rendering.
2. `should display clients and transactions on user dashboard`: user creates client from UI then navigates to transactions page.
3. `should validate client creation form`: submit empty create-client form; validates required-field errors.
4. `should display user dashboard stats`: validates dashboard data sections load from backend.
5. `should navigate to create client page`: validates dashboard -> create-client route navigation.
6. `should navigate between pages successfully`: validates user route transitions across dashboard/create-client/transactions.

## user-logout.spec.ts (3)
Services/APIs: UI auth/session handling on live routes (`/login`, `/user`, `/user/clients/new`, `/user/transactions`).

1. `should logout from user dashboard`: login -> dashboard -> logout; validates redirect, localStorage clear, and protected-route lockout.
2. `should logout from user create client page`: login -> create-client page -> logout; validates redirect and token clear.
3. `should logout from user transactions page`: login -> transactions page -> logout; validates redirect and token clear.

## user-management-advanced.spec.ts (6)
Services/APIs: Auth + User service (`/api/auth/login`, `/api/users`, `/api/users/{id}`, `/api/users/{id}/disable`, `/api/users/me`) plus admin UI page check.

1. `should update user information via API`: create user then update profile fields via `/api/users/{id}`.
2. `should disable a user via API`: create user then disable via `/api/users/{id}/disable`; validates disabled status.
3. `disabled user should not be able to login`: create+disable user then login attempt; validates 401/403 rejection.
4. `should delete a non-root user via API`: create then delete user; validates soft-delete or hard-delete behavior.
5. `root admin must not be deletable`: fetch `/api/users/me`, attempt self-delete, then verify root admin still exists.
6. `admin should view user management page via UI`: admin login -> `/admin/users`; validates page content/render states.
