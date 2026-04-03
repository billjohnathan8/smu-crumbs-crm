import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import { ResetPasswordPage } from '../ResetPasswordPage'

const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams('?token=valid-test-token')
let mockLocationState: unknown = {}

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
  useLocation: () => ({ state: mockLocationState }),
}))

describe('ResetPasswordPage', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams('?token=valid-test-token')
    mockLocationState = {}
  })

  const renderComponent = () =>
    render(
      <ThemeProvider>
        <ResetPasswordPage />
      </ThemeProvider>
    )

  it('renders reset form when token exists', () => {
    renderComponent()
    expect(screen.getByTestId('new-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('reset-password-submit-button')).toBeInTheDocument()
  })

  it('renders request-link form when token is missing', () => {
    mockSearchParams = new URLSearchParams('')
    renderComponent()

    expect(screen.getByTestId('reset-email-input')).toBeInTheDocument()
    expect(screen.getByTestId('request-reset-link-submit-button')).toBeInTheDocument()
    expect(screen.queryByTestId('new-password-input')).not.toBeInTheDocument()
  })

  it('prefills email from navigation state in request-link mode', () => {
    mockSearchParams = new URLSearchParams('')
    mockLocationState = { email: 'alice@example.com' }
    renderComponent()

    expect(screen.getByTestId('reset-email-input')).toHaveValue('alice@example.com')
  })

  it('validates strong-enough reset password before submit', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'short')
    await user.type(screen.getByTestId('confirm-password-input'), 'short')
    await user.click(screen.getByTestId('reset-password-submit-button'))

    await waitFor(() => {
      expect(screen.getByText(/Password does not meet requirements/i)).toBeInTheDocument()
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requires uppercase and lowercase letters in reset password', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'validpass123!')
    await user.type(screen.getByTestId('confirm-password-input'), 'validpass123!')
    await user.click(screen.getByTestId('reset-password-submit-button'))

    await waitFor(() => {
      expect(screen.getByText(/Password does not meet requirements/i)).toBeInTheDocument()
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits reset-password with token and shows success', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'Validpass123!')
    await user.type(screen.getByTestId('confirm-password-input'), 'Validpass123!')
    await user.click(screen.getByTestId('reset-password-submit-button'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/reset-password',
        expect.objectContaining({ method: 'POST' })
      )
    })
    expect(screen.getByRole('heading', { name: 'Password Reset Successful' })).toBeInTheDocument()
  })

  it('blocks paste into confirm password and requires manual typing', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'Validpass123!')
    await user.click(screen.getByTestId('confirm-password-input'))
    await user.paste('Validpass123!')

    expect(screen.getByTestId('confirm-password-input')).toHaveValue('')
    expect(
      screen.getByText('Please type your confirm password manually. Pasting is not allowed.')
    ).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits forgot-password request when token is missing', async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams('')
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))
    renderComponent()

    await user.type(screen.getByTestId('reset-email-input'), 'test@example.com')
    await user.click(screen.getByTestId('request-reset-link-submit-button'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/forgot-password',
        expect.objectContaining({ method: 'POST' })
      )
    })
    expect(screen.getByRole('heading', { name: 'Check Your Email' })).toBeInTheDocument()
  })

  it('shows validation error when request-link email is blank', async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams('')
    renderComponent()

    await user.type(screen.getByTestId('reset-email-input'), '   ')
    await user.click(screen.getByTestId('request-reset-link-submit-button'))

    expect(screen.getByText('Email is required to request a reset link')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows validation error when request-link email format is invalid', async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams('')
    renderComponent()

    await user.type(screen.getByTestId('reset-email-input'), 'invalid-email')
    await user.click(screen.getByTestId('request-reset-link-submit-button'))

    expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks drop into confirm password and requires manual typing', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'Validpass123!')
    fireEvent.drop(screen.getByTestId('confirm-password-input'))

    expect(
      screen.getByText('Please type your confirm password manually. Pasting is not allowed.')
    ).toBeInTheDocument()
  })

  it('navigates to login from default back-to-login button', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'Back to Login' }))

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('shows mismatch validation error when passwords do not match', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'Validpass123!')
    await user.type(screen.getByTestId('confirm-password-input'), 'Differentpass123!')
    await user.click(screen.getByTestId('reset-password-submit-button'))

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows reset error when reset-password API returns non-OK', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'Validpass123!')
    await user.type(screen.getByTestId('confirm-password-input'), 'Validpass123!')
    await user.click(screen.getByTestId('reset-password-submit-button'))

    await waitFor(() => {
      expect(screen.getByText('Failed to reset password. Please try again.')).toBeInTheDocument()
    })
  })

  it('shows fallback error when forgot-password throws non-Error value', async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams('')
    fetchSpy.mockRejectedValueOnce('network-failure')
    renderComponent()

    await user.type(screen.getByTestId('reset-email-input'), 'test@example.com')
    await user.click(screen.getByTestId('request-reset-link-submit-button'))

    await waitFor(() => {
      expect(screen.getByText('Failed to send reset link. Please try again.')).toBeInTheDocument()
    })
  })

  it('navigates to login from success confirmation screen', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))
    renderComponent()

    await user.type(screen.getByTestId('new-password-input'), 'Validpass123!')
    await user.type(screen.getByTestId('confirm-password-input'), 'Validpass123!')
    await user.click(screen.getByTestId('reset-password-submit-button'))

    await screen.findByRole('heading', { name: 'Password Reset Successful' })
    await user.click(screen.getByRole('button', { name: 'Go to Login' }))

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('navigates to login from check-email confirmation screen', async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams('')
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))
    renderComponent()

    await user.type(screen.getByTestId('reset-email-input'), 'test@example.com')
    await user.click(screen.getByTestId('request-reset-link-submit-button'))

    await screen.findByRole('heading', { name: 'Check Your Email' })
    await user.click(screen.getByRole('button', { name: 'Back to Login' }))

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
