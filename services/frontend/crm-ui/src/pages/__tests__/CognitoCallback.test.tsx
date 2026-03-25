import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CognitoCallback } from '../CognitoCallback'

const mockLoginWithCognitoCode = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    loginWithCognitoCode: mockLoginWithCognitoCode,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderWithUrl(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<CognitoCallback />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CognitoCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows loading spinner when code is present', () => {
    mockLoginWithCognitoCode.mockImplementation(() => new Promise(() => {}))

    renderWithUrl('?code=auth_code_123')

    expect(screen.getByText('Signing in with Cognito...')).toBeInTheDocument()
  })

  it('shows error when no code and no error in URL', () => {
    renderWithUrl('')

    expect(screen.getByText('Authentication Failed')).toBeInTheDocument()
    expect(screen.getByText('No authorization code received from Cognito.')).toBeInTheDocument()
  })

  it('shows error when error_description is in URL', () => {
    renderWithUrl('?error_description=access_denied_by_user')

    expect(screen.getByText('Authentication Failed')).toBeInTheDocument()
    expect(screen.getByText('access_denied_by_user')).toBeInTheDocument()
  })

  it('shows error when error (without description) is in URL', () => {
    renderWithUrl('?error=access_denied')

    expect(screen.getByText('Authentication Failed')).toBeInTheDocument()
    expect(screen.getByText('access_denied')).toBeInTheDocument()
  })

  it('navigates to /admin after successful login for admin user', async () => {
    mockLoginWithCognitoCode.mockResolvedValue(undefined)
    localStorage.setItem('currentUser', JSON.stringify({ role: 'admin' }))

    renderWithUrl('?code=valid_code')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
    })
  })

  it('navigates to /admin for super_admin user', async () => {
    mockLoginWithCognitoCode.mockResolvedValue(undefined)
    localStorage.setItem('currentUser', JSON.stringify({ role: 'super_admin' }))

    renderWithUrl('?code=valid_code')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
    })
  })

  it('navigates to /user after successful login for regular user', async () => {
    mockLoginWithCognitoCode.mockResolvedValue(undefined)
    localStorage.setItem('currentUser', JSON.stringify({ role: 'user' }))

    renderWithUrl('?code=valid_code')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/user', { replace: true })
    })
  })

  it('navigates to / when no stored user after login', async () => {
    mockLoginWithCognitoCode.mockResolvedValue(undefined)
    // no currentUser in localStorage

    renderWithUrl('?code=valid_code')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('shows error when loginWithCognitoCode throws an Error', async () => {
    mockLoginWithCognitoCode.mockRejectedValue(new Error('Token exchange failed'))

    renderWithUrl('?code=valid_code')

    await waitFor(() => {
      expect(screen.getByText('Authentication Failed')).toBeInTheDocument()
      expect(screen.getByText('Token exchange failed')).toBeInTheDocument()
    })
  })

  it('shows generic error when loginWithCognitoCode throws non-Error', async () => {
    mockLoginWithCognitoCode.mockRejectedValue('something went wrong')

    renderWithUrl('?code=valid_code')

    await waitFor(() => {
      expect(screen.getByText('Authentication Failed')).toBeInTheDocument()
      expect(screen.getByText('Authentication failed')).toBeInTheDocument()
    })
  })

  it('navigates to /login when "Return to Login" button is clicked', async () => {
    const user = userEvent.setup()
    renderWithUrl('')

    await user.click(screen.getByRole('button', { name: 'Return to Login' }))
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
