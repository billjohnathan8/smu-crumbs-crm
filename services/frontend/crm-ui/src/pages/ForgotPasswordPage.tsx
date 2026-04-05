import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPasswordResetLink } from '@/api/auth'
import { ApiError } from '@/api/client'
import type { ForgotPasswordRequest } from '@/api/types'

export function ForgotPasswordPage() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState<ForgotPasswordRequest>({
    email: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof ForgotPasswordRequest, string>>>({})
  const [generalError, setGeneralError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ForgotPasswordRequest, string>> = {}

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')
    setIsSuccess(false)

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      await requestPasswordResetLink({ email: formData.email.trim() })
      setIsSuccess(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setGeneralError(err.message || 'Failed to send reset email. Please try again.')
      } else if (err instanceof Error) {
        setGeneralError(err.message || 'Failed to send reset email. Please try again.')
      } else {
        setGeneralError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card  rounded-lg p-8">
            <h1 className="text-3xl font-bold text-text mb-2 text-center">Check Your Email</h1>
            <p className="text-text-muted text-center mb-6">
              If an account with that email exists, we've sent you a password reset link.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 rounded-lg font-normal transition-colors bg-primary hover:bg-primary-hover text-white"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card  rounded-lg p-8">
          <h1 className="text-2xl font-normal text-text mb-2 text-center">
            Get back into your account
          </h1>
          <p className="text-text-muted text-center mb-6">
            To recover your account, enter your email and we'll send you a link to reset your
            password.
          </p>

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
                className={`w-full px-4 py-2 bg-background-light border ${
                  errors.email ? 'border-danger' : 'border-border'
                } rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent`}
                disabled={isLoading}
                autoComplete="email"
                placeholder="Enter your email address"
              />
              {errors.email && <p className="text-danger text-sm mt-1">{errors.email}</p>}
            </div>

            <button
              type="submit"
              data-testid="forgot-password-submit-button"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium ${
                isLoading
                  ? 'gradient-dark-red/50 cursor-not-allowed'
                  : 'gradient-dark-red hover:brightness-[0.8] transition-all duration-200'
              } text-white`}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className="text-sm text-center mt-6">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-primary underline-hover font-medium"
            >
              Back to Login
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
