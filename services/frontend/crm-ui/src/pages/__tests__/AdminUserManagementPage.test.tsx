import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, BrowserRouter } from 'react-router-dom'
import { AdminUserManagementPage } from '../AdminUserManagementPage'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as usersApi from '@/api/users'
import * as authApi from '@/api/auth'
import * as clientsApi from '@/api/clients'
import { ApiError } from '@/api/client'
import type { User } from '@/api/types'

vi.mock('@/api/users')
vi.mock('@/api/auth')
vi.mock('@/api/clients')

const mockAdminUser: User = {
  id: 'admin-123',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
}

const mockSuperAdminUser: User = {
  id: 'usr_1',
  firstName: 'Super',
  lastName: 'Admin',
  email: 'super@example.com',
  role: 'super_admin',
  status: 'active',
}

const mockAgentUser: User = {
  id: 'user-123',
  firstName: 'User',
  lastName: 'User',
  email: 'user@example.com',
  role: 'user',
  status: 'active',
}

const renderAdminUserManagementPage = (user: User = mockAdminUser, useStrictRoutes = false) => {
  vi.mocked(authApi.getCurrentUser).mockResolvedValue(user)
  localStorage.setItem('authToken', 'test-token')
  localStorage.setItem('currentUser', JSON.stringify(user))
  const summaryMock = vi.mocked(clientsApi.getVerificationSubmissionSummary)
  if (!summaryMock.getMockImplementation()) {
    summaryMock.mockResolvedValue({ pendingSubmissionCount: 0, pendingSubmissionsByAgent: [] })
  }
  const countMock = vi.mocked(clientsApi.countClientsByAgent)
  if (!countMock.getMockImplementation()) {
    countMock.mockResolvedValue(0)
  }

  if (useStrictRoutes) {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/admin/users']}>
          <AuthProvider>
            <Routes>
              <Route path="/admin/users" element={<AdminUserManagementPage />} />
              <Route path="/unauthorized" element={<h1>Mock Unauthorized Page</h1>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>
    )
  }

  // The default fallback for your standard UI tests
  return render(
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AdminUserManagementPage />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

describe('AdminUserManagementPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock getCurrentUser to prevent AuthProvider from hanging
  })

  it('should handle disable user cancel when window.confirm returns false', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const disableSpy = vi.spyOn(usersApi, 'disableUser').mockResolvedValue({
      ...mockAgentUser,
      status: 'disabled',
    })

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockAgentUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    renderAdminUserManagementPage()

    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Disable'))

    expect(disableSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('should show error message when disable fails', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockAgentUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })
    vi.spyOn(usersApi, 'disableUser').mockRejectedValue(
      new ApiError(500, 'server_error', 'Disable failed')
    )

    renderAdminUserManagementPage()

    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Disable'))

    await waitFor(() => {
      expect(screen.getByText('Disable failed')).toBeInTheDocument()
    })

    confirmSpy.mockRestore()
  })

  it('should render user management page for admin', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockAgentUser],
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    renderAdminUserManagementPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'User Management', level: 1 })).toBeInTheDocument()
    })
    expect(await screen.findByText('My Users')).toBeInTheDocument()
  })

  it('should show pending verification breakdown for admin users', async () => {
    const secondAgent: User = {
      id: 'user-456',
      firstName: 'Second',
      lastName: 'Agent',
      email: 'second@example.com',
      role: 'user',
      status: 'active',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockAgentUser, secondAgent],
      pagination: { total: 2, limit: 10, offset: 0 },
    })
    vi.mocked(clientsApi.getVerificationSubmissionSummary).mockResolvedValue({
      pendingSubmissionCount: 5,
      pendingSubmissionsByAgent: [
        { assignedUserId: 'user-123', pendingSubmissionCount: 3 },
        { assignedUserId: 'user-456', pendingSubmissionCount: 2 },
      ],
    })

    renderAdminUserManagementPage()

    await waitFor(() => {
      expect(screen.getByText(/Pending verification submissions: 5\./)).toBeInTheDocument()
    })

    expect(
      screen.getByText(content => content.includes('Notify related agent to review documents.'))
    ).toBeInTheDocument()
    expect(screen.getByText('View details')).toBeInTheDocument()
    expect(screen.queryByText('User ID')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /View details/i }))

    expect(screen.getByRole('columnheader', { name: 'User ID' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pending' })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /user-123\s+User User\s+3/i })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /user-456\s+Second Agent\s+2/i })).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'tr' && element.textContent === 'user-123User User3'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'tr' && element.textContent === 'user-456Second Agent2'
      )
    ).toBeInTheDocument()
  })

  it('should show pending verification breakdown for root admin users', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [mockAdminUser, mockAgentUser],
      pagination: { total: 2, limit: 10, offset: 0 },
    })
    vi.mocked(clientsApi.getVerificationSubmissionSummary).mockResolvedValue({
      pendingSubmissionCount: 2,
      pendingSubmissionsByAgent: [{ assignedUserId: 'user-123', pendingSubmissionCount: 2 }],
    })
    vi.mocked(clientsApi.countClientsByAgent).mockResolvedValue(0)

    renderAdminUserManagementPage(mockSuperAdminUser)

    await waitFor(() => {
      expect(screen.getByText(/Pending verification submissions: 2\./)).toBeInTheDocument()
    })

    expect(
      screen.getByText(content => content.includes('Notify related agent to review documents.'))
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /View details/i }))

    expect(screen.getByRole('row', { name: /user-123\s+User User\s+2/i })).toBeInTheDocument()
  })
})

