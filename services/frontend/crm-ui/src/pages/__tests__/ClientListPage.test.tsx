import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientListPage } from '../ClientListPage' // Adjust path if necessary
import * as clientsApi from '@/api/clients'
import { ApiError } from '@/api/client'
import { useAuth } from '@/features/auth/AuthContext'

// 1. Mock React Router
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// 2. Mock Auth Context
const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// 3. Mock API
vi.mock('@/api/clients', () => ({
  listClients: vi.fn(),
}))

// 4. Mock the ClientTable to keep the DOM clean and focus on Page logic
vi.mock('@/components/ClientTable', () => ({
  ClientTable: ({ clients, onView }: any) => (
    <div data-testid="mock-client-table">
      {clients.map((client: any) => (
        <div key={client.clientId} data-testid={`client-row-${client.clientId}`}>
          {client.firstName} {client.lastName}
          <button 
            onClick={() => onView(client.clientId)}
            data-testid={`view-btn-${client.clientId}`}
          >
            View
          </button>
        </div>
      ))}
    </div>
  ),
}))

// 5. Mock SidebarLayout to bypass complex UI wrappers
vi.mock('@/components/SidebarDrawer', () => ({
  SidebarLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-layout">{children}</div>
  ),
}))

const mockClientsData = [
  { clientId: 'client-1', firstName: 'John', lastName: 'Doe', emailAddress: 'john@example.com' },
  { clientId: 'client-2', firstName: 'Jane', lastName: 'Smith', emailAddress: 'jane@example.com' },
]

describe('ClientListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock setup: Logged in as User
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-123', role: 'user', firstName: 'User', lastName: 'Smith' },
      logout: mockLogout,
    } as any)

    // Default API response
    vi.mocked(clientsApi.listClients).mockResolvedValue({
      data: mockClientsData as any,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
  })

  const renderComponent = () => render(<ClientListPage />)

  it('should render correct title and base paths for an User', async () => {
    renderComponent()

    // User should see "My Clients"
    expect(screen.getByRole('heading', { name: 'My Clients', level: 1 })).toBeInTheDocument()

    // Verify New Client navigation path uses /user
    const newClientBtn = screen.getByRole('button', { name: /\+ New Client/i })
    await userEvent.click(newClientBtn)
    expect(mockNavigate).toHaveBeenCalledWith('/user/clients/new')
  })

  it('should render correct title and base paths for an Admin', async () => {
    // Override auth mock for Admin
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin-123', role: 'admin', firstName: 'Admin', lastName: 'User' },
      logout: mockLogout,
    } as any)

    renderComponent()

    // Admin should see "All Clients"
    expect(screen.getByRole('heading', { name: 'All Clients', level: 1 })).toBeInTheDocument()

    // Verify New Client navigation path uses /admin
    const newClientBtn = screen.getByRole('button', { name: /\+ New Client/i })
    await userEvent.click(newClientBtn)
    expect(mockNavigate).toHaveBeenCalledWith('/admin/clients/new')
  })

  it('should fetch and display clients on mount', async () => {
    renderComponent()

    // Initially shows spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

    await waitFor(() => {
      // Spinner disappears, table appears
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
      expect(screen.getByTestId('mock-client-table')).toBeInTheDocument()
      
      // Verify API was called with default pagination
      expect(clientsApi.listClients).toHaveBeenCalledWith({ limit: 20, offset: 0, q: undefined })
    })

    // Total count displays correctly
    expect(screen.getByText('2 clients')).toBeInTheDocument()
  })

  it('should pass correct view path to ClientTable based on role', async () => {
    renderComponent() // Default is User

    await waitFor(() => {
      expect(screen.getByTestId('view-btn-client-1')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByTestId('view-btn-client-1'))
    
    // User navigates to /user/clients/:id
    expect(mockNavigate).toHaveBeenCalledWith('/user/clients/client-1')
  })

  it('should handle search functionality', async () => {
    const user = userEvent.setup()
    renderComponent()

    const searchInput = screen.getByPlaceholderText(/Search by name/i)
    const searchBtn = screen.getByRole('button', { name: 'Search' })

    // Type and search
    await user.type(searchInput, 'John')
    await user.click(searchBtn)

    await waitFor(() => {
      // API should be called again with the query string 'John'
      expect(clientsApi.listClients).toHaveBeenCalledWith({ limit: 20, offset: 0, q: 'John' })
    })
  })

  it('should clear search and reset to page 0', async () => {
    const user = userEvent.setup()
    renderComponent()

    const searchInput = screen.getByPlaceholderText(/Search by name/i)
    const searchBtn = screen.getByRole('button', { name: 'Search' })

    await user.type(searchInput, 'Jane')
    await user.click(searchBtn)

    // Wait for the clear button to appear
    const clearBtn = await screen.findByRole('button', { name: 'Clear' })
    
    // Click clear
    await user.click(clearBtn)

    await waitFor(() => {
      // Search input should be empty
      expect(searchInput).toHaveValue('')
      // API called without 'q'
      expect(clientsApi.listClients).toHaveBeenCalledWith({ limit: 20, offset: 0, q: undefined })
    })
  })

  it('should handle pagination (Next and Previous)', async () => {
    // Mock API to return 45 total clients (3 pages)
    vi.mocked(clientsApi.listClients).mockResolvedValue({
      data: mockClientsData as any,
      pagination: { limit: 20, offset: 0, total: 45 },
    })

    const user = userEvent.setup()
    renderComponent()

    // Wait for pagination controls to render
    const nextBtn = await screen.findByRole('button', { name: 'Next' })
    const prevBtn = screen.getByRole('button', { name: 'Previous' })

    // Initially, Previous should be disabled
    expect(prevBtn).toBeDisabled()

    // Click Next
    await user.click(nextBtn)

    await waitFor(() => {
      // Offset should be 20 (Page 2)
      expect(clientsApi.listClients).toHaveBeenCalledWith({ limit: 20, offset: 20, q: undefined })
      expect(screen.getByText(/Page 2 of 3/i)).toBeInTheDocument()
    })

    // Now Previous should be enabled
    expect(prevBtn).not.toBeDisabled()

    // Click Previous
    await user.click(prevBtn)

    await waitFor(() => {
      // Offset should be 0 (Page 1)
      expect(clientsApi.listClients).toHaveBeenCalledWith({ limit: 20, offset: 0, q: undefined })
    })
  })

  it('should log user out on 401 Unauthorized API error', async () => {
    vi.mocked(clientsApi.listClients).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should display correct 403 error for User', async () => {
    vi.mocked(clientsApi.listClients).mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to view this client list.')).toBeInTheDocument()
    })
  })

  it('should display correct 403 error for Admin', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin-1', role: 'admin' },
      logout: mockLogout,
    } as any)

    vi.mocked(clientsApi.listClients).mockRejectedValue(
      new ApiError(403, 'forbidden', 'Forbidden')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('You are not allowed to access this page.')).toBeInTheDocument()
    })
  })

  it('should log user out when Logout button is clicked', async () => {
    const user = userEvent.setup()
    renderComponent()

    const logoutBtn = screen.getByRole('button', { name: 'Logout' })
    await user.click(logoutBtn)

    expect(mockLogout).toHaveBeenCalled()
  })
})