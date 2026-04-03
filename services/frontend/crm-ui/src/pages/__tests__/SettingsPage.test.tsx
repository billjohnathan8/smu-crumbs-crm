import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { SettingsPage } from '../SettingsPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as authApi from '@/api/auth'
import { AuthProvider } from '@/features/auth/AuthContext'
import type { User } from '@/api/types'

vi.mock('@/api/auth')

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockAdminUser: User = {
  id: 'admin-1',
  firstName: 'Alice',
  lastName: 'Admin',
  email: 'alice@example.com',
  role: 'admin',
  status: 'active',
}

const mockRegularUser: User = {
  id: 'user-1',
  firstName: 'Bob',
  lastName: 'User',
  email: 'bob@example.com',
  role: 'user',
  status: 'active',
}

function renderSettings(user: User) {
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(user)
  localStorage.setItem('authToken', 'token')
  localStorage.setItem('currentUser', JSON.stringify(user))
  return render(
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <SettingsPage />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders settings heading', async () => {
    renderSettings(mockAdminUser)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    })
  })

  it('shows user name, email and role in account information section', async () => {
    renderSettings(mockAdminUser)
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument()
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  it('shows root admin label when seeded root identity is loaded', async () => {
    const superAdmin: User = { ...mockAdminUser, id: 'usr_1', role: 'super_admin' }
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(superAdmin)
    localStorage.setItem('authToken', 'token')
    localStorage.setItem('currentUser', JSON.stringify(superAdmin))
    render(
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <SettingsPage />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    )
    await waitFor(() => {
      expect(screen.getByText('Root Admin')).toBeInTheDocument()
    })
  })

  it('shows Appearance section with theme toggle', async () => {
    renderSettings(mockAdminUser)
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      expect(screen.getByText('Theme')).toBeInTheDocument()
    })
  })

  it('shows initial theme label', async () => {
    renderSettings(mockAdminUser)
    await waitFor(() => {
      // Default theme is light
      expect(screen.getByText('Light')).toBeInTheDocument()
    })
  })

  it('toggles theme when theme toggle button is clicked', async () => {
    const user = userEvent.setup()
    renderSettings(mockAdminUser)

    await waitFor(() => {
      expect(screen.getByText('Light')).toBeInTheDocument()
    })

    // Find the toggle button (the rounded full button)
    const toggleButton = screen.getByRole('button', {
      name: '',
    })
    await user.click(toggleButton)

    await waitFor(() => {
      expect(screen.getByText('Dark')).toBeInTheDocument()
    })
  })

  it('shows Reset Password button', async () => {
    renderSettings(mockAdminUser)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument()
    })
  })

  it('navigates to /reset-password with email state when Reset Password is clicked', async () => {
    const user = userEvent.setup()
    renderSettings(mockAdminUser)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(mockNavigate).toHaveBeenCalledWith('/reset-password', {
      state: { email: 'alice@example.com' },
    })
  })

  it('shows Redirecting... after clicking reset password', async () => {
    const user = userEvent.setup()
    renderSettings(mockAdminUser)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Reset Password' }))

    expect(screen.getByRole('button', { name: 'Redirecting...' })).toBeDisabled()
  })

  it('shows admin nav items for admin user', async () => {
    renderSettings(mockAdminUser)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'User Management' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Communications' })).toBeInTheDocument()
    })
  })

  it('shows user nav items for regular user (no User Management link)', async () => {
    renderSettings(mockRegularUser)
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'User Management' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    })
  })
})