it('should render user management page for super admin with admins and users', async () => {
  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [mockAdminUser, mockAgentUser],
    pagination: { total: 2, limit: 10, offset: 0 },
  })

  renderAdminUserManagementPage(mockSuperAdminUser)

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'User Management', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Admins')).toBeInTheDocument()
    expect(screen.getByText('My Users')).toBeInTheDocument()
  })
})

it('should display users in table', async () => {
  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [mockAgentUser],
    pagination: { total: 1, limit: 10, offset: 0 },
  })

  renderAdminUserManagementPage()

  await waitFor(() => {
    expect(screen.getAllByText('User').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(screen.getAllByText('Agent').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('columnheader', { name: 'usr_id' })).toBeInTheDocument()
    expect(screen.getByText('user-123')).toBeInTheDocument()
  })
})

it('should display admins in table for super admin', async () => {
  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [mockAdminUser, mockAgentUser],
    pagination: { total: 2, limit: 10, offset: 0 },
  })

  renderAdminUserManagementPage(mockSuperAdminUser)

  await waitFor(() => {
    expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getAllByText('Agent').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('columnheader', { name: 'usr_id' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('admin-123')).toBeInTheDocument()
    expect(screen.getByText('user-123')).toBeInTheDocument()
  })
})

it('should handle disable user', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [mockAgentUser],
    pagination: { total: 1, limit: 10, offset: 0 },
  })
  vi.spyOn(usersApi, 'disableUser').mockResolvedValue({
    ...mockAgentUser,
    status: 'disabled',
  })

  renderAdminUserManagementPage()

  await waitFor(() => {
    expect(screen.getByText('Disable')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Disable'))

  await waitFor(() => {
    expect(usersApi.disableUser).toHaveBeenCalledWith('user-123')
  })

  confirmSpy.mockRestore()
})

it('should show transfer guidance as tooltip for disabled agents with clients', async () => {
  const disabledAgent: User = {
    ...mockAgentUser,
    status: 'disabled',
  }

  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [disabledAgent],
    pagination: { total: 1, limit: 10, offset: 0 },
  })
  vi.spyOn(clientsApi, 'countClientsByAgent').mockResolvedValue(2)

  renderAdminUserManagementPage(mockSuperAdminUser)

  const transferButton = await screen.findByRole('button', { name: 'Transfer (2)' })
  expect(transferButton).toHaveAttribute(
    'title',
    'Transfer assigned clients; archive is automatic.'
  )
})

