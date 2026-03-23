import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/ThemeContext'
import type { LoginRequest } from '@/api/types'
import { ApiError } from '@/api/client'
import { isCognitoEnabled, AUTH_MODE, buildCognitoLoginUrl } from '@/api/cognito'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { theme } = useTheme()

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

    if (!validateForm()) return

    setIsLoading(true)

    try {
      await login(formData)

      const storedUser = localStorage.getItem('currentUser')
      if (storedUser) {
        const user = JSON.parse(storedUser)
        if (user.role === 'admin') {
          navigate('/admin', { replace: true })
        } else {
          navigate('/user', { replace: true })
        }
      } else {
        navigate('/user', { replace: true })
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
    <div className="min-h-screen bg-background-lighter">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* Left image panel */}
        <div className="relative hidden lg:block">
          <img
            src="/ubs-singapore-building.png"
            alt="UBS Singapore building"
            className="h-full w-full object-cover grayscale"
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>

        {/* Right login panel */}
        <div className="flex items-center justify-center p-2 sm:p-2">
          <div className="w-full max-w-md">
            <div className="p-8 sm:p-10">
              <div className="mb-6 flex flex-col items-center text-center">
                <img
                  src={theme === 'dark' ? '/DarkMode_SGB.svg' : '/LightMode_SGB.svg'}
                  alt="Scrooge Global Bank"
                  className=" h-[96px] w-auto object-contain sm:h-[96px]"
                />
                <h1 className="text-2xl font-medium text-text">Login to the CRM</h1>
                <p className="mt-2 text-text-muted">Sign in to your account</p>
              </div>

              {generalError && (
                <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
                  <p className="text-danger text-sm">{generalError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                <div>
                  <label htmlFor="email" className="block text-sm font-normal text-text mb-2">
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
                    className={`form-input ${errors.email ? 'form-input-error' : ''}`}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                  {errors.email && <p className="text-danger text-sm mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-normal text-text mb-2">
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
                    className={`form-input ${errors.password ? 'form-input-error' : ''}`}
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  {errors.password && (
                    <p className="text-danger text-sm mt-1">{errors.password}</p>
                  )}
                </div>

                <button
                  type="submit"
                  data-testid="login-submit-button"
                  disabled={isLoading}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors text-white ${
                    isLoading
                      ? 'opacity-50 cursor-not-allowed gradient-dark-red'
                      : 'gradient-dark-red'
                  }`}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <p className="text-sm text-center mt-4">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-primary underline-hover"
                >
                  Forgot your password?
                </button>
              </p>

              {isCognitoEnabled && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full" />
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
                    className="w-full py-3 px-4 rounded-lg font-normal transition-colors bg-background-light hover:bg-background-lighter text-text border border-border"
                  >
                    Sign in with Cognito SSO
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}