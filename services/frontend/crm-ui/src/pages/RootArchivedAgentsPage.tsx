import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { listArchivedUsers, reinstateUser } from '@/api/users'
import { ApiError } from '@/api/client'
import type { User } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { SidebarLayout } from '@/components/SidebarDrawer'
import { getSidebarNavForUser } from '@/navigation/sidebarNav'

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
    <SidebarLayout items={getSidebarNavForUser(user)}>
      <div className="flex h-16 items-center justify-between">
        <h1 className="text-2xl font-normal text-text">Archived Agents</h1>
      </div>

      <main className="mt-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-danger bg-danger/10 p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
        {loading ? (
          <p className="text-text-muted">Loading archived agents...</p>
        ) : users.length === 0 ? (
          <p className="text-text-subtle">No archived agents found.</p>
        ) : (
          <div className="rounded-lg bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-xl font-normal text-text">Archived Agents</h2>
              <span className="text-sm text-text-muted">{users.length} archived</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-light">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                      usr_id
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                      Archived At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                      Archived By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-background-light">
                      <td className="px-6 py-4 text-sm font-mono text-text">{u.id || '-'}</td>
                      <td className="px-6 py-4 text-sm text-text">
                        {u.firstName} {u.lastName}
                      </td>
                      <td className="px-6 py-4 text-sm text-text">{u.email}</td>
                      <td className="px-6 py-4 text-sm text-text">
                        {formatDateTime(u.archivedAt)}
                      </td>
                      <td className="px-6 py-4 text-sm text-text">{u.archivedBy || '-'}</td>
                      <td className="px-6 py-4 text-sm text-text">
                        <button
                          onClick={() => handleReinstate(u)}
                          disabled={reinstatingId === u.id}
                          className="rounded bg-success px-3 py-1 text-xs font-medium text-white hover:opacity-85 disabled:opacity-60"
                        >
                          {reinstatingId === u.id ? 'Reinstating...' : 'Reinstate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  )
}
