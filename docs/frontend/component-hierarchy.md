# Frontend Component Hierarchy

## 1. Scope and detection
- Frontend directories discovered:
  - [services/frontend/crm-ui](services/frontend/crm-ui)
  - [docs/frontend](docs/frontend)
  - Frontend-related integration/e2e tests also exist in [tests/integration](tests/integration) and [services/frontend/crm-ui/e2e](services/frontend/crm-ui/e2e)
- Primary frontend identified:
  - Active app is [services/frontend/crm-ui](services/frontend/crm-ui)
  - Entry point is [services/frontend/crm-ui/src/main.tsx](services/frontend/crm-ui/src/main.tsx), which renders [services/frontend/crm-ui/src/app/App.tsx](services/frontend/crm-ui/src/app/App.tsx)
- Legacy/unused frontend candidates:
  - [services/frontend/crm-ui/src/pages/RouteAliasPage.tsx](services/frontend/crm-ui/src/pages/RouteAliasPage.tsx): transition page used to make legacy admin aliases explicit during evaluator walkthroughs
  - [services/frontend/crm-ui/src/components/VerificationForm.tsx](services/frontend/crm-ui/src/components/VerificationForm.tsx): deprecated component retained mainly for tests/compatibility; public flow uses [services/frontend/crm-ui/src/pages/ClientVerifyPage.tsx](services/frontend/crm-ui/src/pages/ClientVerifyPage.tsx)
  - Removed during remediation:
    - `services/frontend/crm-ui/src/App.tsx` (unused Vite scaffold artifact)
    - `services/frontend/crm-ui/src/pages/AdminUserArchivesPage.tsx` (unrouted dormant page)
- Evidence used:
  - Routing and guards: [services/frontend/crm-ui/src/app/App.tsx](services/frontend/crm-ui/src/app/App.tsx), [services/frontend/crm-ui/src/app/ProtectedRoute.tsx](services/frontend/crm-ui/src/app/ProtectedRoute.tsx)
  - Auth/session: [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx), [services/frontend/crm-ui/src/api/auth.ts](services/frontend/crm-ui/src/api/auth.ts), [services/frontend/crm-ui/src/api/client.ts](services/frontend/crm-ui/src/api/client.ts), [services/frontend/crm-ui/src/api/cognito.ts](services/frontend/crm-ui/src/api/cognito.ts)
  - Pages/components/API layer: [services/frontend/crm-ui/src/pages](services/frontend/crm-ui/src/pages), [services/frontend/crm-ui/src/components](services/frontend/crm-ui/src/components), [services/frontend/crm-ui/src/api](services/frontend/crm-ui/src/api)
  - Frontend docs/tests: [services/frontend/crm-ui/README.md](services/frontend/crm-ui/README.md), [docs/frontend/README.md](docs/frontend/README.md), [services/frontend/crm-ui/e2e](services/frontend/crm-ui/e2e), [tests/integration/README.md](tests/integration/README.md)
  - Role contract note: [docs/api-contracts/role-root-admin-contract.md](docs/api-contracts/role-root-admin-contract.md)

## 2. Frontend architecture overview
- Framework/runtime/build tooling:
  - React 19 + TypeScript + Vite in [services/frontend/crm-ui/package.json](services/frontend/crm-ui/package.json)
  - Build/dev config in [services/frontend/crm-ui/vite.config.ts](services/frontend/crm-ui/vite.config.ts)
  - Charting with Recharts in [services/frontend/crm-ui/src/components/DashboardCharts.tsx](services/frontend/crm-ui/src/components/DashboardCharts.tsx)
- Routing approach:
  - BrowserRouter + Routes/Route in [services/frontend/crm-ui/src/app/App.tsx](services/frontend/crm-ui/src/app/App.tsx)
  - Route-level lazy loading of page modules in [services/frontend/crm-ui/src/app/App.tsx](services/frontend/crm-ui/src/app/App.tsx)
  - Access control wrapper is [services/frontend/crm-ui/src/app/ProtectedRoute.tsx](services/frontend/crm-ui/src/app/ProtectedRoute.tsx)
