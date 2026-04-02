import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { listUsers, deleteUser, disableUser } from '@/api/users'
import { reassignClients } from '@/api/clients'
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

const roleLabel = (role: UserRole) => {
  if (role === 'admin') return 'Admin'
  if (role === 'super_admin') return 'Root Admin'
  return 'Agent'
}

const roleLabelForUser = (target: User) => {
  if (isRootAdminUser(target)) return 'Root Admin'
  return roleLabel(target.role)
}

export function AdminUserManagementPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [disablingUserId, setDisablingUserId] = useState<string | null>(null)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [transferFromUser, setTransferFromUser] = useState<User | null>(null)
  const [transferToUserId, setTransferToUserId] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

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
        setSuccessMessage('')

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
    setSuccessMessage('')

    try {
      await deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
      setSuccessMessage('User deleted successfully')
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

  const handleDisableUser = async (target: User) => {
    if (target.role !== 'user') {
      setError('Only agents can be disabled from this view')
      return
    }
    if (target.status === 'disabled') {
      return
    }
    if (!confirm(`Disable ${target.firstName} ${target.lastName}?`)) {
      return
    }

    setDisablingUserId(target.id)
    setError('')
    setSuccessMessage('')

    try {
      const updated = await disableUser(target.id)
      setUsers(prev => prev.map(u => (u.id === target.id ? updated : u)))
      setSuccessMessage('Agent disabled. Reassign clients using Transfer.')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setError('You are not authorized to disable this user')
        } else {
          setError(err.message || 'Failed to disable user')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setDisablingUserId(null)
    }
  }

  const openTransferModal = (sourceUser: User) => {
    setError('')
    setSuccessMessage('')
    setTransferFromUser(sourceUser)
    setTransferToUserId('')
    setIsTransferModalOpen(true)
  }

  const closeTransferModal = () => {
    setIsTransferModalOpen(false)
    setTransferFromUser(null)
    setTransferToUserId('')
  }

  const handleTransferConfirm = async () => {
    if (!transferFromUser) return
    if (!transferToUserId) {
      setError('Please select a target agent')
      return
    }

    setIsTransferring(true)
    setError('')
    setSuccessMessage('')

    try {
      const response = await reassignClients({
        fromUserId: transferFromUser.id,
        toUserId: transferToUserId,
      })
      setSuccessMessage(
        response.count > 0
          ? `Transferred ${response.count} client(s) successfully`
          : 'No clients were assigned to this agent'
      )
      closeTransferModal()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setError('You are not authorized to transfer clients')
        } else {
          setError(err.message || 'Failed to transfer clients')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsTransferring(false)
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
  const transferTargets = regularUsers.filter(
    u => u.status === 'active' && u.id !== transferFromUser?.id
  )

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
        {successMessage && (
          <div className="bg-success/10 border border-success rounded-lg p-4 mb-6">
            <p className="text-success text-sm">{successMessage}</p>
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
                        <th className="text-left py-2 px-4 font-normal text-text">Status</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map(admin => (
                        <tr key={admin.id} className="border-b border-border/50">
                          <td className="py-3 px-4 text-text">{admin.firstName}</td>
                          <td className="py-3 px-4 text-text">{admin.lastName}</td>
                          <td className="py-3 px-4 text-text">{admin.email}</td>
                          <td className="py-3 px-4 text-text">{roleLabelForUser(admin)}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                admin.status === 'disabled'
                                  ? 'bg-warning/20 text-warning'
                                  : 'bg-success/20 text-success'
                              }`}
                            >
                              {admin.status === 'disabled' ? 'Disabled' : 'Active'}
                            </span>
                          </td>
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
                        <th className="text-left py-2 px-4 font-normal text-text">Status</th>
                        <th className="text-left py-2 px-4 font-normal text-text">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regularUsers.map(u => (
                        <tr key={u.id} className="border-b border-border/50">
                          <td className="py-3 px-4 text-text">{u.firstName}</td>
                          <td className="py-3 px-4 text-text">{u.lastName}</td>
                          <td className="py-3 px-4 text-text">{u.email}</td>
                          <td className="py-3 px-4 text-text">{roleLabelForUser(u)}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                u.status === 'disabled'
                                  ? 'bg-warning/20 text-warning'
                                  : 'bg-success/20 text-success'
                              }`}
                            >
                              {u.status === 'disabled' ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {u.status === 'active' ? (
                                <button
                                  onClick={() => handleDisableUser(u)}
                                  disabled={disablingUserId === u.id}
                                  className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                    disablingUserId === u.id
                                      ? 'bg-warning/70 opacity-50 cursor-not-allowed text-white'
                                      : 'bg-warning hover:opacity-80 text-white'
                                  }`}
                                >
                                  {disablingUserId === u.id ? 'Disabling...' : 'Disable'}
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openTransferModal(u)}
                                    className="px-3 py-1 rounded text-sm font-normal bg-accent text-white hover:opacity-80 transition-opacity"
                                  >
                                    Transfer
                                  </button>
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
                                </>
                              )}
                            </div>
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
      {isTransferModalOpen && transferFromUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h3 className="text-lg font-medium text-text mb-2">Transfer Clients</h3>
            <p className="text-sm text-text-subtle mb-4">
              Move all clients from{' '}
              <strong>
                {transferFromUser.firstName} {transferFromUser.lastName}
              </strong>{' '}
              to another active agent.
            </p>
            <label className="block text-sm text-text mb-2" htmlFor="transfer-target">
              Target agent
            </label>
            <select
              id="transfer-target"
              value={transferToUserId}
              onChange={e => setTransferToUserId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-text mb-4"
            >
              <option value="">Select an active agent</option>
              {transferTargets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.firstName} {target.lastName} ({target.email})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeTransferModal}
                disabled={isTransferring}
                className="px-3 py-1.5 rounded border border-border text-text hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTransferConfirm}
                disabled={isTransferring || !transferToUserId}
                className={`px-3 py-1.5 rounded text-white transition-opacity ${
                  isTransferring || !transferToUserId
                    ? 'gradient-dark-red opacity-50 cursor-not-allowed'
                    : 'gradient-dark-red hover:opacity-80'
                }`}
              >
                {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
