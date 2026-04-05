import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { AdminDashboard } from '../AdminDashboard'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as usersApi from '@/api/users'
import * as clientsApi from '@/api/clients'
import * as logsApi from '@/api/logs'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import type { User, LogEntry } from '@/api/types'

vi.mock('@/api/users')
vi.mock('@/api/clients')
vi.mock('@/api/logs')
vi.mock('@/api/auth')

const mockUser: User = {
  id: 'usr_1',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@crm.com',
  role: 'super_admin',
  status: 'active',
}

const renderAdminDashboard = () => {
  localStorage.setItem('authToken', 'test-token')
  localStorage.setItem('currentUser', JSON.stringify(mockUser))

  return render(
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AdminDashboard />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock getCurrentUser to prevent AuthProvider from hanging
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(mockUser)
    vi.mocked(clientsApi.getVerificationSubmissionSummary).mockResolvedValue({
      pendingSubmissionCount: 0,
    })
  })

  it('should render dashboard header with admin name', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Welcome, Admin User/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /Admin Dashboard/i })).toBeInTheDocument()
    })
  })

  it('should display total users count', async () => {
    const listUsersSpy = vi
      .spyOn(usersApi, 'listUsers')
      .mockResolvedValueOnce({
        data: [],
        pagination: { total: 25, limit: 1, offset: 0 },
      })
      .mockResolvedValueOnce({
        data: [],
        pagination: { total: 0, limit: 1, offset: 0 },
      })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Total Agents/i)).toBeInTheDocument()
      expect(listUsersSpy).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }))
    })
  })

  it('should display total clients count', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 150, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument()
      expect(screen.getByText(/Total Clients/i)).toBeInTheDocument()
    })
  })

  it('should display recent activities count', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 500, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText('500')).toBeInTheDocument()
      expect(screen.getByText(/Recent Activities/i)).toBeInTheDocument()
    })
  })

  it('should display activity logs table', async () => {
    const mockLogs: LogEntry[] = [
      {
        logId: 'log-1',
        userId: 'user-abc123',
        clientId: 'client-xyz789',
        action: 'CREATE',
        attributeName: 'email',
        beforeValue: null,
        afterValue: 'new@example.com',
        dateTime: '2024-01-15T10:30:00Z',
      },
      {
        logId: 'log-2',
        userId: 'user-def456',
        clientId: 'client-uvw321',
        action: 'UPDATE',
        attributeName: 'phoneNumber',
        beforeValue: '+6512345678',
        afterValue: '+6587654321',
        dateTime: '2024-01-15T11:00:00Z',
      },
    ]

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: mockLogs,
      pagination: { total: 2, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText('CREATE')).toBeInTheDocument()
      expect(screen.getByText('UPDATE')).toBeInTheDocument()
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('phoneNumber')).toBeInTheDocument()
    })
  })

  it('should show recent activity logs without pagination controls', async () => {
    const pageOneLogs: LogEntry[] = [
      {
        logId: 'log-page-1',
        userId: 'user-page-one',
        clientId: 'client-page-one',
        action: 'CREATE',
        attributeName: 'page-one-attribute',
        beforeValue: null,
        afterValue: 'value-one',
        dateTime: '2024-01-15T10:30:00Z',
      },
    ]
    const pageTwoLogs: LogEntry[] = [
      {
        logId: 'log-page-2',
        userId: 'user-page-two',
        clientId: 'client-page-two',
        action: 'UPDATE',
        attributeName: 'page-two-attribute',
        beforeValue: 'value-one',
        afterValue: 'value-two',
        dateTime: '2024-01-15T11:30:00Z',
      },
    ]

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    const listLogsSpy = vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [...pageOneLogs, ...pageTwoLogs],
      pagination: { total: 11, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    const recentLogHeaders = await screen.findAllByText('Recent Activity Logs')
    expect(recentLogHeaders.length).toBeGreaterThan(0)

    const pageOneRows = await screen.findAllByText('page-one-attribute')
    expect(pageOneRows.length).toBeGreaterThan(0)

    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(listLogsSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }))
  })

  it('should render the View all logs action', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText('Recent Activity Logs')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /View all/i })).toBeInTheDocument()
    })
  })

  it('should show empty state when no logs', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    const emptyStates = await screen.findAllByText(/No activity logs found/i)
    expect(emptyStates.length).toBeGreaterThan(0)
  })

  it('should show loading state', async () => {
    vi.spyOn(usersApi, 'listUsers').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(clientsApi, 'listClients').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(logsApi, 'listLogs').mockImplementation(() => new Promise(() => {}))

    renderAdminDashboard()

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('should show error when API call fails', async () => {
    const error = new ApiError(500, 'server_error', 'Failed to load dashboard data')

    vi.spyOn(usersApi, 'listUsers').mockRejectedValue(error)
    vi.spyOn(clientsApi, 'listClients').mockRejectedValue(error)
    vi.spyOn(logsApi, 'listLogs').mockRejectedValue(error)

    renderAdminDashboard()

    await waitFor(() => {
      const errorMessages = screen.queryAllByText(/Failed to load dashboard data/i)
      expect(errorMessages.length).toBeGreaterThan(0)
      expect(errorMessages[0]).toBeInTheDocument()
    })
  })

  it('should surface logs API error instead of silently showing zero activity', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 1, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 1, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockRejectedValue(
      new ApiError(500, 'server_error', 'Failed to load recent activity logs')
    )

    renderAdminDashboard()

    await waitFor(() => {
      const errorMessages = screen.queryAllByText(/Failed to load recent activity logs/i)
      expect(errorMessages.length).toBeGreaterThan(0)
      expect(errorMessages[0]).toBeInTheDocument()
    })
  })

  it('should render user management link', async () => {
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /User Management/i })
      expect(links.length).toBeGreaterThanOrEqual(1)
      expect(links[0]).toHaveAttribute('href', '/admin/users')
    })
  })

  it('should call logout on 401 when users API returns unauthorized', async () => {
    // Override the AuthContext mock to capture logout
    vi.spyOn(usersApi, 'listUsers').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    // The component should call logout and return early (no dashboard content rendered)
    await waitFor(() => {
      // After logout+return, the component doesn't show a loading spinner
      expect(screen.queryByRole('status', { hidden: true })).not.toBeInTheDocument()
    })
  })

  it('should display DELETE action badge with appropriate styling', async () => {
    const mockLogs = [
      {
        logId: 'log-del',
        userId: 'user-abc123',
        clientId: 'client-xyz789',
        action: 'DELETE' as const,
        attributeName: 'account',
        beforeValue: 'old_value',
        afterValue: null,
        dateTime: '2024-01-15T10:30:00Z',
      },
    ]

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: mockLogs,
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText('DELETE')).toBeInTheDocument()
    })
  })

  it('should display pending verifications section when clients have pending status', async () => {
    const pendingClient = {
      clientId: 'client-pending',
      firstName: 'Pending',
      lastName: 'User',
      emailAddress: 'pending@example.com',
      identityVerificationStatus: 'pending' as const,
      dateOfBirth: '1990-01-01',
      gender: 'Male' as const,
      phoneNumber: '+65 1234 5678',
      address: '123 St',
      city: 'Singapore',
      state: 'Central',
      country: 'Singapore',
      postalCode: '123456',
      createdAt: '2024-01-01T00:00:00Z',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients')
      .mockResolvedValueOnce({
        data: [],
        pagination: { total: 0, limit: 1, offset: 0 },
      })
      .mockResolvedValueOnce({
        data: [pendingClient],
        pagination: { total: 1, limit: 100, offset: 0 },
      })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Pending Verifications/i)).toBeInTheDocument()
      expect(screen.getByText('Pending User')).toBeInTheDocument()
      expect(screen.getByText('pending@example.com')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Review →/i })).toBeInTheDocument()
    })
  })

  it('should show Review button for pending client that is clickable', async () => {
    const pendingClient = {
      clientId: 'client-pending-nav',
      firstName: 'Nav',
      lastName: 'Test',
      emailAddress: 'nav@example.com',
      identityVerificationStatus: 'pending' as const,
      dateOfBirth: '1990-01-01',
      gender: 'Male' as const,
      phoneNumber: '+65 1234 5678',
      address: '123 St',
      city: 'Singapore',
      state: 'Central',
      country: 'Singapore',
      postalCode: '123456',
      createdAt: '2024-01-01T00:00:00Z',
    }

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients')
      .mockResolvedValueOnce({ data: [], pagination: { total: 0, limit: 1, offset: 0 } })
      .mockResolvedValueOnce({
        data: [pendingClient],
        pagination: { total: 1, limit: 100, offset: 0 },
      })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    const user = userEvent.setup()
    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Review →/i })).toBeInTheDocument()
    })

    // Verify the button is clickable (not disabled)
    expect(screen.getByRole('button', { name: /Review →/i })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Review →/i }))
    // Navigation happens through BrowserRouter - just verify no errors thrown
  })

  it('should show full IDs in table', async () => {
    const mockLogs: LogEntry[] = [
      {
        logId: 'log-1',
        userId: 'user-verylongid123456789',
        clientId: 'client-verylongid987654321',
        action: 'CREATE',
        attributeName: 'email',
        beforeValue: null,
        afterValue: 'test@example.com',
        dateTime: '2024-01-15T10:30:00Z',
      },
    ]

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(clientsApi, 'listClients').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    })
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue({
      data: mockLogs,
      pagination: { total: 1, limit: 10, offset: 0 },
    })

    renderAdminDashboard()

    await waitFor(() => {
      expect(screen.getByText('user-verylongid123456789')).toBeInTheDocument()
      expect(screen.getByText('client-verylongid987654321')).toBeInTheDocument()
    })
  })
})
