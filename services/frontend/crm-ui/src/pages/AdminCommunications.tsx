import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  listQueuedCommunications,
  getCommunicationById,
  updateCommunicationStatus,
  updateCommunicationStatusByProviderMessageId,
} from '@/api/communications'
import type {
  Communication,
  CommunicationStatus,
  UpdateCommunicationStatusRequest,
} from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'Manage Accounts', to: '/admin/accounts' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
]

const statusColors: Record<CommunicationStatus, string> = {
  queued: 'bg-warning/20 text-warning',
  sent: 'bg-success/20 text-success',
  failed: 'bg-danger/20 text-danger',
}

export function AdminCommunications() {
  const { logout } = useAuth()
  const [communications, setCommunications] = useState<Communication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusUpdates, setStatusUpdates] = useState<Record<string, CommunicationStatus>>({})
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({})

  // Lookup by provider message ID
  const [providerLookupId, setProviderLookupId] = useState('')
  const [providerLookupResult, setProviderLookupResult] = useState<Communication | null>(null)
  const [providerLookupError, setProviderLookupError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)

  // Lookup by communication ID
  const [commLookupId, setCommLookupId] = useState('')
  const [commLookupResult, setCommLookupResult] = useState<Communication | null>(null)
  const [commLookupError, setCommLookupError] = useState('')
  const [isCommLookingUp, setIsCommLookingUp] = useState(false)

  const fetchQueued = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await listQueuedCommunications({ limit: 200 })
      setCommunications(response.data)
      setStatusUpdates(
        response.data.reduce<Record<string, CommunicationStatus>>((acc, comm) => {
          acc[comm.communicationId] = comm.status
          return acc
        }, {})
      )
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setError(
          err.status >= 500
            ? 'Communications service is not available in this deployment environment.'
            : (err.message || 'Failed to load communications')
        )
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchQueued()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStatusUpdate = async (communicationId: string) => {
    const status = statusUpdates[communicationId]
    if (!status) return

    setIsUpdating(prev => ({ ...prev, [communicationId]: true }))
    setError('')
    try {
      const updated = await updateCommunicationStatus(communicationId, { status })
      setCommunications(prev =>
        prev.map(c =>
          c.communicationId === communicationId
            ? { ...c, status: updated.status, updatedAt: updated.updatedAt }
            : c
        )
      )
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setError(err.message || 'Failed to update status')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsUpdating(prev => ({ ...prev, [communicationId]: false }))
    }
  }

  const handleCommLookup = async () => {
    if (!commLookupId.trim()) return
    setIsCommLookingUp(true)
    setCommLookupError('')
    setCommLookupResult(null)
    try {
      const result = await getCommunicationById(commLookupId.trim())
      setCommLookupResult(result)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setCommLookupError(err.message || 'Communication not found')
      } else {
        setCommLookupError('An unexpected error occurred')
      }
    } finally {
      setIsCommLookingUp(false)
    }
  }

  const handleProviderLookup = async () => {
    if (!providerLookupId.trim()) return
    setIsLookingUp(true)
    setProviderLookupError('')
    setProviderLookupResult(null)
    try {
      const data: UpdateCommunicationStatusRequest = {}
      const result = await updateCommunicationStatusByProviderMessageId(
        providerLookupId.trim(),
        data
      )
      setProviderLookupResult(result)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setProviderLookupError(err.message || 'Communication not found')
      } else {
        setProviderLookupError('An unexpected error occurred')
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const renderCommunicationDetail = (comm: Communication, label: string) => (
    <div className="bg-card border border-border rounded-lg p-4 mt-4">
      <h4 className="font-medium text-text mb-3">{label}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-text-muted">ID:</span>{' '}
          <span className="font-mono text-text">{comm.communicationId}</span>
        </div>
        <div>
          <span className="text-text-muted">Client:</span>{' '}
          <span className="font-mono text-text">{comm.clientId}</span>
        </div>
        <div>
          <span className="text-text-muted">Agent:</span>{' '}
          <span className="font-mono text-text">{comm.agentId}</span>
        </div>
        <div>
          <span className="text-text-muted">To:</span>{' '}
          <span className="text-text">{comm.toEmail}</span>
        </div>
        <div>
          <span className="text-text-muted">Subject:</span>{' '}
          <span className="text-text">{comm.subject}</span>
        </div>
        <div>
          <span className="text-text-muted">Status:</span>{' '}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[comm.status]}`}>
            {comm.status}
          </span>
        </div>
        {comm.providerMessageId && (
          <div>
            <span className="text-text-muted">Provider ID:</span>{' '}
            <span className="font-mono text-text text-xs">{comm.providerMessageId}</span>
          </div>
        )}
        {comm.errorMessage && (
          <div className="col-span-2">
            <span className="text-text-muted">Error:</span>{' '}
            <span className="text-danger text-xs">{comm.errorMessage}</span>
          </div>
        )}
        <div>
          <span className="text-text-muted">Created:</span>{' '}
          <span className="text-text">{formatDateTime(comm.createdAt)}</span>
        </div>
        <div>
          <span className="text-text-muted">Updated:</span>{' '}
          <span className="text-text">{formatDateTime(comm.updatedAt)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <SidebarLayout items={adminNav}>
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center space-x-4">
          <a href="/admin" className="text-text-muted hover:text-text">
            Dashboard
          </a>
          <span className="text-text-muted">/</span>
          <h1 className="text-xl font-bold text-text">Communications</h1>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
        >
          Logout
        </button>
      </div>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {/* Lookup Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Lookup by Communication ID */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-text font-medium mb-3">Lookup by Communication ID</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={commLookupId}
                onChange={e => setCommLookupId(e.target.value)}
                className="flex-1 px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="com_..."
              />
              <button
                onClick={handleCommLookup}
                disabled={isCommLookingUp || !commLookupId.trim()}
                className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isCommLookingUp ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
            {commLookupError && <p className="text-danger text-sm mt-2">{commLookupError}</p>}
            {commLookupResult && renderCommunicationDetail(commLookupResult, 'Result')}
          </div>

          {/* Lookup by Provider Message ID */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-text font-medium mb-3">Lookup by Provider Message ID</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={providerLookupId}
                onChange={e => setProviderLookupId(e.target.value)}
                className="flex-1 px-3 py-2 bg-background-light border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Provider message ID..."
              />
              <button
                onClick={handleProviderLookup}
                disabled={isLookingUp || !providerLookupId.trim()}
                className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isLookingUp ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
            {providerLookupError && (
              <p className="text-danger text-sm mt-2">{providerLookupError}</p>
            )}
            {providerLookupResult && renderCommunicationDetail(providerLookupResult, 'Result')}
          </div>
        </div>

        {/* Queued Communications Table */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-xl font-bold text-text">Queued Communications</h2>
            <button
              onClick={fetchQueued}
              disabled={isLoading}
              className="px-4 py-2 rounded bg-background-light hover:bg-background-lighter text-text text-sm font-medium transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64" role="status">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : communications.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No queued communications found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-light">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {communications.map(comm => (
                    <tr key={comm.communicationId} className="hover:bg-background-light">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-mono">
                        {comm.communicationId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                        {comm.toEmail}
                      </td>
                      <td className="px-6 py-4 text-sm text-text max-w-xs truncate">
                        {comm.subject}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={statusUpdates[comm.communicationId] ?? comm.status}
                            onChange={e =>
                              setStatusUpdates(prev => ({
                                ...prev,
                                [comm.communicationId]: e.target.value as CommunicationStatus,
                              }))
                            }
                            className="px-2 py-1 bg-background-light border border-border rounded text-sm"
                          >
                            <option value="queued">queued</option>
                            <option value="sent">sent</option>
                            <option value="failed">failed</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                        {formatDateTime(comm.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleStatusUpdate(comm.communicationId)}
                          disabled={isUpdating[comm.communicationId]}
                          className="px-2 py-1 text-xs rounded bg-primary hover:bg-primary-hover text-white disabled:opacity-50"
                        >
                          {isUpdating[comm.communicationId] ? 'Saving...' : 'Update'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </SidebarLayout>
  )
}
