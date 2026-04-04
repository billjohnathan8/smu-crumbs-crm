import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { EditClientPage } from '../EditClientPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as clientsApi from '@/api/clients'
import * as usersApi from '@/api/users'
import { ApiError } from '@/api/client'
import type { Client } from '@/api/types'

vi.mock('@/api/clients')
vi.mock('@/api/users')

const mockLogout = vi.fn()
const mockAuthUser: {
  id: string
  firstName: string
  lastName: string
  role: 'user' | 'admin' | 'super_admin'
} = { id: '1', firstName: 'John', lastName: 'Doe', role: 'user' }
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
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
  assignedUserId: 'agent-1',
  createdAt: '2024-01-01T00:00:00Z',
}

describe('UserEditClient', () => {
  const getCountrySelect = () => {
    const field = document.querySelector('select[name="country"]') as HTMLSelectElement | null
    if (!field) {
      throw new Error('Country select not found')
    }
    return field
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = '1'
    mockAuthUser.firstName = 'John'
    mockAuthUser.lastName = 'Doe'
    mockAuthUser.role = 'user'
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClient)
  })

  const renderComponent = () =>
    render(
      <ThemeProvider>
        <BrowserRouter>
          <EditClientPage />
        </BrowserRouter>
      </ThemeProvider>
    )

  it('should render the edit form with client data pre-filled', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Edit Client/i })).toBeInTheDocument()
    })

    const firstNameInput = screen.getByDisplayValue('John')
    expect(firstNameInput).toBeInTheDocument()

    const lastNameInput = screen.getByDisplayValue('Doe')
    expect(lastNameInput).toBeInTheDocument()
  })

  it('should show loading state initially', () => {
    vi.spyOn(clientsApi, 'getClientById').mockReturnValue(new Promise(() => {}))
    renderComponent()

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('should show error when client load fails', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(404, 'not_found', 'Client not found')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Client not found')).toBeInTheDocument()
    })
  })

  it('should show validation errors for empty required fields', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    // Clear first name
    const firstNameInput = screen.getByDisplayValue('John')
    await user.clear(firstNameInput)

    const submitButton = screen.getByRole('button', { name: /Save Changes/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument()
    })
  })

  it('should successfully update client and navigate back', async () => {
    vi.spyOn(clientsApi, 'updateClient').mockResolvedValue({
      ...mockClient,
      firstName: 'Jane',
    })

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    const firstNameInput = screen.getByDisplayValue('John')
    await user.clear(firstNameInput)
    await user.type(firstNameInput, 'Jane')

    const submitButton = screen.getByRole('button', { name: /Save Changes/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(clientsApi.updateClient).toHaveBeenCalledWith(
        'client-123',
        expect.objectContaining({
          firstName: 'Jane',
        })
      )
      expect(mockNavigate).toHaveBeenCalledWith('/user/clients/client-123', {
        state: { successMessage: 'Client updated successfully' },
      })
    })
  })

  it('should navigate back when cancel is clicked', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith('/user/clients/client-123')
  })

  it('should call logout on 401 error during update', async () => {
    vi.spyOn(clientsApi, 'updateClient').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: /Save Changes/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should call logout on 401 error during initial load', async () => {
    vi.spyOn(clientsApi, 'getClientById').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should show error for duplicate email (409)', async () => {
    vi.spyOn(clientsApi, 'updateClient').mockRejectedValue(
      new ApiError(409, 'conflict', 'Conflict')
    )

    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: /Save Changes/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('A client with this email already exists')).toBeInTheDocument()
    })
  })

  it('should show validation errors for invalid email and phone formats', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument()
    })

    const emailInput = screen.getByDisplayValue('john@example.com')
    const phoneInput = screen.getByDisplayValue('+65 1234 5678')
    await user.clear(emailInput)
    await user.type(emailInput, 'invalid-email')
    await user.clear(phoneInput)
    await user.type(phoneInput, '123')
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
      expect(screen.getByText('Invalid phone format (min 8 digits)')).toBeInTheDocument()
    })
  })

  it('should show validation error when postal code does not match selected country', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('123456')).toBeInTheDocument()
    })

    await user.selectOptions(getCountrySelect(), 'Singapore')
    const postalInput = screen.getByDisplayValue('123456')
    await user.clear(postalInput)
    await user.type(postalInput, '62704')
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText(/Postal code must match Singapore format/i)).toBeInTheDocument()
    })
  })

  it('should validate date of birth age boundaries', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('1990-01-15')).toBeInTheDocument()
    })

    const dateInput = screen.getByDisplayValue('1990-01-15')
    const underageYear = new Date().getFullYear() - 10
    await user.clear(dateInput)
    await user.type(dateInput, `${underageYear}-01-01`)
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText('Client must be at least 18 years old')).toBeInTheDocument()
    })

    await user.clear(dateInput)
    await user.type(dateInput, '1900-01-01')
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText('Client age cannot exceed 100 years')).toBeInTheDocument()
    })
  })

  it('should show specific update error for 422 responses', async () => {
    const user = userEvent.setup()

    vi.spyOn(clientsApi, 'updateClient').mockRejectedValue(
      new ApiError(422, 'validation_error', 'Validation failed')
    )
    renderComponent()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Changes/i }))
    await waitFor(() => {
      expect(
        screen.getByText('Invalid data provided. Please check your inputs.')
      ).toBeInTheDocument()
    })
  })

  it('should show generic update error for unexpected failures', async () => {
    const user = userEvent.setup()
    vi.spyOn(clientsApi, 'updateClient').mockRejectedValue(new Error('boom'))

    renderComponent()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Changes/i }))
    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  it('should show generic ApiError message for other status codes (e.g. 500)', async () => {
    vi.spyOn(clientsApi, 'updateClient').mockRejectedValue(
      new ApiError(500, 'server_error', 'Service unavailable')
    )
    const user = userEvent.setup()
    renderComponent()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Changes/i }))
    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument()
    })
  })

  it('should show validation error for missing last name', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
    })

    const lastNameInput = screen.getByDisplayValue('Doe')
    await user.clear(lastNameInput)
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText('Last name is required')).toBeInTheDocument()
    })
  })

  it('should show validation error for missing date of birth', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('1990-01-15')).toBeInTheDocument()
    })

    const dobInput = screen.getByDisplayValue('1990-01-15')
    await user.clear(dobInput)
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText('Date of birth is required')).toBeInTheDocument()
    })
  })

  it('should clear field error when user types in the field', async () => {
    renderComponent()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
    })

    const firstNameInput = screen.getByDisplayValue('John')
    await user.clear(firstNameInput)
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument()
    })

    await user.type(firstNameInput, 'Jane')

    await waitFor(() => {
      expect(screen.queryByText('First name is required')).not.toBeInTheDocument()
    })
  })

  it('should allow root admin to reassign assigned agent on update', async () => {
    mockAuthUser.id = 'usr_1'
    mockAuthUser.role = 'admin'

    vi.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [
        {
          id: 'agent-1',
          firstName: 'Current',
          lastName: 'Agent',
          email: 'current.agent@example.com',
          role: 'user',
          status: 'active',
        },
        {
          id: 'agent-2',
          firstName: 'Next',
          lastName: 'Agent',
          email: 'next.agent@example.com',
          role: 'user',
          status: 'active',
        },
      ],
      pagination: { limit: 200, offset: 0, total: 2 },
    })
    vi.spyOn(clientsApi, 'updateClient').mockResolvedValue({
      ...mockClient,
      assignedUserId: 'agent-2',
    })

    renderComponent()
    const user = userEvent.setup()

    const assignedAgentSelect = () =>
      document.querySelector('select[name="assignedUserId"]') as HTMLSelectElement | null

    await waitFor(() => {
      expect(assignedAgentSelect()).not.toBeNull()
    })

    await user.selectOptions(assignedAgentSelect() as HTMLSelectElement, 'agent-2')
    await user.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(clientsApi.updateClient).toHaveBeenCalledWith(
        'client-123',
        expect.objectContaining({ assignedUserId: 'agent-2' })
      )
    })
  })
})
