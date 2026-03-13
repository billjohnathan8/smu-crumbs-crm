import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import type { LoginRequest } from '@/api/types'
import { ApiError } from '@/api/client'
import { isCognitoEnabled, AUTH_MODE, buildCognitoLoginUrl } from '@/api/cognito'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [formData, setFormData] = useState<LoginRequest>({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof LoginRequest, string>>>({})
  const [generalError, setGeneralError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof LoginRequest, string>> = {}

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      await login(formData)

      // Get user role from localStorage (set by AuthContext)
      const storedUser = localStorage.getItem('currentUser')
      if (storedUser) {
        const user = JSON.parse(storedUser)
        // Redirect based on role
        if (user.role === 'admin') {
          navigate('/admin', { replace: true })
        } else {
          navigate('/agent', { replace: true })
        }
      } else {
        navigate('/agent', { replace: true })
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setGeneralError('Invalid email or password')
        } else if (err.status === 408) {
          setGeneralError('Request timed out. Please check your connection and try again.')
        } else {
          setGeneralError(err.message || 'Login failed. Please try again.')
        }
      } else {
        setGeneralError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-text mb-2 text-center">CRM Login</h1>
          <p className="text-text-muted text-center mb-6">Sign in to your account</p>

          {generalError && (
            <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
              <p className="text-danger text-sm">{generalError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                data-testid="email-input"
                value={formData.email}
                onChange={e => {
                  setFormData({ ...formData, email: e.target.value })
                  if (errors.email) {
                    setErrors({ ...errors, email: '' })
                  }
                }}
                className={`w-full px-4 py-2 bg-background-light border ${
                  errors.email ? 'border-danger' : 'border-border'
                } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                disabled={isLoading}
                autoComplete="email"
              />
              {errors.email && <p className="text-danger text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                data-testid="password-input"
                value={formData.password}
                onChange={e => {
                  setFormData({ ...formData, password: e.target.value })
                  if (errors.password) {
                    setErrors({ ...errors, password: '' })
                  }
                }}
                className={`w-full px-4 py-2 bg-background-light border ${
                  errors.password ? 'border-danger' : 'border-border'
                } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                disabled={isLoading}
                autoComplete="current-password"
              />
              {errors.password && <p className="text-danger text-sm mt-1">{errors.password}</p>}
            </div>

            <button
              type="submit"
              data-testid="login-submit-button"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                isLoading ? 'bg-primary/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'
              } text-white`}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {isCognitoEnabled && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-card px-4 text-text-muted">
                    {AUTH_MODE === 'cognito' ? 'or' : 'or sign in with SSO'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  window.location.href = buildCognitoLoginUrl()
                }}
                className="w-full py-3 px-4 rounded-lg font-semibold transition-colors bg-background-light hover:bg-background-lighter text-text border border-border"
              >
                Sign in with Cognito SSO
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
