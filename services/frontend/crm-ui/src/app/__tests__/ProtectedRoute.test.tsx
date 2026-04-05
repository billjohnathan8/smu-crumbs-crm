import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '../ProtectedRoute'
import type { User, UserRole } from '@/api/types'

vi.mock('@/api/auth')
vi.mock('@/api/client')

const mockUseAuth = vi.fn()

vi.mock('@/features/auth/AuthContext', async () => {
  const actual = await vi.importActual('@/features/auth/AuthContext')
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  }
})

describe('ProtectedRoute', () => {
  const renderProtectedRoute = (allowedRoles?: UserRole[], requireRootAdmin = false) => {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
          <Route
            element={
              <ProtectedRoute allowedRoles={allowedRoles} requireRootAdmin={requireRootAdmin} />
            }
          >
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    )
  }

  it('should show loading state when authentication is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should redirect to login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('should render protected content when user is authenticated with correct role', () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'admin',
      status: 'active',
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute(['admin'])

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect to unauthorized route when user has wrong role', () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute(['admin'])

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument()
  })

  it('should allow access when no role restrictions are specified', () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute()

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should allow access when user role is in allowed roles list', () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute(['admin', 'user'])

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect to unauthorized route when requireRootAdmin is true for non-root user', () => {
    const mockUser: User = {
      id: '2',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'admin',
      status: 'active',
    }
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')
    renderProtectedRoute(undefined, true)

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument()
  })

  it('should allow access when requireRootAdmin is true for root admin identity', () => {
    const mockUser: User = {
      id: 'usr_1',
      firstName: 'Root',
      lastName: 'Admin',
      email: 'admin@crm.com',
      role: 'admin',
      status: 'active',
    }

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    window.history.pushState({}, '', '/protected')

    renderProtectedRoute(undefined, true)

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})
