import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listLogs } from '@/api/logs'
import { listUsers } from '@/api/users'
import { listClients } from '@/api/clients'
import type { LogAction, LogEntry, Client } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

interface Stats {
  totalAgents: number
  totalAdmins: number
  totalClients: number
  recentActivities: number
}

const LOGS_PER_PAGE = 10
type DashboardLogActionFilter = LogAction | 'all'

type DashboardLogFilters = {
  action: DashboardLogActionFilter
  from: string
  to: string
  userId: string
  clientId: string
}

const DEFAULT_LOG_FILTERS: DashboardLogFilters = {
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
  { label: 'User Management', to: '/admin/users' },
  { label: 'Settings', to: '/admin/settings' },
]

export function AdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    totalAgents: 0,
    totalAdmins: 0,
    totalClients: 0,
    recentActivities: 0,
  })
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [currentLogsPage, setCurrentLogsPage] = useState(0)
  const [pendingClients, setPendingClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLogsLoading, setIsLogsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [activeLogsFilters, setActiveLogsFilters] =
    useState<DashboardLogFilters>(DEFAULT_LOG_FILTERS)

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [agentsResult, adminsResult, rootAdminsResult, clientsResult, allClientsResult] =
          await Promise.allSettled([
            listUsers({ limit: 1, role: 'user' }),
            listUsers({ limit: 1, role: 'admin' }),
            listUsers({ limit: 1, role: 'super_admin' }),
            listClients({ limit: 1 }),
            listClients({ limit: 100 }),
          ])
        let nextError = ''

        if (agentsResult.status === 'rejected') {
          const reason = agentsResult.reason
          if (reason instanceof ApiError && reason.status === 401) {
            logout()
            return
          }
          nextError =
            reason instanceof ApiError
              ? reason.message || 'Failed to load dashboard data'
              : 'Failed to load dashboard data'
        }
        if (nextError) {
          setError(nextError)
        }

        const agentsResponse = agentsResult.status === 'fulfilled' ? agentsResult.value : null
        const adminsResponse = adminsResult.status === 'fulfilled' ? adminsResult.value : null
        const rootAdminsResponse =
          rootAdminsResult.status === 'fulfilled' ? rootAdminsResult.value : null
        const clientsResponse = clientsResult.status === 'fulfilled' ? clientsResult.value : null
        const allClientsResponse =
          allClientsResult.status === 'fulfilled' ? allClientsResult.value : null

        setStats(prev => ({
          totalAgents: agentsResponse?.pagination?.total || 0,
          totalAdmins:
            (adminsResponse?.pagination?.total || 0) + (rootAdminsResponse?.pagination?.total || 0),
          totalClients: clientsResponse?.pagination?.total || 0,
          recentActivities: prev.recentActivities,
        }))

        // Filter for clients with pending verification
        const pending = (allClientsResponse?.data || []).filter(
          (c: Client) => c.identityVerificationStatus === 'pending'
        )
        setPendingClients(pending)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
          } else {
            setError(err.message || 'Failed to load dashboard data')
          }
        } else {
          setError('An unexpected error occurred')
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [logout])

  useEffect(() => {
    const toIsoDateTime = (value: string): string | undefined => {
      if (!value) return undefined
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
    }

    const buildListLogsParams = () => {
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
        offset: currentLogsPage * LOGS_PER_PAGE,
      }

      if (activeLogsFilters.action !== 'all') {
        params.action = activeLogsFilters.action
      }
      const fromIso = toIsoDateTime(activeLogsFilters.from)
      const toIso = toIsoDateTime(activeLogsFilters.to)
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
      if (activeLogsFilters.userId.trim()) params.userId = activeLogsFilters.userId.trim()
      if (activeLogsFilters.clientId.trim()) params.clientId = activeLogsFilters.clientId.trim()

      return params
    }

    const fetchRecentLogs = async () => {
      setIsLogsLoading(true)

      try {
        const response = await listLogs(buildListLogsParams())
        const total = response.pagination?.total || 0
        setRecentLogs(response.data || [])
        setLogsTotal(total)
        setStats(prev => ({ ...prev, recentActivities: total }))
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
            return
          }
          setError(err.message || 'Failed to load recent activity logs')
        } else {
          setError('Failed to load recent activity logs')
        }
      } finally {
        setIsLogsLoading(false)
      }
    }

    fetchRecentLogs()
  }, [currentLogsPage, logout, activeLogsFilters])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(logsTotal / LOGS_PER_PAGE))
    if (currentLogsPage > totalPages - 1) {
      setCurrentLogsPage(totalPages - 1)
    }
  }, [currentLogsPage, logsTotal])

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const totalLogPages = Math.ceil(logsTotal / LOGS_PER_PAGE)
  const canPaginateLogs = totalLogPages > 1
  const handleLogFilterChange = (key: keyof DashboardLogFilters, value: string) => {
    setActiveLogsFilters(prev => ({
      ...prev,
      [key]: key === 'action' ? (value as DashboardLogActionFilter) : value,
    }))
    setCurrentLogsPage(0)
  }

  const handleClearLogsFilters = () => {
    setCurrentLogsPage(0)
    setActiveLogsFilters(DEFAULT_LOG_FILTERS)
  }

  return (
    <SidebarLayout items={adminNav}>
      <div>
        <div className="flex justify-between h-16 items-center">
          <div>
            <h1 className="text-2xl font-medium text-text">Admin Dashboard</h1>
            <p className="text-lg text-text-muted">
              Welcome, {user?.firstName} {user?.lastName}
            </p>
          </div>
        </div>
      </div>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64" role="status">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="gradient-dark-red rounded-2xl p-6">
                <h3 className="text-white text-sm font-normal mb-2">Total Agents</h3>
                <p className="text-4xl font-bold text-white">{stats.totalAgents}</p>
              </div>
              <div className="bg-card  rounded-2xl p-6">
                <h3 className="text-text-muted text-sm font-normal mb-2">Total Admins</h3>
                <p className="text-4xl font-bold text-text">{stats.totalAdmins}</p>
              </div>
              <div className="gradient-light-red rounded-2xl p-6">
                <h3 className="text-white text-sm font-normal mb-2">Total Clients</h3>
                <p className="text-4xl font-bold text-white">{stats.totalClients}</p>
              </div>
              <div className="bg-card  rounded-2xl p-6">
                <h3 className="text-text-muted text-sm font-normal mb-2">Recent Activities</h3>
                <p className="text-4xl font-bold text-text">{stats.recentActivities}</p>
              </div>
            </div>

            {/* Pending Verifications */}
            {pendingClients.length > 0 && (
              <div className="bg-card border border-warning rounded-lg">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-xl font-bold text-text">
                    Pending Verifications ({pendingClients.length})
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-background-light">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Client
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pendingClients.map(c => (
                        <tr
                          key={c.clientId}
                          className="hover:bg-background-light transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                            {c.firstName} {c.lastName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted">
                            {c.emailAddress}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => navigate(`/admin/clients/${c.clientId}`)}
                              className="text-primary hover:underline font-normal"
                            >
                              Review →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-card rounded-lg p-4 mt-6">
              <h3 className="text-text font-normal mb-4">Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label
                    htmlFor="logs-filter-action"
                    className="block text-xs text-text-muted mb-1"
                  >
                    Activity Type
                  </label>
                  <select
                    id="logs-filter-action"
                    value={activeLogsFilters.action}
                    onChange={e => handleLogFilterChange('action', e.target.value)}
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All</option>
                    <option value="CREATE">Create</option>
                    <option value="READ">Read</option>
                    <option value="UPDATE">Update</option>
                    <option value="DELETE">Delete</option>
                    <option value="COMMUNICATION">Communication</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="logs-filter-from" className="block text-xs text-text-muted mb-1">
                    Date/Time From
                  </label>
                  <input
                    id="logs-filter-from"
                    type="datetime-local"
                    value={activeLogsFilters.from}
                    onChange={e => handleLogFilterChange('from', e.target.value)}
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
                    value={activeLogsFilters.to}
                    onChange={e => handleLogFilterChange('to', e.target.value)}
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="logs-filter-user-id"
                    className="block text-xs text-text-muted mb-1"
                  >
                    Actor User
                  </label>
                  <input
                    id="logs-filter-user-id"
                    type="text"
                    value={activeLogsFilters.userId}
                    onChange={e => handleLogFilterChange('userId', e.target.value)}
                    placeholder="usr_..."
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="logs-filter-client-id"
                    className="block text-xs text-text-muted mb-1"
                  >
                    Client Reference
                  </label>
                  <input
                    id="logs-filter-client-id"
                    type="text"
                    value={activeLogsFilters.clientId}
                    onChange={e => handleLogFilterChange('clientId', e.target.value)}
                    placeholder="clt_..."
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleClearLogsFilters}
                  className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.9] text-sm font-medium transition-all duration-200"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            <div className="bg-card rounded-lg mt-6">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-xl font-normal text-text">Recent Activity Logs</h2>
              </div>
              <div className="overflow-x-auto">
                {isLogsLoading && recentLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-40" role="status">
                    <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                  </div>
                ) : recentLogs.length === 0 ? (
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
                      {recentLogs.map(log => (
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
              {canPaginateLogs && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    Showing {currentLogsPage * LOGS_PER_PAGE + 1} to{' '}
                    {Math.min((currentLogsPage + 1) * LOGS_PER_PAGE, logsTotal)} of {logsTotal}{' '}
                    activities
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentLogsPage(page => page - 1)}
                      disabled={currentLogsPage === 0 || isLogsLoading}
                      className={`px-3 py-1 rounded ${
                        currentLogsPage === 0 || isLogsLoading
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-hover text-white'
                      }`}
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-text">
                      Page {currentLogsPage + 1} of {totalLogPages}
                    </span>
                    <button
                      onClick={() => setCurrentLogsPage(page => page + 1)}
                      disabled={currentLogsPage >= totalLogPages - 1 || isLogsLoading}
                      className={`px-3 py-1 rounded ${
                        currentLogsPage >= totalLogPages - 1 || isLogsLoading
                          ? 'bg-background-light text-text-muted cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-hover text-white'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </SidebarLayout>
  )
}
