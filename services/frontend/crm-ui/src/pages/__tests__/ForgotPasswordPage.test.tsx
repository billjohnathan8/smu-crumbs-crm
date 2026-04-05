import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordPage } from '../ForgotPasswordPage' // Adjust path if necessary
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/api/auth', () => ({
  requestPasswordResetLink: vi.fn(),
}))

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authApi.requestPasswordResetLink).mockResolvedValue(undefined)
  })

  const renderComponent = () => render(<ForgotPasswordPage />)

  it('should render the initial form correctly', () => {
    renderComponent()

    expect(screen.getByRole('heading', { name: 'Get back into your account' })).toBeInTheDocument()
    expect(screen.getByTestId('email-input')).toBeInTheDocument()
    expect(screen.getByTestId('forgot-password-submit-button')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Login' })).toBeInTheDocument()
  })

  it('should show validation error for empty email', async () => {
    const user = userEvent.setup()
    renderComponent()

    const submitButton = screen.getByTestId('forgot-password-submit-button')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument()
    })

    expect(authApi.requestPasswordResetLink).not.toHaveBeenCalled()
  })

  it('should show validation error for invalid email format', async () => {
    const user = userEvent.setup()
    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'not-an-email')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    })
  })

  it('should clear validation error when user types', async () => {
    const user = userEvent.setup()
    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    // Trigger error
    await user.click(submitButton)
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument()
    })

    // Type to clear error
    await user.type(emailInput, 'a')
    await waitFor(() => {
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument()
    })
  })

  it('should successfully submit and show success screen', async () => {
    const user = userEvent.setup()

    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(authApi.requestPasswordResetLink).toHaveBeenCalledWith({
        email: 'test@example.com',
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Check Your Email' })).toBeInTheDocument()
      expect(screen.queryByTestId('email-input')).not.toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: 'Back to Login' })
    await user.click(backButton)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('should show error message when API rejects with ApiError', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.requestPasswordResetLink).mockRejectedValueOnce(
      new ApiError(400, 'validation_error', 'Failed to send reset link.')
    )

    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Failed to send reset link.')).toBeInTheDocument()
    })
  })

  it('should show error message on non-ApiError failure', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.requestPasswordResetLink).mockRejectedValueOnce(new Error('Network Down'))

    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Network Down')).toBeInTheDocument()
    })
  })

  it('should navigate to login when clicking "Back to Login" from the main form', async () => {
    const user = userEvent.setup()
    renderComponent()

    const backLink = screen.getByRole('button', { name: 'Back to Login' })
    await user.click(backLink)

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
