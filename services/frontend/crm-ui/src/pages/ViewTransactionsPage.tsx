import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { isRootAdminUser } from '@/features/auth/authorization'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  listTransactions,
  listClientTransactions,
  getTransactionById,
  startTransactionImport,
  getTransactionImportBatch,
  type ListTransactionsParams,
} from '@/api/transactions'
import { listClients } from '@/api/clients'
import type {
  Transaction,
  TransactionStatus,
  TransactionKind,
  ImportBatch,
  ImportBatchStatus,
  ImportTransactionsRequest,
} from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout } from '@/components/SidebarDrawer'
import { getSidebarNavForUser } from '@/navigation/sidebarNav'

const ITEMS_PER_PAGE = 20
const FALLBACK_CLIENT_FETCH_LIMIT = 100
const FALLBACK_TRANSACTION_FETCH_LIMIT = 100
const IMPORT_HISTORY_STORAGE_KEY = 'crm-ui:transaction-import-batches'
const MAX_TRACKED_IMPORT_BATCHES = 20
const AGENT_OWNERSHIP_DENIED_MESSAGE =
  'Access denied for selected client. You can only view transactions for your assigned clients.'

const activeImportStatuses: ImportBatchStatus[] = ['queued', 'running']

const importStatusColors: Record<ImportBatchStatus, string> = {
  queued: 'bg-warning/20 text-warning',
  running: 'bg-primary/20 text-primary',
  completed: 'bg-success/20 text-success',
  failed: 'bg-danger/20 text-danger',
}

function parseStoredImportBatchIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value: unknown): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function sortImportBatches(batches: ImportBatch[]): ImportBatch[] {
  return [...batches].sort(
    (left, right) => new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime()
  )
}

