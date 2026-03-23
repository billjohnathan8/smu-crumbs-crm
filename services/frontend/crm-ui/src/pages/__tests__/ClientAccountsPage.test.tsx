import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { ClientAccountsPage } from '../ClientAccountsPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as clientsApi from '@/api/clients'
import { ApiError } from '@/api/client'
import type { Client, Account } from '@/api/types'

vi.mock('@/api/clients')

const mockLogout = vi.fn()
let mockRole: 'user' | 'admin' | 'super_admin' = 'user'
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'John', lastName: 'Doe', role: mockRole },
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
  identityVerificationStatus: 'verified',
  createdAt: '2024-01-01T00:00:00Z',
}

const mockAccounts: Account[] = [
  {
    accountId: 'account-001-xxxx-yyyy',
    clientId: 'client-123',
    accountType: 'Savings',
    accountStatus: 'Active',
    openingDate: '2024-01-01',
    initialDeposit: 1000,
    currency: 'SGD',
    branchId: 'branch-001',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    accountId: 'account-002-xxxx-yyyy',
    clientId: 'client-123',
    accountType: 'Checking',
    accountStatus: 'Pending',
    openingDate: '2024-02-01',
    initialDeposit: 500,
    currency: 'SGD',
    branchId: 'branch-002',
    createdAt: '2024-02-01T00:00:00Z',
  },
]

describe('ClientAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRole = 'user'
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClient)
    vi.spyOn(clientsApi, 'listClientAccounts').mockResolvedValue(mockAccounts)
  })

  const renderComponent = () =>
    render(
      <ThemeProvider>
        <BrowserRouter>
          <ClientAccountsPage />
        </BrowserRouter>
      </ThemeProvider>
    )

  it('should render the accounts page with header', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Bank Accounts/i })).toBeInTheDocument()
    })
  })

  it('should show loading state initially', () => {
    vi.spyOn(clientsApi, 'getClientById').mockReturnValue(new Promise(() => {}))
    renderComponent()

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('should display accounts in a table', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Savings')).toBeInTheDocument()
      expect(screen.getByText('Checking')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('should show empty state when no accounts exist', async () => {
    vi.spyOn(clientsApi, 'listClientAccounts').mockResolvedValue([])
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No accounts found for this client.')).toBeInTheDocument()
    })
  })

  it('should open create account modal when button is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('+ New Account')).toBeInTheDocument()
    })

    await user.click(screen.getByText('+ New Account'))

    await waitFor(() => {
      const modal = screen.getByTestId('account-modal')
      expect(modal).toBeInTheDocument()
      expect(within(modal).getByRole('heading', { name: /Create Account/i })).toBeInTheDocument()
    })
  })

  it('should create account successfully', async () => {
    const newAccount: Account = {
      accountId: 'account-new',
      clientId: 'client-123',
      accountType: 'Savings',
      accountStatus: 'Active',
      openingDate: '2024-03-01',
      initialDeposit: 2000,
      currency: 'SGD',
      branchId: 'branch-003',
      createdAt: '2024-03-01T00:00:00Z',
    }
    vi.spyOn(clientsApi, 'createAccount').mockResolvedValue(newAccount)

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('+ New Account')).toBeInTheDocument()
    })

    await user.click(screen.getByText('+ New Account'))

    await waitFor(() => {
      expect(screen.getByTestId('account-modal')).toBeInTheDocument()
    })

    // Fill branch ID
    const branchInput = screen.getByDisplayValue('')
    await user.type(branchInput, 'branch-003')

    // Submit
    await user.click(screen.getByRole('button', { name: /Create Account/i }))

    await waitFor(() => {
      expect(clientsApi.createAccount).toHaveBeenCalled()
    })
  })

  it('should open edit modal when Edit button is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Edit')).toHaveLength(2)
    })

    await user.click(screen.getAllByText('Edit')[0])

    await waitFor(() => {
      expect(screen.getByTestId('account-modal')).toBeInTheDocument()
      expect(screen.getByText('Edit Account')).toBeInTheDocument()
    })
  })

  it('should open delete confirmation when Delete button is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Delete')).toHaveLength(2)
    })

    await user.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-modal')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Are you sure you want to delete this account? This action cannot be undone.'
        )
      ).toBeInTheDocument()
    })
  })

  it('should delete account successfully', async () => {
    vi.spyOn(clientsApi, 'deleteAccount').mockResolvedValue(undefined)

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Delete')).toHaveLength(2)
    })

    await user.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Delete Account/i }))

    await waitFor(() => {
      expect(clientsApi.deleteAccount).toHaveBeenCalledWith('account-001-xxxx-yyyy')
    })
  })

  it('should show error when load fails', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(500, 'error', 'Server error')
    )
    vi.spyOn(clientsApi, 'listClientAccounts').mockRejectedValue(
      new ApiError(500, 'error', 'Server error')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
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

  it('should show role-specific 403 load errors for user and admin roles', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to access this client.')).toBeInTheDocument()
    })

    mockRole = 'admin'
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to access these accounts.')).toBeInTheDocument()
    })
  })

  it('should validate create account form for required branch id', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('+ New Account')).toBeInTheDocument()
    })

    await user.click(screen.getByText('+ New Account'))
    await user.click(screen.getByRole('button', { name: /Create Account/i }))

    await waitFor(() => {
      expect(screen.getByText('Branch ID is required')).toBeInTheDocument()
    })
  })

  it('should update account successfully in edit mode', async () => {
    vi.spyOn(clientsApi, 'updateAccount').mockResolvedValue({
      ...mockAccounts[0],
      branchId: 'branch-updated',
    })

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Edit')).toHaveLength(2)
    })

    await user.click(screen.getAllByText('Edit')[0])
    await waitFor(() => {
      expect(screen.getByText('Edit Account')).toBeInTheDocument()
    })

    await user.clear(screen.getByDisplayValue('branch-001'))
    await user.type(screen.getByDisplayValue(''), 'branch-updated')
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(clientsApi.updateAccount).toHaveBeenCalledWith('account-001-xxxx-yyyy', {
        accountType: 'Savings',
        accountStatus: 'Active',
        branchId: 'branch-updated',
      })
    })
  })

  it('should show forbidden action error on create account 403', async () => {
    vi.spyOn(clientsApi, 'createAccount').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('+ New Account')).toBeInTheDocument()
    })

    await user.click(screen.getByText('+ New Account'))
    await user.type(screen.getByDisplayValue(''), 'branch-009')
    await user.click(screen.getByRole('button', { name: /Create Account/i }))

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to perform this action.')).toBeInTheDocument()
    })
  })

  it('should show delete errors for forbidden and unexpected failures', async () => {
    vi.spyOn(clientsApi, 'deleteAccount')
      .mockRejectedValueOnce(new ApiError(403, 'forbidden', 'Forbidden'))
      .mockRejectedValueOnce(new Error('boom'))

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Delete')).toHaveLength(2)
    })

    await user.click(screen.getAllByText('Delete')[0])
    await user.click(screen.getByRole('button', { name: /Delete Account/i }))
    await waitFor(() => {
      expect(screen.getByText('You are not allowed to delete this account.')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Cancel/i }))
    await user.click(screen.getAllByText('Delete')[0])
    await user.click(screen.getByRole('button', { name: /Delete Account/i }))
    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })
})
