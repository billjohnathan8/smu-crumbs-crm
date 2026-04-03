import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminCommunications } from '../AdminCommunications'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as communicationsApi from '@/api/communications'
import { ApiError } from '@/api/client'
import type { Communication, PaginatedResponse, User } from '@/api/types'

vi.mock('@/api/communications')

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockLogout = vi.fn()
const mockUseAuth = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const adminUser: User = {
  id: 'admin-123',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
}

const baseCommunication: Communication = {
  communicationId: 'com_1',
  clientId: 'client-1',
  userId: 'user-1',
  channel: 'email',
  toEmail: 'to@example.com',
  subject: 'Queued subject',
  body: 'Queued body',
  status: 'queued',
  createdAt: '2026-03-21T10:00:00Z',
  updatedAt: '2026-03-21T10:00:00Z',
}

const queuedResponse: PaginatedResponse<Communication> = {
  data: [baseCommunication],
  pagination: { limit: 200, offset: 0, total: 1 },
}

const renderPage = () =>
  render(
    <ThemeProvider>
      <MemoryRouter>
        <AdminCommunications />
      </MemoryRouter>
    </ThemeProvider>
  )

describe('AdminCommunications behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ user: adminUser, logout: mockLogout })
    vi.mocked(communicationsApi.listQueuedCommunications).mockResolvedValue(queuedResponse)
  })

  it('does not fetch communications when user is not admin/super_admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { ...adminUser, role: 'user' },
      logout: mockLogout,
    })

    renderPage()

    await waitFor(() => {
      expect(communicationsApi.listQueuedCommunications).not.toHaveBeenCalled()
    })
  })

  it('does not fetch communications when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null, logout: mockLogout })

    renderPage()

    await waitFor(() => {
      expect(communicationsApi.listQueuedCommunications).not.toHaveBeenCalled()
    })
  })

  it('shows fallback service-unavailable message for 5xx without API message', async () => {
    vi.mocked(communicationsApi.listQueuedCommunications).mockRejectedValue(
      new ApiError(500, 'server_error', '')
    )

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText('Communications service is not available in this deployment environment.')
      ).toBeInTheDocument()
    })
  })

  it('shows generic load error for non-api failures', async () => {
    vi.mocked(communicationsApi.listQueuedCommunications).mockRejectedValue(new Error('network'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load communications')).toBeInTheDocument()
    })
  })

  it('shows generic load error for non-5xx ApiError with empty message', async () => {
    vi.mocked(communicationsApi.listQueuedCommunications).mockRejectedValue(
      new ApiError(400, 'bad_request', '')
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load communications')).toBeInTheDocument()
    })
  })

  it('logs out when initial list returns 401', async () => {
    vi.mocked(communicationsApi.listQueuedCommunications).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderPage()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('shows queued table as read-only status (no manual update controls)', async () => {
    renderPage()

    await screen.findByText('Queued subject')

    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('looks up by communication id and renders detailed fields', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationById).mockResolvedValue({
      ...baseCommunication,
      providerMessageId: 'provider-msg-1',
      errorMessage: 'delivery error',
    })

    renderPage()

    await screen.findByText('Lookup by Communication ID')

    await user.type(screen.getByPlaceholderText('com_...'), '  com_1  ')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[0])

    await waitFor(() => {
      expect(communicationsApi.getCommunicationById).toHaveBeenCalledWith('com_1', {
        timeout: 15000,
      })
    })
    expect(screen.getByText('Provider ID:')).toBeInTheDocument()
    expect(screen.getByText('Error:')).toBeInTheDocument()
  })

  it('shows permission error on communication-id lookup 403', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationById).mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderPage()

    await screen.findByText('Lookup by Communication ID')
    await user.type(screen.getByPlaceholderText('com_...'), 'com_denied')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[0])

    await waitFor(() => {
      expect(
        screen.getByText('You are not authorized to view this communication.')
      ).toBeInTheDocument()
    })
  })

  it('shows fallback message on communication-id lookup failure', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationById).mockRejectedValue(new Error('lookup failed'))

    renderPage()

    await screen.findByText('Lookup by Communication ID')
    await user.type(screen.getByPlaceholderText('com_...'), 'com_missing')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[0])

    await waitFor(() => {
      expect(screen.getByText('Communication not found')).toBeInTheDocument()
    })
  })

  it('logs out when communication-id lookup returns 401', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationById).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderPage()

    await screen.findByText('Lookup by Communication ID')
    await user.type(screen.getByPlaceholderText('com_...'), 'com_401')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[0])

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('looks up by provider message id and handles API errors', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationByProviderMessageId).mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderPage()

    await screen.findByText('Lookup by Provider Message ID')
    await user.type(screen.getByPlaceholderText('Provider message ID...'), ' provider_1 ')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(communicationsApi.getCommunicationByProviderMessageId).toHaveBeenCalledWith(
        'provider_1',
        { timeout: 15000 }
      )
      expect(
        screen.getByText('You are not authorized to view this communication.')
      ).toBeInTheDocument()
    })
  })

  it('shows fallback message on provider lookup non-api failure', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationByProviderMessageId).mockRejectedValue(
      new Error('provider failed')
    )

    renderPage()

    await screen.findByText('Lookup by Provider Message ID')
    await user.type(screen.getByPlaceholderText('Provider message ID...'), 'provider_x')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(screen.getByText('Communication not found')).toBeInTheDocument()
    })
  })

  it('logs out when provider lookup returns 401', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationByProviderMessageId).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderPage()

    await screen.findByText('Lookup by Provider Message ID')
    await user.type(screen.getByPlaceholderText('Provider message ID...'), 'provider_401')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('renders provider lookup result for successful response', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationByProviderMessageId).mockResolvedValue({
      ...baseCommunication,
      status: 'failed',
      providerMessageId: 'provider_1',
      errorMessage: 'provider rejected',
    })

    renderPage()

    await screen.findByText('Lookup by Provider Message ID')
    await user.type(screen.getByPlaceholderText('Provider message ID...'), 'provider_1')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(screen.getByText('provider rejected')).toBeInTheDocument()
    })
  })

  it('shows loading labels during lookups and supports header actions', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationById).mockImplementation(
      () => new Promise(() => {})
    )
    vi.mocked(communicationsApi.getCommunicationByProviderMessageId).mockImplementation(
      () => new Promise(() => {})
    )

    renderPage()

    await screen.findByRole('heading', { name: 'Communications' })
    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(mockNavigate).toHaveBeenCalledWith('/admin')

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(mockLogout).toHaveBeenCalled()

    await user.type(screen.getByPlaceholderText('com_...'), 'com_loading')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[0])
    expect(screen.getByRole('button', { name: 'Looking up...' })).toBeInTheDocument()
  })
})
