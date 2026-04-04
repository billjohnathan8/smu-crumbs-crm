import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/useTheme'
import { isRootAdminUser } from '@/features/auth/authorization'
import { createClient } from '@/api/clients'
import { listUsers } from '@/api/users'
import type { ClientCreateRequest, Gender, User } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import {
  COUNTRY_OPTIONS,
  getPostalCodeRule,
  isPostalCodeValidForCountry,
} from '@/utils/postalCodeRules'

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients' },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
  { label: 'Activity Logs', to: '/user/logs' },
  { label: 'Settings', to: '/user/settings' },
]

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Client Archives', to: '/admin/client-archives', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Settings', to: '/admin/settings' },
]

export function CreateClientPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme } = useTheme()

  const isAdmin = user?.role === 'admin'
  const isRootAdmin = isRootAdminUser(user)
  const canViewAllClients = isAdmin || isRootAdmin

  const basePath = canViewAllClients ? '/admin' : '/user'
  const sidebarNav = canViewAllClients ? adminNav : userNav
  const homePath = basePath
  const listPath = canViewAllClients ? '/admin/clients' : '/user/clients'
  const breadcrumbLabel = canViewAllClients ? 'All Clients' : 'My Clients'

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
  const [assignableAgents, setAssignableAgents] = useState<User[]>([])

  useEffect(() => {
    const loadAgents = async () => {
      if (!canViewAllClients) {
        return
      }
      try {
        const response = await listUsers({ role: 'user', limit: 200, offset: 0 })
        setAssignableAgents(response.data.filter(agent => agent.status === 'active'))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout()
          return
        }
        setGeneralError('Unable to load assignable agents')
      }
    }

    loadAgents()
  }, [canViewAllClients, logout])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ClientCreateRequest, string>> = {}
    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    const email = formData.emailAddress.trim()
    const phone = formData.phoneNumber.trim()
    const address = formData.address.trim()
    const city = formData.city.trim()
    const state = formData.state.trim()
    const country = formData.country.trim()
    const postalCode = formData.postalCode.trim()
    const lettersAndSpaces = /^[A-Za-z ]+$/

    if (!firstName) {
      newErrors.firstName = 'First name is required'
    } else if (firstName.length < 2 || firstName.length > 50) {
      newErrors.firstName = 'First name must be 2-50 letters'
    } else if (!lettersAndSpaces.test(firstName)) {
      newErrors.firstName = 'First name can only contain letters and spaces'
    }
    if (!lastName) {
      newErrors.lastName = 'Last name is required'
    } else if (lastName.length < 2 || lastName.length > 50) {
      newErrors.lastName = 'Last name must be 2-50 letters'
    } else if (!lettersAndSpaces.test(lastName)) {
      newErrors.lastName = 'Last name can only contain letters and spaces'
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

    if (!email) {
      newErrors.emailAddress = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.emailAddress = 'Invalid email format'
    }

    if (!phone) {
      newErrors.phoneNumber = 'Phone number is required'
    } else if (!/^\+\d{10,15}$/.test(phone)) {
      newErrors.phoneNumber = 'Phone must start with + and contain 10-15 digits (e.g. +6588888888)'
    }

    if (!address) {
      newErrors.address = 'Address is required'
    } else if (address.length < 5 || address.length > 100) {
      newErrors.address = 'Address must be 5-100 characters'
    }
    if (!city) {
      newErrors.city = 'City is required'
    } else if (city.length < 2 || city.length > 50) {
      newErrors.city = 'City must be 2-50 characters'
    }
    if (!state) {
      newErrors.state = 'State is required'
    } else if (state.length < 2 || state.length > 50) {
      newErrors.state = 'State must be 2-50 characters'
    }
    if (!country) {
      newErrors.country = 'Country is required'
    } else if (country.length < 2 || country.length > 50) {
      newErrors.country = 'Country must be 2-50 characters'
    }
    if (!postalCode) {
      newErrors.postalCode = 'Postal code is required'
    } else if (!isPostalCodeValidForCountry(country, postalCode)) {
      const countryRule = getPostalCodeRule(country)
      newErrors.postalCode = `Postal code must match ${countryRule.country} format (${countryRule.hint})`
    }

    if (canViewAllClients && !formData.assignedUserId?.trim()) {
      newErrors.assignedUserId = 'Please select an agent to assign this client to'
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
      const payload: ClientCreateRequest = {
        ...formData,
        assignedUserId: formData.assignedUserId?.trim() || undefined,
      }
      const client = await createClient(payload)
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
          setGeneralError(err.message || 'A client with this email or phone number already exists')
        } else if (err.status === 400 || err.status === 422) {
          setGeneralError(
            'Please fix the highlighted fields: first/last name (2-50 letters), phone (+10-15 digits), and address fields (required lengths).'
          )
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

  const updateField = useCallback((field: keyof ClientCreateRequest, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      if (prev[field]) {
        const next = { ...prev }
        delete next[field]
        return next
      }
      return prev
    })
  }, [])

  const inputCls = useCallback(
    (field: keyof ClientCreateRequest) =>
      `form-input ${errors[field] ? 'form-input-error' : ''}` +
      (theme === 'dark' ? ' bg-[var(--gray)]' : ' bg-[var(--off-white)]'),
    [errors, theme]
  )

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-4">
            <Link to={homePath} className="text-text-subtle text-2xl">
              Dashboard
            </Link>
            <span className="text-text-subtle text-2xl">/</span>
            <button onClick={() => navigate(listPath)} className="text-text-subtle text-2xl">
              {breadcrumbLabel}
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-normal text-text">Create Client</h1>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto mt-4">
        <div className="bg-card  rounded-lg p-6">
          <div className="mb-6 rounded-lg border border-border bg-background-light p-4">
            <p className="text-sm text-text">
              {canViewAllClients
                ? 'Select an agent to assign this client to.'
                : 'New clients are assigned to your account by default.'}{' '}
              Verification status becomes
              <span className="font-medium"> pending </span>
              only after the client submits documents from the verification link email.
            </p>
          </div>
          {generalError && (
            <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
              <p className="text-danger text-sm">{generalError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {canViewAllClients && (
                <div>
                  <label className="block text-sm font-normal text-text mb-2">
                    Assigned Agent <span className="text-danger">*</span>
                  </label>
                  <select
                    name="assignedUserId"
                    value={formData.assignedUserId ?? ''}
                    onChange={e => updateField('assignedUserId', e.target.value)}
                    className={inputCls('assignedUserId')}
                    disabled={isSubmitting}
                  >
                    <option value="">-- Select an agent --</option>
                    {assignableAgents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.firstName} {agent.lastName} ({agent.email})
                      </option>
                    ))}
                  </select>
                  {errors.assignedUserId && (
                    <p className="text-danger text-xs mt-1">{errors.assignedUserId}</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  First Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
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
                  value={formData.lastName}
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
                  value={formData.dateOfBirth}
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
                  value={formData.gender}
                  onChange={e => updateField('gender', e.target.value as Gender)}
                  className={inputCls('gender')}
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
                  value={formData.emailAddress}
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
                  value={formData.phoneNumber}
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
                value={formData.address}
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
                  value={formData.city}
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
                  value={formData.state}
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
                <select
                  name="country"
                  value={formData.country}
                  onChange={e => updateField('country', e.target.value)}
                  className={inputCls('country')}
                  disabled={isSubmitting}
                >
                  <option value="">-- Select country --</option>
                  {COUNTRY_OPTIONS.map(country => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                {errors.country && <p className="text-danger text-xs mt-1">{errors.country}</p>}
              </div>

              <div>
                <label className="block text-sm font-normal text-text mb-2">
                  Postal Code <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
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
                onClick={() => navigate(listPath)}
                className="px-6 py-3 rounded-lg bg-background-lighter border-[1.5px] border-border text-text font-medium transition-all duration-200 hover:brightness-[0.9]"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isSubmitting
                    ? 'gradient-dark-red/50 cursor-not-allowed text-white'
                    : 'gradient-dark-red hover:brightness-[0.85] text-white'
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
