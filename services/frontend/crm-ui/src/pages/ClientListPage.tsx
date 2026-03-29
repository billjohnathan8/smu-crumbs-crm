import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { listClients } from '@/api/clients'
import type { Client } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import { ClientTable } from '@/components/ClientTable'

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients', end: true },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
  { label: 'Settings', to: '/user/settings' },
]

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

  const fetchClients = async (page: number, q: string) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await listClients({
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
        q: q || undefined,
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
    fetchClients(currentPage, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setCurrentPage(0)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex h-16 items-center justify-between">
          <h1 className="text-2xl font-medium text-text">{pageTitle}</h1>

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

        <form onSubmit={handleSearch} className="mb-6 flex gap-3">
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 rounded-lg  bg-background-lighter px-4 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <button
            type="submit"
            className="rounded-lg gradient-dark-red px-4 py-2 text-sm font-medium text-white
           transition-all duration-200 hover:brightness-[0.85]"
          >
            Search
          </button>

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSearchInput('')
                setCurrentPage(0)
              }}
              className="rounded-lg bg-background-light px-4 py-2 text-sm font-normal text-text transition-colors hover:bg-background-lighter"
            >
              Clear
            </button>
          )}
        </form>

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