it('should show transfer action for disabled agents with clients for admin', async () => {
  const disabledAgent: User = {
    ...mockAgentUser,
    status: 'disabled',
  }

  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [disabledAgent],
    pagination: { total: 1, limit: 10, offset: 0 },
  })
  vi.spyOn(clientsApi, 'countClientsByAgent').mockResolvedValue(2)

  renderAdminUserManagementPage(mockAdminUser)

  const transferButton = await screen.findByRole('button', { name: 'Transfer (2)' })
  expect(transferButton).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
})

it('should allow admin to archive disabled agent when no clients remain', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const disabledAgent: User = {
    ...mockAgentUser,
    status: 'disabled',
  }

  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [disabledAgent],
    pagination: { total: 1, limit: 10, offset: 0 },
  })
  vi.spyOn(clientsApi, 'countClientsByAgent').mockResolvedValue(0)
  vi.spyOn(usersApi, 'deleteUser').mockResolvedValue()

  renderAdminUserManagementPage(mockAdminUser)

  const archiveButton = await screen.findByRole('button', { name: 'Archive' })
  fireEvent.click(archiveButton)

  await waitFor(() => {
    expect(usersApi.deleteUser).toHaveBeenCalledWith('user-123')
  })

  confirmSpy.mockRestore()
})

it('should handle delete admin for super admin', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const disabledAdmin: User = {
    ...mockAdminUser,
    status: 'disabled',
  }
  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [disabledAdmin, mockAgentUser],
    pagination: { total: 2, limit: 10, offset: 0 },
  })
  vi.spyOn(usersApi, 'deleteUser').mockResolvedValue()

  renderAdminUserManagementPage(mockSuperAdminUser)

  await waitFor(() => {
    const archiveButtons = screen.getAllByText('Archive')
    expect(archiveButtons.length).toBeGreaterThan(0)
  })

  const archiveButtons = screen.getAllByText('Archive')
  fireEvent.click(archiveButtons[0]) // Archive admin row first

  await waitFor(() => {
    expect(usersApi.deleteUser).toHaveBeenCalledWith('admin-123')
  })

  confirmSpy.mockRestore()
})

it('should prevent admin from deleting other admins', async () => {
  const anotherAdmin: User = {
    id: 'admin-456',
    firstName: 'Another',
    lastName: 'Admin',
    email: 'another@example.com',
    role: 'admin',
    status: 'active',
  }

  vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
    data: [anotherAdmin],
    pagination: { total: 1, limit: 10, offset: 0 },
  })

  renderAdminUserManagementPage()

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'User Management', level: 1 })).toBeInTheDocument()

    // Should not show admins section for regular admin
    expect(screen.queryByText('Admins')).not.toBeInTheDocument()
  })
})

it('should handle API error', async () => {
  vi.spyOn(usersApi, 'listUsers').mockRejectedValue(
    new ApiError(500, 'Failed to load users', 'Failed to load users')
  )

  renderAdminUserManagementPage()

  await waitFor(() => {
    expect(screen.getByText('Failed to load users')).toBeInTheDocument()
  })
})

it('should show loading state', async () => {
  vi.spyOn(usersApi, 'listUsers').mockImplementation(() => new Promise(() => {})) // Never resolves

  renderAdminUserManagementPage()

  await waitFor(() => {
    expect(screen.getByText('Loading users...')).toBeInTheDocument()
  })
})

it('should redirect unauthorized users', async () => {
  const normalUser: User = {
    id: 'user-123',
    firstName: 'User',
    lastName: 'User',
    email: 'user@example.com',
    role: 'user',
    status: 'active',
  }
  //uses strict routes
  renderAdminUserManagementPage(normalUser, true)

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Mock Unauthorized Page' })).toBeInTheDocument()
  })
})
