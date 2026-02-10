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
  const renderProtectedRoute = (allowedRoles?: UserRole[]) => {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
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

  it('should show access denied when user has wrong role', () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
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

    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByText("You don't have permission to access this page.")).toBeInTheDocument()
  })

  it('should allow access when no role restrictions are specified', () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'agent',
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
      role: 'agent',
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
    renderProtectedRoute(['admin', 'agent'])

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})
