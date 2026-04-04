import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { listClientArchives } from '@/api/clients'
import type { Client, IdentityVerificationStatus } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const rootAdminNav: NavItem[] = [
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

const ITEMS_PER_PAGE = 20

export function ClientArchivesPage() {
  const { logout } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [kycStatus, setKycStatus] = useState<IdentityVerificationStatus | ''>('')

  const fetchArchives = async (
    page: number,
    q: string,
    status: IdentityVerificationStatus | ''
  ) => {
    setIsLoading(true)
    setError('')
    try {
      const response = await listClientArchives({
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
        q: q || undefined,
        kycStatus: status || undefined,
      })
      setClients(response.data)
      setTotal(response.pagination?.total || 0)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
          return
        }
        setError(err.message || 'Failed to load archived clients')
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchArchives(currentPage, search, kycStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, kycStatus])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setCurrentPage(0)
  }

  const resetFilters = () => {
    setSearch('')
    setSearchInput('')
    setKycStatus('')
    setCurrentPage(0)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <SidebarLayout items={rootAdminNav}>
      <div className="flex h-16 items-center justify-between">
        <h1 className="text-2xl font-normal text-text">Client Archives</h1>
      </div>

      <main className="mt-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-danger bg-danger/10 p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="rounded-lg bg-card p-4">
          <h3 className="mb-4 text-text font-normal">Filters</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="archive-search" className="mb-1 block text-xs text-text-muted">
                Search
              </label>
              <input
                id="archive-search"
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
                className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="archive-kyc" className="mb-1 block text-xs text-text-muted">
                KYC Status
              </label>
              <select
                id="archive-kyc"
                value={kycStatus}
                onChange={e => {
                  setKycStatus(e.target.value as IdentityVerificationStatus | '')
                  setCurrentPage(0)
                }}
                className="w-full rounded bg-background-light px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All</option>
                <option value="unverified">Unverified</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={handleSearch}
              className="rounded-lg gradient-dark-red px-4 py-2 text-sm font-medium text-white hover:brightness-[0.85]"
            >
              Apply Filters
            </button>
            <button
              onClick={resetFilters}
              className="rounded border-[1.5px] border-border bg-background-lighter px-4 py-2 text-sm font-medium text-text hover:brightness-[0.9]"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-xl font-normal text-text">Archived Clients</h2>
            <span className="text-sm text-text-muted">{total} archived</span>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="inline-block h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : clients.length === 0 ? (
            <div className="p-6 text-center text-text-subtle">No archived clients found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background-light">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                        Client
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                        Phone
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-normal uppercase tracking-wider text-text-muted">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clients.map(client => (
                      <tr key={client.clientId} className="hover:bg-background-light">
                        <td className="px-6 py-4 text-sm text-text">
                          {client.firstName} {client.lastName}
                        </td>
                        <td className="px-6 py-4 text-sm text-text">{client.emailAddress}</td>
                        <td className="px-6 py-4 text-sm text-text">{client.phoneNumber}</td>
                        <td className="px-6 py-4 text-sm text-text">
                          {client.identityVerificationStatus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-6 py-4">
                  <p className="text-sm text-text-muted">
                    Page {currentPage + 1} of {totalPages}
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(p => p - 1)}
                      disabled={currentPage === 0}
                      className="rounded bg-background-light px-3 py-1 text-sm text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={currentPage >= totalPages - 1}
                      className="rounded bg-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
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
