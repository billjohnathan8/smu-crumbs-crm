import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  listCommunications,
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
}

const DEFAULT_FILTERS: CommunicationFilters = {
  status: 'all',
  createdFrom: '',
  createdTo: '',
  recipient: '',
  subject: '',
  client: '',
  sender: '',
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
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filterError, setFilterError] = useState('')
  const [activeFilters, setActiveFilters] = useState<CommunicationFilters>(DEFAULT_FILTERS)
  const [filterDraft, setFilterDraft] = useState<CommunicationFilters>(DEFAULT_FILTERS)

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
      const response = await listCommunications(buildListParams(filters, page))
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

  const handleApplyFilters = async () => {
    if (filterDraft.createdFrom && filterDraft.createdTo) {
      const from = new Date(filterDraft.createdFrom)
      const to = new Date(filterDraft.createdTo)
      if (from.getTime() > to.getTime()) {
        setFilterError('Start datetime must be before end datetime.')
        return
      }
    }
    setFilterError('')
    setCurrentPage(0)
    setActiveFilters(filterDraft)
    setShowFilterDropdown(false)
  }

  const handleClearFilters = () => {
    setFilterError('')
    setFilterDraft(DEFAULT_FILTERS)
    setCurrentPage(0)
    setActiveFilters(DEFAULT_FILTERS)
    setShowFilterDropdown(false)
  }

  const activeFilterCount = [
    activeFilters.status !== DEFAULT_FILTERS.status,
    Boolean(activeFilters.createdFrom),
    Boolean(activeFilters.createdTo),
    Boolean(activeFilters.recipient.trim()),
    Boolean(activeFilters.subject.trim()),
    Boolean(activeFilters.client.trim()),
    Boolean(activeFilters.sender.trim()),
  ].filter(Boolean).length

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

        <CommunicationsPanel
          communications={communications}
          formatDate={formatDateTime}
          title="All Communications"
          titleAsHeading={false}
          emptyMessage="No communications found"
          onRefresh={() => fetchCommunications(activeFilters, currentPage, true)}
          isRefreshing={isTableLoading}
          headerActions={
            <div className="relative">
              <button
                onClick={() => {
                  setShowFilterDropdown(prev => !prev)
                  setFilterError('')
                }}
                className="rounded bg-background-lighter border-[1.5px] border-border px-4 py-2 text-sm font-medium text-text transition-all duration-200 hover:brightness-[0.9]"
              >
                {activeFilterCount > 0 ? `Filter (${activeFilterCount})` : 'Filter'}
              </button>
              {showFilterDropdown && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-card p-4 shadow-xl">
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                        Delivery State
                      </label>
                      <select
                        value={filterDraft.status}
                        onChange={e =>
                          setFilterDraft(prev => ({
                            ...prev,
                            status: e.target.value as FilterStatus,
                          }))
                        }
                        className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="all">All states</option>
                        <option value="queued">Queued</option>
                        <option value="sent">Sent</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                          Created From
                        </label>
                        <input
                          type="datetime-local"
                          value={filterDraft.createdFrom}
                          onChange={e =>
                            setFilterDraft(prev => ({ ...prev, createdFrom: e.target.value }))
                          }
                          className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                          Created To
                        </label>
                        <input
                          type="datetime-local"
                          value={filterDraft.createdTo}
                          onChange={e =>
                            setFilterDraft(prev => ({ ...prev, createdTo: e.target.value }))
                          }
                          className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                        Recipient Contains
                      </label>
                      <input
                        type="text"
                        value={filterDraft.recipient}
                        onChange={e =>
                          setFilterDraft(prev => ({ ...prev, recipient: e.target.value }))
                        }
                        placeholder="email@domain.com"
                        className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                        Subject Contains
                      </label>
                      <input
                        type="text"
                        value={filterDraft.subject}
                        onChange={e =>
                          setFilterDraft(prev => ({ ...prev, subject: e.target.value }))
                        }
                        placeholder="payment reminder"
                        className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                          Client Reference
                        </label>
                        <input
                          type="text"
                          value={filterDraft.client}
                          onChange={e =>
                            setFilterDraft(prev => ({ ...prev, client: e.target.value }))
                          }
                          placeholder="clt_..."
                          className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-muted">
                          Sender User
                        </label>
                        <input
                          type="text"
                          value={filterDraft.sender}
                          onChange={e =>
                            setFilterDraft(prev => ({ ...prev, sender: e.target.value }))
                          }
                          placeholder="usr_..."
                          className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {filterError && <p className="mt-3 text-xs text-danger">{filterError}</p>}

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      onClick={handleClearFilters}
                      className="rounded bg-background-light px-3 py-2 text-sm text-text hover:brightness-[0.95]"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleApplyFilters}
                      className="rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:brightness-[0.9]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          }
          editableStatuses
        />
        {Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE) > 1 && (
          <div className="rounded-lg bg-card px-6 py-4 border border-border flex items-center justify-between">
            <p className="text-sm text-text-muted">
              Showing {currentPage * COMMUNICATIONS_PER_PAGE + 1} to{' '}
              {Math.min((currentPage + 1) * COMMUNICATIONS_PER_PAGE, totalCommunications)} of{' '}
              {totalCommunications} communications
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(page => page - 1)}
                disabled={currentPage === 0 || isTableLoading}
                className={`px-3 py-1 rounded ${
                  currentPage === 0 || isTableLoading
                    ? 'bg-background-light text-text-muted cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-hover text-white'
                }`}
              >
                Previous
              </button>
              <span className="px-3 py-1 text-text">
                Page {currentPage + 1} of {Math.ceil(totalCommunications / COMMUNICATIONS_PER_PAGE)}
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
                    : 'bg-primary hover:bg-primary-hover text-white'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  )
}
