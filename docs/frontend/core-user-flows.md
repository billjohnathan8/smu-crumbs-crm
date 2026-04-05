# Core user flows

## Flow: Login / authentication
- Entry point: /login
- Steps:
  - User submits credentials in LoginPage
  - AuthContext login calls auth login endpoint
  - Access token and user profile are stored locally
  - User is redirected to /admin or /user depending on role
- Components involved:
  - [services/frontend/crm-ui/src/pages/LoginPage.tsx](services/frontend/crm-ui/src/pages/LoginPage.tsx)
  - [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
- Route transitions:
  - /login -> /admin or /user
- API/service calls:
  - login, getCurrentUser in [services/frontend/crm-ui/src/api/auth.ts](services/frontend/crm-ui/src/api/auth.ts)
- Role/access rules:
  - RootRedirect and ProtectedRoute enforce route access after login
- Gaps / risks / missing pieces:
  - Session refresh flow exists in API module but is not centrally used for automatic re-auth

## Flow: Admin creates/updates/disables users
- Entry point: /admin/users and /admin/users/new
- Steps:
  - Admin opens User Management page and sees filtered users by role privileges
  - Admin can create users from Create New User page
  - Admin can disable users
  - Root admin can archive admins and transfer clients from disabled agents before archive
- Components involved:
  - [services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx](services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx)
  - [services/frontend/crm-ui/src/pages/CreateNewUserPage.tsx](services/frontend/crm-ui/src/pages/CreateNewUserPage.tsx)
- Route transitions:
  - /admin/users -> /admin/users/new -> /admin/users
- API/service calls:
  - listUsers, createUser, disableUser, deleteUser, reassignClients, countClientsByAgent
- Role/access rules:
  - non-root admin cannot create admin role in UI
  - root admin gates archive/admin-on-admin capabilities
- Gaps / risks / missing pieces:
  - Update user is exposed in API layer but no dedicated edit-user page is present

## Flow: Agent creates client profile
- Entry point: /user/clients/new
- Steps:
  - Agent fills client profile form
  - Validation enforces core profile constraints
  - Submit creates client and redirects to dashboard
- Components involved:
  - [services/frontend/crm-ui/src/pages/CreateClientPage.tsx](services/frontend/crm-ui/src/pages/CreateClientPage.tsx)
- Route transitions:
  - /user/clients/new -> /user
- API/service calls:
  - createClient via [services/frontend/crm-ui/src/api/clients.ts](services/frontend/crm-ui/src/api/clients.ts)
- Role/access rules:
  - agent does not choose assignedUserId
  - root admin path requires assignedUserId
- Gaps / risks / missing pieces:
  - ownership constraints after creation are enforced by backend, not by frontend alone

## Flow: Agent verifies or updates client details
- Entry point: /user/clients/:clientId and /user/clients/:clientId/edit
- Steps:
  - Agent opens client detail
  - Agent edits profile via edit page
  - Agent can use verification review panel when status is pending
  - Agent can re-send verification link for non-verified clients
- Components involved:
  - [services/frontend/crm-ui/src/pages/ClientDetailPage.tsx](services/frontend/crm-ui/src/pages/ClientDetailPage.tsx)
  - [services/frontend/crm-ui/src/pages/EditClientPage.tsx](services/frontend/crm-ui/src/pages/EditClientPage.tsx)
  - [services/frontend/crm-ui/src/components/VerificationReviewPanel.tsx](services/frontend/crm-ui/src/components/VerificationReviewPanel.tsx)
- Route transitions:
  - /user/clients -> /user/clients/:id -> /user/clients/:id/edit
- API/service calls:
  - getClientById, updateClient, reviewVerification, resendVerificationLink
- Role/access rules:
  - route-level access allows user role
  - detail page currently allows review action by user role in frontend logic
- Gaps / risks / missing pieces:
  - backend contract says review endpoint is admin-only; frontend permission signal appears broader than contract

## Flow: Agent creates account
- Entry point: /user/clients/:clientId/accounts
- Steps:
  - Agent opens client accounts page
  - Agent opens create account modal
  - Agent submits account details and refreshes account list
- Components involved:
  - [services/frontend/crm-ui/src/pages/ClientAccountsPage.tsx](services/frontend/crm-ui/src/pages/ClientAccountsPage.tsx)
  - [services/frontend/crm-ui/src/components/AccountFormModal.tsx](services/frontend/crm-ui/src/components/AccountFormModal.tsx)
- Route transitions:
  - /user/clients/:id -> /user/clients/:id/accounts
- API/service calls:
  - listClientAccounts, createAccount, getAccountOpeningOptions
- Role/access rules:
  - page is accessible to user role
- Gaps / risks / missing pieces:
  - frontend relies on API authorization for client ownership boundaries

## Flow: Agent views client profile
- Entry point: /user/clients
- Steps:
  - Agent filters list and opens selected client
  - Detail page loads profile + related transactions/accounts/communications
- Components involved:
  - [services/frontend/crm-ui/src/pages/ClientListPage.tsx](services/frontend/crm-ui/src/pages/ClientListPage.tsx)
  - [services/frontend/crm-ui/src/pages/ClientDetailPage.tsx](services/frontend/crm-ui/src/pages/ClientDetailPage.tsx)
- Route transitions:
  - /user/clients -> /user/clients/:id
- API/service calls:
  - listClients, getClientById, listClientTransactions, listClientAccounts, listClientCommunications
- Role/access rules:
  - user role protected route
- Gaps / risks / missing pieces:
  - direct clientId route access still depends on backend ownership checks

## Flow: Agent views transactions
- Entry point: /user/transactions
- Steps:
  - Agent opens transactions page and applies filters
  - Page fetches allowed client IDs and scopes transaction fetch by those clients
- Components involved:
  - [services/frontend/crm-ui/src/pages/ViewTransactionsPage.tsx](services/frontend/crm-ui/src/pages/ViewTransactionsPage.tsx)
- Route transitions:
  - /user -> /user/transactions
- API/service calls:
  - listClients, listClientTransactions
- Role/access rules:
  - user role protected route
- Gaps / risks / missing pieces:
  - if backend ownership controls fail, frontend-only filtering is not sufficient as a security boundary

## Flow: Log-related workflow visible from frontend
- Entry point: /user/logs and /admin/logs
- Steps:
  - User/admin opens Activity Logs page
  - Applies action/date/user/client filters
  - Paginates through results
- Components involved:
  - [services/frontend/crm-ui/src/pages/ActivityLogsPage.tsx](services/frontend/crm-ui/src/pages/ActivityLogsPage.tsx)
- Route transitions:
  - role home -> logs route
- API/service calls:
  - listLogs from [services/frontend/crm-ui/src/api/logs.ts](services/frontend/crm-ui/src/api/logs.ts)
- Role/access rules:
  - non-admin params are forced to current userId in frontend
- Gaps / risks / missing pieces:
  - frontend filter scoping still relies on backend to prevent unauthorized direct API access

## Flow: Password reset / logout / session expiry
- Entry point:
  - forgot/reset: /forgot-password and /reset-password
  - logout: sidebar logout button
- Steps:
  - Forgot page requests reset link
  - Reset page validates token/password policy and submits reset
  - Logout clears auth data and navigates to login
  - Most page API errors with 401 trigger logout path
- Components involved:
  - [services/frontend/crm-ui/src/pages/ForgotPasswordPage.tsx](services/frontend/crm-ui/src/pages/ForgotPasswordPage.tsx)
  - [services/frontend/crm-ui/src/pages/ResetPasswordPage.tsx](services/frontend/crm-ui/src/pages/ResetPasswordPage.tsx)
  - [services/frontend/crm-ui/src/components/SidebarDrawer.tsx](services/frontend/crm-ui/src/components/SidebarDrawer.tsx)
  - [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
- Route transitions:
  - /forgot-password -> /login
  - /reset-password -> /login
  - authenticated route -> /login on logout or 401 handling
- API/service calls:
  - direct fetch for forgot/reset endpoints; clearAuthToken for logout
- Role/access rules:
  - reset pages are public, token-driven
- Gaps / risks / missing pieces:
  - no centralized token refresh or dedicated session-expiry UX screen