import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listLogs } from '@/api/logs'
import { listUsers } from '@/api/users'
import { listClients } from '@/api/clients'
import type { LogEntry, Client } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

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
  const [isLoading, setIsLoading] = useState(true)
  const [isLogsLoading, setIsLogsLoading] = useState(true)
  const [error, setError] = useState<string>('')

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

            {/* Pending Verifications */}
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
