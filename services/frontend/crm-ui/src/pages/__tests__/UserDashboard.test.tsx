import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { UserDashboard } from '../UserDashboard'
import { AuthProvider } from '@/features/auth/AuthContext'
import * as clientsApi from '@/api/clients'
import * as logsApi from '@/api/logs'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import type { User, PaginatedResponse, Client, LogEntry } from '@/api/types'

vi.mock('@/api/clients')
vi.mock('@/api/logs')
vi.mock('@/api/auth')

const mockUser: User = {
  id: 'user-123',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  role: 'user',
  status: 'active',
}

const renderUserDashboard = () => {
  // Mock localStorage to have a user
  localStorage.setItem('authToken', 'test-token')
  localStorage.setItem('currentUser', JSON.stringify(mockUser))

  return render(
    <BrowserRouter>
      <AuthProvider>
        <UserDashboard />
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('UserDashboard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock getCurrentUser to prevent AuthProvider from hanging
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(mockUser)
  })

  it('should render dashboard header with user name', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    }

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Welcome, John Doe/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /User Dashboard/i })).toBeInTheDocument()
    })
  })

  it('should display client count', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 15, limit: 1, offset: 0 },
    }

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /My Recent Activities/i ,level:2},)).toBeInTheDocument()
    })
  })

  it('should display recent activities count', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    }

    const mockActivities: LogEntry[] = [
      {
        logId: 'log-1',
        userId: 'user-123',
        clientId: 'client-1',
        action: 'CREATE',
        attributeName: 'email',
        beforeValue: null,
        afterValue: 'test@example.com',
        dateTime: '2024-01-15T10:00:00Z',
      },
      {
        logId: 'log-2',
        userId: 'user-123',
        clientId: 'client-2',
        action: 'UPDATE',
        attributeName: 'phoneNumber',
        beforeValue: '+6512345678',
        afterValue: '+6587654321',
        dateTime: '2024-01-15T11:00:00Z',
      },
    ]

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: mockActivities,
      pagination: { total: 2, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
      const recentActivitiesElements = screen.getAllByText(/Recent Activities/i)
      expect(recentActivitiesElements.length).toBeGreaterThan(0)
    })
  })

  it('should display activities table with data', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    }

    const mockActivities: LogEntry[] = [
      {
        logId: 'log-1',
        userId: 'user-123',
        clientId: 'client-abc123',
        action: 'CREATE',
        attributeName: 'email',
        beforeValue: null,
        afterValue: 'new@example.com',
        dateTime: '2024-01-15T10:30:00Z',
      },
    ]

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: mockActivities,
      pagination: { total: 1, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText('CREATE')).toBeInTheDocument()
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('new@example.com')).toBeInTheDocument()
    })
  })

  it('should show empty state when no activities', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    }

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText(/No recent activities/i)).toBeInTheDocument()
    })
  })

  it('should show loading state', async () => {
    vi.spyOn(clientsApi, 'listClients').mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )
    vi.spyOn(logsApi, 'listLogs').mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    renderUserDashboard()

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('should show error when API call fails', async () => {
    const error = new ApiError(500, 'server_error', 'Failed to load dashboard data')

    vi.spyOn(clientsApi, 'listClients').mockRejectedValue(error)
    vi.spyOn(logsApi, 'listLogs').mockRejectedValue(error)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard data/i)).toBeInTheDocument()
    })
  })

  it('should render navigation links', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    }

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      const createClientLinks = screen.getAllByRole('link', { name: /Create Client/i })
      expect(createClientLinks.length).toBeGreaterThan(0)
      createClientLinks.forEach(link => {
        expect(link).toHaveAttribute('href', '/user/clients/new')
      })
      expect(screen.getByRole('link', { name: /View Transactions/i })).toHaveAttribute(
        'href',
        '/user/transactions'
      )
    })
  })

  it('should truncate client ID in table', async () => {
    const mockClientsResponse: PaginatedResponse<Client> = {
      data: [],
      pagination: { total: 0, limit: 1, offset: 0 },
    }

    const mockActivities: LogEntry[] = [
      {
        logId: 'log-1',
        userId: 'user-123',
        clientId: 'client-verylongid123456789',
        action: 'CREATE',
        attributeName: 'email',
        beforeValue: null,
        afterValue: 'test@example.com',
        dateTime: '2024-01-15T10:30:00Z',
      },
    ]

    const mockLogsResponse: PaginatedResponse<LogEntry> = {
      data: mockActivities,
      pagination: { total: 1, limit: 10, offset: 0 },
    }

    vi.spyOn(clientsApi, 'listClients').mockResolvedValue(mockClientsResponse)
    vi.spyOn(logsApi, 'listLogs').mockResolvedValue(mockLogsResponse)

    renderUserDashboard()

    await waitFor(() => {
      expect(screen.getByText(/client-v\.\.\./i)).toBeInTheDocument()
    })
  })
})
