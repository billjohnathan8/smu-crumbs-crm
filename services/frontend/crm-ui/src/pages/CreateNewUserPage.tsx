import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { createUser } from '@/api/users'
import type { CreateUserRequest, UserRole } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout } from '@/components/SidebarDrawer'
import { getSidebarNavForUser } from '@/navigation/sidebarNav'
import { useTheme } from '@/features/theme/useTheme'
import {
  getPasswordRules,
  getPasswordStrength,
  getPasswordStrengthPercent,
} from '@/features/auth/passwordPolicy'
const roleLabel = (role: UserRole) => {
  if (role === 'admin') return 'Admin'
  if (role === 'super_admin') return 'Root Admin'
  return 'Agent'
}

export function CreateNewUserPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme } = useTheme()

  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAdmin = user?.role === 'admin'
  const isRootAdmin = isRootAdminUser(user)
  const isUser = user?.role === 'user'

  const canManageUsers = isAdmin || isRootAdmin

  const basePath = canManageUsers ? '/admin' : '/user'
  const homePath = basePath
  const listPath = canManageUsers ? '/admin/users' : '/user'
  const breadcrumbLabel = canManageUsers ? 'Manage Users' : 'Dashboard'

  const allowedRoles: UserRole[] = isRootAdmin ? ['user', 'admin'] : ['user']

  const [formData, setFormData] = useState<CreateUserRequest>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'user',
    sendInviteEmail: true,
  })

  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CreateUserRequest, string>>>({})

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (isUser || !canManageUsers) {
    return <Navigate to="/unauthorized" replace />
  }

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

    if (!allowedRoles.includes(formData.role)) {
      newErrors.role = 'You are not allowed to create this role'
    }

    if (formData.temporaryPassword && formData.temporaryPassword.trim()) {
      const invalidRules = getPasswordRules(formData.temporaryPassword).filter(
        rule => rule.required && !rule.passed
      )
      if (invalidRules.length > 0) {
        newErrors.temporaryPassword = `Password does not meet requirements: ${invalidRules
          .map(rule => rule.label.toLowerCase())
          .join(', ')}`
      }
    }

    setFormErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setError('')
    setSuccessMessage('')
    setIsSubmitting(true)

    try {
      await createUser(formData)

      setSuccessMessage(`${roleLabel(formData.role)} created successfully`)

      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        role: 'user',
        sendInviteEmail: true,
      })
      setFormErrors({})
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setError('You are not authorized to create this user role')
        } else if (err.status === 409) {
          setError('A user with this email already exists')
        } else if (err.error === 'password_policy_violation') {
          setError(err.message)
        } else if (err.status === 422) {
          setError('Invalid data provided. Please check your inputs.')
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

  const updateField = (field: keyof CreateUserRequest, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const inputCls = (field: keyof CreateUserRequest) =>
    `form-input ${formErrors[field] ? 'form-input-error' : ''}` +
    (theme === 'dark' ? ' bg-[var(--gray)]' : ' bg-[var(--off-white)]')

  const temporaryPassword = formData.temporaryPassword ?? ''
  const hasTemporaryPassword = temporaryPassword.trim().length > 0
  const passwordRules = hasTemporaryPassword ? getPasswordRules(temporaryPassword) : []
  const passwordStrength = hasTemporaryPassword ? getPasswordStrength(temporaryPassword) : null
  const strengthPercent = passwordStrength ? getPasswordStrengthPercent(passwordStrength) : 0
  const strengthLabelClass =
    passwordStrength === 'good'
      ? 'text-success'
      : passwordStrength === 'medium'
        ? 'text-yellow-500'
        : 'text-danger'

  return (
    <SidebarLayout items={getSidebarNavForUser(user)}>
      <nav>
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(homePath)} className="text-text-subtle text-2xl">
              Dashboard
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <button onClick={() => navigate(listPath)} className="text-text-subtle text-2xl">
              {breadcrumbLabel}
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-normal text-text">Create New User</h1>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <div className="bg-card rounded-lg p-6">
          <h2 className="text-xl font-medium text-text mb-6">User Details</h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="firstName" className="block text-sm font-normal text-text mb-1">
                First Name <span className="text-danger">*</span>
              </label>
              <input
                id="firstName"
                data-testid="first-name-input"
                type="text"
                value={formData.firstName}
                onChange={e => updateField('firstName', e.target.value)}
                className={inputCls('firstName')}
                disabled={isSubmitting}
              />
              {formErrors.firstName && (
                <p className="text-danger text-xs mt-1">{formErrors.firstName}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-normal text-text mb-1">
                Last Name <span className="text-danger">*</span>
              </label>
              <input
                id="lastName"
                data-testid="last-name-input"
                type="text"
                value={formData.lastName}
                onChange={e => updateField('lastName', e.target.value)}
                className={inputCls('lastName')}
                disabled={isSubmitting}
              />
              {formErrors.lastName && (
                <p className="text-danger text-xs mt-1">{formErrors.lastName}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-normal text-text mb-1">
                Email <span className="text-danger">*</span>
              </label>
              <input
                id="email"
                data-testid="email-input"
                type="email"
                value={formData.email}
                onChange={e => updateField('email', e.target.value)}
                className={inputCls('email')}
                disabled={isSubmitting}
              />
              {formErrors.email && <p className="text-danger text-xs mt-1">{formErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-normal text-text mb-1">
                Role <span className="text-danger">*</span>
              </label>
              <select
                id="role"
                data-testid="role-select"
                value={formData.role}
                onChange={e => updateField('role', e.target.value as UserRole)}
                className={inputCls('role')}
                disabled={isSubmitting}
              >
                {allowedRoles.map(role => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
              {formErrors.role && <p className="text-danger text-xs mt-1">{formErrors.role}</p>}
            </div>

            <div>
              <label
                htmlFor="temporaryPassword"
                className="block text-sm font-normal text-text mb-1"
              >
                Temporary Password
              </label>
              <input
                id="temporaryPassword"
                data-testid="password-input"
                type="password"
                value={formData.temporaryPassword ?? ''}
                onChange={e => updateField('temporaryPassword', e.target.value)}
                className={inputCls('temporaryPassword')}
                disabled={isSubmitting}
                placeholder="Leave blank to auto-generate"
              />
              {hasTemporaryPassword && (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <p className={`text-xs font-medium capitalize min-w-12 ${strengthLabelClass}`}>
                      {passwordStrength}
                    </p>
                    <div className="h-2 flex-1 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          passwordStrength === 'good'
                            ? 'bg-success'
                            : passwordStrength === 'medium'
                              ? 'bg-yellow-500'
                              : 'bg-danger'
                        }`}
                        style={{ width: `${strengthPercent}%` }}
                      />
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 list-disc pl-5">
                    {passwordRules.map(rule => (
                      <li
                        key={rule.label}
                        className={`text-xs ${
                          rule.passed
                            ? 'text-success'
                            : rule.required
                              ? 'text-text-subtle'
                              : 'text-yellow-500'
                        }`}
                      >
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {formErrors.temporaryPassword && (
                <p className="text-danger text-xs mt-1">{formErrors.temporaryPassword}</p>
              )}
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="sendInvite"
                checked={formData.sendInviteEmail}
                onChange={e => updateField('sendInviteEmail', e.target.checked)}
                className="mr-2"
                disabled={isSubmitting}
              />
              <label htmlFor="sendInvite" className="text-sm text-text">
                Send invitation
              </label>
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="submit"
                data-testid="create-user-button"
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isSubmitting
                    ? 'bg-primary/50 cursor-not-allowed text-white'
                    : 'bg-primary hover:bg-primary-hover text-white'
                }`}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </SidebarLayout>
  )
}
