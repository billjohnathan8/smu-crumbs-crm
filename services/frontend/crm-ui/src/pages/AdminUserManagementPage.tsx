import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listUsers, deleteUser } from '@/api/users'
import type { User, UserRole } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients' },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
]

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients' },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'User Management', to: '/admin/adminusermanagement' },
]

export function AdminUserManagementPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const isRootAdmin = user?.role === 'super_admin' || String(user?.id) === '1'
  const isUser = user?.role === 'user'

  const canManageUsers = isAdmin || isRootAdmin

  const basePath = canManageUsers ? '/admin' : '/user'
  const sidebarNav = canManageUsers ? adminNav : userNav
  const homePath = basePath

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true)
        setError('')

        // For root admin, get all users; for admin, get only users
        const params = isRootAdmin ? {} : { role: 'user' as UserRole }
        const response = await listUsers(params)
        setUsers(response.data)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
          } else {
            setError(err.message || 'Failed to load users')
          }
        } else {
          setError('An unexpected error occurred')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [isRootAdmin, logout])

  const handleDeleteUser = async (userId: string, userRole: UserRole) => {
    // Check permissions
    if (userRole === 'admin' && !isRootAdmin) {
      setError('Only root admin can delete other admins')
      return
    }

    if (userRole === 'user' && !isAdmin && !isRootAdmin) {
      setError('You do not have permission to delete users')
      return
    }

    if (!confirm(`Are you sure you want to delete this ${userRole}?`)) {
      return
    }

    setDeletingUserId(userId)
    setError('')

    try {
      await deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setError('You are not authorized to delete this user')
        } else {
          setError(err.message || 'Failed to delete user')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setDeletingUserId(null)
    }
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (isUser || !canManageUsers) {
    return <Navigate to="/unauthorized" replace />
  }

  // Group users by role for display
  const admins = users.filter(u => u.role === 'admin' || u.role === 'super_admin')
  const users = users.filter(u => u.role === 'user')

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(homePath)} className="text-text-muted hover:text-text">
              Dashboard
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">User Management</h1>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/admin/createnewuserpage')}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              Create New User
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-text-muted">Loading users...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {isRootAdmin && admins.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-bold text-text mb-4">Admins</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-4 font-medium text-text">First Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Last Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Email</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Role</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map(admin => (
                        <tr key={admin.id} className="border-b border-border/50">
                          <td className="py-3 px-4 text-text">{admin.firstName}</td>
                          <td className="py-3 px-4 text-text">{admin.lastName}</td>
                          <td className="py-3 px-4 text-text">{admin.email}</td>
                          <td className="py-3 px-4 text-text capitalize">{admin.role}</td>
                          <td className="py-3 px-4">
                            {admin.id !== user.id && (
                              <button
                                onClick={() => handleDeleteUser(admin.id, admin.role)}
                                disabled={deletingUserId === admin.id}
                                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                  deletingUserId === admin.id
                                    ? 'bg-danger/50 cursor-not-allowed text-white'
                                    : 'bg-danger hover:bg-danger-hover text-white'
                                }`}
                              >
                                {deletingUserId === admin.id ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-bold text-text mb-4">
                {isRootAdmin ? 'My Users' : 'My Users'}
              </h2>

              {users.length === 0 ? (
                <p className="text-text-muted">No users found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-4 font-medium text-text">First Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Last Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Email</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Role</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-b border-border/50">
                          <td className="py-3 px-4 text-text">{user.firstName}</td>
                          <td className="py-3 px-4 text-text">{user.lastName}</td>
                          <td className="py-3 px-4 text-text">{user.email}</td>
                          <td className="py-3 px-4 text-text capitalize">{user.role}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleDeleteUser(user.id, user.role)}
                              disabled={deletingUserId === user.id}
                              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                deletingUserId === user.id
                                  ? 'bg-danger/50 cursor-not-allowed text-white'
                                  : 'bg-danger hover:bg-danger-hover text-white'
                              }`}
                            >
                              {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  )
}
