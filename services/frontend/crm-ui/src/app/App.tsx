import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

import { LoginPage } from '@/pages/LoginPage'
import { CognitoCallback } from '@/pages/CognitoCallback'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'

import { AdminDashboard } from '@/pages/AdminDashboard'
import { AdminCommunications } from '@/pages/AdminCommunications'
import { AdminUserManagementPage } from '@/pages/AdminUserManagementPage'
import { UserDashboard } from '@/pages/UserDashboard'
import { AmlAlertsPage } from '@/pages/AmlAlertsPage'
import { ClientAccountsPage } from '@/pages/ClientAccountsPage'
import { ClientDetailPage } from '@/pages/ClientDetailPage'
import { ClientListPage } from '@/pages/ClientListPage'
import { CreateClientPage } from '@/pages/CreateClientPage'
import { CreateNewUserPage } from '@/pages/CreateNewUserPage'
import { EditClientPage } from '@/pages/EditClientPage'
import { ViewTransactionsPage } from '@/pages/ViewTransactionsPage'

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

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<CognitoCallback />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute allowedRoles={['admin', 'super_admin']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/clients" element={<ClientListPage />} />
            <Route path="/admin/clients/new" element={<CreateClientPage />} />
            <Route path="/admin/clients/:clientId" element={<ClientDetailPage />} />
            <Route path="/admin/clients/:clientId/edit" element={<EditClientPage />} />
            <Route path="/admin/clients/:clientId/accounts" element={<ClientAccountsPage />} />
            <Route path="/admin/communications" element={<AdminCommunications />} />
            <Route path="/admin/transactions" element={<ViewTransactionsPage />} />
            <Route path="/admin/aml-alerts" element={<AmlAlertsPage />} />
            <Route path="/admin/users" element={<AdminUserManagementPage />} />
            <Route path="/admin/users/new" element={<CreateNewUserPage />} />
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
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
