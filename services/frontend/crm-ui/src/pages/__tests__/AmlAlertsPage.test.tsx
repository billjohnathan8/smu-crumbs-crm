import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AmlAlertsPage } from '../AmlAlertsPage' // Adjust path as necessary
import * as amlApi from '@/api/aml'
import { ApiError } from '@/api/client'
import { useAuth } from '@/features/auth/AuthContext'
import type { AmlAlert } from '@/api/types'

// 1. Mock Auth Context
const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// 2. Mock API
vi.mock('@/api/aml', () => ({
  listAmlAlerts: vi.fn(),
  updateAmlAlertReview: vi.fn(),
}))

// 3. Mock SidebarLayout to bypass complex UI wrappers
vi.mock('@/components/SidebarDrawer', () => ({
  SidebarLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-layout">{children}</div>
  ),
}))

const mockAlerts: AmlAlert[] = [
  {
    alertId: 'alert-1',
    clientId: 'clt_123',
    alertType: 'STRUCTURING',
    reviewStatus: 'Pending',
    description: 'Multiple deposits just under 10k',
    detectedAt: '2026-03-16T10:00:00Z',
    createdAt: '2026-03-16T10:00:00Z',
    updatedAt: '2026-03-16T10:00:00Z',
  },
  {
    alertId: 'alert-2',
    clientId: 'clt_456',
    alertType: 'PASSTHROUGH',
    reviewStatus: 'Confirmed',
    description: 'Immediate withdrawal after deposit',
    detectedAt: '2026-03-15T10:00:00Z',
    createdAt: '2026-03-15T10:00:00Z',
    updatedAt: '2026-03-15T10:00:00Z',
  },
]

