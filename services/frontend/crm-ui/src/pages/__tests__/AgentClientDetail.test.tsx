import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { AgentClientDetail } from '../AgentClientDetail'
import * as clientsApi from '@/api/clients'
import * as transactionsApi from '@/api/transactions'
import * as communicationsApi from '@/api/communications'
import { ApiError } from '@/api/client'
import type { Client, PaginatedResponse, Transaction, Account, Communication } from '@/api/types'

vi.mock('@/api/clients')
vi.mock('@/api/transactions')
vi.mock('@/api/communications')

const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'agent-1', firstName: 'Agent', lastName: 'Smith', role: 'agent' },
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
    useLocation: () => ({ state: null, pathname: '/agent/clients/client-123', search: '', hash: '', key: '' }),
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

describe('AgentClientDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClient)
    vi.spyOn(clientsApi, 'listClientAccounts').mockResolvedValue([])
    vi.spyOn(transactionsApi, 'listClientTransactions').mockResolvedValue(mockTxResponse)
    vi.spyOn(communicationsApi, 'listClientCommunications').mockResolvedValue(mockCommsResponse)
  })

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <AgentClientDetail />
      </BrowserRouter>
    )

  it('should render client profile with name', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })
  })

  it('should show loading spinner initially', () => {
    vi.spyOn(clientsApi, 'getClientById').mockReturnValue(new Promise(() => {}))
    renderComponent()

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('should display Edit Client button', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Edit Client/i })).toBeInTheDocument()
    })
  })

  it('should navigate to edit page when Edit Client is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Edit Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Edit Client/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/agent/clients/client-123/edit')
  })

  it('should display Delete Client button', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })
  })

  it('should show delete confirmation modal when Delete Client is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Client/i }))

    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
      expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument()
    })
  })

  it('should delete client and navigate to client list', async () => {
    vi.spyOn(clientsApi, 'deleteClient').mockResolvedValue(undefined)

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete Client/i })).toBeInTheDocument()
    })

    // Open modal
    await user.click(screen.getByRole('button', { name: /Delete Client/i }))

    await waitFor(() => {
      expect(screen.getByTestId('delete-client-modal')).toBeInTheDocument()
    })

    // Confirm delete - find the delete button inside the modal
    const modalDeleteButton = screen.getByTestId('delete-client-modal').querySelector('button.bg-danger')
    expect(modalDeleteButton).not.toBeNull()
    await user.click(modalDeleteButton!)

    await waitFor(() => {
      expect(clientsApi.deleteClient).toHaveBeenCalledWith('client-123')
      expect(mockNavigate).toHaveBeenCalledWith('/agent/clients', expect.objectContaining({
        replace: true,
      }))
    })
  })

  it('should display Bank Accounts section with manage link', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Bank Accounts')).toBeInTheDocument()
      expect(screen.getByText('Manage accounts →')).toBeInTheDocument()
    })
  })

  it('should navigate to accounts page when manage accounts is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Manage accounts →')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Manage accounts →'))
    expect(mockNavigate).toHaveBeenCalledWith('/agent/clients/client-123/accounts')
  })

  it('should display Communications section', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Communications')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Compose Email/i })).toBeInTheDocument()
    })
  })

  it('should show compose email form when Compose Email is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compose Email/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Compose Email/i }))

    await waitFor(() => {
      expect(screen.getByText('To Email')).toBeInTheDocument()
      expect(screen.getByText('Subject')).toBeInTheDocument()
      expect(screen.getByText('Body')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Send Email/i })).toBeInTheDocument()
    })
  })

  it('should send email successfully', async () => {
    const mockComm: Communication = {
      communicationId: 'comm-1',
      clientId: 'client-123',
      agentId: 'agent-1',
      channel: 'email',
      toEmail: 'john@example.com',
      subject: 'Test Subject',
      body: 'Test body',
      status: 'queued',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    vi.spyOn(communicationsApi, 'sendCommunication').mockResolvedValue(mockComm)

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compose Email/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Compose Email/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send Email/i })).toBeInTheDocument()
    })

    // The toEmail field should be pre-filled with client's email
    // Fill subject and body
    const subjectInput = screen.getByRole('textbox', { name: '' }) || screen.getAllByRole('textbox')[1]
    // Use more specific selectors
    const inputs = screen.getAllByRole('textbox')
    const emailInput = inputs[0]
    const subInput = inputs[1]

    await user.clear(emailInput)
    await user.type(emailInput, 'john@example.com')
    await user.type(subInput, 'Test Subject')

    const textareas = document.querySelectorAll('textarea')
    await user.type(textareas[0], 'Test body')

    await user.click(screen.getByRole('button', { name: /Send Email/i }))

    await waitFor(() => {
      expect(communicationsApi.sendCommunication).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'client-123',
        channel: 'email',
        subject: 'Test Subject',
        body: 'Test body',
      }))
    })
  })

  it('should show Verify Client (KYC) button for unverified clients', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Verify Client \(KYC\)/i })).toBeInTheDocument()
    })
  })

  it('should not show Verify button for verified clients', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue({
      ...mockClient,
      identityVerificationStatus: 'verified',
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Verify Client/i })).not.toBeInTheDocument()
  })

  it('should show error when client not found', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(404, 'not_found', 'Client not found')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Client not found')).toBeInTheDocument()
    })
  })

  it('should call logout on 401 error', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })
})