export function ViewTransactionsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const isManagementUser = isRootAdminUser(user)

  const basePath = isManagementUser ? '/admin' : '/user'

  const clientIdFromQuery = searchParams.get('clientId') || ''
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const [filters, setFilters] = useState({
    clientId: clientIdFromQuery,
    status: '' as TransactionStatus | '',
    transaction: '' as TransactionKind | '',
    fromDate: '',
    toDate: '',
    search: '',
  })

  const [importClientId, setImportClientId] = useState('')
  const [importSourcePath, setImportSourcePath] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [importNoticeIsError, setImportNoticeIsError] = useState(false)
  const [trackedImportBatchIds, setTrackedImportBatchIds] = useState<string[]>([])
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [isRefreshingImportHistory, setIsRefreshingImportHistory] = useState(false)
  const [importHistoryError, setImportHistoryError] = useState('')
  const latestFetchRequestIdRef = useRef(0)

  const mergeTrackedImportBatchIds = (batchIds: string[]) => {
    const normalized = Array.from(new Set(batchIds.filter(Boolean)))
    if (!normalized.length) return

    setTrackedImportBatchIds(prev => {
      const merged = [...normalized, ...prev.filter(existing => !normalized.includes(existing))]
      return merged.slice(0, MAX_TRACKED_IMPORT_BATCHES)
    })
  }

  const fetchTransactions = async (page: number) => {
    const requestId = ++latestFetchRequestIdRef.current
    setIsLoading(true)
    setError('')

    try {
      const trimmedSearch = filters.search.trim()
      const trimmedClientId = filters.clientId.trim()
      const hasTransactionIdSearch = /^txn_[A-Za-z0-9_-]+$/i.test(trimmedSearch)

      const transactionMatchesFilters = (transaction: Transaction): boolean => {
        if (trimmedClientId && transaction.clientId !== trimmedClientId) return false
        if (filters.status && transaction.status !== filters.status) return false
        if (filters.transaction && transaction.transaction !== filters.transaction) return false
        if (filters.fromDate && transaction.date) {
          const txDate = transaction.date.slice(0, 10)
          if (txDate < filters.fromDate) return false
        }
        if (filters.toDate && transaction.date) {
          const txDate = transaction.date.slice(0, 10)
          if (txDate > filters.toDate) return false
        }
        return true
      }

      if (!isManagementUser) {
        const clientsResponse = await listClients({
          limit: FALLBACK_CLIENT_FETCH_LIMIT,
          offset: 0,
        })
        if (requestId !== latestFetchRequestIdRef.current) return

        const allowedClientIds = new Set(
          clientsResponse.data
            .map(client => client.clientId)
            .filter((id): id is string => Boolean(id))
        )

        if (trimmedClientId && !allowedClientIds.has(trimmedClientId)) {
          setTransactions([])
          setTotal(0)
          setError(AGENT_OWNERSHIP_DENIED_MESSAGE)
          return
        }

        const targetClientIds = trimmedClientId
          ? [trimmedClientId]
          : Array.from(allowedClientIds.values())

        if (targetClientIds.length === 0) {
          setTransactions([])
          setTotal(0)
          return
        }

        const scopedResults = await Promise.allSettled(
          targetClientIds.map(clientId =>
            listClientTransactions(clientId, {
              limit: FALLBACK_TRANSACTION_FETCH_LIMIT,
              offset: 0,
            })
          )
        )
        if (requestId !== latestFetchRequestIdRef.current) return

        const merged: Transaction[] = []
        const seenIds = new Set<string>()
        for (const result of scopedResults) {
          if (result.status !== 'fulfilled') continue
          for (const transaction of result.value.data) {
            if (seenIds.has(transaction.id)) continue
            seenIds.add(transaction.id)
            merged.push(transaction)
          }
        }

        let filtered = merged
          .filter(transactionMatchesFilters)
          .sort(
            (left, right) =>
              new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime()
          )

        if (trimmedSearch) {
          const searchLower = trimmedSearch.toLowerCase()
          filtered = filtered.filter(transaction => {
            if (hasTransactionIdSearch) {
              return transaction.id.toLowerCase() === searchLower
            }
            return (
              transaction.id.toLowerCase().includes(searchLower) ||
              transaction.clientId.toLowerCase().includes(searchLower)
            )
          })
        }

        const offset = page * ITEMS_PER_PAGE
        setTransactions(filtered.slice(offset, offset + ITEMS_PER_PAGE))
        setTotal(filtered.length)
        return
      }

      if (hasTransactionIdSearch) {
        try {
          const transaction = await getTransactionById(trimmedSearch)
          if (requestId !== latestFetchRequestIdRef.current) return
          const data = transactionMatchesFilters(transaction) ? [transaction] : []
          setTransactions(data)
          setTotal(data.length)
          return
        } catch (lookupErr) {
          if (requestId !== latestFetchRequestIdRef.current) return
          if (lookupErr instanceof ApiError && lookupErr.status === 404) {
            setTransactions([])
            setTotal(0)
            return
          }
          throw lookupErr
        }
      }

      const params: ListTransactionsParams = {
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
      }

      if (trimmedClientId) params.clientId = trimmedClientId
      if (filters.status) params.status = filters.status
      if (filters.transaction) params.transaction = filters.transaction
      if (filters.fromDate) params.fromDate = filters.fromDate
      if (filters.toDate) params.toDate = filters.toDate

      const response = await listTransactions(params)
      if (requestId !== latestFetchRequestIdRef.current) return

      if (isManagementUser) {
        const importIds = response.data
          .map(transaction => transaction.importBatchId)
          .filter((importBatchId): importBatchId is string => Boolean(importBatchId))
        mergeTrackedImportBatchIds(importIds)
      }

      let filteredData = response.data

      if (filters.search) {
        const searchLower = trimmedSearch.toLowerCase()
        filteredData = filteredData.filter(
          transaction =>
            transaction.clientId.toLowerCase().includes(searchLower) ||
            transaction.id.toLowerCase().includes(searchLower)
        )
      }

      setTransactions(filteredData)
      setTotal(response.pagination?.total ?? response.data.length)
    } catch (err) {
      if (requestId !== latestFetchRequestIdRef.current) return
      if (err instanceof ApiError) {
        if (err.status === 401) {
          return
        } else if (filters.clientId.trim() && [400, 403, 404].includes(err.status)) {
          // For client-id filter misses/access denials, show an empty result set instead
          // of leaving stale rows rendered from the previous successful fetch.
          setTransactions([])
          setTotal(0)
          setError(err.status === 403 ? AGENT_OWNERSHIP_DENIED_MESSAGE : '')
        } else {
          setTransactions([])
          setTotal(0)
          setError(err.message || 'Failed to load transactions')
        }
      } else {
        setTransactions([])
        setTotal(0)
        setError('An unexpected error occurred')
      }
    } finally {
      if (requestId === latestFetchRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  const refreshImportBatchHistory = async (batchIds: string[] = trackedImportBatchIds) => {
    if (!isManagementUser) return

    const normalizedIds = Array.from(new Set(batchIds)).slice(0, MAX_TRACKED_IMPORT_BATCHES)

    if (normalizedIds.length === 0) {
      setImportBatches([])
      setImportHistoryError('')
      return
    }

    setIsRefreshingImportHistory(true)
    setImportHistoryError('')

    try {
      const results = await Promise.allSettled(
        normalizedIds.map(importBatchId => getTransactionImportBatch(importBatchId))
      )

      const refreshedBatches: ImportBatch[] = []
      const nextTrackedIds: string[] = []
      let hasRefreshErrors = false

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index]
        const batchId = normalizedIds[index]

        if (result.status === 'fulfilled') {
          refreshedBatches.push(result.value)
          nextTrackedIds.push(batchId)
          continue
        }

        const reason = result.reason
        if (reason instanceof ApiError) {
          if (reason.status === 401) {
            return
          }
          if (reason.status === 404) {
            continue
          }
        }

        hasRefreshErrors = true
        nextTrackedIds.push(batchId)
      }

      setImportBatches(sortImportBatches(refreshedBatches))
      setTrackedImportBatchIds(prev =>
        sameStringArray(prev, nextTrackedIds) ? prev : nextTrackedIds
      )

      if (hasRefreshErrors) {
        setImportHistoryError('Some import batches could not be refreshed. Please try again.')
      }
    } finally {
      setIsRefreshingImportHistory(false)
    }
  }

  useEffect(() => {
    fetchTransactions(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters])

  useEffect(() => {
    if (!isManagementUser) return
    const storedBatchIds = parseStoredImportBatchIds(
      localStorage.getItem(IMPORT_HISTORY_STORAGE_KEY)
    )
    if (storedBatchIds.length > 0) {
      setTrackedImportBatchIds(storedBatchIds.slice(0, MAX_TRACKED_IMPORT_BATCHES))
    }
  }, [isManagementUser])

  useEffect(() => {
    if (!isManagementUser) return

    if (trackedImportBatchIds.length === 0) {
      localStorage.removeItem(IMPORT_HISTORY_STORAGE_KEY)
      setImportBatches([])
      return
    }

    localStorage.setItem(IMPORT_HISTORY_STORAGE_KEY, JSON.stringify(trackedImportBatchIds))
    void refreshImportBatchHistory(trackedImportBatchIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagementUser, trackedImportBatchIds])

  const hasActiveImports = importBatches.some(batch => activeImportStatuses.includes(batch.status))

  useEffect(() => {
    if (!isManagementUser || !hasActiveImports || trackedImportBatchIds.length === 0) return

    const intervalId = window.setInterval(() => {
      void refreshImportBatchHistory(trackedImportBatchIds)
    }, 5000)

    return () => window.clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagementUser, hasActiveImports, trackedImportBatchIds])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(0)
  }

  const resetFilters = () => {
    setFilters({
      clientId: '',
      status: '',
      transaction: '',
      fromDate: '',
      toDate: '',
      search: '',
    })
    setCurrentPage(0)
  }

  const handleStartImport = async () => {
    setIsImporting(true)
    setImportNotice('')
    setImportNoticeIsError(false)
    setImportHistoryError('')

    try {
      const payload: ImportTransactionsRequest = {}
      const trimmedClientId = importClientId.trim()
      const trimmedSourcePath = importSourcePath.trim()

      if (trimmedClientId) payload.clientId = trimmedClientId
      if (trimmedSourcePath) payload.sourcePath = trimmedSourcePath

      const batch = await startTransactionImport(
        Object.keys(payload).length > 0 ? payload : undefined
      )

      mergeTrackedImportBatchIds([batch.importBatchId])
      setImportBatches(prev =>
        sortImportBatches([
          batch,
          ...prev.filter(item => item.importBatchId !== batch.importBatchId),
        ])
      )

      if (batch.status === 'failed') {
        setImportNotice(batch.errorMessage || `Import batch ${batch.importBatchId} failed.`)
        setImportNoticeIsError(true)
      } else if (batch.status === 'completed') {
        setImportNotice(
          `Import batch ${batch.importBatchId} completed (${batch.importedRecords}/${batch.totalRecords} imported).`
        )
      } else {
        setImportNotice(
          `Import batch ${batch.importBatchId} started with status "${batch.status}".`
        )
      }

      setImportClientId('')
      setImportSourcePath('')
      await fetchTransactions(currentPage)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          return
        }
        setImportNotice(err.message || 'Failed to start transaction import')
      } else {
        setImportNotice('An unexpected error occurred while starting the import')
      }
      setImportNoticeIsError(true)
    } finally {
      setIsImporting(false)
    }
  }

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
    }).format(amount)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)
  const canPaginateTransactions = totalPages > 1
  const transactionsRangeStart = total === 0 ? 0 : currentPage * ITEMS_PER_PAGE + 1
  const transactionsRangeEnd = total === 0 ? 0 : Math.min((currentPage + 1) * ITEMS_PER_PAGE, total)

  return (
    <SidebarLayout items={getSidebarNavForUser(user)}>
      <nav>
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(basePath)} className="text-text-subtle text-2xl">
              Dashboard
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-normal text-text">Transactions</h1>
          </div>
        </div>
      </nav>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {isManagementUser && (
          <div className="bg-card  rounded-lg mb-6 p-4" data-testid="transaction-import-panel">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-text font-normal">Transaction Import</h3>
                <p className="text-xs text-text-muted mt-1">
                  Trigger imports and track their batch status from this page.
                </p>
              </div>
              <button
                onClick={() => void refreshImportBatchHistory(trackedImportBatchIds)}
                disabled={isRefreshingImportHistory || trackedImportBatchIds.length === 0}
                className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.8] text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRefreshingImportHistory ? 'Refreshing...' : 'Refresh Batch Status'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">Client ID (optional)</label>
                <input
                  type="text"
                  placeholder="Import for one client"
                  value={importClientId}
                  onChange={event => setImportClientId(event.target.value)}
                  className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Source Path (optional)</label>
                <input
                  type="text"
                  placeholder="Override source path"
                  value={importSourcePath}
                  onChange={event => setImportSourcePath(event.target.value)}
                  className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => void handleStartImport()}
                disabled={isImporting}
                className="px-4 py-2 rounded gradient-dark-red hover:brightness-[0.8] text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? 'Starting Import...' : 'Start Import'}
              </button>
            </div>

            {importNotice && (
              <div
                className={`rounded-lg border p-3 mt-4 ${
                  importNoticeIsError
                    ? 'bg-danger/10 border-danger text-danger'
                    : 'bg-success/10 border-success text-success'
                }`}
              >
                <p className="text-sm">{importNotice}</p>
              </div>
            )}

            {importHistoryError && (
              <div className="bg-warning/10 border border-warning rounded-lg p-3 mt-4">
                <p className="text-warning text-sm">{importHistoryError}</p>
              </div>
            )}

            <div className="mt-6  rounded-lg">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h4 className="font-normal text-text">Import Batch History</h4>
                {hasActiveImports && (
                  <span className="text-xs text-text-muted">Auto-refresh every 5s</span>
                )}
              </div>

              {isRefreshingImportHistory && importBatches.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : importBatches.length === 0 ? (
                <div className="p-4 text-sm text-text-muted">No import batches tracked yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-background-light">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Batch ID
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Requested Client
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Requested At
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Imported
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Failed
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Finished / Error
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importBatches.map(batch => (
                        <tr key={batch.importBatchId} className="hover:bg-background-light">
                          <td className="px-4 py-3 text-sm text-text-muted font-mono">
                            {batch.importBatchId}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 rounded text-xs font-normal ${importStatusColors[batch.status]}`}
                            >
                              {batch.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-text">
                            {batch.requestedClientId || 'All clients'}
                          </td>
                          <td className="px-4 py-3 text-sm text-text">
                            {formatDateTime(batch.requestedAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-text">
                            {batch.importedRecords}/{batch.totalRecords}
                          </td>
                          <td className="px-4 py-3 text-sm text-text">{batch.failedRecords}</td>
                          <td className="px-4 py-3 text-sm">
                            {batch.errorMessage ? (
                              <span className="text-danger">{batch.errorMessage}</span>
                            ) : (
                              <span className="text-text-muted">
                                {batch.finishedAt
                                  ? formatDateTime(batch.finishedAt)
                                  : batch.startedAt
                                    ? `Started ${formatDateTime(batch.startedAt)}`
                                    : '-'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-card  rounded-lg mb-6 p-4">
          <h3 className="text-text font-normal mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Client ID</label>
              <input
                type="text"
                placeholder="clt_.."
                value={filters.clientId}
                onChange={e => handleFilterChange('clientId', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Transaction ID</label>
              <input
                type="text"
                placeholder="txn_.."
                value={filters.search}
                onChange={e => handleFilterChange('search', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Status</label>
              <select
                value={filters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Type</label>
              <select
                value={filters.transaction}
                onChange={e => handleFilterChange('transaction', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All</option>
                <option value="D">Deposit</option>
                <option value="W">Withdrawal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">From Date</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={e => handleFilterChange('fromDate', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">To Date</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={e => handleFilterChange('toDate', e.target.value)}
                className="w-full px-3 py-2 bg-background-light  rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.8] text-sm font-medium transition-all duration-200"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="bg-card  rounded-lg">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-normal text-text">Transaction List</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div
                data-testid="loading-spinner"
                className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
              />
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No transactions found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-light">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Transaction ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Client ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-normal text-text-muted uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map(transaction => (
                      <tr key={transaction.id} className="hover:bg-background-light">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                          {formatDateTime(transaction.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-mono text-xs">
                          {transaction.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-mono text-xs">
                          {transaction.clientId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-normal ${
                              transaction.transaction === 'D'
                                ? 'bg-success/20 text-success'
                                : 'bg-warning/20 text-warning'
                            }`}
                          >
                            {transaction.transaction === 'D' ? 'DEPOSIT' : 'WITHDRAWAL'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text text-right font-normal">
                          {formatAmount(transaction.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-normal ${
                              transaction.status === 'Completed'
                                ? 'bg-success/20 text-success'
                                : transaction.status === 'Pending'
                                  ? 'bg-warning/20 text-warning'
                                  : 'bg-danger/20 text-danger'
                            }`}
                          >
                            {transaction.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {canPaginateTransactions && (
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <p className="text-sm text-text-muted">
                Showing {transactionsRangeStart} to {transactionsRangeEnd} of {total} transactions
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(page => page - 1)}
                  disabled={currentPage === 0 || isLoading}
                  className={`px-3 py-1 rounded ${
                    currentPage === 0 || isLoading
                      ? 'bg-background-light text-text-muted cursor-not-allowed'
                      : 'bg-primary hover:brightness-[0.8] text-white transition-all duration-200'
                  }`}
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-text">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(page => page + 1)}
                  disabled={currentPage >= totalPages - 1 || isLoading}
                  className={`px-3 py-1 rounded ${
                    currentPage >= totalPages - 1 || isLoading
                      ? 'bg-background-light text-text-muted cursor-not-allowed'
                      : 'bg-primary hover:brightness-[0.8] text-white transition-all duration-200'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </SidebarLayout>
  )
}
