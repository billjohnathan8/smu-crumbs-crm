import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  listCommunications,
  listQueuedCommunications,
  getCommunicationById,
  listClientCommunications,
  type ListCommunicationsParams,
} from '@/api/communications'
import type { Communication, CommunicationStatus } from '@/api/types'
import { ApiError } from '@/api/client'
import { listClients } from '@/api/clients'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import { CommunicationsPanel } from '@/components/CommunicationsPanel'

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients', end: true },
  { label: 'Client Archives', to: '/admin/client-archives', end: true },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Settings', to: '/admin/settings' },
]

const statusColors: Record<CommunicationStatus, string> = {
  queued: 'bg-warning/20 text-warning',
  sent: 'bg-success/20 text-success',
  failed: 'bg-danger/20 text-danger',
}
const COMMUNICATION_LOOKUP_TIMEOUT_MS = 15000
const COMMUNICATIONS_PER_PAGE = 10
type FilterStatus = CommunicationStatus | 'all'

type CommunicationFilters = {
  status: FilterStatus
  createdFrom: string
  createdTo: string
  recipient: string
  subject: string
  client: string
  sender: string
  descriptionContains: string
}

const DEFAULT_FILTERS: CommunicationFilters = {
  status: 'all',
  createdFrom: '',
  createdTo: '',
  recipient: '',
  subject: '',
  client: '',
  sender: '',
  descriptionContains: '',
}

