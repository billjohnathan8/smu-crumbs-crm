import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listUsers, createUser, deleteUser, disableUser, resetUserPassword } from '@/api/users'
import type { User, UserRole } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients' },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'User Management', to: '/admin/users' },
]

const PAGE_SIZE = 10

interface ModalForm {
  firstName: string
  lastName: string
  email: string
  role: string
}

interface ModalErrors {
  firstName?: string
  lastName?: string
  email?: string
}

export function AdminManageAccountsPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [modalForm, setModalForm] = useState<ModalForm>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'user',
  })
  const [modalErrors, setModalErrors] = useState<ModalErrors>({})
  const [modalError, setModalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalPages = Math.ceil(totalUsers / PAGE_SIZE)

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true)
        setError('')
        const offset = (currentPage - 1) * PAGE_SIZE
        const response = await listUsers({ limit: PAGE_SIZE, offset })
        setUsers(response.data)
        setTotalUsers(response.pagination?.total ?? 0)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) logout()
          else setError(err.message || 'Failed to load users')
        } else {
          setError('An unexpected error occurred')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [currentPage, logout])

  const openModal = () => {
    setModalForm({ firstName: '', lastName: '', email: '', role: 'user' })
    setModalErrors({})
    setModalError('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
  }

  const validateModal = (): boolean => {
    const errors: ModalErrors = {}
    if (!modalForm.firstName.trim()) errors.firstName = 'First name is required'
    if (!modalForm.lastName.trim()) errors.lastName = 'Last name is required'
    if (!modalForm.email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalForm.email)) {
      errors.email = 'Invalid email format'
    }
    setModalErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateModal()) return

    setIsSubmitting(true)
    setModalError('')

    try {
      const newUser = await createUser({
        firstName: modalForm.firstName,
        lastName: modalForm.lastName,
        email: modalForm.email,
        role: modalForm.role as UserRole,
      })
      setUsers(prev => [...prev, newUser])
      setSuccessMessage(`User ${newUser.firstName} ${newUser.lastName} created successfully`)
      setShowModal(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 409) {
          setModalError('A user with this email already exists')
        } else {
          setModalError(err.message || 'Failed to create user')
        }
      } else {
        setModalError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisableUser = async (u: User) => {
    if (!confirm(`Are you sure you want to disable this user?`)) return
    setSuccessMessage('')
    setError('')
    try {
      await disableUser(u.id)
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, status: 'disabled' as const } : x)))
      setSuccessMessage('User disabled successfully')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout()
      else setError('Failed to disable user')
    }
  }

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Are you sure you want to delete this user?`)) return
    setSuccessMessage('')
    setError('')
    try {
      await deleteUser(u.id)
      setUsers(prev => prev.filter(x => x.id !== u.id))
      setSuccessMessage('User deleted successfully')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout()
      else setError('Failed to delete user')
    }
  }

  const handleResetPassword = async (u: User) => {
    if (!confirm(`Are you sure you want to send a password reset email to this user?`)) return
    setSuccessMessage('')
    setError('')
    try {
      await resetUserPassword(u.id, u.email)
      setSuccessMessage('Password reset email sent')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout()
      else setError('Failed to send password reset')
    }
  }

  return (
    <SidebarLayout items={adminNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/admin')} className="text-text-muted hover:text-text">
              Dashboard
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">Manage Accounts</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={openModal}
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
          <div className="bg-card border border-border rounded-lg">
            <div className="overflow-x-auto">
              {users.length === 0 ? (
                <div className="p-6 text-center text-text-muted">No users found</div>
              ) : (
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
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="py-3 px-4 text-text">{u.firstName}</td>
                        <td className="py-3 px-4 text-text">{u.lastName}</td>
                        <td className="py-3 px-4 text-text">{u.email}</td>
                        <td className="py-3 px-4 text-text capitalize">{u.role}</td>
                        <td className="py-3 px-4 text-text capitalize">{u.status}</td>
                        <td className="py-3 px-4">
                          <div className="flex space-x-2">
                            {u.status !== 'disabled' && u.id !== user?.id && (
                              <button
                                onClick={() => handleDisableUser(u)}
                                className="px-3 py-1 rounded text-sm font-medium bg-warning hover:bg-warning-hover text-white transition-colors"
                              >
                                Disable
                              </button>
                            )}
                            {u.id !== user?.id && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="px-3 py-1 rounded text-sm font-medium bg-danger hover:bg-danger-hover text-white transition-colors"
                              >
                                Delete
                              </button>
                            )}
                            <button
                              onClick={() => handleResetPassword(u)}
                              className="px-3 py-1 rounded text-sm font-medium bg-primary hover:bg-primary-hover text-white transition-colors"
                            >
                              Reset Password
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {totalUsers > 0 && (
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-background-light text-text disabled:opacity-50 transition-colors"
                >
                  Previous
                </button>
                <span className="text-text">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-4 py-2 rounded-lg bg-background-light text-text disabled:opacity-50 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-text mb-4">Create New User</h2>

            {modalError && (
              <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                <p className="text-danger text-sm">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-text mb-1">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={modalForm.firstName}
                  onChange={e => setModalForm({ ...modalForm, firstName: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {modalErrors.firstName && (
                  <p className="text-danger text-xs mt-1">{modalErrors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-text mb-1">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={modalForm.lastName}
                  onChange={e => setModalForm({ ...modalForm, lastName: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {modalErrors.lastName && (
                  <p className="text-danger text-xs mt-1">{modalErrors.lastName}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={modalForm.email}
                  onChange={e => setModalForm({ ...modalForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {modalErrors.email && (
                  <p className="text-danger text-xs mt-1">{modalErrors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-text mb-1">
                  Role
                </label>
                <select
                  id="role"
                  value={modalForm.role}
                  onChange={e => setModalForm({ ...modalForm, role: e.target.value })}
                  className="w-full px-3 py-2 bg-background-light border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-background-light text-text font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors disabled:opacity-50"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
