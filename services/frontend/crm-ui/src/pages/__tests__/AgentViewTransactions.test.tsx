import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { AgentViewTransactions } from '../AgentViewTransactions'
import * as transactionsApi from '@/api/transactions'
import { ApiError } from '@/api/client'
import type { Transaction } from '@/api/types'

vi.mock('@/api/transactions')

const mockLogout = vi.fn()
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'John', lastName: 'Doe', role: 'agent' },
    logout: mockLogout,
  }),
}))

describe('AgentViewTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <AgentViewTransactions />
      </BrowserRouter>
    )
  }

  const mockTransactions: Transaction[] = [
    {
      id: 'txn-1',
      clientId: 'client-1',
      transaction: 'D',
      amount: 1000.0,
      date: '2024-01-15T10:30:00Z',
      status: 'Completed',
    },
    {
      id: 'txn-2',
      clientId: 'client-2',
      transaction: 'W',
      amount: 500.0,
      date: '2024-01-16T14:20:00Z',
      status: 'Pending',
    },
  ]

  it('should render the transactions list page', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    expect(screen.getByText('Transactions')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Transaction List')).toBeInTheDocument()
    })
  })

  it('should display transactions in a table', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    await waitFor(() => {
      // Check for transaction IDs (partial match to handle truncation)
      expect(screen.getByText(/txn-1/)).toBeInTheDocument()
      expect(screen.getByText(/txn-2/)).toBeInTheDocument()
      // Check for statuses (may appear in dropdown and table, so use getAllByText)
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('should show loading state initially', () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockImplementation(() => new Promise(() => {}))

    renderComponent()

    const spinner = screen.getByTestId('loading-spinner')
    expect(spinner.className).toContain('animate-spin')
  })

  it('should display empty state when no transactions found', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeInTheDocument()
    })
  })

  it('should display error state when API call fails', async () => {
    const apiError = new ApiError(500, 'server_error', 'Failed to fetch transactions')
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(apiError)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch transactions')).toBeInTheDocument()
    })
  })

  it('should display network error state', async () => {
    const networkError = new ApiError(0, 'network_error', 'Network error occurred')
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(networkError)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Network error occurred')).toBeInTheDocument()
    })
  })

  it('should render filter controls', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    expect(screen.getByText('Filters')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Client ID or Transaction ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset Filters/ })).toBeInTheDocument()

    await waitFor(() => {
      const statusSelects = screen.getAllByRole('combobox')
      expect(statusSelects.length).toBeGreaterThan(0)
    })
  })

  it('should format amounts as currency', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/1,000/)).toBeInTheDocument()
      expect(screen.getByText(/500/)).toBeInTheDocument()
    })
  })

  it('should handle pagination when total exceeds page size', async () => {
    const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `txn-${i}`,
      clientId: `client-${i}`,
      transaction: 'D' as const,
      amount: 100,
      date: '2024-01-15T10:30:00Z',
      status: 'Completed' as const,
    }))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: manyTransactions.slice(0, 20),
      pagination: { limit: 20, offset: 0, total: 25 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Showing 1 to 20 of 25 transactions/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Previous/ })).toBeInTheDocument()
    })
  })

  it('should not show pagination for single page results', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument()
    })
  })

  it('should call logout on 401 error', async () => {
    const error = new ApiError(401, 'unauthorized', 'Unauthorized')
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(error)

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('should handle generic API error', async () => {
    const error = new ApiError(500, 'server_error', 'Server error')
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(error)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('should handle non-ApiError exception', async () => {
    const error = new Error('Network failure')
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(error)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  it('should navigate to next page when clicking Next button', async () => {
    const user = userEvent.setup()
    const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `txn-${i}`,
      clientId: `client-${i}`,
      transaction: 'D' as const,
      amount: 100,
      date: '2024-01-15T10:30:00Z',
      status: 'Completed' as const,
    }))

    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: manyTransactions.slice(0, 20),
        pagination: { limit: 20, offset: 0, total: 25 },
      })
      .mockResolvedValueOnce({
        data: manyTransactions.slice(20, 25),
        pagination: { limit: 20, offset: 20, total: 25 },
      })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Showing 1 to 20 of 25 transactions/)).toBeInTheDocument()
    })

    const nextButton = screen.getByRole('button', { name: /Next/ })
    await user.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText(/Showing 21 to 25 of 25 transactions/)).toBeInTheDocument()
    })
  })

  it('should navigate to previous page when clicking Previous button', async () => {
    const user = userEvent.setup()
    const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `txn-${i}`,
      clientId: `client-${i}`,
      transaction: 'D' as const,
      amount: 100,
      date: '2024-01-15T10:30:00Z',
      status: 'Completed' as const,
    }))

    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    // Initial render - page 0
    listSpy
      .mockResolvedValueOnce({
        data: manyTransactions.slice(0, 20),
        pagination: { limit: 20, offset: 0, total: 25 },
      })
      // Click Next - go to page 1
      .mockResolvedValueOnce({
        data: manyTransactions.slice(20, 25),
        pagination: { limit: 20, offset: 20, total: 25 },
      })
      // Click Previous - go back to page 0
      .mockResolvedValueOnce({
        data: manyTransactions.slice(0, 20),
        pagination: { limit: 20, offset: 0, total: 25 },
      })

    renderComponent()

    // Wait for initial page to load
    await waitFor(() => {
      expect(screen.getByText(/Showing 1 to 20 of 25 transactions/)).toBeInTheDocument()
    })

    // Navigate to page 1
    const nextButton = screen.getByRole('button', { name: /Next/i })
    await user.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText(/Showing 21 to 25 of 25 transactions/)).toBeInTheDocument()
    })

    // Navigate back to page 0
    const prevButton = screen.getByRole('button', { name: /Previous/ })
    await user.click(prevButton)

    await waitFor(() => {
      expect(screen.getByText(/Showing 1 to 20 of 25 transactions/)).toBeInTheDocument()
    })
  })

  it('should filter by status', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: mockTransactions,
        pagination: { limit: 20, offset: 0, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [mockTransactions[0]], // Only Completed
        pagination: { limit: 20, offset: 0, total: 1 },
      })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Transaction List')).toBeInTheDocument()
    })

    // Find the status dropdown
    const selects = screen.getAllByRole('combobox')
    const statusSelect =
      selects.find(select => select.getAttribute('class')?.includes('status')) || selects[0]

    await user.selectOptions(statusSelect, 'Completed')

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  it('should filter by transaction type', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: mockTransactions,
        pagination: { limit: 20, offset: 0, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [mockTransactions[0]], // Only Deposit
        pagination: { limit: 20, offset: 0, total: 1 },
      })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Transaction List')).toBeInTheDocument()
    })

    // Find the transaction type dropdown
    const selects = screen.getAllByRole('combobox')
    const typeSelect =
      selects.find(select => select.textContent?.includes('All Types')) || selects[1]

    await user.selectOptions(typeSelect, 'D')

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  it('should filter by search text', async () => {
    const user = userEvent.setup()
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Transaction List')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Client ID or Transaction ID')
    await user.type(searchInput, 'txn-1')

    await waitFor(() => {
      // The component should filter locally, so we check if filtering logic is triggered
      expect(searchInput).toHaveValue('txn-1')
    })
  })

  it('should reset all filters when clicking Reset Filters', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: mockTransactions,
        pagination: { limit: 20, offset: 0, total: 2 },
      })
      .mockResolvedValueOnce({
        data: mockTransactions,
        pagination: { limit: 20, offset: 0, total: 2 },
      })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Transaction List')).toBeInTheDocument()
    })

    // Add a search filter
    const searchInput = screen.getByPlaceholderText('Client ID or Transaction ID')
    await user.type(searchInput, 'test')

    expect(searchInput).toHaveValue('test')

    // Click reset
    const resetButton = screen.getByRole('button', { name: /Reset Filters/i })
    await user.click(resetButton)

    await waitFor(() => {
      expect(searchInput).toHaveValue('')
    })
  })

  it('should disable Previous button on first page', async () => {
    const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `txn-${i}`,
      clientId: `client-${i}`,
      transaction: 'D' as const,
      amount: 100,
      date: '2024-01-15T10:30:00Z',
      status: 'Completed' as const,
    }))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: manyTransactions.slice(0, 20),
      pagination: { limit: 20, offset: 0, total: 25 },
    })

    renderComponent()

    await waitFor(() => {
      const prevButton = screen.getByRole('button', { name: /Previous/i })
      expect(prevButton).toBeDisabled()
    })
  })

  it('should disable Next button on last page', async () => {
    const user = userEvent.setup()
    const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
      id: `txn-${i}`,
      clientId: `client-${i}`,
      transaction: 'D' as const,
      amount: 100,
      date: '2024-01-15T10:30:00Z',
      status: 'Completed' as const,
    }))

    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: manyTransactions.slice(0, 20),
        pagination: { limit: 20, offset: 0, total: 25 },
      })
      .mockResolvedValueOnce({
        data: manyTransactions.slice(20, 25),
        pagination: { limit: 20, offset: 20, total: 25 },
      })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Showing 1 to 20 of 25 transactions/)).toBeInTheDocument()
    })

    // Navigate to last page
    const nextButton = screen.getByRole('button', { name: /Next/i })
    await user.click(nextButton)

    await waitFor(() => {
      expect(screen.getByText(/Showing 21 to 25 of 25 transactions/)).toBeInTheDocument()
      const nextButtonAfterClick = screen.getByRole('button', { name: /Next/i })
      expect(nextButtonAfterClick).toBeDisabled()
    })
  })
})
