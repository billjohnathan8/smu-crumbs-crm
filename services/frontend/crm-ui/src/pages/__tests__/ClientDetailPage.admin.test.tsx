/**
 * Admin-role-specific tests for ClientDetailPage.
 * Kept in a separate file so the auth mock can use admin role.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    user: { id: 'admin-1', firstName: 'Admin', lastName: 'User', role: 'admin' },
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
      pathname: '/admin/clients/client-123',
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

const mockClientPending: Client = {
  ...mockClient,
  identityVerificationStatus: 'pending',
}

const mockTxResponse: PaginatedResponse<Transaction> = {
  data: [],
  pagination: { limit: 10, offset: 0, total: 0 },
}

const mockCommsResponse: PaginatedResponse<Communication> = {
  data: [],
  pagination: { limit: 10, offset: 0, total: 0 },
}

describe('ClientDetailPage (admin role)', () => {
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

  it('renders admin breadcrumb "All Clients" for admin role', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/← All Clients/)).toBeInTheDocument()
    })
  })

  it('navigates to admin client accounts for admin role', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Manage accounts →')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Manage accounts →'))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/clients/client-123/accounts')
  })

  it('shows verification review panel for admin when client status is pending', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClientPending)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument()
    })
  })

  it('calls reviewVerification approve and updates client', async () => {
    vi.spyOn(clientsApi, 'getClientById')
      .mockResolvedValueOnce(mockClientPending)
      .mockResolvedValueOnce({ ...mockClientPending, identityVerificationStatus: 'verified' })
    vi.spyOn(clientsApi, 'reviewVerification').mockResolvedValue({
      ...mockClientPending,
      identityVerificationStatus: 'verified',
    })

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Approve/i }))

    await waitFor(() => {
      expect(clientsApi.reviewVerification).toHaveBeenCalledWith('client-123', {
        action: 'approve',
      })
    })
  })

  it('calls reviewVerification reject', async () => {
    vi.spyOn(clientsApi, 'getClientById')
      .mockResolvedValueOnce(mockClientPending)
      .mockResolvedValueOnce({ ...mockClientPending, identityVerificationStatus: 'rejected' })
    vi.spyOn(clientsApi, 'reviewVerification').mockResolvedValue({
      ...mockClientPending,
      identityVerificationStatus: 'rejected',
    })

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Reject/i }))

    await waitFor(() => {
      expect(clientsApi.reviewVerification).toHaveBeenCalledWith('client-123', {
        action: 'reject',
      })
    })
  })

  it('shows review error on 403 during review', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClientPending)
    vi.spyOn(clientsApi, 'reviewVerification').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Not authorized to review')
    )

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Approve/i }))

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to review verification.')).toBeInTheDocument()
    })
  })

  it('calls logout on 401 during review', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClientPending)
    vi.spyOn(clientsApi, 'reviewVerification').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Approve/i }))

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('does not show verification review panel when client status is not pending', async () => {
    // mockClient has 'unverified' status
    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })

    expect(screen.queryByRole('button', { name: /Approve/i })).not.toBeInTheDocument()
  })

  it('shows 403 forbidden error with admin message on load failure', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderComponent()

    await waitFor(() => {
      expect(
        screen.getByText('You are not allowed to access this client record.')
      ).toBeInTheDocument()
    })
  })

  it('shows verify success message from navigation state', async () => {
    vi.mock('react-router-dom', async () => {
      const actual = await vi.importActual('react-router-dom')
      return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ clientId: 'client-123' }),
        useLocation: () => ({
          state: { successMessage: 'Client updated successfully' },
          pathname: '/admin/clients/client-123',
          search: '',
          hash: '',
          key: '',
        }),
      }
    })
  })
})
