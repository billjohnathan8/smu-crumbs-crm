import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { listArchivedUsers } from '@/api/users'
import { ApiError } from '@/api/client'
import type { User } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'User Management', to: '/admin/users', end: true },
  { label: 'My Archived Users', to: '/admin/users/archives' },
  { label: 'Settings', to: '/admin/settings' },
]

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-SG')
}

export function AdminUserArchivesPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await listArchivedUsers({ role: 'user', limit: 200 })
        setUsers(response.data)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) logout()
          else setError(err.message || 'Failed to load archived users')
        } else {
          setError('An unexpected error occurred')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [logout])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/unauthorized" replace />

  return (
    <SidebarLayout items={adminNav}>
      <nav className="flex h-16 items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/admin/users')} className="text-text-subtle text-2xl">
            User Management
          </button>
          <span className="text-text-subtle text-2xl">/</span>
          <h1 className="text-2xl font-normal text-text">My Archived Users</h1>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto py-8">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}
        {loading ? (
          <p className="text-text-muted">Loading archived users...</p>
        ) : users.length === 0 ? (
          <p className="text-text-subtle">No archived users found.</p>
        ) : (
          <div className="bg-card rounded-lg p-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 font-medium text-text">Name</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Email</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Archived At</th>
                  <th className="text-left py-2 px-4 font-medium text-text">Archived By</th>
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
