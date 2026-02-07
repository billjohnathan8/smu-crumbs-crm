import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { login as apiLogin, getCurrentUser } from '@/api/auth'
import { setAuthToken, clearAuthToken, getAuthToken } from '@/api/client'
import type { User, LoginRequest } from '@/api/types'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken()
      const storedUser = localStorage.getItem('currentUser')

      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser))
          // Optionally re-fetch to ensure token is still valid
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
    const tokenResponse = await apiLogin(credentials)
    setAuthToken(tokenResponse.accessToken)
    if (tokenResponse.refreshToken) {
      localStorage.setItem('refreshToken', tokenResponse.refreshToken)
    }

    const user = await getCurrentUser()
    setUser(user)
    localStorage.setItem('currentUser', JSON.stringify(user))
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
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
