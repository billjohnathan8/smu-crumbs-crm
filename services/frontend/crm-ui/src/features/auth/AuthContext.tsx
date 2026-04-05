import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { login as apiLogin, getCurrentUser } from '@/api/auth'
import { setAuthToken, clearAuthToken, getAuthToken, setSessionExpiryHandler } from '@/api/client'
import {
  isCognitoEnabled,
  AUTH_MODE,
  exchangeCodeForTokens,
  buildCognitoLogoutUrl,
} from '@/api/cognito'
import type { User, LoginRequest } from '@/api/types'

const DEV_BYPASS_AUTH = import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH === 'true'
const DEV_ROLE = (import.meta.env.VITE_BYPASS_ROLE ?? 'admin') as 'admin' | 'user' | 'super_admin'

const DEV_USERS = {
  admin: {
    id: 'admin-123',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
  },
  super_admin: {
    id: 'usr_1',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'super-admin@example.com',
    role: 'super_admin',
    status: 'active',
  },
  user: {
    id: 'user-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'user@example.com',
    role: 'user',
    status: 'active',
  },
} as const

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  loginWithCognitoCode: (code: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setSessionExpiryHandler(() => {
      clearAuthToken()
      localStorage.removeItem('idToken')
      setUser(null)
      setIsLoading(false)
    })

    return () => {
      setSessionExpiryHandler(undefined)
    }
  }, [])

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      // ✅ DEV bypass: auto-auth without backend
      if (DEV_BYPASS_AUTH) {
        const devUser = DEV_USERS[DEV_ROLE]
        setUser(devUser as unknown as User)
        localStorage.setItem('currentUser', JSON.stringify(devUser))
        setIsLoading(false)
        return
      }

      const token = getAuthToken()
      const storedUser = localStorage.getItem('currentUser')

      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser))
          const freshUser = await getCurrentUser()
          setUser(freshUser)
          localStorage.setItem('currentUser', JSON.stringify(freshUser))
        } catch {
          clearAuthToken()
          setUser(null)
        }
      }
      setIsLoading(false)
    }

    initAuth()
  }, [])

  const login = useCallback(async (credentials: LoginRequest) => {
    // ✅ DEV bypass: accept README test creds
    if (DEV_BYPASS_AUTH) {
      const { email, password } = credentials

      const devUser =
        email === 'admin@example.com' && password === 'password123'
          ? DEV_USERS.admin
          : email === 'user@example.com' && password === 'password123'
            ? DEV_USERS.user
            : null

      if (!devUser) throw new Error('Invalid email or password')

      setUser(devUser as unknown as User)
      localStorage.setItem('currentUser', JSON.stringify(devUser))
      setIsLoading(false)
      return
    }

    const tokenResponse = await apiLogin(credentials)
    setAuthToken(tokenResponse.accessToken)
    if (tokenResponse.refreshToken) {
      localStorage.setItem('refreshToken', tokenResponse.refreshToken)
    }

    const user = await getCurrentUser()
    setUser(user)
    localStorage.setItem('currentUser', JSON.stringify(user))
  }, [])

  const loginWithCognitoCode = useCallback(async (code: string) => {
    try {
      const tokens = await exchangeCodeForTokens(code)
      // Cognito access_token is used for API calls to backend services
      setAuthToken(tokens.access_token)
      if (tokens.refresh_token) {
        localStorage.setItem('refreshToken', tokens.refresh_token)
      }

      const user = await getCurrentUser()
      setUser(user)
      localStorage.setItem('currentUser', JSON.stringify(user))
    } catch {
      clearAuthToken()
      setUser(null)
      throw new Error('Authentication failed')
    }
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    localStorage.removeItem('idToken')
    setUser(null)

    // If Cognito is active, redirect to Cognito logout to clear SSO session
    if (isCognitoEnabled && AUTH_MODE === 'cognito') {
      window.location.href = buildCognitoLogoutUrl()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithCognitoCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
