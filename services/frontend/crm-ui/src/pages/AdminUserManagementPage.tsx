import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
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
  { label: 'Settings', to: '/user/settings' },
]

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Settings', to: '/admin/settings' },
]

export function AdminUserManagementPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const isRootAdmin = isRootAdminUser(user)
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
  const regularUsers = users.filter(u => u.role === 'user')

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(homePath)} className="text-text-subtle text-2xl">
              Dashboard
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-medium text-text">User Management</h1>
          </div>

          <div className="flex items-center space-x-4">
            <button
              data-testid="create-new-user-button"
              onClick={() => navigate('/admin/users/new')}
              className="px-4 py-2 rounded-lg gradient-dark-red hover:brightness-[0.8] text-white font-medium transition-all duration-200"
            >
              Create New User
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-8">
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
              <div className="bg-card  rounded-lg p-6">
                <h2 className="text-xl font-bold text-text mb-4">Admins</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-4 font-normal text-text">First Name</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Last Name</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Email</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Role</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Actions</th>
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
                                className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                  deletingUserId === admin.id
                                    ? 'gradient-dark-red opacity-50 cursor-not-allowed text-white'
                                    : 'gradient-dark-red hover:opacity-80 text-white'
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

            <div className="bg-card rounded-lg p-6">
              <h2 className="text-xl font-normal text-text mb-4">
                {isRootAdmin ? 'My Users' : 'My Users'}
              </h2>

              {regularUsers.length === 0 ? (
                <p className="text-text-subtle">No users found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-4 font-normal text-text">First Name</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Last Name</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Email</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Role</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regularUsers.map(u => (
                        <tr key={u.id} className="border-b border-border/50">
                          <td className="py-3 px-4 text-text">{u.firstName}</td>
                          <td className="py-3 px-4 text-text">{u.lastName}</td>
                          <td className="py-3 px-4 text-text">{u.email}</td>
                          <td className="py-3 px-4 text-text capitalize">{u.role}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleDeleteUser(u.id, u.role)}
                              disabled={deletingUserId === u.id}
                              className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                deletingUserId === u.id
                                  ? 'gradient-dark-red opacity-50 cursor-not-allowed text-white'
                                  : 'gradient-dark-red hover:opacity-80 text-white'
                              }`}
                            >
                              {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
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
