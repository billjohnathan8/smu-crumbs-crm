import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  id: 'admin-123',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  role: 'admin',
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
    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { total: 25, limit: 1, offset: 0 },
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
      expect(screen.getByText('25')).toBeInTheDocument()
      expect(screen.getByText(/Total Agents/i)).toBeInTheDocument()
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

    await waitFor(() => {
      expect(screen.getByText(/No activity logs found/i)).toBeInTheDocument()
    })
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
      expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument()
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

  it('should truncate IDs in table', async () => {
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
      const truncatedTexts = screen.getAllByText(/\.\.\./i)
      expect(truncatedTexts.length).toBeGreaterThan(0)
    })
  })
})
