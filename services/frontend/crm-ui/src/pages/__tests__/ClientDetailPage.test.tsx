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

  it('shows verification upload form when verify is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Submit for KYC Verification/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Submit for KYC Verification/i }))

    await waitFor(() => {
      expect(screen.getByText('KYC Verification')).toBeInTheDocument()
      expect(screen.getByText('Primary Identity Document')).toBeInTheDocument()
      expect(screen.getByText('Proof of Address Document')).toBeInTheDocument()
    })
  })

  it('validates required verification documents before submit', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Submit for KYC Verification/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Submit for KYC Verification/i }))
    await user.click(screen.getByRole('button', { name: /Submit for Review/i }))

    await waitFor(() => {
      expect(screen.getByText('Please upload both required documents.')).toBeInTheDocument()
    })
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
})
