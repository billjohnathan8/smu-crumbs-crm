import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { RootArchivedAdminsPage } from '../RootArchivedAdminsPage'
import { RootArchivedAgentsPage } from '../RootArchivedAgentsPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as usersApi from '@/api/users'

vi.mock('@/api/users')
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr_1',
      firstName: 'Root',
      lastName: 'Admin',
      email: 'admin@crm.com',
      role: 'super_admin',
      status: 'active',
    },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    loginWithCognitoCode: vi.fn(),
  }),
}))

const renderWithProviders = (initialEntry: string, page: ReactElement) => {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={initialEntry} element={page} />
          <Route path="/unauthorized" element={<h1>Unauthorized</h1>} />
          <Route path="/login" element={<h1>Login</h1>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  )
}

describe('Root archived users tables', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows usr_id column and values for archived admins', async () => {
    vi.mocked(usersApi.listArchivedUsers).mockResolvedValue({
      data: [
        {
          id: 'usr_42',
          firstName: 'Ada',
          lastName: 'Admin',
          email: 'ada.admin@example.com',
          role: 'admin',
          status: 'deleted',
          archivedAt: '2026-04-05T12:00:00Z',
          archivedBy: 'usr_1',
        },
      ],
      pagination: { total: 1, limit: 200, offset: 0 },
    })

    renderWithProviders('/admin/users/archives/admins', <RootArchivedAdminsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Archived Admins' })).toBeInTheDocument()
    })
    expect(screen.getByRole('columnheader', { name: 'usr_id' })).toBeInTheDocument()
    expect(screen.getByText('usr_42')).toBeInTheDocument()
    expect(usersApi.listArchivedUsers).toHaveBeenCalledWith({ role: 'admin', limit: 200 })
  })

  it('shows usr_id column and values for archived agents', async () => {
    vi.mocked(usersApi.listArchivedUsers).mockResolvedValue({
      data: [
        {
          id: 'usr_99',
          firstName: 'Alex',
          lastName: 'Agent',
          email: 'alex.agent@example.com',
          role: 'user',
          status: 'deleted',
          archivedAt: '2026-04-05T12:00:00Z',
          archivedBy: 'usr_1',
        },
      ],
      pagination: { total: 1, limit: 200, offset: 0 },
    })

    renderWithProviders('/admin/users/archives/agents', <RootArchivedAgentsPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Archived Agents' })).toBeInTheDocument()
    })
    expect(screen.getByRole('columnheader', { name: 'usr_id' })).toBeInTheDocument()
    expect(screen.getByText('usr_99')).toBeInTheDocument()
    expect(usersApi.listArchivedUsers).toHaveBeenCalledWith({ role: 'user', limit: 200 })
  })
})
