import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { listLogs } from '@/api/logs'
import { listClients } from '@/api/clients'
import type { LogEntry } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const agentNav: NavItem[] = [
  { label: 'Home', to: '/agent', end: true },
  { label: 'My Clients', to: '/agent/clients' },
  { label: 'Create Client', to: '/agent/clients/new' },
  { label: 'Transactions', to: '/agent/transactions' },
  { label: 'AML Alerts', to: '/agent/aml-alerts' },
]

export function AgentDashboard() {
  const { user, logout } = useAuth()
  const [clientCount, setClientCount] = useState(0)
  const [recentActivities, setRecentActivities] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true)
      setError('')

      try {
        const [clientsResponse, logsResponse] = await Promise.all([
          listClients({ limit: 1 }),
          listLogs({ limit: 10, agentId: user?.id }),
        ])

        setClientCount(clientsResponse.pagination?.total || 0)
        setRecentActivities(logsResponse.data)
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
  }, [user?.id, logout])

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
    <SidebarLayout items={agentNav}>
      <div className="flex justify-between h-16 items-center">
        <div>
          <h1 className="text-xl font-bold text-text">Agent Dashboard</h1>
          <p className="text-sm text-text-muted">
            Welcome, {user?.firstName} {user?.lastName}
          </p>
        </div>

        <div className="flex space-x-4">
          <a
            href="/agent/clients/new"
            className="px-4 py-2 rounded-lg bg-success hover:bg-success-hover text-white font-medium transition-colors"
          >
            Create Client
          </a>
          <a
            href="/agent/transactions"
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            View Transactions
          </a>
          <a
            href="/agent/aml-alerts"
            className="px-4 py-2 rounded-lg bg-warning hover:bg-warning-hover text-white font-medium transition-colors"
          >
            AML Alerts
          </a>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
          >
            Logout
          </button>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-text-muted text-sm font-medium mb-2">My Clients</h3>
                <p className="text-4xl font-bold text-text">{clientCount}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-text-muted text-sm font-medium mb-2">Recent Activities</h3>
                <p className="text-4xl font-bold text-text">{recentActivities.length}</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-text">My Recent Activities</h2>
              </div>

              <div className="overflow-x-auto">
                {recentActivities.length === 0 ? (
                  <div className="p-6 text-center text-text-muted">No recent activities</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-background-light">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          Date/Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          Attribute
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          Client ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          Before
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                          After
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentActivities.map(log => (
                        <tr key={log.logId} className="hover:bg-background-light">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                            {formatDateTime(log.dateTime)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
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
                            {log.clientId.substring(0, 8)}...
                          </td>
                          <td className="px-6 py-4 text-sm text-text-subtle max-w-xs truncate">
                            {log.beforeValue || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-text max-w-xs truncate">
                            {log.afterValue || '-'}
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
