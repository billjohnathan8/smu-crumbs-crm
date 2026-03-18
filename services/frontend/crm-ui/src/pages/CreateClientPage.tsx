import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { createClient } from '@/api/clients'
import type { ClientCreateRequest, Gender } from '@/api/types'
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
  { label: 'User Management', to: '/admin/users' },
]

export function CreateClientPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const isAdmin = user?.role === 'admin'
  const isRootAdmin = user?.role === 'super_admin' || String(user?.id) === '0'
  const canViewAllClients = isAdmin || isRootAdmin

  const basePath = canViewAllClients ? '/admin' : '/user'
  const sidebarNav = canViewAllClients ? adminNav : userNav
  const homePath = basePath
  const listPath = canViewAllClients ? '/admin/accounts' : '/user/clients'
  const breadcrumbLabel = canViewAllClients ? 'Manage Accounts' : 'My Clients'

  const [formData, setFormData] = useState<ClientCreateRequest>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'Prefer not to say',
    emailAddress: '',
    phoneNumber: '',
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
  })

  const [errors, setErrors] = useState<Partial<Record<keyof ClientCreateRequest, string>>>({})
  const [generalError, setGeneralError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ClientCreateRequest, string>> = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required'
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required'
    }

    if (!formData.dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required'
    } else {
      const dob = new Date(formData.dateOfBirth)
      const today = new Date()
      const age = today.getFullYear() - dob.getFullYear()
      const monthDiff = today.getMonth() - dob.getMonth()
      const actualAge =
        monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate()) ? age - 1 : age

      if (actualAge < 18) {
        newErrors.dateOfBirth = 'Client must be at least 18 years old'
      } else if (actualAge > 100) {
        newErrors.dateOfBirth = 'Client age cannot exceed 100 years'
      }
    }

    if (!formData.emailAddress.trim()) {
      newErrors.emailAddress = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailAddress)) {
      newErrors.emailAddress = 'Invalid email format'
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!/^[+]?[\d\s()-]{8,}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Invalid phone format (min 8 digits)'
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required'
    }
    if (!formData.city.trim()) {
      newErrors.city = 'City is required'
    }
    if (!formData.state.trim()) {
      newErrors.state = 'State is required'
    }
    if (!formData.country.trim()) {
      newErrors.country = 'Country is required'
    }
    if (!formData.postalCode.trim()) {
      newErrors.postalCode = 'Postal code is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')

    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      const client = await createClient(formData)
      navigate(homePath, {
        replace: true,
        state: {
          successMessage: `Client ${client.firstName} ${client.lastName} created successfully`,
        },
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 409) {
          setGeneralError('A client with this email already exists')
        } else if (err.status === 422) {
          setGeneralError('Invalid data provided. Please check your inputs.')
        } else {
          setGeneralError(err.message || 'Failed to create client')
        }
      } else {
        setGeneralError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = (field: keyof ClientCreateRequest, value: string) => {
    setFormData({ ...formData, [field]: value })
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' })
    }
  }

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <Link to={homePath} className="text-text-muted hover:text-text">
              Dashboard
            </Link>
            <span className="text-text-muted">/</span>
            <button onClick={() => navigate(listPath)} className="text-text-muted hover:text-text">
              {breadcrumbLabel}
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">Create Client</h1>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card border border-border rounded-lg p-6">
          {generalError && (
            <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
              <p className="text-danger text-sm">{generalError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  First Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={e => updateField('firstName', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.firstName ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.firstName && <p className="text-danger text-xs mt-1">{errors.firstName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Last Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={e => updateField('lastName', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.lastName ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.lastName && <p className="text-danger text-xs mt-1">{errors.lastName}</p>}
              </div>

              <div>
                <label htmlFor="dateOfBirth" className="block text-sm font-medium text-text mb-2">
                  Date of Birth <span className="text-danger">*</span>
                </label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={e => updateField('dateOfBirth', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.dateOfBirth ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.dateOfBirth && (
                  <p className="text-danger text-xs mt-1">{errors.dateOfBirth}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Gender <span className="text-danger">*</span>
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={e => updateField('gender', e.target.value as Gender)}
                  className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={isSubmitting}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Email <span className="text-danger">*</span>
                </label>
                <input
                  type="email"
                  name="emailAddress"
                  value={formData.emailAddress}
                  onChange={e => updateField('emailAddress', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.emailAddress ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.emailAddress && (
                  <p className="text-danger text-xs mt-1">{errors.emailAddress}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Phone Number <span className="text-danger">*</span>
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={e => updateField('phoneNumber', e.target.value)}
                  placeholder="+65 1234 5678"
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.phoneNumber ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.phoneNumber && (
                  <p className="text-danger text-xs mt-1">{errors.phoneNumber}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Address <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={e => updateField('address', e.target.value)}
                className={`w-full px-4 py-2 bg-background-light border ${
                  errors.address ? 'border-danger' : 'border-border'
                } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                disabled={isSubmitting}
              />
              {errors.address && <p className="text-danger text-xs mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  City <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={e => updateField('city', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.city ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.city && <p className="text-danger text-xs mt-1">{errors.city}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  State <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={e => updateField('state', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.state ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.state && <p className="text-danger text-xs mt-1">{errors.state}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Country <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={e => updateField('country', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.country ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                  disabled={isSubmitting}
                />
                {errors.country && <p className="text-danger text-xs mt-1">{errors.country}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Postal Code <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={e => updateField('postalCode', e.target.value)}
                  className={`w-full px-4 py-2 bg-background-light border ${
                    errors.postalCode ? 'border-danger' : 'border-border'
                  } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
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
                onClick={() => navigate(listPath)}
                className="px-6 py-3 rounded-lg bg-background-light text-text hover:bg-background-lighter font-medium transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isSubmitting
                    ? 'bg-primary/50 cursor-not-allowed text-white'
                    : 'bg-primary hover:bg-primary-hover text-white'
                }`}
              >
                {isSubmitting ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </SidebarLayout>
  )
}
