import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { CognitoCallback } from '@/pages/CognitoCallback'
import { AdminDashboard } from '@/pages/AdminDashboard'
import { AdminManageAccounts } from '@/pages/AdminManageAccounts'
import { AdminCommunications } from '@/pages/AdminCommunications'
import { AgentDashboard } from '@/pages/AgentDashboard'
import { AgentClientList } from '@/pages/AgentClientList'
import { AgentClientDetail } from '@/pages/AgentClientDetail'
import { AgentCreateClient } from '@/pages/AgentCreateClient'
import { AgentEditClient } from '@/pages/AgentEditClient'
import { AgentClientAccounts } from '@/pages/AgentClientAccounts'
import { AgentViewTransactions } from '@/pages/AgentViewTransactions'
import { AmlAlertsPage } from '@/pages/AmlAlertsPage'

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role === 'admin' || user?.role === 'super_admin') {
    return <Navigate to="/admin" replace />
  }

  return <Navigate to="/agent" replace />
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<CognitoCallback />} />

          <Route element={<ProtectedRoute allowedRoles={['admin', 'super_admin']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/accounts" element={<AdminManageAccounts />} />
            <Route path="/admin/communications" element={<AdminCommunications />} />
            <Route path="/admin/clients/:clientId" element={<AgentClientDetail />} />
            <Route path="/admin/aml-alerts" element={<AmlAlertsPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['agent']} />}>
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/clients" element={<AgentClientList />} />
            <Route path="/agent/clients/new" element={<AgentCreateClient />} />
            <Route path="/agent/clients/:clientId" element={<AgentClientDetail />} />
            <Route path="/agent/clients/:clientId/edit" element={<AgentEditClient />} />
            <Route path="/agent/clients/:clientId/accounts" element={<AgentClientAccounts />} />
            <Route path="/agent/transactions" element={<AgentViewTransactions />} />
            <Route path="/agent/aml-alerts" element={<AmlAlertsPage />} />
          </Route>

          <Route path="/" element={<RootRedirect />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
