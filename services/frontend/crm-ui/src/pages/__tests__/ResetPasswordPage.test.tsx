import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordPage } from '../ResetPasswordPage' // Adjust this path as needed

const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams('?token=valid-test-token')

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}))

describe('ResetPasswordPage', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to a valid token state before each test
    mockSearchParams = new URLSearchParams('?token=valid-test-token')
  })

  const renderComponent = () => render(<ResetPasswordPage />)

  it('should render the form with password inputs', () => {
    renderComponent()

    expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument()
    expect(screen.getByTestId('new-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('reset-password-submit-button')).toBeInTheDocument()
  })

  it('should disable submit button if token is missing', () => {
    // Override search params for this specific test
    mockSearchParams = new URLSearchParams('')
    renderComponent()

    const submitButton = screen.getByTestId('reset-password-submit-button')
    expect(submitButton).toBeDisabled()
  })

  it('should show validation errors for empty fields', async () => {
    const user = userEvent.setup()
    renderComponent()

    const submitButton = screen.getByTestId('reset-password-submit-button')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('New password is required')).toBeInTheDocument()
      expect(screen.getByText('Please confirm your password')).toBeInTheDocument()
    })
    // Fetch should not be called if validation fails
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('should show validation error if password is too short', async () => {
    const user = userEvent.setup()
    renderComponent()

    const newPasswordInput = screen.getByTestId('new-password-input')
    const confirmPasswordInput = screen.getByTestId('confirm-password-input')
    const submitButton = screen.getByTestId('reset-password-submit-button')

    await user.type(newPasswordInput, 'short')
    await user.type(confirmPasswordInput, 'short')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters long')).toBeInTheDocument()
    })
  })

  it('should show validation error if passwords do not match', async () => {
    const user = userEvent.setup()
    renderComponent()

    const newPasswordInput = screen.getByTestId('new-password-input')
    const confirmPasswordInput = screen.getByTestId('confirm-password-input')
    const submitButton = screen.getByTestId('reset-password-submit-button')

    await user.type(newPasswordInput, 'ValidPassword123!')
    await user.type(confirmPasswordInput, 'DifferentPassword123!')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('should successfully reset password and show success screen', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    renderComponent()

    const newPasswordInput = screen.getByTestId('new-password-input')
    const confirmPasswordInput = screen.getByTestId('confirm-password-input')
    const submitButton = screen.getByTestId('reset-password-submit-button')

    await user.type(newPasswordInput, 'ValidPassword123!')
    await user.type(confirmPasswordInput, 'ValidPassword123!')
    await user.click(submitButton)

    // 1. Verify API was called with correct payload
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-test-token',
          newPassword: 'ValidPassword123!',
          confirmPassword: 'ValidPassword123!',
        }),
      })
    })

    // 2. Verify success UI appears
    expect(screen.getByRole('heading', { name: 'Password Reset Successful' })).toBeInTheDocument()

    // 3. Verify clicking 'Go to Login' navigates correctly
    const loginButton = screen.getByRole('button', { name: 'Go to Login' })
    await user.click(loginButton)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('should show API error message when fetch fails', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 400 }))

    renderComponent()

    const newPasswordInput = screen.getByTestId('new-password-input')
    const confirmPasswordInput = screen.getByTestId('confirm-password-input')
    const submitButton = screen.getByTestId('reset-password-submit-button')

    await user.type(newPasswordInput, 'ValidPassword123!')
    await user.type(confirmPasswordInput, 'ValidPassword123!')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Failed to reset password.')).toBeInTheDocument()
    })
  })

  it('should navigate to login when clicking "Back to Login"', async () => {
    const user = userEvent.setup()
    renderComponent()

    const backLink = screen.getByRole('button', { name: 'Back to Login' })
    await user.click(backLink)

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})