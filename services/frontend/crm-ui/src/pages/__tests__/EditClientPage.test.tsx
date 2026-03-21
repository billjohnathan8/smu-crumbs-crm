import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { EditClientPage } from '../EditClientPage'
import * as clientsApi from '@/api/clients'
import { ApiError } from '@/api/client'
import type { Client } from '@/api/types'

vi.mock('@/api/clients')

const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'John', lastName: 'Doe', role: 'user' },
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

describe('UserEditClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(clientsApi, 'getClientById').mockResolvedValue(mockClient)
  })

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <EditClientPage />
      </BrowserRouter>
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
})
