import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { ClientDetailPage } from '../ClientDetailPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as clientsApi from '@/api/clients'
import * as transactionsApi from '@/api/transactions'
import * as communicationsApi from '@/api/communications'
import { ApiError } from '@/api/client'
import type { Client, PaginatedResponse, Transaction, Communication } from '@/api/types'

vi.mock('@/api/clients')
vi.mock('@/api/transactions')
vi.mock('@/api/communications')

const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'User', lastName: 'Smith', role: 'user' },
    logout: mockLogout,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ clientId: 'client-123' }),
    useLocation: () => ({
      state: null,
      pathname: '/user/clients/client-123',
      search: '',
      hash: '',
      key: '',
    }),
  }
})

const mockClient: Client = {
  clientId: 'client-123',
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1990-01-15',
  gender: 'Male',
  emailAddress: 'john@example.com',
  phoneNumber: '+65 1234 5678',
  address: '123 Main St',
  city: 'Singapore',
  state: 'Central',
  country: 'Singapore',
  postalCode: '123456',
  identityVerificationStatus: 'unverified',
  createdAt: '2024-01-01T00:00:00Z',
}

const mockTxResponse: PaginatedResponse<Transaction> = {
  data: [],
  pagination: { limit: 10, offset: 0, total: 0 },
}

const mockCommsResponse: PaginatedResponse<Communication> = {
  data: [],
  pagination: { limit: 10, offset: 0, total: 0 },
}

describe('ClientDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClient)
    vi.spyOn(clientsApi, 'listClientAccounts').mockResolvedValue([])
    vi.spyOn(transactionsApi, 'listClientTransactions').mockResolvedValue(mockTxResponse)
    vi.spyOn(communicationsApi, 'listClientCommunications').mockResolvedValue(mockCommsResponse)
  })

  const renderComponent = () =>
    render(
      <ThemeProvider>
        <BrowserRouter>
          <ClientDetailPage />
        </BrowserRouter>
      </ThemeProvider>
    )

  it('renders client profile', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
      expect(screen.getByText('Client Profile')).toBeInTheDocument()
    })
  })

  it('navigates to account management', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Manage accounts →')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Manage accounts →'))
    expect(mockNavigate).toHaveBeenCalledWith('/user/clients/client-123/accounts')
  })

  it('does not show internal verification submission button', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    expect(
      screen.queryByRole('button', { name: /Submit for KYC Verification/i })
    ).not.toBeInTheDocument()
  })

  it('calls logout on 401 error', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('shows not found error for missing client', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(404, 'not_found', 'Client not found')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Client not found')).toBeInTheDocument()
    })
  })

  it('shows 403 forbidden error message for user role', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to access this client.')).toBeInTheDocument()
    })
  })

  it('shows generic ApiError message for unexpected status codes', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(500, 'server_error', 'Internal Server Error')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Internal Server Error')).toBeInTheDocument()
    })
  })

  it('shows unexpected error for non-ApiError during load', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(new Error('network failure'))

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  it('navigates back to client list via back button when error shown', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(404, 'not_found', 'Client not found')
    )
    const user = userEvent.setup()
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to Clients' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Back to Clients' }))
    expect(mockNavigate).toHaveBeenCalledWith('/user/clients')
  })

  it('shows delete confirm modal when Delete button is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Client/i }))

    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
    })
  })

  it('deletes client and navigates on confirm delete', async () => {
    vi.spyOn(clientsApi, 'deleteClient').mockResolvedValue(undefined)
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Client/i }))
    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete Account' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/user/clients',
        expect.objectContaining({ replace: true })
      )
    })
  })

  it('shows delete error on 403 during delete', async () => {
    vi.spyOn(clientsApi, 'deleteClient').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Client/i }))
    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete Account' }))

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to delete this client.')).toBeInTheDocument()
    })
  })

  it('cancels delete modal without deleting', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Client/i }))
    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByTestId('delete-client-modal')).not.toBeInTheDocument()
    })
  })

  it('calls logout on 401 during delete', async () => {
    vi.spyOn(clientsApi, 'deleteClient').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Client/i }))
    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete Account' }))

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('renders client profile with correct nav breadcrumb for user role', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/← My Clients/)).toBeInTheDocument()
    })
  })

  it('navigates to all transactions when View All is clicked', async () => {
    vi.spyOn(transactionsApi, 'listClientTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 10, offset: 0, total: 0 },
    })
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View all →/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /View all →/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/user/transactions?clientId=client-123')
  })

  it('sends communication and shows success', async () => {
    vi.spyOn(communicationsApi, 'sendCommunication').mockResolvedValue({} as never)
    vi.spyOn(communicationsApi, 'listClientCommunications').mockResolvedValue({
      data: [],
      pagination: { limit: 10, offset: 0, total: 0 },
    })
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compose Email/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Compose Email/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send Email/i })).toBeInTheDocument()
    })

    // Use fireEvent.change for reliable controlled input updates
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const subjectInput = document.querySelector('input[type="text"]') as HTMLInputElement
    const bodyTextarea = document.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(subjectInput, { target: { value: 'Hello' } })
    fireEvent.change(bodyTextarea, { target: { value: 'Body text' } })

    await user.click(screen.getByRole('button', { name: /Send Email/i }))

    await waitFor(() => {
      expect(communicationsApi.sendCommunication).toHaveBeenCalled()
    })
  })

  it('shows send communication validation error when fields are empty', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compose Email/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Compose Email/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send Email/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Send Email/i }))

    await waitFor(() => {
      expect(screen.getByText('All fields are required')).toBeInTheDocument()
    })
  })

  it('does not show provider message id metadata to normal users', async () => {
    vi.spyOn(communicationsApi, 'listClientCommunications').mockResolvedValue({
      data: [
        {
          communicationId: 'com_1',
          clientId: 'client-123',
          userId: 'user-1',
          channel: 'email',
          toEmail: 'john@example.com',
          subject: 'Test communication',
          body: 'Hello',
          status: 'sent',
          providerMessageId: 'ses-msg-123',
          createdAt: '2026-04-03T10:00:00Z',
          updatedAt: '2026-04-03T10:01:00Z',
        },
      ],
      pagination: { limit: 10, offset: 0, total: 1 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Test communication')).toBeInTheDocument()
    })

    expect(screen.queryByText('Provider ID:')).not.toBeInTheDocument()
    expect(screen.queryByText('ses-msg-123')).not.toBeInTheDocument()
  })
})
