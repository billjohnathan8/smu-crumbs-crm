import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

/**
 * Handles the OAuth2 callback from Cognito Hosted UI.
 *
 * Reads the authorization code from the URL, exchanges it for tokens
 * via AuthContext.loginWithCognitoCode(), then redirects to the
 * role-appropriate dashboard.
 */
export function CognitoCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithCognitoCode } = useAuth()
  const [runtimeError, setRuntimeError] = useState<string>('')
  const code = searchParams.get('code')
  const callbackError = searchParams.get('error_description') || searchParams.get('error')
  const error =
    callbackError || (!code ? 'No authorization code received from Cognito.' : runtimeError)

  useEffect(() => {
    if (callbackError || !code) {
      return
    }

    let cancelled = false

    const exchange = async () => {
      try {
        await loginWithCognitoCode(code)
        if (cancelled) return

        const storedUser = localStorage.getItem('currentUser')
        if (storedUser) {
          const user = JSON.parse(storedUser)
          navigate(user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/agent', {
            replace: true,
          })
        } else {
          navigate('/', { replace: true })
        }
      } catch (err) {
        if (!cancelled) {
          setRuntimeError(err instanceof Error ? err.message : 'Authentication failed')
        }
      }
    }

    exchange()
    return () => {
      cancelled = true
    }
  }, [callbackError, code, loginWithCognitoCode, navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-danger mb-4">Authentication Failed</h1>
          <p className="text-text-muted mb-6">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full py-3 px-4 rounded-lg font-semibold bg-primary hover:bg-primary-hover text-white"
          >
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-text-muted">Signing in with Cognito...</p>
      </div>
    </div>
  )
}
