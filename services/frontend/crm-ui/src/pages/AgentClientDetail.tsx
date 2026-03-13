import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { getClientById, verifyClient } from '@/api/clients'
import { listClientTransactions } from '@/api/transactions'
import type { Client, Transaction, VerifyClientRequest } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const agentNav: NavItem[] = [
  { label: 'Home', to: '/agent', end: true },
  { label: 'My Clients', to: '/agent/clients' },
  { label: 'Create Client', to: '/agent/clients/new' },
  { label: 'Transactions', to: '/agent/transactions' },
  { label: 'AML Alerts', to: '/agent/aml-alerts' },
]

const statusColors: Record<string, string> = {
  unverified: 'bg-background-light text-text-muted',
  pending: 'bg-warning/20 text-warning',
  verified: 'bg-success/20 text-success',
  rejected: 'bg-danger/20 text-danger',
}

export function AgentClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [client, setClient] = useState<Client | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  // Verify form state
  const [showVerifyForm, setShowVerifyForm] = useState(false)
  const [verifyData, setVerifyData] = useState<VerifyClientRequest>({
    nric: '',
    documentType: 'NRIC',
    documentRef: '',
  })
  const [verifyError, setVerifyError] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifySuccess, setVerifySuccess] = useState<string>('')

  useEffect(() => {
    if (!clientId) return
    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        const [clientData, txResponse] = await Promise.all([
          getClientById(clientId),
          listClientTransactions(clientId, { limit: 10 }),
        ])
        setClient(clientData)
        setTransactions(txResponse.data)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            logout()
          } else if (err.status === 404) {
            setError('Client not found')
          } else {
            setError(err.message || 'Failed to load client')
          }
        } else {
          setError('An unexpected error occurred')
        }
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [clientId, logout])

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (!clientId) return
    if (!verifyData.nric.trim()) {
      setVerifyError('NRIC is required')
      return
    }
    setIsVerifying(true)
    setVerifyError('')
    setVerifySuccess('')
    try {
      const result = await verifyClient(clientId, verifyData)
      setVerifySuccess(`Client successfully verified (status: ${result.identityVerificationStatus})`)
      setShowVerifyForm(false)
      // Refresh client data
      const updated = await getClientById(clientId)
      setClient(updated)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout()
        } else {
          setVerifyError(err.message || 'Verification failed')
        }
      } else {
        setVerifyError('An unexpected error occurred')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(amount)

  if (isLoading) {
    return (
      <SidebarLayout items={agentNav}>
        <div className="flex items-center justify-center h-64">
          <div
            data-testid="loading-spinner"
            className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
          />
        </div>
      </SidebarLayout>
    )
  }

  if (error || !client) {
    return (
      <SidebarLayout items={agentNav}>
        <div className="bg-danger/10 border border-danger rounded-lg p-4 mt-6">
          <p className="text-danger">{error || 'Client not found'}</p>
        </div>
        <button
          onClick={() => navigate('/agent/clients')}
          className="mt-4 px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm"
        >
          Back to Clients
        </button>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout items={agentNav}>
      <nav>
        <div className="flex justify-between h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/agent/clients')}
              className="text-text-muted hover:text-text text-sm"
            >
              ← My Clients
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">
              {client.firstName} {client.lastName}
            </h1>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                statusColors[client.identityVerificationStatus] ?? 'bg-background-light text-text-muted'
              }`}
            >
              {client.identityVerificationStatus}
            </span>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-danger hover:bg-danger-hover text-white font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="mt-6 space-y-6">
        {verifySuccess && (
          <div className="bg-success/10 border border-success rounded-lg p-4">
            <p className="text-success text-sm">{verifySuccess}</p>
          </div>
        )}

        {/* Client Profile */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text">Client Profile</h2>
            {client.identityVerificationStatus !== 'verified' && (
              <button
                onClick={() => setShowVerifyForm(v => !v)}
                className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium"
              >
                {showVerifyForm ? 'Cancel Verification' : 'Verify Client (KYC)'}
              </button>
            )}
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ['Client ID', client.clientId],
              ['Full Name', `${client.firstName} ${client.lastName}`],
              ['Date of Birth', formatDate(client.dateOfBirth)],
              ['Gender', client.gender],
              ['Email', client.emailAddress],
              ['Phone', client.phoneNumber],
              ['Address', client.address],
              ['City', client.city],
              ['State', client.state],
              ['Country', client.country],
              ['Postal Code', client.postalCode],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-text-muted font-medium uppercase tracking-wider">{label}</dt>
                <dd className="text-sm text-text mt-1">{value || '-'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* KYC Verification Form */}
        {showVerifyForm && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold text-text mb-4">KYC Verification</h2>
            {verifyError && (
              <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                <p className="text-danger text-sm">{verifyError}</p>
              </div>
            )}
            <form onSubmit={handleVerify} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  NRIC <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. S1234567D"
                  value={verifyData.nric}
                  onChange={e => setVerifyData({ ...verifyData, nric: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isVerifying}
                />
                <p className="text-xs text-text-muted mt-1">Singapore NRIC format: S/T/F/G/M + 7 digits + letter</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Document Reference</label>
                <input
                  type="text"
                  placeholder="Optional scan/document reference ID"
                  value={verifyData.documentRef || ''}
                  onChange={e => setVerifyData({ ...verifyData, documentRef: e.target.value })}
                  className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isVerifying}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-6 py-2 bg-success hover:bg-success-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying...' : 'Confirm Verification'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowVerifyForm(false)}
                  className="px-6 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Recent Transactions</h2>
            <button
              onClick={() => navigate(`/agent/transactions?clientId=${client.clientId}`)}
              className="text-primary hover:underline text-sm"
            >
              View all →
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-sm">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-light">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-background-light">
                      <td className="px-6 py-3 text-sm text-text">
                        {new Date(tx.date).toLocaleDateString('en-SG')}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            tx.transaction === 'D' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
                          }`}
                        >
                          {tx.transaction === 'D' ? 'Deposit' : 'Withdrawal'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text text-right font-medium">
                        {formatAmount(tx.amount)}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            tx.status === 'Completed'
                              ? 'bg-success/20 text-success'
                              : tx.status === 'Pending'
                                ? 'bg-warning/20 text-warning'
                                : 'bg-danger/20 text-danger'
                          }`}
                        >
                          {tx.status}
                        </span>
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
