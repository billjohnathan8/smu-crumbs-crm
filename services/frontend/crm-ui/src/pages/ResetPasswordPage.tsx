import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ResetPasswordRequest } from '@/api/types'
import { useTheme } from '@/features/theme/ThemeContext'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { theme } = useTheme()

  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])

  const [formData, setFormData] = useState<Omit<ResetPasswordRequest, 'token'>>({
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<
    Partial<Record<'token' | keyof Omit<ResetPasswordRequest, 'token'>, string>>
  >({})
  const [generalError, setGeneralError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const inputCls = (field: keyof Omit<ResetPasswordRequest, 'token'>) =>
    `form-input ${errors[field] ? 'form-input-error' : ''}` +
    (theme === 'dark' ? ' bg-[var(--gray)]' : ' bg-[var(--off-white)]')

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<'token' | keyof Omit<ResetPasswordRequest, 'token'>, string>> =
      {}

    if (!token.trim()) {
      newErrors.token = 'Reset link is invalid or missing token'
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters long'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')
    setIsSuccess(false)

    if (!validateForm()) return

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: formData.newPassword,
          confirmPassword: formData.confirmPassword,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to reset password.')
      }

      setIsSuccess(true)
    } catch (err) {
      if (err instanceof Error) {
        setGeneralError(err.message || 'Failed to reset password. Please try again.')
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
            <h1 className="text-3xl font-bold text-text mb-2 text-center">
              Password Reset Successful
            </h1>
            <p className="text-text-muted text-center mb-6">
              Your password has been successfully reset. You can now log in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 rounded-lg font-normal transition-colors bg-primary hover:bg-primary-hover text-white"
            >
              Go to Login
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
          <h1 className="text-3xl font-medium text-text mb-2 text-center">Reset Password</h1>
          <p className="text-text-muted text-center mb-8">Enter your new password below</p>

          {generalError && (
            <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
              <p className="text-danger text-sm">{generalError}</p>
            </div>
          )}

          {errors.token && (
            <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
              <p className="text-danger text-sm">{errors.token}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-normal text-text mb-2">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                data-testid="new-password-input"
                value={formData.newPassword}
                onChange={e => {
                  setFormData({ ...formData, newPassword: e.target.value })
                  if (errors.newPassword) {
                    setErrors({ ...errors, newPassword: '' })
                  }
                }}
                className={inputCls('newPassword')}
                disabled={isLoading}
                autoComplete="new-password"
                placeholder="Enter new password"
              />
              {errors.newPassword && (
                <p className="text-danger text-sm mt-1">{errors.newPassword}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-normal text-text mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                data-testid="confirm-password-input"
                value={formData.confirmPassword}
                onChange={e => {
                  setFormData({ ...formData, confirmPassword: e.target.value })
                  if (errors.confirmPassword) {
                    setErrors({ ...errors, confirmPassword: '' })
                  }
                }}
                className={inputCls('confirmPassword')}
                disabled={isLoading}
                autoComplete="new-password"
                placeholder="Confirm new password"
              />
              {errors.confirmPassword && (
                <p className="text-danger text-sm mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              data-testid="reset-password-submit-button"
              disabled={isLoading || !token}
              className={`w-full py-3 px-4 rounded-lg font-normal transition-all hover:brightness-[0.8] duration-200 ${
                isLoading || !token ? 'gradient-dark-red' : 'gradient-dark-red'
              } text-white`}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <p className="text-sm text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-primary underline-hover mt-4 mb-4"
            >
              Back to Login
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