export function AdminCommunications() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const canAccessCommunications = isAdmin || isSuperAdmin

  const [communications, setCommunications] = useState<Communication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [hasLoadedList, setHasLoadedList] = useState(false)
  const [error, setError] = useState('')
  const [totalCommunications, setTotalCommunications] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)

  const [clientNameLookup, setClientNameLookup] = useState('')
  const [clientLookupResult, setClientLookupResult] = useState<Communication | null>(null)
  const [clientLookupError, setClientLookupError] = useState('')
  const [isClientLookingUp, setIsClientLookingUp] = useState(false)

  const [commLookupId, setCommLookupId] = useState('')
  const [commLookupResult, setCommLookupResult] = useState<Communication | null>(null)
  const [commLookupError, setCommLookupError] = useState('')
  const [isCommLookingUp, setIsCommLookingUp] = useState(false)
  const [activeFilters, setActiveFilters] = useState<CommunicationFilters>(DEFAULT_FILTERS)

  const filteredCommunications = activeFilters.descriptionContains.trim()
    ? communications.filter(c =>
        (c.body ?? '')
          .toLowerCase()
          .includes(activeFilters.descriptionContains.trim().toLowerCase())
      )
    : communications

  const toIsoDateTime = (value: string): string | undefined => {
    if (!value) return undefined
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }

  const buildListParams = (
    filters: CommunicationFilters,
    page: number
  ): ListCommunicationsParams => ({
    limit: COMMUNICATIONS_PER_PAGE,
    offset: page * COMMUNICATIONS_PER_PAGE,
    status: filters.status === 'all' ? undefined : filters.status,
    createdFrom: toIsoDateTime(filters.createdFrom),
    createdTo: toIsoDateTime(filters.createdTo),
    recipient: filters.recipient.trim() || undefined,
    subject: filters.subject.trim() || undefined,
    client: filters.client.trim() || undefined,
    sender: filters.sender.trim() || undefined,
  })

  const fetchCommunications = async (
    filters: CommunicationFilters = activeFilters,
    page: number = currentPage,
    useTableLoading = true
  ) => {
    if (useTableLoading) {
      setIsTableLoading(true)
    } else {
      setIsLoading(true)
    }
    setError('')

    try {
      let response
      try {
        response = await listCommunications(buildListParams(filters, page))
      } catch (err) {
        // Backward compatibility: some environments expose queued communications only.
        if (err instanceof ApiError && err.status === 404) {
          response = await listQueuedCommunications(buildListParams(filters, page))
        } else {
          throw err
        }
      }
      setCommunications(response.data)
      setTotalCommunications(response.pagination?.total || 0)
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
      if (useTableLoading) {
        setIsTableLoading(false)
      } else {
        setIsLoading(false)
        setHasLoadedList(true)
      }
    }
  }

  const handleFilterChange = (key: keyof CommunicationFilters, value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [key]:
        key === 'status' ? (value as FilterStatus) : (value as CommunicationFilters[typeof key]),
    }))
    setCurrentPage(0)
  }

  const handleClearFilters = () => {
    setCurrentPage(0)
    setActiveFilters(DEFAULT_FILTERS)
  }

  useEffect(() => {
    if (!canAccessCommunications) {
      setIsLoading(false)
      return
    }

    fetchCommunications(activeFilters, currentPage, hasLoadedList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessCommunications, currentPage, activeFilters])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE))
    if (currentPage > totalPages - 1) {
      setCurrentPage(totalPages - 1)
    }
  }, [currentPage, totalCommunications])

  const handleCommLookup = async () => {
    if (!commLookupId.trim()) return

    setIsCommLookingUp(true)
    setCommLookupError('')
    setCommLookupResult(null)

    try {
      const result = await getCommunicationById(commLookupId.trim(), {
        timeout: COMMUNICATION_LOOKUP_TIMEOUT_MS,
      })
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

  const handleClientNameLookup = async () => {
    const query = clientNameLookup.trim()
    if (!query) return

    setIsClientLookingUp(true)
    setClientLookupError('')
    setClientLookupResult(null)

    try {
      const matchedClients = await listClients(
        { q: query, limit: 5 },
        { timeout: COMMUNICATION_LOOKUP_TIMEOUT_MS }
      )
      if (!matchedClients.data.length) {
        setClientLookupError('No client found for that name.')
        return
      }

      const primaryClient = matchedClients.data[0]
      const latestComms = await listClientCommunications(
        primaryClient.clientId,
        { limit: 1, offset: 0 },
        { timeout: COMMUNICATION_LOOKUP_TIMEOUT_MS }
      )
      if (!latestComms.data.length) {
        setClientLookupError('No communications found for this client.')
        return
      }

      setClientLookupResult({
        ...latestComms.data[0],
        clientId: `${primaryClient.firstName} ${primaryClient.lastName} (${primaryClient.clientId})`,
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
      } else if (err instanceof ApiError && err.status === 400) {
        setClientLookupError('Invalid client name.')
      } else if (err instanceof ApiError && err.status === 403) {
        setClientLookupError('You are not authorized to view this communication.')
      } else {
        setClientLookupError(
          err instanceof ApiError ? err.message : 'Failed to look up by client name'
        )
      }
    } finally {
      setIsClientLookingUp(false)
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
            {comm.status.toUpperCase()}
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
            <h1 className="text-2xl font-normal text-text">Communications</h1>
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
            <h3 className="mb-3 font-normal text-text">Lookup by Client Name</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={clientNameLookup}
                onChange={e => setClientNameLookup(e.target.value)}
                className="flex-1 rounded  bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Client name..."
              />
              <button
                onClick={handleClientNameLookup}
                disabled={isClientLookingUp || !clientNameLookup.trim()}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:brightness-[0.8] disabled:opacity-50"
              >
                {isClientLookingUp ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
            {clientLookupError && <p className="mt-2 text-sm text-danger">{clientLookupError}</p>}
            {clientLookupResult && renderCommunicationDetail(clientLookupResult, 'Result')}
          </div>
        </div>

        <div className="bg-card rounded-lg p-4">
          <h3 className="text-text font-normal mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Status</label>
              <select
                value={activeFilters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="queued">Queued</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Recipient</label>
              <input
                type="text"
                value={activeFilters.recipient}
                onChange={e => handleFilterChange('recipient', e.target.value)}
                placeholder="email@domain.com"
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Subject</label>
              <input
                type="text"
                value={activeFilters.subject}
                onChange={e => handleFilterChange('subject', e.target.value)}
                placeholder="payment reminder"
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Client Reference</label>
              <input
                type="text"
                value={activeFilters.client}
                onChange={e => handleFilterChange('client', e.target.value)}
                placeholder="clt_..."
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Sender User</label>
              <input
                type="text"
                value={activeFilters.sender}
                onChange={e => handleFilterChange('sender', e.target.value)}
                placeholder="usr_..."
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Created From</label>
              <input
                type="datetime-local"
                value={activeFilters.createdFrom}
                onChange={e => handleFilterChange('createdFrom', e.target.value)}
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Created To</label>
              <input
                type="datetime-local"
                value={activeFilters.createdTo}
                onChange={e => handleFilterChange('createdTo', e.target.value)}
                className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Description contains</label>
              <input
                type="text"
                value={activeFilters.descriptionContains}
                onChange={e => handleFilterChange('descriptionContains', e.target.value)}
                placeholder="search body text..."
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

        <CommunicationsPanel
          communications={filteredCommunications}
          formatDate={formatDateTime}
          title="Communications"
          titleAsHeading={false}
          emptyMessage="No communications found"
          onRefresh={() => fetchCommunications(activeFilters, currentPage, true)}
          isRefreshing={isTableLoading}
          editableStatuses
          footerContent={
            Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE) > 1 ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-muted">
                  Showing {currentPage * COMMUNICATIONS_PER_PAGE + 1} to{' '}
                  {Math.min((currentPage + 1) * COMMUNICATIONS_PER_PAGE, totalCommunications)} of{' '}
                  {totalCommunications} communications
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(page => page - 1)}
                    disabled={currentPage === 0 || isTableLoading}
                    className={`px-3 py-1 rounded ${
                      currentPage === 0 || isTableLoading
                        ? 'bg-background-light text-text-muted cursor-not-allowed'
                        : 'bg-primary hover:brightness-[0.8] text-white transition-all duration-200'
                    }`}
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-text">
                    Page {currentPage + 1} of{' '}
                    {Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(page => page + 1)}
                    disabled={
                      currentPage >= Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE) - 1 ||
                      isTableLoading
                    }
                    className={`px-3 py-1 rounded ${
                      currentPage >= Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE) - 1 ||
                      isTableLoading
                        ? 'bg-background-light text-text-muted cursor-not-allowed'
                        : 'bg-primary hover:brightness-[0.8] text-white transition-all duration-200'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null
          }
        />
      </main>
    </SidebarLayout>
  )
}
