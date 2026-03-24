import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/ThemeContext'
import { getClientById, updateClient } from '@/api/clients'
import type { ClientUpdateRequest, Gender } from '@/api/types'
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

export function EditClientPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const isManagementUser = isAdmin || isSuperAdmin

  const basePath = isManagementUser ? '/admin' : '/user'
  const sidebarNav: NavItem[] = isManagementUser
    ? [
        ...adminNav,
        ...(isSuperAdmin ? [{ label: 'Admin Management', to: '/admin/admins' as const }] : []),
      ]
    : userNav

  const detailPath = clientId ? `${basePath}/clients/${clientId}` : `${basePath}/clients`
  const listPath = `${basePath}/clients`
  const breadcrumbLabel = isManagementUser ? 'All Clients' : 'My Clients'

  const [formData, setFormData] = useState<ClientUpdateRequest>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof ClientUpdateRequest, string>>>({})
  const [generalError, setGeneralError] = useState('')

  useEffect(() => {
    if (!clientId) return

    const load = async () => {
      setIsLoading(true)
      try {
        const client = await getClientById(clientId)
        setFormData({
          firstName: client.firstName,
          lastName: client.lastName,
          dateOfBirth: client.dateOfBirth,
          gender: client.gender,
          emailAddress: client.emailAddress,
          phoneNumber: client.phoneNumber,
          address: client.address,
          city: client.city,
          state: client.state,
          country: client.country,
          postalCode: client.postalCode,
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout()
        } else {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load client')
        }
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [clientId, logout])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ClientUpdateRequest, string>> = {}

    if (!formData.firstName?.trim()) newErrors.firstName = 'First name is required'
    if (!formData.lastName?.trim()) newErrors.lastName = 'Last name is required'

    if (!formData.dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required'
    } else {
      const dob = new Date(formData.dateOfBirth)
      const today = new Date()
      const age = today.getFullYear() - dob.getFullYear()
      const monthDiff = today.getMonth() - dob.getMonth()
      const actualAge =
        monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate()) ? age - 1 : age

      if (actualAge < 18) newErrors.dateOfBirth = 'Client must be at least 18 years old'
      else if (actualAge > 100) newErrors.dateOfBirth = 'Client age cannot exceed 100 years'
    }

    if (!formData.emailAddress?.trim()) {
      newErrors.emailAddress = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailAddress)) {
      newErrors.emailAddress = 'Invalid email format'
    }

    if (!formData.phoneNumber?.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!/^[+]?[\d\s()-]{8,}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Invalid phone format (min 8 digits)'
    }

    if (!formData.address?.trim()) newErrors.address = 'Address is required'
    if (!formData.city?.trim()) newErrors.city = 'City is required'
    if (!formData.state?.trim()) newErrors.state = 'State is required'
    if (!formData.country?.trim()) newErrors.country = 'Country is required'
    if (!formData.postalCode?.trim()) newErrors.postalCode = 'Postal code is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')
    if (!validateForm() || !clientId) return

    setIsSubmitting(true)
    try {
      await updateClient(clientId, formData)
      navigate(detailPath, {
        state: { successMessage: 'Client updated successfully' },
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else if (err.status === 409) setGeneralError('A client with this email already exists')
        else if (err.status === 422)
          setGeneralError('Invalid data provided. Please check your inputs.')
        else setGeneralError(err.message || 'Failed to update client')
      } else {
        setGeneralError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = (field: keyof ClientUpdateRequest, value: string) => {
    setFormData({ ...formData, [field]: value })
    if (errors[field]) setErrors({ ...errors, [field]: '' })
  }

  if (isLoading) {
    return (
      <SidebarLayout items={sidebarNav}>
        <div className="flex items-center justify-center h-64">
          <div
            data-testid="loading-spinner"
            className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
          />
        </div>
      </SidebarLayout>
    )
  }

  if (loadError) {
    return (
      <SidebarLayout items={sidebarNav}>
        <div className="bg-danger/10 border border-danger rounded-lg p-4 mt-6">
          <p className="text-danger">{loadError}</p>
        </div>
        <button
          onClick={() => navigate(detailPath)}
          className="mt-4 px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm"
        >
          Back to Client
        </button>
      </SidebarLayout>
    )
  }

  const inputCls = (field: keyof ClientUpdateRequest) =>
    `w-full px-4 py-2 rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
      errors[field] ? 'ring-2 ring-danger' : ''
    }` + (theme === 'dark' ? ' bg-[var(--gray)]' : ' bg-[var(--off-white)]')

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(basePath)}
              className="text-text-muted hover:text-text text-2xl"
            >
              Dashboard
            </button>
            <span className="text-text-muted text-2xl">/</span>
            <button
              onClick={() => navigate(listPath)}
              className="text-text-muted hover:text-text text-2xl"
            >
              {breadcrumbLabel}
            </button>
            <span className="text-text-muted text-2xl">/</span>
            <button
              onClick={() => navigate(detailPath)}
              className="text-text-muted hover:text-text"
            >
              Client Details
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-2xl font-normal text-text">Edit Client</h1>
          </div>
        </div>
      </nav>

      <main className="mt-6">
        <div className="bg-card  rounded-lg p-6">
          {generalError && (
            <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
              <p className="text-danger text-sm">{generalError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  First Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName || ''}
                  onChange={e => updateField('firstName', e.target.value)}
                  className={inputCls('firstName')}
                  disabled={isSubmitting}
                />
                {errors.firstName && <p className="text-danger text-xs mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Last Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName || ''}
                  onChange={e => updateField('lastName', e.target.value)}
                  className={inputCls('lastName')}
                  disabled={isSubmitting}
                />
                {errors.lastName && <p className="text-danger text-xs mt-1">{errors.lastName}</p>}
              </div>
              <div>
                <label htmlFor="dateOfBirth" className="block text-sm font-normal text-text mb-2">
                  Date of Birth <span className="text-danger">*</span>
                </label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth || ''}
                  onChange={e => updateField('dateOfBirth', e.target.value)}
                  className={inputCls('dateOfBirth')}
                  disabled={isSubmitting}
                />
                {errors.dateOfBirth && (
                  <p className="text-danger text-xs mt-1">{errors.dateOfBirth}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Gender <span className="text-danger">*</span>
                </label>
                <select
                  name="gender"
                  value={formData.gender || 'Prefer not to say'}
                  onChange={e => updateField('gender', e.target.value as Gender)}
                  className="w-full px-4 py-2 bg-background-light  rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={isSubmitting}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Email <span className="text-danger">*</span>
                </label>
                <input
                  type="email"
                  name="emailAddress"
                  value={formData.emailAddress || ''}
                  onChange={e => updateField('emailAddress', e.target.value)}
                  className={inputCls('emailAddress')}
                  disabled={isSubmitting}
                />
                {errors.emailAddress && (
                  <p className="text-danger text-xs mt-1">{errors.emailAddress}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Phone Number <span className="text-danger">*</span>
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber || ''}
                  onChange={e => updateField('phoneNumber', e.target.value)}
                  placeholder="+65 1234 5678"
                  className={inputCls('phoneNumber')}
                  disabled={isSubmitting}
                />
                {errors.phoneNumber && (
                  <p className="text-danger text-xs mt-1">{errors.phoneNumber}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-normal text-text mb-2">
                Address <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="address"
                value={formData.address || ''}
                onChange={e => updateField('address', e.target.value)}
                className={inputCls('address')}
                disabled={isSubmitting}
              />
              {errors.address && <p className="text-danger text-xs mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  City <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city || ''}
                  onChange={e => updateField('city', e.target.value)}
                  className={inputCls('city')}
                  disabled={isSubmitting}
                />
                {errors.city && <p className="text-danger text-xs mt-1">{errors.city}</p>}
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  State <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="state"
                  value={formData.state || ''}
                  onChange={e => updateField('state', e.target.value)}
                  className={inputCls('state')}
                  disabled={isSubmitting}
                />
                {errors.state && <p className="text-danger text-xs mt-1">{errors.state}</p>}
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Country <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country || ''}
                  onChange={e => updateField('country', e.target.value)}
                  className={inputCls('country')}
                  disabled={isSubmitting}
                />
                {errors.country && <p className="text-danger text-xs mt-1">{errors.country}</p>}
              </div>
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Postal Code <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode || ''}
                  onChange={e => updateField('postalCode', e.target.value)}
                  className={inputCls('postalCode')}
                  disabled={isSubmitting}
                />
                {errors.postalCode && (
                  <p className="text-danger text-xs mt-1">{errors.postalCode}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="button"
                onClick={() => navigate(detailPath)}
                className="px-6 py-3 rounded-lg bg-background-light text-text hover:bg-background-lighter font-normal transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-lg font-normal transition-colors ${
                  isSubmitting
                    ? 'bg-primary/50 cursor-not-allowed text-white'
                    : 'bg-primary hover:bg-primary-hover text-white'
                }`}
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </SidebarLayout>
  )
}
