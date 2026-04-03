import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { ViewTransactionsPage } from '../ViewTransactionsPage'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import * as transactionsApi from '@/api/transactions'
import { ApiError } from '@/api/client'
import type { Transaction, ImportBatch } from '@/api/types'

vi.mock('@/api/transactions')

let mockRole: 'admin' | 'user' | 'super_admin' = 'user'
const mockLogout = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'John', lastName: 'Doe', role: mockRole },
    logout: mockLogout,
  }),
}))

const importHistoryStorageKey = 'crm-ui:transaction-import-batches'

const mockTransactions: Transaction[] = [
  {
    id: 'txn-1',
    clientId: 'client-1',
    transaction: 'D',
    amount: 1000,
    date: '2024-01-15T10:30:00Z',
    status: 'Completed',
  },
  {
    id: 'txn-2',
    clientId: 'client-2',
    transaction: 'W',
    amount: 500,
    date: '2024-01-16T14:20:00Z',
    status: 'Pending',
  },
]

const mockImportBatch: ImportBatch = {
  importBatchId: 'imp_1',
  status: 'running',
  requestedClientId: null,
  requestedAt: '2026-03-20T10:00:00Z',
  startedAt: '2026-03-20T10:00:01Z',
  finishedAt: null,
  totalRecords: 0,
  importedRecords: 0,
  failedRecords: 0,
  errorMessage: null,
}

