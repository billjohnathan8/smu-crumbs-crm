import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { listArchivedUsers, reinstateUser } from '@/api/users'
import { ApiError } from '@/api/client'
import type { User } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const rootAdminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Client Archives', to: '/admin/client-archives', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Archived Admins', to: '/admin/users/archives/admins' },
  { label: 'Archived Agents', to: '/admin/users/archives/agents' },
  { label: 'Settings', to: '/admin/settings' },
]

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-SG')
}

export function RootArchivedAgentsPage() {
  const { user, logout } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reinstatingId, setReinstatingId] = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await listArchivedUsers({ role: 'user', limit: 200 })
      setUsers(response.data)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setError(err.message || 'Failed to load archived agents')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logout])

  const handleReinstate = async (target: User) => {
    if (!confirm(`Reinstate ${target.firstName} ${target.lastName}?`)) return
    setReinstatingId(target.id)
    setError('')
    try {
      await reinstateUser(target.id)
      setUsers(prev => prev.filter(u => u.id !== target.id))
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setError(err.message || 'Failed to reinstate archived agent')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setReinstatingId(null)
    }
  }

  if (!user) return <Navigate to="/login" replace />
  if (!isRootAdminUser(user)) return <Navigate to="/unauthorized" replace />

  return (
    <SidebarLayout items={rootAdminNav}>
      <h1 className="text-2xl font-normal text-text py-4">Archived Agents</h1>
      <main className="max-w-6xl mx-auto py-4">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}
        {loading ? (
          <p className="text-text-muted">Loading archived agents...</p>
        ) : users.length === 0 ? (
          <p className="text-text-subtle">No archived agents found.</p>
        ) : (
          <div className="bg-card rounded-lg p-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 font-medium text-text">Name</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Email</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Archived At</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Archived By</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-border/50">
                    <td className="py-3 px-4 text-text">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="py-3 px-4 text-text">{u.email}</td>
                    <td className="py-3 px-4 text-text">{formatDateTime(u.archivedAt)}</td>
                    <td className="py-3 px-4 text-text">{u.archivedBy || '-'}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleReinstate(u)}
                        disabled={reinstatingId === u.id}
                        className="px-3 py-1 rounded bg-success text-white hover:opacity-85 disabled:opacity-60"
                      >
                        {reinstatingId === u.id ? 'Reinstating...' : 'Reinstate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </SidebarLayout>
  )
}
