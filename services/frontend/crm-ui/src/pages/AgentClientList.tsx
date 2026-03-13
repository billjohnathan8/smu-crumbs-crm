import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listClients } from '@/api/clients'
import type { Client } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const agentNav: NavItem[] = [
  { label: 'Home', to: '/agent', end: true },
  { label: 'My Clients', to: '/agent/clients' },
  { label: 'Create Client', to: '/agent/clients/new' },
  { label: 'Transactions', to: '/agent/transactions' },
  { label: 'AML Alerts', to: '/agent/aml-alerts' },
]

const ITEMS_PER_PAGE = 20

const statusColors: Record<string, string> = {
  unverified: 'bg-background-light text-text-muted',
  pending: 'bg-warning/20 text-warning',
  verified: 'bg-success/20 text-success',
  rejected: 'bg-danger/20 text-danger',
}

export function AgentClientList() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchClients = async (page: number, q: string) => {
    setIsLoading(true)
    setError('')
    try {
      const response = await listClients({ limit: ITEMS_PER_PAGE, offset: page * ITEMS_PER_PAGE, q: q || undefined })
      setClients(response.data)
      setTotal(response.pagination?.total || 0)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
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
    fetchClients(currentPage, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setCurrentPage(0)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <SidebarLayout items={agentNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <h1 className="text-xl font-bold text-text">My Clients</h1>
          <div className="flex space-x-3">
            <a
              href="/agent/clients/new"
              className="px-4 py-2 rounded-lg bg-success hover:bg-success-hover text-white font-medium transition-colors"
            >
              + New Client
            </a>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="mt-6">
        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSearch} className="mb-6 flex gap-3">
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setCurrentPage(0) }}
              className="px-4 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-medium transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-xl font-bold text-text">Client List</h2>
            <span className="text-sm text-text-muted">{total} clients</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div
                data-testid="loading-spinner"
                className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"
              />
            </div>
          ) : clients.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No clients found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-light">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Phone</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">KYC Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clients.map(client => (
                      <tr
                        key={client.clientId}
                        className="hover:bg-background-light cursor-pointer"
                        onClick={() => navigate(`/agent/clients/${client.clientId}`)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-text">
                          {client.firstName} {client.lastName}
                        </td>
                        <td className="px-6 py-4 text-sm text-text-muted">{client.emailAddress}</td>
                        <td className="px-6 py-4 text-sm text-text-muted">{client.phoneNumber}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              statusColors[client.identityVerificationStatus] ?? 'bg-background-light text-text-muted'
                            }`}
                          >
                            {client.identityVerificationStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/agent/clients/${client.clientId}`) }}
                            className="text-primary hover:underline text-sm"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-text-muted">
                    Page {currentPage + 1} of {totalPages} ({total} total)
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(p => p - 1)}
                      disabled={currentPage === 0}
                      className={`px-3 py-1 rounded text-sm ${currentPage === 0 ? 'bg-background-light text-text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-white'}`}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= totalPages - 1}
                      className={`px-3 py-1 rounded text-sm ${currentPage >= totalPages - 1 ? 'bg-background-light text-text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-white'}`}
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
