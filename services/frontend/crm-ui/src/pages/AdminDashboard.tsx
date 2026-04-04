import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listLogs } from '@/api/logs'
import { listUsers } from '@/api/users'
import { listClients } from '@/api/clients'
import type { Client, LogEntry } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import {
  ActivityTrendChart,
  NewClientsChart,
  VerificationStatusChart,
  type ActivityTrendPoint,
  type NewClientsPoint,
  type VerificationStatusPoint,
} from '@/components/DashboardCharts'

interface Stats {
  totalAgents: number
  totalAdmins: number
  totalClients: number
  recentActivities: number
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

const PAGE_SIZE = 200

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now)
  from.setDate(now.getDate() - 6)
  return {
    from: toDateInputValue(from),
    to: toDateInputValue(now),
  }
}

function getDateRangeForDays(days: number): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now)
  from.setDate(now.getDate() - (days - 1))
  return {
    from: toDateInputValue(from),
    to: toDateInputValue(now),
  }
}

function getDateKeys(from: string, to: string): string[] {
  const keys: string[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)

  while (cursor <= end) {
    keys.push(toDateInputValue(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return keys
}

function toChartDateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-SG', {
    month: 'short',
    day: 'numeric',
  })
}

function toDateKey(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return toDateInputValue(date)
}

