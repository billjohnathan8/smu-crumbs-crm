import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { UnauthorizedPage } from '../UnauthorizedPage'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('UnauthorizedPage', () => {
  it('renders access denied content', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument()
    expect(screen.getByText('You do not have permission to access this page.')).toBeInTheDocument()
  })

  it('navigates to root dashboard from primary action', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Go to Dashboard' }))
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('navigates to login from secondary action', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Return to Login' }))
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