describe('ViewTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRole = 'user'
  })

  const renderComponent = () =>
    render(
      <ThemeProvider>
        <BrowserRouter>
          <ViewTransactionsPage />
        </BrowserRouter>
      </ThemeProvider>
    )

  it('renders transaction list for user role without import controls', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })

    renderComponent()

    expect(screen.getByRole('heading', { name: 'Transactions', level: 1 })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Transaction List')).toBeInTheDocument()
      expect(screen.getByText(/txn-1/)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('transaction-import-panel')).not.toBeInTheDocument()
  })

  it('shows empty state when there are no transactions', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeInTheDocument()
    })
  })

  it('shows pagination at the bottom when total spans multiple pages', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 25 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeInTheDocument()
      expect(screen.getByText('Showing 1 to 20 of 25 transactions')).toBeInTheDocument()
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    })
  })

  it('logs out on unauthorized transaction listing response', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('requests next page when clicking pagination next', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: Array.from({ length: 20 }, (_, index) => ({
          id: `txn-${index}`,
          clientId: `client-${index}`,
          transaction: 'D' as const,
          amount: 100,
          date: '2024-01-15T10:30:00Z',
          status: 'Completed' as const,
        })),
        pagination: { limit: 20, offset: 0, total: 25 },
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 5 }, (_, index) => ({
          id: `txn-2-${index}`,
          clientId: `client-2-${index}`,
          transaction: 'W' as const,
          amount: 120,
          date: '2024-01-16T10:30:00Z',
          status: 'Pending' as const,
        })),
        pagination: { limit: 20, offset: 20, total: 25 },
      })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(listSpy).toHaveBeenLastCalledWith({ limit: 20, offset: 20 })
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    })
  })

  it('shows import controls for admin and starts import without payload', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    const startImportSpy = vi
      .spyOn(transactionsApi, 'startTransactionImport')
      .mockResolvedValue(mockImportBatch)
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue({
      ...mockImportBatch,
      status: 'completed',
      finishedAt: '2026-03-20T10:00:05Z',
      totalRecords: 10,
      importedRecords: 10,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(startImportSpy).toHaveBeenCalledWith(undefined)
      expect(screen.getByText(/Import batch imp_1 started/i)).toBeInTheDocument()
      expect(screen.getByText('imp_1')).toBeInTheDocument()
    })
  })

  it('does not show edit actions even for admin', async () => {
    mockRole = 'admin'

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/txn-1/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })
  })

  it('starts import with optional payload fields', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    const startImportSpy = vi
      .spyOn(transactionsApi, 'startTransactionImport')
      .mockResolvedValue(mockImportBatch)
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('Import for one client'), 'clt_123')
    await user.type(screen.getByPlaceholderText('Override source path'), '/tmp/sample.csv')
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(startImportSpy).toHaveBeenCalledWith({
        clientId: 'clt_123',
        sourcePath: '/tmp/sample.csv',
      })
    })
  })

  it('shows import error notice when starting import fails', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockRejectedValue(
      new ApiError(500, 'server_error', 'Failed to start import')
    )
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to start import')).toBeInTheDocument()
    })
  })

  it('loads tracked import batch history from localStorage for admin', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, JSON.stringify(['imp_saved']))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockResolvedValue(mockImportBatch)
    const getBatchSpy = vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue({
      importBatchId: 'imp_saved',
      status: 'failed',
      requestedClientId: 'clt_300',
      requestedAt: '2026-03-20T10:00:00Z',
      startedAt: '2026-03-20T10:00:01Z',
      finishedAt: '2026-03-20T10:00:02Z',
      totalRecords: 4,
      importedRecords: 1,
      failedRecords: 3,
      errorMessage: 'Malformed records detected',
    })

    renderComponent()

    await waitFor(() => {
      expect(getBatchSpy).toHaveBeenCalledWith('imp_saved')
      expect(screen.getByText('imp_saved')).toBeInTheDocument()
      expect(screen.getByText('Malformed records detected')).toBeInTheDocument()
    })
  })

  it('shows previous page button and navigates to previous page', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions')
    listSpy
      .mockResolvedValueOnce({
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `txn-${i}`,
          clientId: `client-${i}`,
          transaction: 'D' as const,
          amount: 100,
          date: '2024-01-15T10:30:00Z',
          status: 'Completed' as const,
        })),
        pagination: { limit: 20, offset: 0, total: 25 },
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 5 }, (_, i) => ({
          id: `txn-p2-${i}`,
          clientId: `client-p2-${i}`,
          transaction: 'W' as const,
          amount: 120,
          date: '2024-01-16T10:30:00Z',
          status: 'Pending' as const,
        })),
        pagination: { limit: 20, offset: 20, total: 25 },
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `txn-back-${i}`,
          clientId: `client-back-${i}`,
          transaction: 'D' as const,
          amount: 100,
          date: '2024-01-15T10:30:00Z',
          status: 'Completed' as const,
        })),
        pagination: { limit: 20, offset: 0, total: 25 },
      })

    renderComponent()

    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith({ limit: 20, offset: 0 }))
  })

  it('shows generic error for non-ApiError during fetch', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(new Error('network error'))

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  it('shows non-401 ApiError message during fetch', async () => {
    vi.spyOn(transactionsApi, 'listTransactions').mockRejectedValue(
      new ApiError(500, 'server_error', 'Server failed')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Server failed')).toBeInTheDocument()
    })
  })

  it('shows import controls for super_admin', async () => {
    mockRole = 'super_admin'

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument()
    })
  })

  it('resets filters when Reset Filters button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Transaction ID')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Transaction ID')
    await user.type(searchInput, 'test-search')

    await user.click(screen.getByRole('button', { name: 'Reset Filters' }))

    await waitFor(() => {
      expect((searchInput as HTMLInputElement).value).toBe('')
    })
  })

  it('filters transactions by client ID when clientId filter is set', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Client ID')).toBeInTheDocument()
    })

    const clientIdInput = screen.getByPlaceholderText('Client ID')
    await user.type(clientIdInput, 'clt_abc')

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'clt_abc' }))
    })
  })

  it('tracks import batch ids discovered in transaction rows', async () => {
    mockRole = 'admin'

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [{ ...mockTransactions[0], importBatchId: 'imp_from_txn' }],
      pagination: { limit: 20, offset: 0, total: 1 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockResolvedValue(mockImportBatch)
    const getBatchSpy = vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue({
      ...mockImportBatch,
      importBatchId: 'imp_from_txn',
      status: 'completed',
      totalRecords: 3,
      importedRecords: 3,
      finishedAt: '2026-03-20T10:05:00Z',
    })

    renderComponent()

    await waitFor(() => {
      expect(getBatchSpy).toHaveBeenCalledWith('imp_from_txn')
      expect(screen.getByText('imp_from_txn')).toBeInTheDocument()
    })
  })

  it('renders super admin specific navigation item', async () => {
    mockRole = 'super_admin'

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Admin Management')).toBeInTheDocument()
    })
  })

  it('passes status, type and date filters into listTransactions request', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })

    const { container } = renderComponent()

    const [statusSelect, typeSelect] = screen.getAllByRole('combobox')
    const dateInputs = container.querySelectorAll('input[type="date"]')

    await user.selectOptions(statusSelect, 'Pending')
    await user.selectOptions(typeSelect, 'W')
    fireEvent.change(dateInputs[0], { target: { value: '2026-03-01' } })
    fireEvent.change(dateInputs[1], { target: { value: '2026-03-31' } })

    await waitFor(() => {
      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'Pending',
          transaction: 'W',
          fromDate: '2026-03-01',
          toDate: '2026-03-31',
        })
      )
    })
  })

  it('shows completed import notice when import batch completes immediately', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockResolvedValue({
      ...mockImportBatch,
      status: 'completed',
      totalRecords: 12,
      importedRecords: 12,
      finishedAt: '2026-03-20T10:00:07Z',
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue({
      ...mockImportBatch,
      status: 'completed',
      totalRecords: 12,
      importedRecords: 12,
      finishedAt: '2026-03-20T10:00:07Z',
    })

    renderComponent()

    await waitFor(() => expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(screen.getByText(/completed \(12\/12 imported\)/i)).toBeInTheDocument()
    })
  })

  it('shows failed import notice from batch error message', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockResolvedValue({
      ...mockImportBatch,
      status: 'failed',
      errorMessage: 'CSV schema mismatch',
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue({
      ...mockImportBatch,
      status: 'failed',
      errorMessage: 'CSV schema mismatch',
    })

    renderComponent()

    await waitFor(() => expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(screen.getAllByText('CSV schema mismatch').length).toBeGreaterThan(0)
    })
  })

  it('logs out when transaction import start request returns 401', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('shows fallback import error for non-ApiError failures', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockRejectedValue(new Error('network down'))
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(
        screen.getByText('An unexpected error occurred while starting the import')
      ).toBeInTheDocument()
    })
  })

  it('shows import history refresh warning when a tracked batch cannot be refreshed', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, JSON.stringify(['imp_saved']))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockRejectedValue(
      new ApiError(500, 'server_error', 'refresh failed')
    )

    renderComponent()

    await waitFor(() => {
      expect(
        screen.getByText('Some import batches could not be refreshed. Please try again.')
      ).toBeInTheDocument()
    })
  })

  it('logs out when tracked import batch refresh returns unauthorized', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, JSON.stringify(['imp_saved']))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockRejectedValue(
      new ApiError(401, 'unauthorized', 'Unauthorized')
    )

    renderComponent()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('ignores malformed import history in localStorage', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, '{"badJson":')

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    const getBatchSpy = vi
      .spyOn(transactionsApi, 'getTransactionImportBatch')
      .mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(
      () => {
        expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument()
        expect(getBatchSpy).not.toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('ignores non-array import history payload in localStorage', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, JSON.stringify({ id: 'imp_saved' }))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    const getBatchSpy = vi
      .spyOn(transactionsApi, 'getTransactionImportBatch')
      .mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(
      () => {
        expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument()
        expect(getBatchSpy).not.toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('handles unknown refresh failures for tracked import batches', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, JSON.stringify(['imp_saved']))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockRejectedValue(
      new Error('connection dropped')
    )

    renderComponent()

    await waitFor(() => {
      expect(
        screen.getByText('Some import batches could not be refreshed. Please try again.')
      ).toBeInTheDocument()
    })
  })

  it('removes tracked batch row when refresh returns 404', async () => {
    mockRole = 'admin'
    localStorage.setItem(importHistoryStorageKey, JSON.stringify(['imp_saved']))

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockRejectedValue(
      new ApiError(404, 'not_found', 'Not found')
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.queryByText('imp_saved')).not.toBeInTheDocument()
    })
  })

  it('shows fallback failed notice when failed batch has no error message', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockResolvedValue({
      ...mockImportBatch,
      status: 'failed',
      errorMessage: '',
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(screen.getByText('Import batch imp_1 failed.')).toBeInTheDocument()
    })
  })

  it('uses generic API import error when message is empty', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    vi.spyOn(transactionsApi, 'startTransactionImport').mockRejectedValue(
      new ApiError(500, 'server_error', '')
    )
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => expect(screen.getByTestId('transaction-import-panel')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Start Import' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to start transaction import')).toBeInTheDocument()
    })
  })

  it('renders fallback display values for missing transaction and batch timestamps', async () => {
    mockRole = 'admin'

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: [
        {
          ...mockTransactions[0],
          id: 'txn-no-date',
          date: undefined as unknown as string,
          importBatchId: 'imp_no_timestamps',
        },
      ],
      pagination: { limit: 20, offset: 0, total: 1 },
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue({
      ...mockImportBatch,
      importBatchId: 'imp_no_timestamps',
      status: 'running',
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText('-').length).toBeGreaterThan(0)
      expect(screen.getByText('imp_no_timestamps')).toBeInTheDocument()
    })
  })
})