- State management approach:
  - No Redux/Zustand-like store detected
  - State is mostly page-local via React state/effects
  - Shared state via providers:
    - Auth context in [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
    - Theme context in [services/frontend/crm-ui/src/features/theme/ThemeContext.tsx](services/frontend/crm-ui/src/features/theme/ThemeContext.tsx)
- API integration approach:
  - Central request wrapper in [services/frontend/crm-ui/src/api/client.ts](services/frontend/crm-ui/src/api/client.ts)
  - Feature API modules in [services/frontend/crm-ui/src/api](services/frontend/crm-ui/src/api)
  - Relative API paths under /api with Vite proxy support in [services/frontend/crm-ui/vite.config.ts](services/frontend/crm-ui/vite.config.ts)
  - Built-in GET caching and timeout in [services/frontend/crm-ui/src/api/client.ts](services/frontend/crm-ui/src/api/client.ts)
- Auth/session approach:
  - Login exchanges credentials for token then fetches current user in [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
  - Auth token/user cached in localStorage via [services/frontend/crm-ui/src/api/client.ts](services/frontend/crm-ui/src/api/client.ts)
  - Logout clears local storage and optionally redirects to Cognito logout in [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
  - Password recovery/reset UI uses dedicated public pages: [services/frontend/crm-ui/src/pages/ForgotPasswordPage.tsx](services/frontend/crm-ui/src/pages/ForgotPasswordPage.tsx), [services/frontend/crm-ui/src/pages/ResetPasswordPage.tsx](services/frontend/crm-ui/src/pages/ResetPasswordPage.tsx)
- Role-based rendering/access approach:
  - Role type is admin/user/super_admin in [services/frontend/crm-ui/src/api/types.ts](services/frontend/crm-ui/src/api/types.ts)
  - Root-admin identity helper in [services/frontend/crm-ui/src/features/auth/authorization.ts](services/frontend/crm-ui/src/features/auth/authorization.ts)
  - Route groups by role in [services/frontend/crm-ui/src/app/App.tsx](services/frontend/crm-ui/src/app/App.tsx)
  - Role-aware nav menu in [services/frontend/crm-ui/src/navigation/sidebarNav.ts](services/frontend/crm-ui/src/navigation/sidebarNav.ts)

## 3. High-level component hierarchy
- App
  - [services/frontend/crm-ui/src/main.tsx](services/frontend/crm-ui/src/main.tsx)
    - App root: [services/frontend/crm-ui/src/app/App.tsx](services/frontend/crm-ui/src/app/App.tsx)
      - ThemeProvider: [services/frontend/crm-ui/src/features/theme/ThemeContext.tsx](services/frontend/crm-ui/src/features/theme/ThemeContext.tsx)
      - AuthProvider: [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
      - BrowserRouter
        - Suspense fallback loader
        - Route public pages
          - LoginPage
          - ClientVerifyPage
          - CognitoCallback
          - ForgotPasswordPage
          - ResetPasswordPage
          - UnauthorizedPage
        - Route group: ProtectedRoute allowedRoles admin/super_admin
          - AdminHomeRedirect
            - AdminDashboard (root admin only via redirect logic)
          - AdminUserManagementPage
          - CreateNewUserPage
          - ActivityLogsPage
          - SettingsPage
          - RouteAliasPage transition routes (/admin/accounts, /admin/users/archives)
        - Route group: ProtectedRoute allowedRoles admin/super_admin + requireRootAdmin
          - ClientListPage
          - ClientArchivesPage
          - CreateClientPage
          - ClientDetailPage
          - EditClientPage
          - ClientAccountsPage
          - Optional/X-factor: AdminCommunications
          - Optional/X-factor: ViewTransactionsPage
          - Optional/X-factor: AmlAlertsPage
          - Optional/X-factor: RootArchivedAdminsPage
          - Optional/X-factor: RootArchivedAgentsPage
        - Route group: ProtectedRoute allowedRoles user
          - UserDashboard
          - ClientListPage
          - CreateClientPage
          - ClientDetailPage
          - EditClientPage
          - ClientAccountsPage
          - ViewTransactionsPage
          - AmlAlertsPage
          - ActivityLogsPage
          - SettingsPage
        - RootRedirect and wildcard redirect
- Shared layout and navigation
  - Sidebar shell: [services/frontend/crm-ui/src/components/SidebarDrawer.tsx](services/frontend/crm-ui/src/components/SidebarDrawer.tsx)
  - Role nav definitions: [services/frontend/crm-ui/src/navigation/sidebarNav.ts](services/frontend/crm-ui/src/navigation/sidebarNav.ts)
- Shared feature components
  - Client list/detail/account views:
    - [services/frontend/crm-ui/src/components/ClientTable.tsx](services/frontend/crm-ui/src/components/ClientTable.tsx)
    - [services/frontend/crm-ui/src/components/ClientDetail.tsx](services/frontend/crm-ui/src/components/ClientDetail.tsx)
    - [services/frontend/crm-ui/src/components/AccountsTable.tsx](services/frontend/crm-ui/src/components/AccountsTable.tsx)
    - [services/frontend/crm-ui/src/components/AccountFormModal.tsx](services/frontend/crm-ui/src/components/AccountFormModal.tsx)
    - [services/frontend/crm-ui/src/components/BankAccountsPreview.tsx](services/frontend/crm-ui/src/components/BankAccountsPreview.tsx)
  - Transaction/log/comms widgets:
    - [services/frontend/crm-ui/src/components/RecentTransactionsTable.tsx](services/frontend/crm-ui/src/components/RecentTransactionsTable.tsx)
    - [services/frontend/crm-ui/src/components/CommunicationsPanel.tsx](services/frontend/crm-ui/src/components/CommunicationsPanel.tsx)
    - [services/frontend/crm-ui/src/components/DeleteConfirmModal.tsx](services/frontend/crm-ui/src/components/DeleteConfirmModal.tsx)
  - KYC/verification:
    - [services/frontend/crm-ui/src/components/VerificationReviewPanel.tsx](services/frontend/crm-ui/src/components/VerificationReviewPanel.tsx)
    - [services/frontend/crm-ui/src/pages/ClientVerifyPage.tsx](services/frontend/crm-ui/src/pages/ClientVerifyPage.tsx) (public upload flow)
  - Dashboard charts:
    - [services/frontend/crm-ui/src/components/DashboardCharts.tsx](services/frontend/crm-ui/src/components/DashboardCharts.tsx)
- Supporting layers
  - Auth guard/helper:
    - [services/frontend/crm-ui/src/app/ProtectedRoute.tsx](services/frontend/crm-ui/src/app/ProtectedRoute.tsx)
    - [services/frontend/crm-ui/src/features/auth/authorization.ts](services/frontend/crm-ui/src/features/auth/authorization.ts)
  - Context/hooks:
    - [services/frontend/crm-ui/src/features/auth/AuthContext.tsx](services/frontend/crm-ui/src/features/auth/AuthContext.tsx)
    - [services/frontend/crm-ui/src/features/theme/ThemeContext.tsx](services/frontend/crm-ui/src/features/theme/ThemeContext.tsx)
    - [services/frontend/crm-ui/src/features/theme/useTheme.ts](services/frontend/crm-ui/src/features/theme/useTheme.ts)
  - API modules:
    - [services/frontend/crm-ui/src/api/auth.ts](services/frontend/crm-ui/src/api/auth.ts)
    - [services/frontend/crm-ui/src/api/users.ts](services/frontend/crm-ui/src/api/users.ts)
    - [services/frontend/crm-ui/src/api/clients.ts](services/frontend/crm-ui/src/api/clients.ts)
    - [services/frontend/crm-ui/src/api/transactions.ts](services/frontend/crm-ui/src/api/transactions.ts)
    - [services/frontend/crm-ui/src/api/logs.ts](services/frontend/crm-ui/src/api/logs.ts)
    - [services/frontend/crm-ui/src/api/communications.ts](services/frontend/crm-ui/src/api/communications.ts)
    - [services/frontend/crm-ui/src/api/aml.ts](services/frontend/crm-ui/src/api/aml.ts)
    - [services/frontend/crm-ui/src/api/cognito.ts](services/frontend/crm-ui/src/api/cognito.ts)
  - UI validation/utils tied to behavior:
    - [services/frontend/crm-ui/src/features/auth/passwordPolicy.ts](services/frontend/crm-ui/src/features/auth/passwordPolicy.ts)
    - [services/frontend/crm-ui/src/utils/postalCodeRules.ts](services/frontend/crm-ui/src/utils/postalCodeRules.ts)
    - [services/frontend/crm-ui/src/utils/errorMessages.ts](services/frontend/crm-ui/src/utils/errorMessages.ts)

## 4. Pages and layouts

### SidebarLayout
- File/path: [services/frontend/crm-ui/src/components/SidebarDrawer.tsx](services/frontend/crm-ui/src/components/SidebarDrawer.tsx)
- Route: Wrapper used by most authenticated pages
- Role(s): all authenticated users
- Purpose: common app shell with side navigation and logout
- Main child components: nav links + page content slot
- Key actions: collapse sidebar, logout, navigate
- Data/API dependencies: auth context logout, theme context logo variant
- Relevant feature mapping: F1 foundation for secure app navigation
- Notes / gaps: repeated page-level breadcrumb patterns still exist outside layout

### LoginPage
- File/path: [services/frontend/crm-ui/src/pages/LoginPage.tsx](services/frontend/crm-ui/src/pages/LoginPage.tsx)
- Route: /login
- Role(s): public
- Purpose: credential sign-in and role-based redirect
- Main child components: inline form fields, optional Cognito button
- Key actions: submit credentials, navigate to forgot-password, optional SSO redirect
- Data/API dependencies: AuthContext login, Cognito URL builder
- Relevant feature mapping: F1
- Notes / gaps: role redirect treats admin as /admin and all others as /user

### ForgotPasswordPage
- File/path: [services/frontend/crm-ui/src/pages/ForgotPasswordPage.tsx](services/frontend/crm-ui/src/pages/ForgotPasswordPage.tsx)
- Route: /forgot-password
- Role(s): public
- Purpose: request reset link
- Main child components: inline email form
- Key actions: send reset email, return to login
- Data/API dependencies: requestPasswordResetLink in [services/frontend/crm-ui/src/api/auth.ts](services/frontend/crm-ui/src/api/auth.ts)
- Relevant feature mapping: F1
- Notes / gaps: aligned with shared API module conventions

### ResetPasswordPage
- File/path: [services/frontend/crm-ui/src/pages/ResetPasswordPage.tsx](services/frontend/crm-ui/src/pages/ResetPasswordPage.tsx)
- Route: /reset-password
- Role(s): public
- Purpose: reset password via token; fallback to request link if token missing
- Main child components: password form, strength rules UI
- Key actions: reset password, request link, return to login
- Data/API dependencies: resetPassword and requestPasswordResetLink in [services/frontend/crm-ui/src/api/auth.ts](services/frontend/crm-ui/src/api/auth.ts), password policy helper
- Relevant feature mapping: F1
- Notes / gaps: confirm password blocks paste by design

### UnauthorizedPage
- File/path: [services/frontend/crm-ui/src/pages/UnauthorizedPage.tsx](services/frontend/crm-ui/src/pages/UnauthorizedPage.tsx)
- Route: /unauthorized
- Role(s): public
- Purpose: deterministic target for denied route access
- Main child components: inline action buttons
- Key actions: navigate back to dashboard or login
- Data/API dependencies: none
- Relevant feature mapping: access control consistency
- Notes / gaps: used by route guard and page-level authorization fallbacks

### RouteAliasPage
- File/path: [services/frontend/crm-ui/src/pages/RouteAliasPage.tsx](services/frontend/crm-ui/src/pages/RouteAliasPage.tsx)
- Route: /admin/accounts and /admin/users/archives (as transition aliases)
- Role(s): admin and root admin
- Purpose: explicit user-visible transition from legacy aliases to canonical routes
- Main child components: informational route transition panel
- Key actions: auto-redirect to destination route
- Data/API dependencies: none
- Relevant feature mapping: evaluator walkthrough clarity
- Notes / gaps: replaces silent redirects for discoverability

### ClientVerifyPage
- File/path: [services/frontend/crm-ui/src/pages/ClientVerifyPage.tsx](services/frontend/crm-ui/src/pages/ClientVerifyPage.tsx)
- Route: /verify-client
- Role(s): public tokenized link recipient
- Purpose: upload KYC docs and trigger pending verification
- Main child components: two document upload sections
- Key actions: decode token, upload primary + address docs
- Data/API dependencies: uploadVerificationDocs from clients API
- Relevant feature mapping: F3
- Notes / gaps: JWT payload decoded client-side without signature verification (frontend can only validate structure/expiry)

### AdminDashboard
- File/path: [services/frontend/crm-ui/src/pages/AdminDashboard.tsx](services/frontend/crm-ui/src/pages/AdminDashboard.tsx)
- Route: /admin (through AdminHomeRedirect)
- Role(s): root admin only in effective behavior
- Purpose: aggregate user/client/log metrics and verification queues
- Main child components: DashboardCharts
- Key actions: inspect trend charts, navigate to logs and pending client reviews
- Data/API dependencies: listUsers, listClients, listLogs, getVerificationSubmissionSummary
- Relevant feature mapping: F2/F3/F4
- Notes / gaps: standard admins are redirected away from this dashboard

### UserDashboard
- File/path: [services/frontend/crm-ui/src/pages/UserDashboard.tsx](services/frontend/crm-ui/src/pages/UserDashboard.tsx)
- Route: /user
- Role(s): agent (user role)
- Purpose: agent home with personal activity and client trends
- Main child components: DashboardCharts, pending client table
- Key actions: inspect activity trends, open pending client details
- Data/API dependencies: listClients, listLogs
- Relevant feature mapping: F3/F4
- Notes / gaps: data aggregation uses paginated fetch loops, no separate centralized data hook

### AdminUserManagementPage
- File/path: [services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx](services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx)
- Route: /admin/users
- Role(s): admin and root admin
- Purpose: list/filter users, disable/archive users, transfer agent clients (root admin)
- Main child components: table sections + transfer modal
- Key actions: filter users, disable user, archive user, transfer clients
- Data/API dependencies: listUsers, disableUser, deleteUser, reassignClients, countClientsByAgent, getVerificationSubmissionSummary
- Relevant feature mapping: F2
- Notes / gaps: unauthorized redirects resolve to explicit /unauthorized route

### CreateNewUserPage
- File/path: [services/frontend/crm-ui/src/pages/CreateNewUserPage.tsx](services/frontend/crm-ui/src/pages/CreateNewUserPage.tsx)
- Route: /admin/users/new
- Role(s): admin and root admin
- Purpose: create admin/agent users (role options constrained by caller role)
- Main child components: user creation form
- Key actions: create user, optional invite email, optional temporary password
- Data/API dependencies: createUser, passwordPolicy helper
- Relevant feature mapping: F2
- Notes / gaps: no separate edit-user UI route despite updateUser API existing

### RootArchivedAdminsPage
- File/path: [services/frontend/crm-ui/src/pages/RootArchivedAdminsPage.tsx](services/frontend/crm-ui/src/pages/RootArchivedAdminsPage.tsx)
- Route: /admin/users/archives/admins
- Role(s): root admin
- Purpose: list and reinstate archived admin records
- Main child components: archive table
- Key actions: reinstate admin
- Data/API dependencies: listArchivedUsers, reinstateUser
- Relevant feature mapping: F2
- Notes / gaps: root admin only, matched by requireRootAdmin route group

### RootArchivedAgentsPage
- File/path: [services/frontend/crm-ui/src/pages/RootArchivedAgentsPage.tsx](services/frontend/crm-ui/src/pages/RootArchivedAgentsPage.tsx)
- Route: /admin/users/archives/agents
- Role(s): root admin
- Purpose: list and reinstate archived agent records
- Main child components: archive table
- Key actions: reinstate agent
- Data/API dependencies: listArchivedUsers, reinstateUser
- Relevant feature mapping: F2
- Notes / gaps: root admin only, matched by requireRootAdmin route group

### ClientListPage
- File/path: [services/frontend/crm-ui/src/pages/ClientListPage.tsx](services/frontend/crm-ui/src/pages/ClientListPage.tsx)
- Route: /admin/clients and /user/clients
- Role(s): root admin and agent
- Purpose: searchable/paginated client list; root admin can filter by assigned agent
- Main child components: ClientTable
- Key actions: search, filter, open client details, create client
- Data/API dependencies: listClients, listUsers/listArchivedUsers for agent-name map
- Relevant feature mapping: F3
- Notes / gaps: ownership enforcement for agent visibility is mostly backend-dependent

### CreateClientPage
- File/path: [services/frontend/crm-ui/src/pages/CreateClientPage.tsx](services/frontend/crm-ui/src/pages/CreateClientPage.tsx)
- Route: /admin/clients/new and /user/clients/new
- Role(s): root admin and agent
- Purpose: create new client profile and assign agent when required
- Main child components: create form fields with postal code validation
- Key actions: submit client profile
- Data/API dependencies: createClient, listUsers, postalCodeRules
- Relevant feature mapping: F3
- Notes / gaps: strict validation implemented client-side; server remains final authority

### EditClientPage
- File/path: [services/frontend/crm-ui/src/pages/EditClientPage.tsx](services/frontend/crm-ui/src/pages/EditClientPage.tsx)
- Route: /admin/clients/:clientId/edit and /user/clients/:clientId/edit
- Role(s): root admin and agent
- Purpose: update client profile, with assignment control for root admin
- Main child components: edit form fields
- Key actions: save profile edits
- Data/API dependencies: getClientById, updateClient, listUsers, postalCodeRules
- Relevant feature mapping: F3
- Notes / gaps: ownership checks are not performed in frontend before fetch; relies on API authorization

### ClientDetailPage
- File/path: [services/frontend/crm-ui/src/pages/ClientDetailPage.tsx](services/frontend/crm-ui/src/pages/ClientDetailPage.tsx)
- Route: /admin/clients/:clientId and /user/clients/:clientId
- Role(s): root admin and agent
- Purpose: consolidated client profile, verification review, transactions, accounts, communications
- Main child components: ClientDetail, VerificationReviewPanel, RecentTransactionsTable, BankAccountsPreview, CommunicationsPanel, DeleteConfirmModal
- Key actions: approve/reject verification, resend verification link, edit/delete client, send communication
- Data/API dependencies: getClientById, reviewVerification, resendVerificationLink, deleteClient, listClientTransactions, listClientAccounts, listClientCommunications, sendCommunication, getUserById
- Relevant feature mapping: F3/F4
- Notes / gaps: canReviewVerification currently allows agent and root admin in UI logic, but backend contract defines review as admin-only

### ClientAccountsPage
- File/path: [services/frontend/crm-ui/src/pages/ClientAccountsPage.tsx](services/frontend/crm-ui/src/pages/ClientAccountsPage.tsx)
- Route: /admin/clients/:clientId/accounts and /user/clients/:clientId/accounts
- Role(s): root admin and agent
- Purpose: manage client bank accounts
- Main child components: AccountsTable, AccountFormModal, DeleteConfirmModal
- Key actions: create/edit/delete account
- Data/API dependencies: getClientById, listClientAccounts, getAccountOpeningOptions, createAccount, updateAccount, deleteAccount
- Relevant feature mapping: F3
- Notes / gaps: uses fallback account-opening options if options endpoint unavailable

### ClientArchivesPage
- File/path: [services/frontend/crm-ui/src/pages/ClientArchivesPage.tsx](services/frontend/crm-ui/src/pages/ClientArchivesPage.tsx)
- Route: /admin/client-archives
- Role(s): root admin
- Purpose: list and reinstate archived clients
- Main child components: archive table
- Key actions: filter archives, reinstate client
- Data/API dependencies: listClientArchives, reinstateClient
- Relevant feature mapping: F3
- Notes / gaps: no agent/admin access beyond root admin route group

### ViewTransactionsPage
- File/path: [services/frontend/crm-ui/src/pages/ViewTransactionsPage.tsx](services/frontend/crm-ui/src/pages/ViewTransactionsPage.tsx)
- Route: /admin/transactions and /user/transactions
- Role(s): root admin and agent
- Purpose: transaction browsing/filtering; import batch controls/history for management user
- Main child components: inline tables, filter controls, import status/actions
- Key actions: filter transactions, trigger import, view import history
- Data/API dependencies: listTransactions, listClientTransactions, getTransactionById, startTransactionImport, getTransactionImportBatch, listClients
- Relevant feature mapping: F4
- Notes / gaps: edit modal dead-path removed; access-denied messaging is explicit for non-owned client queries

### ActivityLogsPage
- File/path: [services/frontend/crm-ui/src/pages/ActivityLogsPage.tsx](services/frontend/crm-ui/src/pages/ActivityLogsPage.tsx)
- Route: /admin/logs and /user/logs
- Role(s): admin/root admin and agent
- Purpose: filterable audit log viewer
- Main child components: logs table and filters
- Key actions: filter by action/date/user/client and paginate
- Data/API dependencies: listLogs
- Relevant feature mapping: F4
- Notes / gaps: for non-admin users, userId is forcibly set to current user in frontend params

### AmlAlertsPage
- File/path: [services/frontend/crm-ui/src/pages/AmlAlertsPage.tsx](services/frontend/crm-ui/src/pages/AmlAlertsPage.tsx)
- Route: /admin/aml-alerts and /user/aml-alerts
- Role(s): root admin and agent
- Purpose: AML alert listing and review status updates
- Main child components: alert table + filter controls
- Key actions: update review status, trigger AML scan
- Data/API dependencies: listAmlAlerts, updateAmlAlertReview, triggerAmlScan
- Relevant feature mapping: X-factor (beyond core F1-F4 baseline)
- Notes / gaps: standard admin cannot access this page by route design

### AdminCommunications
- File/path: [services/frontend/crm-ui/src/pages/AdminCommunications.tsx](services/frontend/crm-ui/src/pages/AdminCommunications.tsx)
- Route: /admin/communications
- Role(s): root admin only
- Purpose: communication audit/lookup/filter page with optional status edits
- Main child components: CommunicationsPanel
- Key actions: lookup by communication ID/client name, filter list, paginate, refresh
- Data/API dependencies: listCommunications, listQueuedCommunications, getCommunicationById, listClientCommunications, listClients
- Relevant feature mapping: X-factor
- Notes / gaps: page-level authorization is now aligned with route-level root-admin policy

### SettingsPage
- File/path: [services/frontend/crm-ui/src/pages/SettingsPage.tsx](services/frontend/crm-ui/src/pages/SettingsPage.tsx)
- Route: /admin/settings and /user/settings
- Role(s): all authenticated roles
- Purpose: account display, theme toggle, password reset entry
- Main child components: settings cards
- Key actions: toggle theme, navigate to reset-password
- Data/API dependencies: theme context, auth context
- Relevant feature mapping: F1 supporting page
- Notes / gaps: reset button navigates to public reset page with prefilled email state

### CognitoCallback
- File/path: [services/frontend/crm-ui/src/pages/CognitoCallback.tsx](services/frontend/crm-ui/src/pages/CognitoCallback.tsx)
- Route: /auth/callback
- Role(s): public callback receiver
- Purpose: exchange Cognito auth code and redirect by role
- Main child components: callback status/error view
- Key actions: consume OAuth state, exchange code, navigate to role home
- Data/API dependencies: AuthContext loginWithCognitoCode, consumeExpectedOauthState
- Relevant feature mapping: X-factor (SSO)
- Notes / gaps: routed and reachable from Cognito login flow