async function fetchAllClientsPaginated(): Promise<Client[]> {
  const clients: Client[] = []
  let offset = 0
  let expectedTotal = Number.POSITIVE_INFINITY

  while (clients.length < expectedTotal) {
    const response = await listClients({ limit: PAGE_SIZE, offset })
    clients.push(...response.data)
    expectedTotal = response.pagination?.total ?? clients.length

    if (response.data.length === 0) {
      break
    }

    offset += PAGE_SIZE
  }

  return clients
}

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
  const [pendingClients, setPendingClients] = useState<Client[]>([])
  const [allClients, setAllClients] = useState<Client[]>([])

  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [activityDateFrom, setActivityDateFrom] = useState(defaultRange.from)
  const [activityDateTo, setActivityDateTo] = useState(defaultRange.to)
  const [activePresetDays, setActivePresetDays] = useState<7 | 14 | 30 | null>(7)
  const [activityTrendData, setActivityTrendData] = useState<ActivityTrendPoint[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isLogsLoading, setIsLogsLoading] = useState(true)
  const [isActivityChartLoading, setIsActivityChartLoading] = useState(true)
  const [isClientChartsLoading, setIsClientChartsLoading] = useState(true)

  const [error, setError] = useState<string>('')
  const [chartError, setChartError] = useState('')

  const verificationStatusData = useMemo<VerificationStatusPoint[]>(() => {
    const pending = allClients.filter(c => c.identityVerificationStatus === 'pending').length
    const verified = allClients.filter(c => c.identityVerificationStatus === 'verified').length
    const rejected = allClients.filter(c => c.identityVerificationStatus === 'rejected').length

    return [
      { name: 'Pending', value: pending, color: 'var(--purple)' },
      { name: 'Verified', value: verified, color: 'var(--green)' },
      { name: 'Rejected', value: rejected, color: 'var(--red)' },
    ]
  }, [allClients])

  const newClientsTrendData = useMemo<NewClientsPoint[]>(() => {
    if (!activityDateFrom || !activityDateTo || activityDateFrom > activityDateTo) {
      return []
    }

    const dateKeys = getDateKeys(activityDateFrom, activityDateTo)
    const buckets = new Map<string, number>(dateKeys.map(key => [key, 0]))

    allClients.forEach(client => {
      const key = toDateKey(client.createdAt)
      if (key && buckets.has(key)) {
        buckets.set(key, (buckets.get(key) || 0) + 1)
      }
    })

    return dateKeys.map(key => ({
      date: toChartDateLabel(key),
      clients: buckets.get(key) || 0,
    }))
  }, [allClients, activityDateFrom, activityDateTo])

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [agentsResult, adminsResult, rootAdminsResult, clientsResult] =
          await Promise.allSettled([
            listUsers({ limit: 1, role: 'user' }),
            listUsers({ limit: 1, role: 'admin' }),
            listUsers({ limit: 1, role: 'super_admin' }),
            listClients({ limit: 1 }),
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

        setStats(prev => ({
          totalAgents: agentsResponse?.pagination?.total || 0,
          totalAdmins:
            (adminsResponse?.pagination?.total || 0) + (rootAdminsResponse?.pagination?.total || 0),
          totalClients: clientsResponse?.pagination?.total || 0,
          recentActivities: prev.recentActivities,
        }))
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
            return
          }
          setError(err.message || 'Failed to load dashboard data')
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
    const fetchRecentLogs = async () => {
      setIsLogsLoading(true)
      try {
        const response = await listLogs({ limit: 10 })
        const total = response.pagination?.total || 0
        setRecentLogs(response.data || [])
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
  }, [logout])

  useEffect(() => {
    const fetchClientChartsData = async () => {
      setIsClientChartsLoading(true)
      setChartError('')

      try {
        const clients = await fetchAllClientsPaginated()
        setAllClients(clients)

        const pending = clients.filter(c => c.identityVerificationStatus === 'pending')
        setPendingClients(pending)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
            return
          }
          setChartError(err.message || 'Failed to load client chart data')
        } else {
          setChartError('Failed to load client chart data')
        }
      } finally {
        setIsClientChartsLoading(false)
      }
    }

    fetchClientChartsData()
  }, [logout])

  useEffect(() => {
    const fetchActivityTrend = async () => {
      if (!activityDateFrom || !activityDateTo || activityDateFrom > activityDateTo) {
        setChartError('Date range is invalid. Please set a valid From and To date.')
        setActivityTrendData([])
        setIsActivityChartLoading(false)
        return
      }

      setIsActivityChartLoading(true)
      setChartError('')

      try {
        const dateKeys = getDateKeys(activityDateFrom, activityDateTo)
        const buckets = new Map<string, { create: number; update: number; delete: number }>(
          dateKeys.map(key => [key, { create: 0, update: 0, delete: 0 }])
        )

        const fromIso = new Date(`${activityDateFrom}T00:00:00`).toISOString()
        const toIso = new Date(`${activityDateTo}T23:59:59.999`).toISOString()

        let offset = 0
        let expectedTotal = Number.POSITIVE_INFINITY

        while (offset < expectedTotal) {
          const response = await listLogs({
            limit: PAGE_SIZE,
            offset,
            from: fromIso,
            to: toIso,
          })

          expectedTotal = response.pagination?.total ?? response.data.length

          response.data.forEach(log => {
            const key = toDateKey(log.dateTime)
            if (!key || !buckets.has(key)) return

            const bucket = buckets.get(key)
            if (!bucket) return

            if (log.action === 'CREATE') bucket.create += 1
            if (log.action === 'UPDATE') bucket.update += 1
            if (log.action === 'DELETE') bucket.delete += 1
          })

          if (response.data.length === 0) {
            break
          }

          offset += PAGE_SIZE
        }

        setActivityTrendData(
          dateKeys.map(key => ({
            date: toChartDateLabel(key),
            create: buckets.get(key)?.create || 0,
            update: buckets.get(key)?.update || 0,
            delete: buckets.get(key)?.delete || 0,
          }))
        )
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
            return
          }
          setChartError(err.message || 'Failed to load activity trend data')
        } else {
          setChartError('Failed to load activity trend data')
        }
      } finally {
        setIsActivityChartLoading(false)
      }
    }

    fetchActivityTrend()
  }, [activityDateFrom, activityDateTo, logout])

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <SidebarLayout items={adminNav}>
      <div>
        <div className="flex justify-between h-16 items-center">
          <div>
            <h1 className="text-2xl font-normal text-text">Admin Dashboard</h1>
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
              <div className="gradient-dark-red rounded-lg p-6">
                <h3 className="text-white text-sm font-normal mb-2">Total Agents</h3>
                <p className="text-4xl font-bold text-white">{stats.totalAgents}</p>
              </div>
              <div className="bg-card rounded-lg p-6">
                <h3 className="text-text-muted text-sm font-normal mb-2">Total Admins</h3>
                <p className="text-4xl font-bold text-text">{stats.totalAdmins}</p>
              </div>
              <div className="gradient-light-red rounded-lg p-6">
                <h3 className="text-white text-sm font-normal mb-2">Total Clients</h3>
                <p className="text-4xl font-bold text-white">{stats.totalClients}</p>
              </div>
              <div className="bg-card rounded-lg p-6">
                <h3 className="text-text-muted text-sm font-normal mb-2">Recent Activities</h3>
                <p className="text-4xl font-bold text-text">{stats.recentActivities}</p>
              </div>
            </div>

            <div className="bg-card rounded-lg p-6 mb-8">
              <div>
                <h2 className="text-lg font-normal text-text mb-4">Activity Trend</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <label className="text-sm text-text-muted">
                    From
                    <input
                      type="date"
                      value={activityDateFrom}
                      onChange={e => {
                        setActivityDateFrom(e.target.value)
                        setActivePresetDays(null)
                      }}
                      className="mt-1 w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </label>
                  <label className="text-sm text-text-muted">
                    To
                    <input
                      type="date"
                      value={activityDateTo}
                      onChange={e => {
                        setActivityDateTo(e.target.value)
                        setActivePresetDays(null)
                      }}
                      className="mt-1 w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    onClick={() => {
                      const range = getDateRangeForDays(7)
                      setActivityDateFrom(range.from)
                      setActivityDateTo(range.to)
                      setActivePresetDays(7)
                    }}
                    className={`px-2.5 py-1 text-xs rounded border transition-all duration-150 hover:brightness-110 ${
                      activePresetDays === 7
                        ? 'text-white border-danger bg-gradient-to-r from-danger to-red-900'
                        : 'text-danger border-danger bg-transparent'
                    }`}
                  >
                    Last 7 days
                  </button>
                  <button
                    onClick={() => {
                      const range = getDateRangeForDays(14)
                      setActivityDateFrom(range.from)
                      setActivityDateTo(range.to)
                      setActivePresetDays(14)
                    }}
                    className={`px-2.5 py-1 text-xs rounded border transition-all duration-150 hover:brightness-110 ${
                      activePresetDays === 14
                        ? 'text-white border-danger bg-gradient-to-r from-danger to-red-900'
                        : 'text-danger border-danger bg-transparent'
                    }`}
                  >
                    Last 14 days
                  </button>
                  <button
                    onClick={() => {
                      const range = getDateRangeForDays(30)
                      setActivityDateFrom(range.from)
                      setActivityDateTo(range.to)
                      setActivePresetDays(30)
                    }}
                    className={`px-2.5 py-1 text-xs rounded border transition-all duration-150 hover:brightness-110 ${
                      activePresetDays === 30
                        ? 'text-white border-danger bg-gradient-to-r from-danger to-red-900'
                        : 'text-danger border-danger bg-transparent'
                    }`}
                  >
                    Last 30 days
                  </button>
                </div>
              </div>
              <ActivityTrendChart data={activityTrendData} isLoading={isActivityChartLoading} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
              <div className="bg-card rounded-lg p-6">
                <h2 className="text-lg font-normal text-text mb-2">Client verification status</h2>
                <VerificationStatusChart
                  data={verificationStatusData}
                  isLoading={isClientChartsLoading}
                />
              </div>
              <div className="bg-card rounded-lg p-6">
                <h2 className="text-lg font-normal text-text mb-2">New clients over time</h2>
                <NewClientsChart data={newClientsTrendData} isLoading={isClientChartsLoading} />
              </div>
            </div>

            {chartError && (
              <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
                <p className="text-danger text-sm">{chartError}</p>
              </div>
            )}

            {pendingClients.length > 0 && (
              <div className="bg-card border border-warning rounded-lg">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-xl font-normal text-text">
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
                              className="underline-hover text-primary font-normal"
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

            <div className="bg-card rounded-lg mt-8">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-xl font-normal text-text">Recent Activity Logs</h2>
                <button
                  onClick={() => navigate('/admin/logs')}
                  className="underline-hover text-primary text-sm"
                >
                  View all →
                </button>
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
            </div>
          </>
        )}
      </main>
    </SidebarLayout>
  )
}
