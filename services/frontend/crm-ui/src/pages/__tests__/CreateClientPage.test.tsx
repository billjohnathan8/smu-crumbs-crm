import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { CreateClientPage } from '../CreateClientPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as clientsApi from '@/api/clients'
import { ApiError } from '@/api/client'
import type { Client } from '@/api/types'

vi.mock('@/api/clients')

const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'John', lastName: 'Doe', role: 'user' },
    logout: mockLogout,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('CreateClientPage', () => {
  const getInput = (name: string) => {
    const field = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null
    if (!field) {
      throw new Error(`Input not found: ${name}`)
    }
    return field
  }

  const getSelect = (name: string) => {
    const field = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement | null
    if (!field) {
      throw new Error(`Select not found: ${name}`)
    }
    return field
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderComponent = () => {
    return render(
      <ThemeProvider>
        <BrowserRouter>
          <CreateClientPage />
        </BrowserRouter>
      </ThemeProvider>
    )
  }

  // Helper to fill form with valid data
  const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(getInput('firstName'), 'John')
    await user.type(getInput('lastName'), 'Doe')
    await user.type(getInput('emailAddress'), 'john@example.com')
    await user.type(getInput('phoneNumber'), '+6588888888')
    await user.type(getInput('address'), '123 Main St')
    await user.type(getInput('city'), 'Singapore')
    await user.type(getInput('state'), 'Central')
    await user.selectOptions(getSelect('country'), 'Singapore')
    await user.type(getInput('postalCode'), '123456')

    // Fill date of birth (20 years old - valid)
    const dobInput = screen.getByLabelText(/Date of Birth/i)
    const twentyYearsAgo = new Date()
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20)
    const dobValue = twentyYearsAgo.toISOString().split('T')[0]
    await user.type(dobInput, dobValue)
  }

  it('should render the create client form', () => {
    renderComponent()

    expect(screen.getByRole('heading', { name: /Create Client/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create Client/i })).toBeInTheDocument()
  })

  it('should show validation errors for empty required fields', async () => {
    const user = userEvent.setup()
    renderComponent()

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument()
      expect(screen.getByText('Last name is required')).toBeInTheDocument()
      expect(screen.getByText('Date of birth is required')).toBeInTheDocument()
      expect(screen.getByText('Email is required')).toBeInTheDocument()
      expect(screen.getByText('Phone number is required')).toBeInTheDocument()
      expect(screen.getByText('Address is required')).toBeInTheDocument()
    })
  })

  it('should show validation error for client younger than 18', async () => {
    const user = userEvent.setup()
    renderComponent()

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'John')
    await user.type(inputs[1], 'Doe')

    // Set date of birth to 17 years ago
    const dobInput = screen.getByLabelText(/Date of Birth/i)
    const seventeenYearsAgo = new Date()
    seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17)
    const dobValue = seventeenYearsAgo.toISOString().split('T')[0]
    await user.type(dobInput, dobValue)

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Client must be at least 18 years old')).toBeInTheDocument()
    })
  })

  it('should show validation error for client older than 100', async () => {
    const user = userEvent.setup()
    renderComponent()

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'John')
    await user.type(inputs[1], 'Doe')

    // Set date of birth to 101 years ago
    const dobInput = screen.getByLabelText(/Date of Birth/i)
    const overHundred = new Date()
    overHundred.setFullYear(overHundred.getFullYear() - 101)
    const dobValue = overHundred.toISOString().split('T')[0]
    await user.type(dobInput, dobValue)

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Client age cannot exceed 100 years')).toBeInTheDocument()
    })
  })

  it('should accept exactly 18 years old', async () => {
    const user = userEvent.setup()
    renderComponent()

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'John')
    await user.type(inputs[1], 'Doe')

    // Set date of birth to exactly 18 years ago
    const dobInput = screen.getByLabelText(/Date of Birth/i)
    const exactlyEighteen = new Date()
    exactlyEighteen.setFullYear(exactlyEighteen.getFullYear() - 18)
    const dobValue = exactlyEighteen.toISOString().split('T')[0]
    await user.type(dobInput, dobValue)

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByText('Client must be at least 18 years old')).not.toBeInTheDocument()
      expect(screen.queryByText('Client age cannot exceed 100 years')).not.toBeInTheDocument()
    })
  })

  it('should show validation error for invalid email format', async () => {
    const user = userEvent.setup()
    renderComponent()

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'John')
    await user.type(inputs[1], 'Doe')
    await user.type(inputs[2], 'invalidemail') // Invalid email

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    })
  })

  it('should show validation error for invalid phone format', async () => {
    const user = userEvent.setup()
    renderComponent()

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'John')
    await user.type(inputs[1], 'Doe')
    await user.type(inputs[3], '123') // Too short

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(
        screen.getByText('Phone must start with + and contain 10-15 digits (e.g. +6588888888)')
      ).toBeInTheDocument()
    })
  })

  it('should show validation error when postal code does not match selected country format', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.type(getInput('firstName'), 'John')
    await user.type(getInput('lastName'), 'Doe')
    await user.type(getInput('emailAddress'), 'john@example.com')
    await user.type(getInput('phoneNumber'), '+6588888888')
    await user.type(getInput('address'), '123 Main St')
    await user.type(getInput('city'), 'Singapore')
    await user.type(getInput('state'), 'Central')
    await user.selectOptions(getSelect('country'), 'Singapore')
    await user.type(getInput('postalCode'), '62704')

    const dobInput = screen.getByLabelText(/Date of Birth/i)
    const twentyYearsAgo = new Date()
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20)
    const dobValue = twentyYearsAgo.toISOString().split('T')[0]
    await user.type(dobInput, dobValue)

    await user.click(screen.getByRole('button', { name: /Create Client/i }))

    await waitFor(() => {
      expect(screen.getByText(/Postal code must match Singapore format/i)).toBeInTheDocument()
    })
  })

  it('should clear field error when user types in field', async () => {
    const user = userEvent.setup()
    renderComponent()

    // Submit to show errors
    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument()
    })

    // Type in first name field
    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'John')

    // Error should be cleared
    await waitFor(() => {
      expect(screen.queryByText('First name is required')).not.toBeInTheDocument()
    })
  })

  it('should successfully create client and navigate to dashboard', async () => {
    const user = userEvent.setup()
    const mockClient = {
      clientId: '123',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      gender: 'Male' as const,
      emailAddress: 'john@example.com',
      phoneNumber: '+65 1234 5678',
      address: '123 Main St',
      city: 'Singapore',
      state: 'Central',
      country: 'Singapore',
      postalCode: '123456',
      identityVerificationStatus: 'unverified' as const,
      createdAt: '2024-01-01T00:00:00Z',
    }

    vi.spyOn(clientsApi, 'createClient').mockResolvedValue(mockClient)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(clientsApi.createClient).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/user', {
        replace: true,
        state: {
          successMessage: 'Client John Doe created successfully',
        },
      })
    })
  })

  it('should call logout when clicking logout button', async () => {
    const user = userEvent.setup()
    renderComponent()

    const logoutButton = screen.getByRole('button', { name: /Logout/i })
    await user.click(logoutButton)

    expect(mockLogout).toHaveBeenCalled()
  })

  it('should navigate to dashboard when clicking cancel button', async () => {
    const user = userEvent.setup()
    renderComponent()

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith('/user/clients')
  })

  it('should call logout on 401 error', async () => {
    const user = userEvent.setup()
    const apiError = new ApiError(401, 'unauthorized', 'Unauthorized')

    vi.spyOn(clientsApi, 'createClient').mockRejectedValue(apiError)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should display API error for duplicate email (409)', async () => {
    const user = userEvent.setup()
    const apiError = new ApiError(409, 'conflict', 'Email address already exists.')

    vi.spyOn(clientsApi, 'createClient').mockRejectedValue(apiError)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Email address already exists.')).toBeInTheDocument()
    })
  })

  it('should display API error for validation error (422)', async () => {
    const user = userEvent.setup()
    const apiError = new ApiError(422, 'validation_error', 'Invalid data')

    vi.spyOn(clientsApi, 'createClient').mockRejectedValue(apiError)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(
        screen.getByText(
          'Please fix the highlighted fields: first/last name (2-50 letters), phone (+10-15 digits), and address fields (required lengths).'
        )
      ).toBeInTheDocument()
    })
  })

  it('should display generic API error for other status codes', async () => {
    const user = userEvent.setup()
    const apiError = new ApiError(500, 'internal_error', 'Server error')

    vi.spyOn(clientsApi, 'createClient').mockRejectedValue(apiError)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('should display generic error for non-ApiError exceptions', async () => {
    const user = userEvent.setup()
    const genericError = new Error('Network error')

    vi.spyOn(clientsApi, 'createClient').mockRejectedValue(genericError)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  it('should disable form fields while submitting', async () => {
    const user = userEvent.setup()

    // Create a promise that we can resolve manually
    let resolveCreate!: (value: Client) => void
    const createPromise = new Promise<Client>(resolve => {
      resolveCreate = resolve
    })

    vi.spyOn(clientsApi, 'createClient').mockReturnValue(createPromise)

    renderComponent()
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', { name: /Create Client/i })
    await user.click(submitButton)

    // Check button shows "Creating..." and is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Creating.../i })).toBeDisabled()
    })

    // Resolve the promise to complete the test
    resolveCreate({
      clientId: '123',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      gender: 'Male',
      emailAddress: 'john@example.com',
      phoneNumber: '+65 1234 5678',
      address: '123 Main St',
      city: 'Singapore',
      state: 'Central',
      country: 'Singapore',
      postalCode: '123456',
      identityVerificationStatus: 'unverified' as const,
      createdAt: '2024-01-01T00:00:00Z',
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/user', {
        replace: true,
        state: {
          successMessage: 'Client John Doe created successfully',
        },
      })
    })
  })
})
