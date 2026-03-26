import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('allows admin to edit a transaction', async () => {
    mockRole = 'admin'
    const user = userEvent.setup()

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      data: mockTransactions,
      pagination: { limit: 20, offset: 0, total: 2 },
    })
    const updateSpy = vi.spyOn(transactionsApi, 'updateTransaction').mockResolvedValue({
      ...mockTransactions[0],
      status: 'Failed',
      amount: 333,
    })
    vi.spyOn(transactionsApi, 'getTransactionImportBatch').mockResolvedValue(mockImportBatch)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/txn-1/)).toBeInTheDocument()
    })

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.clear(screen.getByLabelText('Edit Transaction Amount'))
    await user.type(screen.getByLabelText('Edit Transaction Amount'), '333')
    await user.selectOptions(screen.getByLabelText('Edit Transaction Status'), 'Failed')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('txn-1', expect.objectContaining({ status: 'Failed', amount: 333 }))
      expect(screen.getByText('Transaction updated successfully.')).toBeInTheDocument()
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
})
