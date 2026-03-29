import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordPage } from '../ForgotPasswordPage' // Adjust path if necessary

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

describe('ForgotPasswordPage', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    vi.clearAllMocks()
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

    // Ensure native fetch was not called
    expect(fetchSpy).not.toHaveBeenCalled()
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

    // Mock successful native fetch resolution
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    // 1. Verify global fetch was called with the correct URL and payload
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    })

    // 2. Verify UI changes to success state
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Check Your Email' })).toBeInTheDocument()
      expect(screen.queryByTestId('email-input')).not.toBeInTheDocument()
    })

    // 3. Verify the "Back to Login" button on the success screen navigates properly
    const backButton = screen.getByRole('button', { name: 'Back to Login' })
    await user.click(backButton)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('should show error message when fetch response is not ok (e.g., 400)', async () => {
    const user = userEvent.setup()

    // Simulate a 400 Bad Request. In your component, !response.ok throws an Error.
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 400 }))

    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Failed to send reset link.')).toBeInTheDocument()
    })
  })

  it('should show fallback error message on severe network failure', async () => {
    const user = userEvent.setup()

    // Simulate a hard network crash where fetch itself rejects
    fetchSpy.mockRejectedValueOnce(new Error('Network Down'))

    renderComponent()

    const emailInput = screen.getByTestId('email-input')
    const submitButton = screen.getByTestId('forgot-password-submit-button')

    await user.type(emailInput, 'test@example.com')
    await user.click(submitButton)

    await waitFor(() => {
      // Because your component catch block does `setGeneralError(err.message || ...)`,
      // it should display the error's message.
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
