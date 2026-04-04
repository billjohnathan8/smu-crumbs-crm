import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SidebarLayout, type NavItem } from '../SidebarDrawer'

const mockNavigate = vi.fn()
const mockLogout = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}))

vi.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ theme: 'light' }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const navItems: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'Clients', to: '/admin/clients' },
]

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <SidebarLayout items={navItems}>
        <div>content</div>
      </SidebarLayout>
    </MemoryRouter>
  )
}

describe('SidebarDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nav links and logs out to login route', async () => {
    const user = userEvent.setup()
    renderSidebar()

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/admin/clients')

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('toggles collapsed state from header button', async () => {
    const user = userEvent.setup()
    renderSidebar()

    expect(screen.getByAltText('ScroogeBank')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '←' }))
    expect(screen.queryByAltText('ScroogeBank')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '☰' }))
    expect(screen.getByAltText('ScroogeBank')).toBeInTheDocument()
  })

  it('hides and shows header based on scroll direction', () => {
    const { container } = renderSidebar()
    const header = container.querySelector('header')
    expect(header).toBeTruthy()

    Object.defineProperty(window, 'scrollY', { value: 0, writable: true })
    fireEvent.scroll(window)
    expect(header?.className).toContain('translate-y-0')

    Object.defineProperty(window, 'scrollY', { value: 100, writable: true })
    fireEvent.scroll(window)
    expect(header?.className).toContain('-translate-y-full')

    Object.defineProperty(window, 'scrollY', { value: 40, writable: true })
    fireEvent.scroll(window)
    expect(header?.className).toContain('translate-y-0')

    Object.defineProperty(window, 'scrollY', { value: 5, writable: true })
    fireEvent.scroll(window)
    expect(header?.className).toContain('translate-y-0')
  })
})
