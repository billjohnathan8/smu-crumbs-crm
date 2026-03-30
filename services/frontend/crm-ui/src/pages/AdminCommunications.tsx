import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
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
import { CommunicationsPanel } from '@/components/CommunicationsPanel'

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

const statusColors: Record<CommunicationStatus, string> = {
  queued: 'bg-warning/20 text-warning',
  sent: 'bg-success/20 text-success',
  failed: 'bg-danger/20 text-danger',
}

export function AdminCommunications() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const canAccessCommunications = isAdmin || isSuperAdmin

  const [communications, setCommunications] = useState<Communication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [statusUpdates, setStatusUpdates] = useState<Record<string, CommunicationStatus>>({})
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({})

  const [providerLookupId, setProviderLookupId] = useState('')
  const [providerLookupResult, setProviderLookupResult] = useState<Communication | null>(null)
  const [providerLookupError, setProviderLookupError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)

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
          err.message ||
            (err.status >= 500
              ? 'Communications service is not available in this deployment environment.'
              : 'Failed to load communications')
        )
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load communications')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!canAccessCommunications) {
      setIsLoading(false)
      return
    }

    fetchQueued()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessCommunications])

  const handleStatusUpdate = async (communicationId: string) => {
    const status = statusUpdates[communicationId]
    if (!status) return

    setIsUpdating(prev => ({ ...prev, [communicationId]: true }))
    setError('')

    try {
      const updated = await updateCommunicationStatus(communicationId, { status })
      setCommunications(prev =>
        prev.map(comm =>
          comm.communicationId === communicationId
            ? { ...comm, status: updated.status, updatedAt: updated.updatedAt }
            : comm
        )
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
      } else if (err instanceof ApiError && err.status === 403) {
        setError('You are not authorized to update communications.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to update status')
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
      if (err instanceof ApiError && err.status === 401) {
        logout()
      } else if (err instanceof ApiError && err.status === 400) {
        setCommLookupError('Invalid id.')
      } else if (err instanceof ApiError && err.status === 403) {
        setCommLookupError('You are not authorized to view this communication.')
      } else {
        setCommLookupError(err instanceof ApiError ? err.message : 'Communication not found')
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
      if (err instanceof ApiError && err.status === 401) {
        logout()
      } else if (err instanceof ApiError && err.status === 400) {
        setProviderLookupError('Invalid id.')
      } else if (err instanceof ApiError && err.status === 403) {
        setProviderLookupError('You are not authorized to view this communication.')
      } else {
        setProviderLookupError(err instanceof ApiError ? err.message : 'Communication not found')
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderCommunicationDetail = (comm: Communication, label: string) => (
    <div className="mt-4 rounded-lg  bg-card p-4">
      <h4 className="mb-3 font-normal text-text">{label}</h4>
      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        <div>
          <span className="text-text-muted">ID:</span>{' '}
          <span className="font-mono text-text">{comm.communicationId}</span>
        </div>
        <div>
          <span className="text-text-muted">Client:</span>{' '}
          <span className="font-mono text-text">{comm.clientId}</span>
        </div>
        <div>
          <span className="text-text-muted">User:</span>{' '}
          <span className="font-mono text-text">{comm.userId}</span>
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
          <span className={`rounded px-2 py-0.5 text-xs font-normal ${statusColors[comm.status]}`}>
            {comm.status}
          </span>
        </div>

        {comm.providerMessageId && (
          <div>
            <span className="text-text-muted">Provider ID:</span>{' '}
            <span className="font-mono text-xs text-text">{comm.providerMessageId}</span>
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

        {comm.errorMessage && (
          <div className="md:col-span-2 xl:col-span-3">
            <span className="text-text-muted">Error:</span>{' '}
            <span className="text-xs text-danger">{comm.errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  )

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!canAccessCommunications) {
    return <Navigate to="/unauthorized" replace />
  }

  if (isLoading) {
    return (
      <SidebarLayout items={adminNav}>
        <div className="flex h-64 items-center justify-center">
          <div
            data-testid="loading-spinner"
            className="inline-block h-12 w-12 animate-spin rounded-full"
          />
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout items={adminNav}>
      <nav>
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/admin')} className="text-text-subtle text-2xl">
              Dashboard
            </button>
            <span className="text-text-subtle text-2xl">/</span>
            <h1 className="text-2xl font-medium text-text">Communications</h1>
          </div>
        </div>
      </nav>

      <main className="mt-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-danger bg-danger/10 p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg  bg-card p-4">
            <h3 className="mb-3 font-normal text-text">Lookup by Communication ID</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={commLookupId}
                onChange={e => setCommLookupId(e.target.value)}
                className="flex-1 rounded  bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="com_..."
              />
              <button
                onClick={handleCommLookup}
                disabled={isCommLookingUp || !commLookupId.trim()}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:brightness-[0.8] disabled:opacity-50"
              >
                {isCommLookingUp ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
            {commLookupError && <p className="mt-2 text-sm text-danger">{commLookupError}</p>}
            {commLookupResult && renderCommunicationDetail(commLookupResult, 'Result')}
          </div>

          <div className="rounded-lg  bg-card p-4">
            <h3 className="mb-3 font-normal text-text">Lookup by Provider Message ID</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={providerLookupId}
                onChange={e => setProviderLookupId(e.target.value)}
                className="flex-1 rounded  bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Provider message ID..."
              />
              <button
                onClick={handleProviderLookup}
                disabled={isLookingUp || !providerLookupId.trim()}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:brightness-[0.8] disabled:opacity-50"
              >
                {isLookingUp ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
            {providerLookupError && (
              <p className="mt-2 text-sm text-danger">{providerLookupError}</p>
            )}
            {providerLookupResult && renderCommunicationDetail(providerLookupResult, 'Result')}
          </div>
        </div>

        <CommunicationsPanel
          communications={communications}
          formatDate={formatDateTime}
          title="Queued Communications"
          titleAsHeading={false}
          emptyMessage="No queued communications found"
          onRefresh={fetchQueued}
          isRefreshing={isLoading}
          editableStatuses
          statusUpdates={statusUpdates}
          setStatusUpdates={setStatusUpdates}
          isUpdating={isUpdating}
          onUpdateStatus={handleStatusUpdate}
        />
      </main>
    </SidebarLayout>
  )
}
