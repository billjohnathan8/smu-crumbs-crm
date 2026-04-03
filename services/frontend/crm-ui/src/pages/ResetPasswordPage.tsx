import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { ForgotPasswordRequest, ResetPasswordRequest } from '@/api/types'
import { useTheme } from '@/features/theme/useTheme'
import {
  getPasswordRules,
  getPasswordStrength,
  getPasswordStrengthPercent,
} from '@/features/auth/passwordPolicy'

type ResetErrors = Partial<Record<'token' | keyof Omit<ResetPasswordRequest, 'token'>, string>>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme } = useTheme()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])
  const hasToken = token.trim().length > 0
  const prefetchedEmail =
    typeof location.state === 'object' &&
    location.state &&
    'email' in location.state &&
    typeof location.state.email === 'string'
      ? location.state.email
      : ''

  const [formData, setFormData] = useState<Omit<ResetPasswordRequest, 'token'>>({
    newPassword: '',
    confirmPassword: '',
  })
  const [requestLinkEmail, setRequestLinkEmail] = useState(prefetchedEmail)
  const [errors, setErrors] = useState<ResetErrors>({})
  const [generalError, setGeneralError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [linkRequested, setLinkRequested] = useState(false)

  const inputCls = (field: keyof Omit<ResetPasswordRequest, 'token'>) =>
    `form-input ${errors[field] ? 'form-input-error' : ''}` +
    (theme === 'dark' ? ' bg-[var(--gray)]' : ' bg-[var(--off-white)]')

  const emailInputCls =
    `form-input ${errors.token ? 'form-input-error' : ''}` +
    (theme === 'dark' ? ' bg-[var(--gray)]' : ' bg-[var(--off-white)]')

  const validateResetForm = (): boolean => {
    const newErrors: ResetErrors = {}
    if (!token.trim()) {
      newErrors.token = 'Reset link is invalid or missing token'
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else {
      const invalidRules = getPasswordRules(formData.newPassword).filter(rule => !rule.passed)
      if (invalidRules.length > 0) {
        newErrors.newPassword = `Password does not meet requirements: ${invalidRules
          .map(rule => rule.label.toLowerCase())
          .join(', ')}`
      }
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')
    setIsSuccess(false)

    if (!validateResetForm()) return
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
        throw new Error('Failed to reset password. Please try again.')
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

  const handleRequestLinkSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError('')
    setErrors({})

    const normalizedEmail = requestLinkEmail.trim()
    if (!normalizedEmail) {
      setErrors({ token: 'Email is required to request a reset link' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrors({ token: 'Invalid email format' })
      return
    }

    setIsLoading(true)
    try {
      const payload: ForgotPasswordRequest = { email: normalizedEmail }
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error('Failed to send reset link. Please try again.')
      }
      setLinkRequested(true)
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : 'Failed to send reset link. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const newPassword = formData.newPassword
  const hasNewPassword = newPassword.trim().length > 0
  const passwordRules = hasNewPassword ? getPasswordRules(newPassword) : []
  const passwordStrength = hasNewPassword ? getPasswordStrength(newPassword) : null
  const strengthPercent = passwordStrength ? getPasswordStrengthPercent(passwordStrength) : 0
  const strengthLabelClass =
    passwordStrength === 'strong'
      ? 'text-success'
      : passwordStrength === 'medium'
        ? 'text-yellow-500'
        : 'text-danger'

  const handleConfirmPasswordNonTypingInput = () => {
    setErrors(prev => ({
      ...prev,
      confirmPassword: 'Please type your confirm password manually. Pasting is not allowed.',
    }))
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg p-8">
            <h1 className="text-3xl font-bold text-text mb-2 text-center">
              Password Reset Successful
            </h1>
            <p className="text-text-muted text-center mb-6">
              Your password has been reset. You can now log in with your new password.
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

  if (!hasToken && linkRequested) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg p-8">
            <h1 className="text-3xl font-bold text-text mb-2 text-center">Check Your Email</h1>
            <p className="text-text-muted text-center mb-6">
              If an account with that email exists, a reset link has been sent.
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
        <div className="bg-card rounded-lg p-8">
          <h1 className="text-3xl font-medium text-text mb-2 text-center">Reset Password</h1>
          <p className="text-text-muted text-center mb-8">
            {hasToken ? 'Enter your new password below' : 'Request a reset link to continue'}
          </p>

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

          {hasToken ? (
            <form onSubmit={handleResetSubmit} className="space-y-6" noValidate>
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
                    setFormData(prev => ({ ...prev, newPassword: e.target.value }))
                    if (errors.newPassword) {
                      setErrors(prev => ({ ...prev, newPassword: '' }))
                    }
                  }}
                  className={inputCls('newPassword')}
                  disabled={isLoading}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                />
                {hasNewPassword && (
                  <>
                    <div className="mt-3 flex items-center gap-3">
                      <p className={`text-xs font-medium capitalize min-w-12 ${strengthLabelClass}`}>
                        {passwordStrength}
                      </p>
                      <div className="h-2 flex-1 rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            passwordStrength === 'strong'
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
                          className={`text-xs ${rule.passed ? 'text-success' : 'text-text-subtle'}`}
                        >
                          {rule.label}
                        </li>
                      ))}
                      <li className="text-xs text-text-subtle">Avoid reusing passwords across sites.</li>
                    </ul>
                  </>
                )}
                {errors.newPassword && (
                  <p className="text-danger text-sm mt-1">{errors.newPassword}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-normal text-text mb-2"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  data-testid="confirm-password-input"
                  value={formData.confirmPassword}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))
                    if (errors.confirmPassword) {
                      setErrors(prev => ({ ...prev, confirmPassword: '' }))
                    }
                  }}
                  className={inputCls('confirmPassword')}
                  disabled={isLoading}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  onPaste={e => {
                    e.preventDefault()
                    handleConfirmPasswordNonTypingInput()
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    handleConfirmPasswordNonTypingInput()
                  }}
                  onBeforeInput={e => {
                    if (e.nativeEvent.inputType === 'insertFromPaste') {
                      e.preventDefault()
                      handleConfirmPasswordNonTypingInput()
                    }
                  }}
                />
                {errors.confirmPassword && (
                  <p className="text-danger text-sm mt-1">{errors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                data-testid="reset-password-submit-button"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-normal transition-all hover:brightness-[0.8] duration-200 gradient-dark-red text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRequestLinkSubmit} className="space-y-6" noValidate>
              <div>
                <label htmlFor="resetEmail" className="block text-sm font-normal text-text mb-2">
                  Email
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  data-testid="reset-email-input"
                  value={requestLinkEmail}
                  onChange={e => setRequestLinkEmail(e.target.value)}
                  className={emailInputCls}
                  disabled={isLoading}
                  autoComplete="email"
                  placeholder="Enter your email address"
                />
              </div>
              <button
                type="submit"
                data-testid="request-reset-link-submit-button"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-normal transition-all hover:brightness-[0.8] duration-200 gradient-dark-red text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

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
