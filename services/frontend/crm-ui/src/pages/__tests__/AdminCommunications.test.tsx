import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AdminCommunications } from '../AdminCommunications'
import { AuthProvider } from '@/features/auth/AuthContext'
import * as communicationsApi from '@/api/communications'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import type { User, Communication, PaginatedResponse } from '@/api/types'

vi.mock('@/api/communications')
vi.mock('@/api/auth')

const mockUser: User = {
  id: 'admin-123',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
}

const mockComm: Communication = {
  communicationId: 'com_1',
  clientId: 'client-123',
  agentId: 'agent-1',
  channel: 'email',
  toEmail: 'john@example.com',
  subject: 'Welcome Email',
  body: 'Hello John',
  status: 'queued',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const renderPage = () => {
  localStorage.setItem('authToken', 'test-token')
  localStorage.setItem('currentUser', JSON.stringify(mockUser))

  return render(
    <BrowserRouter>
      <AuthProvider>
        <AdminCommunications />
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('AdminCommunications', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(mockUser)
  })

  it('should render the Communications heading', async () => {
    const mockResponse: PaginatedResponse<Communication> = {
      data: [],
      pagination: { limit: 200, offset: 0, total: 0 },
    }
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockResolvedValue(mockResponse)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Communications$/i })).toBeInTheDocument()
    })
  })

  it('should show empty state when no queued communications', async () => {
    const mockResponse: PaginatedResponse<Communication> = {
      data: [],
      pagination: { limit: 200, offset: 0, total: 0 },
    }
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockResolvedValue(mockResponse)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/No queued communications found/i)).toBeInTheDocument()
    })
  })

  it('should display queued communications in table', async () => {
    const mockResponse: PaginatedResponse<Communication> = {
      data: [mockComm],
      pagination: { limit: 200, offset: 0, total: 1 },
    }
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockResolvedValue(mockResponse)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('com_1')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('Welcome Email')).toBeInTheDocument()
    })
  })

  it('should show loading state', async () => {
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockImplementation(
      () => new Promise(() => {})
    )

    renderPage()

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('should show error when API call fails', async () => {
    const error = new ApiError(500, 'server_error', 'Failed to load communications')
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockRejectedValue(error)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load communications/i)).toBeInTheDocument()
    })
  })

  it('should render lookup panels', async () => {
    const mockResponse: PaginatedResponse<Communication> = {
      data: [],
      pagination: { limit: 200, offset: 0, total: 0 },
    }
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockResolvedValue(mockResponse)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Lookup by Communication ID/i)).toBeInTheDocument()
      expect(screen.getByText(/Lookup by Provider Message ID/i)).toBeInTheDocument()
    })
  })

  it('should render sidebar with Communications nav item', async () => {
    const mockResponse: PaginatedResponse<Communication> = {
      data: [],
      pagination: { limit: 200, offset: 0, total: 0 },
    }
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockResolvedValue(mockResponse)

    renderPage()

    await waitFor(() => {
      const navLinks = screen.getAllByRole('link')
      const commLink = navLinks.find(link => link.textContent === 'Communications')
      expect(commLink).toBeTruthy()
      expect(commLink).toHaveAttribute('href', '/admin/communications')
    })
  })

  it('should render Refresh button', async () => {
    const mockResponse: PaginatedResponse<Communication> = {
      data: [],
      pagination: { limit: 200, offset: 0, total: 0 },
    }
    vi.spyOn(communicationsApi, 'listQueuedCommunications').mockResolvedValue(mockResponse)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument()
    })
  })
})
