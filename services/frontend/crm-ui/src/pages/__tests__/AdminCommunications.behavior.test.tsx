import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminCommunications } from '../AdminCommunications'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as communicationsApi from '@/api/communications'
import * as clientsApi from '@/api/clients'
import { ApiError } from '@/api/client'
import type { Client, Communication, PaginatedResponse, User } from '@/api/types'

vi.mock('@/api/communications')
vi.mock('@/api/clients')

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

const matchedClient: Client = {
  clientId: 'client-1',
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1990-01-01',
  gender: 'Male',
  emailAddress: 'john@example.com',
  phoneNumber: '+65 1234 5678',
  address: '1 Street',
  city: 'Singapore',
  state: 'Central',
  country: 'Singapore',
  postalCode: '123456',
  identityVerificationStatus: 'verified',
  createdAt: '2026-03-21T10:00:00Z',
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
    vi.mocked(communicationsApi.listCommunications).mockResolvedValue(queuedResponse)
    vi.mocked(clientsApi.listClients).mockResolvedValue({
      data: [],
      pagination: { limit: 5, offset: 0, total: 0 },
    })
  })

  it('does not fetch communications when user is not admin/super_admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { ...adminUser, role: 'user' },
      logout: mockLogout,
    })

    renderPage()

    await waitFor(() => {
      expect(communicationsApi.listCommunications).not.toHaveBeenCalled()
    })
  })

  it('does not fetch communications when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null, logout: mockLogout })

    renderPage()

    await waitFor(() => {
      expect(communicationsApi.listCommunications).not.toHaveBeenCalled()
    })
  })

  it('shows fallback service-unavailable message for 5xx without API message', async () => {
    vi.mocked(communicationsApi.listCommunications).mockRejectedValue(
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
    vi.mocked(communicationsApi.listCommunications).mockRejectedValue(new Error('network'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load communications')).toBeInTheDocument()
    })
  })

  it('shows generic load error for non-5xx ApiError with empty message', async () => {
    vi.mocked(communicationsApi.listCommunications).mockRejectedValue(
      new ApiError(400, 'bad_request', '')
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load communications')).toBeInTheDocument()
    })
  })

  it('logs out when initial list returns 401', async () => {
    vi.mocked(communicationsApi.listCommunications).mockRejectedValue(
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
    const communicationRow = screen.getByText('Queued subject').closest('tr')
    expect(communicationRow).not.toBeNull()
    expect(within(communicationRow as HTMLElement).queryByRole('combobox')).not.toBeInTheDocument()
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

  it('looks up by client name and handles API errors', async () => {
    const user = userEvent.setup()
    vi.mocked(clientsApi.listClients).mockRejectedValue(new ApiError(403, 'forbidden', 'Forbidden'))

    renderPage()

    await screen.findByText('Lookup by Client Name')
    await user.type(screen.getByPlaceholderText('Client name...'), ' John ')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(clientsApi.listClients).toHaveBeenCalledWith(
        { q: 'John', limit: 5 },
        { timeout: 15000 }
      )
      expect(
        screen.getByText('You are not authorized to view this communication.')
      ).toBeInTheDocument()
    })
  })

  it('shows no-client message on client-name lookup miss', async () => {
    const user = userEvent.setup()
    vi.mocked(clientsApi.listClients).mockResolvedValue({
      data: [],
      pagination: { limit: 5, offset: 0, total: 0 },
    })

    renderPage()

    await screen.findByText('Lookup by Client Name')
    await user.type(screen.getByPlaceholderText('Client name...'), 'unknown')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(screen.getByText('No client found for that name.')).toBeInTheDocument()
    })
  })

  it('shows no-communications message when matched client has no communications', async () => {
    const user = userEvent.setup()
    vi.mocked(clientsApi.listClients).mockResolvedValue({
      data: [matchedClient],
      pagination: { limit: 5, offset: 0, total: 1 },
    })
    vi.mocked(communicationsApi.listClientCommunications).mockResolvedValue({
      data: [],
      pagination: { limit: 1, offset: 0, total: 0 },
    })

    renderPage()

    await screen.findByText('Lookup by Client Name')
    await user.type(screen.getByPlaceholderText('Client name...'), 'john')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(screen.getByText('No communications found for this client.')).toBeInTheDocument()
    })
  })

  it('shows fallback message on client-name lookup non-api failure', async () => {
    const user = userEvent.setup()
    vi.mocked(clientsApi.listClients).mockRejectedValue(new Error('lookup failed'))

    renderPage()

    await screen.findByText('Lookup by Client Name')
    await user.type(screen.getByPlaceholderText('Client name...'), 'john')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(screen.getByText('Failed to look up by client name')).toBeInTheDocument()
    })
  })

  it('logs out when client-name lookup returns 401', async () => {
    const user = userEvent.setup()
    vi.mocked(clientsApi.listClients).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderPage()

    await screen.findByText('Lookup by Client Name')
    await user.type(screen.getByPlaceholderText('Client name...'), 'john')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('renders client-name lookup result for successful response', async () => {
    const user = userEvent.setup()
    vi.mocked(clientsApi.listClients).mockResolvedValue({
      data: [matchedClient],
      pagination: { limit: 5, offset: 0, total: 1 },
    })
    vi.mocked(communicationsApi.listClientCommunications).mockResolvedValue({
      data: [{ ...baseCommunication, status: 'failed', errorMessage: 'provider rejected' }],
      pagination: { limit: 1, offset: 0, total: 1 },
    })

    renderPage()

    await screen.findByText('Lookup by Client Name')
    await user.type(screen.getByPlaceholderText('Client name...'), 'john')
    await user.click(screen.getAllByRole('button', { name: 'Lookup' })[1])

    await waitFor(() => {
      expect(screen.getByText('provider rejected')).toBeInTheDocument()
      expect(screen.getByText('John Doe (client-1)')).toBeInTheDocument()
    })
  })

  it('shows loading labels during communication-id lookup and supports header actions', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.getCommunicationById).mockImplementation(
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

  it('applies inline table filters and calls communications list with params', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.listCommunications).mockResolvedValue(queuedResponse)

    renderPage()

    await screen.findByText('Queued subject')

    await user.selectOptions(screen.getByDisplayValue('All'), 'failed')
    await user.type(screen.getByPlaceholderText('email@domain.com'), 'example.com')

    await waitFor(() => {
      expect(communicationsApi.listCommunications).toHaveBeenLastCalledWith({
        limit: 10,
        offset: 0,
        status: 'failed',
        createdFrom: undefined,
        createdTo: undefined,
        recipient: 'example.com',
        subject: undefined,
        client: undefined,
        sender: undefined,
      })
    })
  })

  it('supports paginating communications list', async () => {
    const user = userEvent.setup()
    vi.mocked(communicationsApi.listCommunications)
      .mockResolvedValueOnce({
        data: [baseCommunication],
        pagination: { limit: 10, offset: 0, total: 25 },
      })
      .mockResolvedValueOnce({
        data: [{ ...baseCommunication, communicationId: 'com_2', subject: 'Second page row' }],
        pagination: { limit: 10, offset: 10, total: 25 },
      })

    renderPage()

    await screen.findByText('Page 1 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(communicationsApi.listCommunications).toHaveBeenLastCalledWith({
        limit: 10,
        offset: 10,
        status: undefined,
        createdFrom: undefined,
        createdTo: undefined,
        recipient: undefined,
        subject: undefined,
        client: undefined,
        sender: undefined,
      })
    })
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Second page row')).toBeInTheDocument()
  })
})
