import { useState, useEffect, type FormEvent } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { listUsers, createUser, disableUser, deleteUser, resetUserPassword } from '@/api/users'
import type { User, CreateUserRequest, UserRole } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const ITEMS_PER_PAGE = 10

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'Manage Accounts', to: '/admin/accounts' },
]

export function AdminManageAccounts() {
  const { logout } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const [formData, setFormData] = useState<CreateUserRequest>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'agent',
    sendInviteEmail: true,
  })
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CreateUserRequest, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string>('')

  const fetchUsers = async (page: number) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await listUsers({
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
      })

      setUsers(response.data)
      setTotal(response.pagination?.total || 0)
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
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CreateUserRequest, string>> = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required'
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required'
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    setFormErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    setError('')
    setSuccessMessage('')

    try {
      await createUser(formData)
      setSuccessMessage('User created successfully')
      setShowCreateModal(false)
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        role: 'agent',
        sendInviteEmail: true,
      })
      fetchUsers(currentPage)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else {
          setError(err.message || 'Failed to create user')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisableUser = async (userId: string) => {
    if (!confirm('Are you sure you want to disable this user?')) return

    try {
      await disableUser(userId)
      setSuccessMessage('User disabled successfully')
      fetchUsers(currentPage)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else {
          setError(err.message || 'Failed to disable user')
        }
      } else {
        setError('An unexpected error occurred')
      }
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return

    try {
      await deleteUser(userId)
      setSuccessMessage('User deleted successfully')
      fetchUsers(currentPage)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else {
          setError(err.message || 'Failed to delete user')
        }
      } else {
        setError('An unexpected error occurred')
      }
    }
  }

  const handleResetPassword = async (userId: string, email: string) => {
    if (!confirm('Send password reset email to this user?')) return

    try {
      await resetUserPassword(userId, email)
      setSuccessMessage('Password reset email sent')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else {
          setError(err.message || 'Failed to reset password')
        }
      } else {
        setError('An unexpected error occurred')
      }
    }
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

return (
  <SidebarLayout items={adminNav}>
    <div className="flex justify-between h-16 items-center">
      <div className="flex items-center space-x-4">
        <a href="/admin" className="text-text-muted hover:text-text">
          Dashboard
        </a>
        <span className="text-text-muted">/</span>
        <h1 className="text-xl font-bold text-text">Manage Accounts</h1>
      </div>
      <button
        onClick={logout}
        className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
      >
        Logout
      </button>
    </div>

    <main className="mt-6">
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

        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h2 className="text-xl font-bold text-text">User Accounts</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              Create New Agent
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64" role="status">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No users found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-light">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-background-light">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                          {user.firstName} {user.lastName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              user.role === 'admin'
                                ? 'bg-primary/20 text-primary'
                                : 'bg-success/20 text-success'
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              user.status === 'active'
                                ? 'bg-success/20 text-success'
                                : 'bg-danger/20 text-danger'
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          <button
                            onClick={() => handleResetPassword(user.id, user.email)}
                            className="text-warning hover:text-warning-hover"
                          >
                            Reset Password
                          </button>
                          {user.status === 'active' && (
                            <button
                              onClick={() => handleDisableUser(user.id)}
                              className="text-warning hover:text-warning-hover"
                            >
                              Disable
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-danger hover:text-danger-hover"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    Showing {currentPage * ITEMS_PER_PAGE + 1} to{' '}
                    {Math.min((currentPage + 1) * ITEMS_PER_PAGE, total)} of {total} users
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 0}
                      className={`px-3 py-1 rounded ${
                        currentPage === 0
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-hover text-white'
                      }`}
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-text">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage >= totalPages - 1}
                      className={`px-3 py-1 rounded ${
                        currentPage >= totalPages - 1
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-hover text-white'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-text mb-4">Create New User</h3>

            <form onSubmit={handleCreateUser} className="space-y-4" noValidate>
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-text mb-1">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={e => {
                    setFormData({ ...formData, firstName: e.target.value })
                    if (formErrors.firstName) setFormErrors({ ...formErrors, firstName: '' })
                  }}
                  className={`w-full px-3 py-2 bg-background-light border ${
                    formErrors.firstName ? 'border-danger' : 'border-border'
                  } rounded text-text focus:outline-none focus:ring-2 focus:ring-primary`}
                  disabled={isSubmitting}
                />
                {formErrors.firstName && (
                  <p className="text-danger text-xs mt-1">{formErrors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-text mb-1">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={e => {
                    setFormData({ ...formData, lastName: e.target.value })
                    if (formErrors.lastName) setFormErrors({ ...formErrors, lastName: '' })
                  }}
                  className={`w-full px-3 py-2 bg-background-light border ${
                    formErrors.lastName ? 'border-danger' : 'border-border'
                  } rounded text-text focus:outline-none focus:ring-2 focus:ring-primary`}
                  disabled={isSubmitting}
                />
                {formErrors.lastName && (
                  <p className="text-danger text-xs mt-1">{formErrors.lastName}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={e => {
                    setFormData({ ...formData, email: e.target.value })
                    if (formErrors.email) setFormErrors({ ...formErrors, email: '' })
                  }}
                  className={`w-full px-3 py-2 bg-background-light border ${
                    formErrors.email ? 'border-danger' : 'border-border'
                  } rounded text-text focus:outline-none focus:ring-2 focus:ring-primary`}
                  disabled={isSubmitting}
                />
                {formErrors.email && <p className="text-danger text-xs mt-1">{formErrors.email}</p>}
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-text mb-1">
                  Role
                </label>
                <select
                  id="role"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 bg-background-light border border-border rounded text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isSubmitting}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="sendInvite"
                  checked={formData.sendInviteEmail}
                  onChange={e => setFormData({ ...formData, sendInviteEmail: e.target.checked })}
                  className="mr-2"
                  disabled={isSubmitting}
                />
                <label htmlFor="sendInvite" className="text-sm text-text">
                  Send invite email
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setFormData({
                      firstName: '',
                      lastName: '',
                      email: '',
                      role: 'agent',
                      sendInviteEmail: true,
                    })
                    setFormErrors({})
                  }}
                  className="px-4 py-2 rounded bg-background-light text-text hover:bg-background-lighter transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white transition-colors"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
