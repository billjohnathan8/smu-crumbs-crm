import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listLogs } from '@/api/logs'
import type { LogAction, LogEntry } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const LOGS_PER_PAGE = 10
type LogActionFilter = LogAction | 'all'

type LogFilters = {
  action: LogActionFilter
  from: string
  to: string
  userId: string
  clientId: string
}

const DEFAULT_FILTERS: LogFilters = {
  action: 'all',
  from: '',
  to: '',
  userId: '',
  clientId: '',
}

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Settings', to: '/admin/settings' },
]

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients' },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
  { label: 'Activity Logs', to: '/user/logs' },
  { label: 'Settings', to: '/user/settings' },
]

export function ActivityLogsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const basePath = isAdmin ? '/admin' : '/user'
  const sidebarNav = isAdmin ? adminNav : userNav

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFilters, setActiveFilters] = useState<LogFilters>(DEFAULT_FILTERS)

  useEffect(() => {
    const toIsoDateTime = (value: string): string | undefined => {
      if (!value) return undefined
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
    }

    const fetchLogs = async () => {
      setIsLoading(true)
      setError('')

      try {
        const params: {
          limit: number
          offset: number
          action?: LogAction
          from?: string
          to?: string
          userId?: string
          clientId?: string
        } = {
          limit: LOGS_PER_PAGE,
          offset: currentPage * LOGS_PER_PAGE,
        }

        if (activeFilters.action !== 'all') {
          params.action = activeFilters.action
        }
        const fromIso = toIsoDateTime(activeFilters.from)
        const toIso = toIsoDateTime(activeFilters.to)
        if (fromIso) params.from = fromIso
        if (toIso) params.to = toIso
        if (activeFilters.userId.trim()) params.userId = activeFilters.userId.trim()
        if (activeFilters.clientId.trim()) params.clientId = activeFilters.clientId.trim()

        // Non-admin users only see their own logs
        if (!isAdmin && user?.id) {
          params.userId = user.id
        }

        const response = await listLogs(params)
        setLogs(response.data || [])
        setLogsTotal(response.pagination?.total || 0)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
            return
          }
          setError(err.message || 'Failed to load activity logs')
        } else {
          setError('Failed to load activity logs')
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [currentPage, activeFilters, logout, isAdmin, user?.id])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(logsTotal / LOGS_PER_PAGE))
    if (currentPage > totalPages - 1) {
      setCurrentPage(totalPages - 1)
    }
  }, [currentPage, logsTotal])

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const totalPages = Math.ceil(logsTotal / LOGS_PER_PAGE)
  const canPaginate = totalPages > 1

  const handleFilterChange = (key: keyof LogFilters, value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [key]: key === 'action' ? (value as LogActionFilter) : value,
    }))
    setCurrentPage(0)
  }

  const handleClearFilters = () => {
    setCurrentPage(0)
    setActiveFilters(DEFAULT_FILTERS)
  }

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(basePath)} className="text-text-subtle text-2xl">
              Dashboard
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-normal text-text">Activity Logs</h1>
          </div>
        </div>
      </nav>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        <div className="bg-card rounded-lg p-4">
          <h3 className="text-text font-normal mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label htmlFor="logs-filter-action" className="block text-xs text-text-muted mb-1">
                Activity Type
              </label>
              <select
                id="logs-filter-action"
                value={activeFilters.action}
                onChange={e => handleFilterChange('action', e.target.value)}
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="CREATE">Create</option>
                <option value="READ">Read</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
              </select>
            </div>
            <div>
              <label htmlFor="logs-filter-from" className="block text-xs text-text-muted mb-1">
                Date/Time From
              </label>
              <input
                id="logs-filter-from"
                type="datetime-local"
                value={activeFilters.from}
                onChange={e => handleFilterChange('from', e.target.value)}
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="logs-filter-to" className="block text-xs text-text-muted mb-1">
                Date/Time To
              </label>
              <input
                id="logs-filter-to"
                type="datetime-local"
                value={activeFilters.to}
                onChange={e => handleFilterChange('to', e.target.value)}
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {isAdmin && (
              <div>
                <label htmlFor="logs-filter-user-id" className="block text-xs text-text-muted mb-1">
                  Actor User
                </label>
                <input
                  id="logs-filter-user-id"
                  type="text"
                  value={activeFilters.userId}
                  onChange={e => handleFilterChange('userId', e.target.value)}
                  placeholder="usr_..."
                  className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            <div>
              <label htmlFor="logs-filter-client-id" className="block text-xs text-text-muted mb-1">
                Client Reference
              </label>
              <input
                id="logs-filter-client-id"
                type="text"
                value={activeFilters.clientId}
                onChange={e => handleFilterChange('clientId', e.target.value)}
                placeholder="clt_..."
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.9] text-sm font-medium transition-all duration-200"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="bg-card rounded-lg mt-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-normal text-text">All Activity Logs</h2>
          </div>
          <div className="overflow-x-auto">
            {isLoading && logs.length === 0 ? (
              <div className="flex items-center justify-center h-40" role="status">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-6 text-center text-text-subtle">No activity logs found</div>
            ) : (
              <table className="w-full">
                <thead className="bg-background-light">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                      Date/Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                      Attribute
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                      User ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                      Client ID
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map(log => (
                    <tr key={log.logId} className="hover:bg-background-light">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                        {formatDateTime(log.dateTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded text-xs font-normal ${
                            log.action === 'CREATE'
                              ? 'bg-success/20 text-success'
                              : log.action === 'UPDATE'
                                ? 'bg-warning/20 text-warning'
                                : log.action === 'DELETE'
                                  ? 'bg-danger/20 text-danger'
                                  : 'bg-primary/20 text-primary'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text">{log.attributeName}</td>
                      <td className="px-6 py-4 text-sm text-text-muted font-mono text-xs">
                        {log.userId}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-muted font-mono text-xs">
                        {log.clientId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {canPaginate && (
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <p className="text-sm text-text-muted">
                Showing {currentPage * LOGS_PER_PAGE + 1} to{' '}
                {Math.min((currentPage + 1) * LOGS_PER_PAGE, logsTotal)} of {logsTotal} activities
              </p>
              <div className="flex items-center space-x-2">
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
