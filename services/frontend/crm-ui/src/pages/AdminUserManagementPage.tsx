import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { listUsers, deleteUser, disableUser } from '@/api/users'
import {
  reassignClients,
  countClientsByAgent,
  getVerificationSubmissionSummary,
} from '@/api/clients'
import type { User, UserRole } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout } from '@/components/SidebarDrawer'
import { getSidebarNavForUser } from '@/navigation/sidebarNav'

const roleLabel = (role: UserRole) => {
  if (role === 'admin') return 'Admin'
  if (role === 'super_admin') return 'Root Admin'
  return 'Agent'
}

const roleLabelForUser = (target: User) => {
  if (isRootAdminUser(target)) return 'Root Admin'
  return roleLabel(target.role)
}

const statusBadgeClass = (status: User['status']) => {
  if (status === 'deleted') return 'bg-danger/20 text-danger'
  if (status === 'disabled') return 'bg-warning/20 text-warning'
  return 'bg-success/20 text-success'
}

const statusLabel = (status: User['status']) => {
  if (status === 'deleted') return 'ARCHIVED'
  if (status === 'disabled') return 'DISABLED'
  return 'ACTIVE'
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
  const [agentClientCounts, setAgentClientCounts] = useState<Record<string, number>>({})
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState<number | null>(null)
  const [listFilters, setListFilters] = useState<{
    search: string
    role: UserRole | ''
    status: User['status'] | ''
  }>({
    search: '',
    role: '',
    status: '',
  })

  const isAdmin = user?.role === 'admin'
  const isRootAdmin = isRootAdminUser(user)
  const isUser = user?.role === 'user'

  const canManageUsers = isAdmin || isRootAdmin

  const homePath = canManageUsers ? '/admin' : '/user'

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

  useEffect(() => {
    if (!isRootAdmin) {
      return
    }
    const disabledAgents = users.filter(u => u.role === 'user' && u.status === 'disabled')
    if (disabledAgents.length === 0) return
    const fetchCounts = async () => {
      const counts: Record<string, number> = {}
      await Promise.all(
        disabledAgents.map(async agent => {
          try {
            counts[agent.id] = await countClientsByAgent(agent.id)
          } catch {
            counts[agent.id] = -1
          }
        })
      )
      setAgentClientCounts(prev => ({ ...prev, ...counts }))
    }
    fetchCounts()
  }, [isRootAdmin, users])

  useEffect(() => {
    if (!canManageUsers) {
      return
    }
    getVerificationSubmissionSummary()
      .then(summary => setPendingSubmissionCount(summary.pendingSubmissionCount))
      .catch(() => setPendingSubmissionCount(null))
  }, [canManageUsers])

  const handleDeleteUser = async (userId: string, userRole: UserRole) => {
    // Check permissions
    if (userRole === 'admin' && !isRootAdmin) {
      setError('Only root admin can archive other admins')
      return
    }

    if (userRole === 'user' && !isAdmin && !isRootAdmin) {
      setError('You do not have permission to archive users')
      return
    }

    if (!confirm(`Are you sure you want to archive this ${userRole}?`)) {
      return
    }

    setDeletingUserId(userId)
    setError('')
    setSuccessMessage('')

    try {
      await deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
      setSuccessMessage('User archived successfully')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setError('You are not authorized to archive this user')
        } else {
          setError(err.message || 'Failed to archive user')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleDisableUser = async (target: User) => {
    if (target.role === 'super_admin') {
      setError('Root admin cannot be disabled from this view')
      return
    }
    if (target.role === 'admin' && !isRootAdmin) {
      setError('Only root admin can disable admins')
      return
    }
    if (target.role === 'user' && !isAdmin && !isRootAdmin) {
      setError('You do not have permission to disable users')
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
      setSuccessMessage(
        target.role === 'user'
          ? 'Agent disabled. Transfer assigned clients before archiving.'
          : 'Admin disabled. Archive is now available.'
      )
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

  const handleListFilterChange = (key: 'search' | 'role' | 'status', value: string) => {
    setListFilters(prev => ({
      ...prev,
      [key]:
        key === 'role'
          ? (value as UserRole | '')
          : key === 'status'
            ? (value as User['status'] | '')
            : value,
    }))
  }

  const resetListFilters = () => {
    setListFilters({ search: '', role: '', status: '' })
  }

  const handleTransferConfirm = async () => {
    if (!isRootAdmin) {
      setError('Only root admin can transfer clients between agents')
      return
    }
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
      await deleteUser(transferFromUser.id)
      setUsers(prev => prev.filter(u => u.id !== transferFromUser.id))
      setSuccessMessage(`Transferred ${response.count} client(s) and archived the agent.`)
      setAgentClientCounts(prev => ({ ...prev, [transferFromUser.id]: 0 }))
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
  const userMatchesFilters = (candidate: User) => {
    const normalizedSearch = listFilters.search.trim().toLowerCase()
    const matchesSearch =
      normalizedSearch.length === 0 ||
      candidate.id.toLowerCase().includes(normalizedSearch) ||
      candidate.firstName.toLowerCase().includes(normalizedSearch) ||
      candidate.lastName.toLowerCase().includes(normalizedSearch) ||
      candidate.email.toLowerCase().includes(normalizedSearch)
    const matchesRole = !listFilters.role || candidate.role === listFilters.role
    const matchesStatus = !listFilters.status || candidate.status === listFilters.status
    return matchesSearch && matchesRole && matchesStatus
  }

  const allRegularUsers = users.filter(u => u.role === 'user')
  const admins = users
    .filter(u => u.role === 'admin' || u.role === 'super_admin')
    .filter(userMatchesFilters)
  const regularUsers = allRegularUsers.filter(userMatchesFilters)
  const transferTargets = allRegularUsers.filter(
    u => u.status === 'active' && u.id !== transferFromUser?.id
  )

  return (
    <SidebarLayout items={getSidebarNavForUser(user)}>
      <nav>
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(homePath)} className="text-text-subtle text-2xl">
              Dashboard
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-normal text-text">User Management</h1>
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
        {pendingSubmissionCount !== null && (
          <div className="bg-warning/10 border border-warning rounded-lg p-4 mb-6">
            <p className="text-warning text-sm">
              Pending verification submissions: {pendingSubmissionCount}.{' '}
              {isRootAdmin
                ? 'Review from root-admin client pages.'
                : 'Notify root admin for review decisions.'}
            </p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <p className="text-text-muted">Loading users...</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-card rounded-lg p-4">
              <h3 className="text-text font-normal mb-4">Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Search</label>
                  <input
                    type="text"
                    value={listFilters.search}
                    onChange={e => handleListFilterChange('search', e.target.value)}
                    placeholder="ID, name, or email"
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Role</label>
                  <select
                    value={listFilters.role}
                    onChange={e => handleListFilterChange('role', e.target.value)}
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All</option>
                    <option value="super_admin">Root Admin</option>
                    <option value="admin">Admin</option>
                    <option value="user">Agent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Status</label>
                  <select
                    value={listFilters.status}
                    onChange={e => handleListFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={resetListFilters}
                  className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.9] text-sm font-medium transition-all duration-200"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {isRootAdmin && admins.length > 0 && (
              <div className="bg-card  rounded-lg p-6">
                <h2 className="text-xl font-normal text-text mb-4">Admins</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-4 font-medium text-text">First Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Last Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Email</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Role</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Status</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Actions</th>
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
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(admin.status)}`}
                            >
                              {statusLabel(admin.status)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {admin.id !== user.id && (
                              <div className="flex items-center gap-2">
                                {admin.status === 'active' ? (
                                  <button
                                    onClick={() => handleDisableUser(admin)}
                                    disabled={disablingUserId === admin.id}
                                    className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                      disablingUserId === admin.id
                                        ? 'border border-danger text-danger opacity-50 cursor-not-allowed'
                                        : 'border border-danger text-danger hover:bg-danger/10'
                                    }`}
                                  >
                                    {disablingUserId === admin.id ? 'Disabling...' : 'Disable'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteUser(admin.id, admin.role)}
                                    disabled={deletingUserId === admin.id}
                                    className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                      deletingUserId === admin.id
                                        ? 'gradient-dark-red opacity-50 cursor-not-allowed text-white'
                                        : 'gradient-dark-red hover:opacity-80 text-white'
                                    }`}
                                  >
                                    {deletingUserId === admin.id ? 'Archiving...' : 'Archive'}
                                  </button>
                                )}
                              </div>
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
                        <th className="text-left py-2 px-4 font-medium text-text">First Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Last Name</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Email</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Role</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Status</th>
                        <th className="text-left py-2 px-4 font-medium text-text">Actions</th>
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
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(u.status)}`}
                            >
                              {statusLabel(u.status)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {u.status === 'active' ? (
                                <>
                                  <button
                                    onClick={() => handleDisableUser(u)}
                                    disabled={disablingUserId === u.id}
                                    className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                      disablingUserId === u.id
                                        ? 'border border-danger text-danger opacity-50 cursor-not-allowed'
                                        : 'border border-danger text-danger hover:bg-danger/10'
                                    }`}
                                  >
                                    {disablingUserId === u.id ? 'Disabling...' : 'Disable'}
                                  </button>
                              </>
                            ) : (
                              <>
                                  {isRootAdmin && (agentClientCounts[u.id] ?? -1) > 0 && (
                                    <button
                                      onClick={() => openTransferModal(u)}
                                      title="Transfer assigned clients; archive is automatic."
                                      className="px-3 py-1 rounded text-sm font-normal bg-accent text-white hover:opacity-80 transition-opacity"
                                    >
                                      Transfer
                                      {agentClientCounts[u.id] != null &&
                                      agentClientCounts[u.id] > 0
                                        ? ` (${agentClientCounts[u.id]})`
                                        : ''}
                                    </button>
                                  )}
                                  {isRootAdmin && (agentClientCounts[u.id] ?? -1) === 0 && (
                                    <button
                                      onClick={() => handleDeleteUser(u.id, u.role)}
                                      disabled={deletingUserId === u.id}
                                      className={`px-3 py-1 rounded text-sm font-normal transition-opacity ${
                                        deletingUserId === u.id
                                          ? 'gradient-dark-red opacity-50 cursor-not-allowed text-white'
                                          : 'gradient-dark-red hover:opacity-80 text-white'
                                      }`}
                                    >
                                      {deletingUserId === u.id ? 'Archiving...' : 'Archive'}
                                    </button>
                                  )}
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