describe('AmlAlertsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock setup: Logged in as Admin
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin-1', role: 'admin', firstName: 'Admin', lastName: 'User' },
      logout: mockLogout,
    } as unknown as ReturnType<typeof useAuth>)

    // Default list API response
    vi.mocked(amlApi.listAmlAlerts).mockResolvedValue({
      data: mockAlerts,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
  })

  const renderComponent = () =>
    render(
      <MemoryRouter>
        <AmlAlertsPage />
      </MemoryRouter>
    )

  it('should render correct dashboard link based on role', () => {
    // 1. Test Admin Role (Default)
    renderComponent()
    const adminLink = screen.getByRole('link', { name: 'Dashboard' })
    expect(adminLink).toHaveAttribute('href', '/admin')

    // 2. Test User Role
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', role: 'user' },
      logout: mockLogout,
    } as unknown as ReturnType<typeof useAuth>)

    renderComponent()
    const userLink = screen.getAllByRole('link', { name: 'Dashboard' })[1] // Get the newly rendered one
    expect(userLink).toHaveAttribute('href', '/user')
  })

  it('should fetch and display alerts on mount', async () => {
    renderComponent()

    // Wait for the data to load and replace the spinner
    await waitFor(() => {
      expect(screen.getByText('alert-1')).toBeInTheDocument()
      expect(screen.getByText('alert-2')).toBeInTheDocument()
    })

    // Verify initial fetch parameters
    expect(amlApi.listAmlAlerts).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      clientId: undefined,
      alertType: undefined,
      reviewStatus: undefined,
    })
  })

  it('should display empty state when no alerts found', async () => {
    vi.mocked(amlApi.listAmlAlerts).mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No AML alerts found')).toBeInTheDocument()
    })
  })

  it('should handle filtering and reset', async () => {
    const user = userEvent.setup()
    renderComponent()

    // Wait for initial load
    await waitFor(() => expect(screen.getByText('alert-1')).toBeInTheDocument())

    // 1. Filter by Client ID
    const clientIdInput = screen.getByPlaceholderText('clt_...')
    await user.type(clientIdInput, 'clt_999')

    // 2. Filter by Alert Type (1st combobox is Alert Type filter)
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'STRUCTURING')

    // 3. Filter by Review Status (2nd combobox is Review Status filter)
    await user.selectOptions(selects[1], 'Pending')

    await waitFor(() => {
      expect(amlApi.listAmlAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'clt_999',
          alertType: 'STRUCTURING',
          reviewStatus: 'Pending',
          offset: 0,
        })
      )
    })

    // 4. Reset Filters
    const resetBtn = screen.getByRole('button', { name: 'Reset Filters' })
    await user.click(resetBtn)

    await waitFor(() => {
      expect(clientIdInput).toHaveValue('')
      expect(amlApi.listAmlAlerts).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        clientId: undefined,
        alertType: undefined,
        reviewStatus: undefined,
      })
    })
  })

  it('should update review status successfully', async () => {
    const user = userEvent.setup()

    // Mock the update API call
    vi.mocked(amlApi.updateAmlAlertReview).mockResolvedValue({
      ...mockAlerts[0],
      reviewStatus: 'Confirmed',
    } as unknown as AmlAlert)

    renderComponent()
    await waitFor(() => expect(screen.getByText('alert-1')).toBeInTheDocument())

    // The first two comboboxes are filters. The third one belongs to the first table row.
    const rowSelects = screen.getAllByRole('combobox')
    const firstRowSelect = rowSelects[2]

    // Change status to Confirmed
    await user.selectOptions(firstRowSelect, 'Confirmed')

    // Click Save on the first row
    const saveButtons = screen.getAllByRole('button', { name: 'Save' })
    await user.click(saveButtons[0])

    await waitFor(() => {
      expect(amlApi.updateAmlAlertReview).toHaveBeenCalledWith('alert-1', {
        reviewStatus: 'Confirmed',
      })

      // The button temporarily changes to "Saving..." then back to "Save" when done
      expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeInTheDocument()
    })
  })

  it('should handle pagination correctly', async () => {
    // Mock 45 items to force 3 pages
    vi.mocked(amlApi.listAmlAlerts).mockResolvedValue({
      data: mockAlerts,
      pagination: { limit: 20, offset: 0, total: 45 },
    })

    const user = userEvent.setup()
    renderComponent()

    const nextBtn = await screen.findByRole('button', { name: 'Next' })
    const prevBtn = screen.getByRole('button', { name: 'Previous' })

    // Previous should be disabled on page 1
    expect(prevBtn).toBeDisabled()

    // Go to next page
    await user.click(nextBtn)

    await waitFor(() => {
      expect(amlApi.listAmlAlerts).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }))
      expect(screen.getByText(/Page 2 of 3/i)).toBeInTheDocument()
    })

    expect(prevBtn).not.toBeDisabled()

    // Go back to previous page
    await user.click(prevBtn)

    await waitFor(() => {
      expect(amlApi.listAmlAlerts).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }))
    })
  })

  it('should log user out on 401 Unauthorized API error during fetch', async () => {
    vi.mocked(amlApi.listAmlAlerts).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should log user out on 401 Unauthorized API error during update', async () => {
    const user = userEvent.setup()
    vi.mocked(amlApi.updateAmlAlertReview).mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()
    await waitFor(() => expect(screen.getByText('alert-1')).toBeInTheDocument())

    const saveButtons = screen.getAllByRole('button', { name: 'Save' })
    await user.click(saveButtons[0])

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should display generic error messages on list API failure', async () => {
    vi.mocked(amlApi.listAmlAlerts).mockRejectedValue(
      new ApiError(500, 'server_error', 'Failed to load AML alerts')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Failed to load AML alerts')).toBeInTheDocument()
    })
  })

  it('should display generic error messages on update API failure', async () => {
    const user = userEvent.setup()
    vi.mocked(amlApi.updateAmlAlertReview).mockRejectedValue(
      new ApiError(500, 'server_error', 'Failed to update review status')
    )

    renderComponent()
    await waitFor(() => expect(screen.getByText('alert-1')).toBeInTheDocument())

    const saveButtons = screen.getAllByRole('button', { name: 'Save' })
    await user.click(saveButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Failed to update review status')).toBeInTheDocument()
    })
  })
})
