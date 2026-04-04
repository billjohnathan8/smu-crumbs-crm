import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listClients } from '@/api/clients'
import { listArchivedUsers, listUsers } from '@/api/users'
import type { Client, IdentityVerificationStatus, User } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import { ClientTable } from '@/components/ClientTable'

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients', end: true },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
  { label: 'Activity Logs', to: '/user/logs' },
  { label: 'Settings', to: '/user/settings' },
]

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

const ITEMS_PER_PAGE = 20

export function ClientListPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isUser = user?.role === 'user'
  const isAdmin = user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const isManagementUser = isAdmin || isSuperAdmin
  const canViewAllClients = isManagementUser

  const sidebarNav: NavItem[] = isManagementUser
    ? [
        ...adminNav,
        ...(isSuperAdmin ? [{ label: 'Admin Management', to: '/admin/admins' as const }] : []),
      ]
    : userNav

  const basePath = isManagementUser ? '/admin' : '/user'
  const pageTitle = canViewAllClients ? 'All Clients' : 'My Clients'
  const createClientPath = `${basePath}/clients/new`
  const clientDetailPath = (clientId: string) => `${basePath}/clients/${clientId}`

  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<User[]>([])
  const [filters, setFilters] = useState<{
    kycStatus: IdentityVerificationStatus | ''
    assignedUserId: string
  }>({
    kycStatus: '',
    assignedUserId: '',
  })

  const fetchClients = async (
    page: number,
    q: string,
    kycStatus: IdentityVerificationStatus | '',
    assignedUserId: string
  ) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await listClients({
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
        q: q || undefined,
        kycStatus: kycStatus || undefined,
        assignedUserId: assignedUserId || undefined,
      })

      setClients(response.data)
      setTotal(response.pagination?.total || 0)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setError(
            isUser
              ? 'You are not allowed to view this client list.'
              : 'You are not allowed to access this page.'
          )
        } else {
          setError(err.message || 'Failed to load clients')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchClients(currentPage, search, filters.kycStatus, filters.assignedUserId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, filters])

  useEffect(() => {
    if (!canViewAllClients) return
    Promise.all([listUsers({ role: 'user' }), listArchivedUsers({ role: 'user', limit: 200 })])
      .then(([activeRes, archivedRes]) => {
        const allUsers = [...activeRes.data, ...archivedRes.data]
        const map: Record<string, string> = {}
        for (const u of allUsers) {
          map[u.id] = `${u.firstName} ${u.lastName}`
        }
        setAgentNameMap(map)
        setAgents(allUsers)
      })
      .catch(() => {})
  }, [canViewAllClients])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setCurrentPage(0)
  }

  const handleFilterChange = (key: 'kycStatus' | 'assignedUserId', value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: key === 'kycStatus' ? (value as IdentityVerificationStatus | '') : value,
    }))
    setCurrentPage(0)
  }

  const resetFilters = () => {
    setFilters({
      kycStatus: '',
      assignedUserId: '',
    })
    setSearch('')
    setSearchInput('')
    setCurrentPage(0)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex h-16 items-center justify-between">
          <h1 className="text-2xl font-normal text-text">{pageTitle}</h1>

          <div className="flex space-x-3">
            <button
              onClick={() => navigate(createClientPath)}
              className="rounded-lg gradient-dark-red px-4 py-2 font-medium text-white transition-all duration-200 hover:brightness-[0.85]"
            >
              + New Client
            </button>
          </div>
        </div>
      </nav>

      <main className="mt-6">
        {error && (
          <div className="mb-6 rounded-lg border border-danger bg-danger/10 p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="mb-6 space-y-4">
          <div className="bg-card rounded-lg p-4">
            <h3 className="text-text font-normal mb-4">Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="search-input" className="block text-xs text-text-muted mb-1">
                  Search
                </label>
                <input
                  id="search-input"
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSearch(e)
                    }
                  }}
                  placeholder="Name, email, or phone"
                  className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="kyc-status-select" className="block text-xs text-text-muted mb-1">
                  KYC Status
                </label>
                <select
                  id="kyc-status-select"
                  value={filters.kycStatus}
                  onChange={e => handleFilterChange('kycStatus', e.target.value)}
                  className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All</option>
                  <option value="unverified">Unverified</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {canViewAllClients && (
                <div>
                  <label
                    htmlFor="assigned-agent-select"
                    className="block text-xs text-text-muted mb-1"
                  >
                    Assigned Agent
                  </label>
                  <select
                    id="assigned-agent-select"
                    value={filters.assignedUserId}
                    onChange={e => handleFilterChange('assignedUserId', e.target.value)}
                    className="w-full px-3 py-2 bg-background-light rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.firstName} {agent.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-between items-center">
              <button
                onClick={handleSearch}
                className="px-4 py-2 rounded-lg gradient-dark-red text-white text-sm font-medium hover:brightness-[0.85] transition-all duration-200"
              >
                Apply Filters
              </button>
              <button
                onClick={resetFilters}
                className="px-4 py-2 rounded bg-background-lighter border-[1.5px] border-border text-text hover:brightness-[0.9] text-sm font-medium transition-all duration-200"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg  bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-xl font-normal text-text">Client List</h2>
            <span className="text-sm text-text-muted">{total} clients</span>
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div
                data-testid="loading-spinner"
                className="inline-block h-10 w-10 animate-spin rounded-full border-b-2 border-primary"
              />
            </div>
          ) : (
            <>
              <ClientTable
                clients={clients}
                onView={clientId => navigate(clientDetailPath(clientId))}
                showAssignedAgent={canViewAllClients}
                agentNameMap={agentNameMap}
              />

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-6 py-4">
                  <p className="text-sm text-text-muted">
                    Page {currentPage + 1} of {totalPages} ({total} total)
                  </p>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(p => p - 1)}
                      disabled={currentPage === 0}
                      className={`rounded px-3 py-1 text-sm ${
                        currentPage === 0
                          ? 'cursor-not-allowed bg-background-light text-text-muted'
                          : 'bg-primary text-white hover:bg-primary-hover'
                      }`}
                    >
                      Previous
                    </button>

                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= totalPages - 1}
                      className={`rounded px-3 py-1 text-sm ${
                        currentPage >= totalPages - 1
                          ? 'cursor-not-allowed bg-background-light text-text-muted'
                          : 'bg-primary text-white hover:bg-primary-hover'
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
