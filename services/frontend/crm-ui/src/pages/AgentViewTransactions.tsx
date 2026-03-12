import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { listTransactions, type ListTransactionsParams } from '@/api/transactions'
import type { Transaction, TransactionStatus, TransactionKind } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const agentNav: NavItem[] = [
  { label: 'Home', to: '/agent', end: true },
  { label: 'Create Client', to: '/agent/clients/new' },
  { label: 'View Transactions', to: '/agent/transactions' },
  { label: 'AML Alerts', to: '/agent/aml-alerts' },
]

const ITEMS_PER_PAGE = 20

export function AgentViewTransactions() {
  const { logout } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const [filters, setFilters] = useState({
    status: '' as TransactionStatus | '',
    transaction: '' as TransactionKind | '',
    fromDate: '',
    toDate: '',
    search: '',
  })

  const fetchTransactions = async (page: number) => {
    setIsLoading(true)
    setError('')

    try {
      const params: ListTransactionsParams = {
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
      }

      if (filters.status) params.status = filters.status
      if (filters.transaction) params.transaction = filters.transaction
      if (filters.fromDate) params.fromDate = filters.fromDate
      if (filters.toDate) params.toDate = filters.toDate

      const response = await listTransactions(params)

      let filteredData = response.data

      // Client-side search filter (if API doesn't support search)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        filteredData = filteredData.filter(
          t =>
            t.clientId.toLowerCase().includes(searchLower) ||
            t.id.toLowerCase().includes(searchLower)
        )
      }

      setTransactions(filteredData)
      setTotal(response.pagination?.total || 0)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else {
          setError(err.message || 'Failed to load transactions')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters])

  const handleFilterChange = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value })
    setCurrentPage(0)
  }

  const resetFilters = () => {
    setFilters({
      status: '',
      transaction: '',
      fromDate: '',
      toDate: '',
      search: '',
    })
    setCurrentPage(0)
  }

  const formatDateTime = (dateString: string) => {
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

  return (
    <SidebarLayout items={agentNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <a href="/agent" className="text-text-muted hover:text-text">
              Dashboard
            </a>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">Transactions</h1>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        <div className="bg-card border border-border rounded-lg mb-6 p-4">
          <h3 className="text-text font-medium mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Search</label>
              <input
                type="text"
                placeholder="Client ID or Transaction ID"
                value={filters.search}
                onChange={e => handleFilterChange('search', e.target.value)}
                className="w-full px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Status</label>
              <select
                value={filters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="w-full px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="w-full px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">To Date</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={e => handleFilterChange('toDate', e.target.value)}
                className="w-full px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded bg-background-light text-text hover:bg-background-lighter text-sm font-medium transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-bold text-text">Transaction List</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div
                data-testid="loading-spinner"
                className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
              ></div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No transactions found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-light">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Transaction ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Client ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
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
                          {transaction.id.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-mono text-xs">
                          {transaction.clientId.substring(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              transaction.transaction === 'D'
                                ? 'bg-success/20 text-success'
                                : 'bg-warning/20 text-warning'
                            }`}
                          >
                            {transaction.transaction === 'D' ? 'Deposit' : 'Withdrawal'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text text-right font-medium">
                          {formatAmount(transaction.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              transaction.status === 'Completed'
                                ? 'bg-success/20 text-success'
                                : transaction.status === 'Pending'
                                  ? 'bg-warning/20 text-warning'
                                  : 'bg-danger/20 text-danger'
                            }`}
                          >
                            {transaction.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    Showing {currentPage * ITEMS_PER_PAGE + 1} to{' '}
                    {currentPage * ITEMS_PER_PAGE + transactions.length} of {total} transactions
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 0}
                      className={`px-3 py-1 rounded ${
                        currentPage === 0
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-hover text-white'
                      }`}
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-text">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage >= totalPages - 1}
                      className={`px-3 py-1 rounded ${
                        currentPage >= totalPages - 1
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-hover text-white'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </SidebarLayout>
  )
}
