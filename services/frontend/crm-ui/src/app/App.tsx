import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import { ProtectedRoute } from './ProtectedRoute'
import { isRootAdminUser } from '@/features/auth/authorization'

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then(module => ({ default: module.LoginPage }))
)
const AdminDashboard = lazy(() =>
  import('@/pages/AdminDashboard').then(module => ({ default: module.AdminDashboard }))
)
const AdminCommunications = lazy(() =>
  import('@/pages/AdminCommunications').then(module => ({ default: module.AdminCommunications }))
)
const AdminUserManagementPage = lazy(() =>
  import('@/pages/AdminUserManagementPage').then(module => ({
    default: module.AdminUserManagementPage,
  }))
)
const CreateNewUserPage = lazy(() =>
  import('@/pages/CreateNewUserPage').then(module => ({ default: module.CreateNewUserPage }))
)
const RootArchivedAdminsPage = lazy(() =>
  import('@/pages/RootArchivedAdminsPage').then(module => ({
    default: module.RootArchivedAdminsPage,
  }))
)
const RootArchivedAgentsPage = lazy(() =>
  import('@/pages/RootArchivedAgentsPage').then(module => ({
    default: module.RootArchivedAgentsPage,
  }))
)
const ClientListPage = lazy(() =>
  import('@/pages/ClientListPage').then(module => ({ default: module.ClientListPage }))
)
const ClientDetailPage = lazy(() =>
  import('@/pages/ClientDetailPage').then(module => ({ default: module.ClientDetailPage }))
)
const ClientArchivesPage = lazy(() =>
  import('@/pages/ClientArchivesPage').then(module => ({ default: module.ClientArchivesPage }))
)
const UserDashboard = lazy(() =>
  import('@/pages/UserDashboard').then(module => ({ default: module.UserDashboard }))
)
const CreateClientPage = lazy(() =>
  import('@/pages/CreateClientPage').then(module => ({ default: module.CreateClientPage }))
)
const ViewTransactionsPage = lazy(() =>
  import('@/pages/ViewTransactionsPage').then(module => ({ default: module.ViewTransactionsPage }))
)
const ClientVerifyPage = lazy(() =>
  import('@/pages/ClientVerifyPage').then(module => ({ default: module.ClientVerifyPage }))
)
const AmlAlertsPage = lazy(() =>
  import('@/pages/AmlAlertsPage').then(module => ({ default: module.AmlAlertsPage }))
)
const ClientAccountsPage = lazy(() =>
  import('@/pages/ClientAccountsPage').then(module => ({ default: module.ClientAccountsPage }))
)
const EditClientPage = lazy(() =>
  import('@/pages/EditClientPage').then(module => ({ default: module.EditClientPage }))
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then(module => ({ default: module.SettingsPage }))
)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/ForgotPasswordPage').then(module => ({ default: module.ForgotPasswordPage }))
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then(module => ({ default: module.ResetPasswordPage }))
)
const ActivityLogsPage = lazy(() =>
  import('@/pages/ActivityLogsPage').then(module => ({ default: module.ActivityLogsPage }))
)

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role === 'admin' || user?.role === 'super_admin') {
    return <Navigate to="/admin" replace />
  }

  return <Navigate to="/user" replace />
}

function AdminHomeRedirect() {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }
  // Non-root admins should not access the dashboard (client data)
  // Redirect them to User Management instead
  if (!isRootAdminUser(user)) {
    return <Navigate to="/admin/users" replace />
  }
  return <AdminDashboard />
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
              </div>
            }
          >
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-client" element={<ClientVerifyPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route element={<ProtectedRoute allowedRoles={['admin', 'super_admin']} />}>
                <Route path="/admin" element={<AdminHomeRedirect />} />
                <Route path="/admin/users" element={<AdminUserManagementPage />} />
                <Route path="/admin/users/new" element={<CreateNewUserPage />} />
                <Route
                  path="/admin/users/archives"
                  element={<Navigate to="/admin/users" replace />}
                />
                <Route path="/admin/logs" element={<ActivityLogsPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />
                <Route path="/admin/accounts" element={<Navigate to="/admin/users" replace />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute allowedRoles={['admin', 'super_admin']} requireRootAdmin />
                }
              >
                <Route path="/admin/clients" element={<ClientListPage />} />
                <Route path="/admin/client-archives" element={<ClientArchivesPage />} />
                <Route path="/admin/clients/new" element={<CreateClientPage />} />
                <Route path="/admin/clients/:clientId" element={<ClientDetailPage />} />
                <Route path="/admin/clients/:clientId/edit" element={<EditClientPage />} />
                <Route path="/admin/clients/:clientId/accounts" element={<ClientAccountsPage />} />
                <Route path="/admin/communications" element={<AdminCommunications />} />
                <Route path="/admin/transactions" element={<ViewTransactionsPage />} />
                <Route path="/admin/aml-alerts" element={<AmlAlertsPage />} />
                <Route path="/admin/users/archives/admins" element={<RootArchivedAdminsPage />} />
                <Route path="/admin/users/archives/agents" element={<RootArchivedAgentsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['user']} />}>
                <Route path="/user" element={<UserDashboard />} />
                <Route path="/user/clients" element={<ClientListPage />} />
                <Route path="/user/clients/new" element={<CreateClientPage />} />
                <Route path="/user/clients/:clientId" element={<ClientDetailPage />} />
                <Route path="/user/clients/:clientId/edit" element={<EditClientPage />} />
                <Route path="/user/clients/:clientId/accounts" element={<ClientAccountsPage />} />
                <Route path="/user/transactions" element={<ViewTransactionsPage />} />
                <Route path="/user/aml-alerts" element={<AmlAlertsPage />} />
                <Route path="/user/logs" element={<ActivityLogsPage />} />
                <Route path="/user/settings" element={<SettingsPage />} />
              </Route>

              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
