import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  getClientById,
  verifyClient,
  reviewVerification,
  deleteClient,
  listClientAccounts,
} from '@/api/clients'
import { listClientTransactions } from '@/api/transactions'
import { listClientCommunications, sendCommunication } from '@/api/communications'
import type {
  Client,
  Transaction,
  VerifyClientRequest,
  Account,
  Communication,
  ReviewAction,
} from '@/api/types'
import type { SendCommunicationRequest } from '@/api/communications'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const agentNav: NavItem[] = [
  { label: 'Home', to: '/agent', end: true },
  { label: 'My Clients', to: '/agent/clients' },
  { label: 'Create Client', to: '/agent/clients/new' },
  { label: 'Transactions', to: '/agent/transactions' },
  { label: 'AML Alerts', to: '/agent/aml-alerts' },
]

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'Manage Accounts', to: '/admin/accounts' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
]

const statusColors: Record<string, string> = {
  unverified: 'bg-background-light text-text-muted',
  pending: 'bg-warning/20 text-warning',
  verified: 'bg-success/20 text-success',
  rejected: 'bg-danger/20 text-danger',
}

export function AgentClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [client, setClient] = useState<Client | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [communications, setCommunications] = useState<Communication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  // Success message from navigation state (e.g. after edit)
  const navSuccessMessage =
    (location.state as { successMessage?: string } | null)?.successMessage || ''

  // Verify form state
  const [showVerifyForm, setShowVerifyForm] = useState(false)
  const [verifyData, setVerifyData] = useState<VerifyClientRequest>({
    nric: '',
    documentType: 'NRIC',
    documentRef: '',
  })
  const [verifyError, setVerifyError] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifySuccess, setVerifySuccess] = useState<string>(navSuccessMessage)

  // Delete client state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Communications compose state
  const [showComposeForm, setShowComposeForm] = useState(false)
  const [composeData, setComposeData] = useState<
    Omit<SendCommunicationRequest, 'clientId' | 'channel'>
  >({
    toEmail: '',
    subject: '',
    body: '',
  })
  const [composeError, setComposeError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [composeSuccess, setComposeSuccess] = useState('')

  // Admin verification review state
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const sidebarNav = isAdmin ? adminNav : agentNav

  const handleReviewVerification = async (action: ReviewAction) => {
    if (!clientId) return
    setIsReviewing(true)
    setReviewError('')
    setVerifySuccess('')
    try {
      const result = await reviewVerification(clientId, { action })
      setVerifySuccess(
        action === 'approve'
          ? `Verification approved (status: ${result.identityVerificationStatus})`
          : `Verification rejected (status: ${result.identityVerificationStatus})`
      )
      const updated = await getClientById(clientId)
      setClient(updated)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setReviewError(err.message || 'Review failed')
      } else {
        setReviewError('An unexpected error occurred')
      }
    } finally {
      setIsReviewing(false)
    }
  }

  useEffect(() => {
    if (!clientId) return
    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        const [clientData, txResponse, accountsData, commsResponse] = await Promise.all([
          getClientById(clientId),
          listClientTransactions(clientId, { limit: 10 }),
          listClientAccounts(clientId).catch(() => [] as Account[]),
          listClientCommunications(clientId, { limit: 10 }).catch(() => ({
            data: [] as Communication[],
          })),
        ])
        setClient(clientData)
        setTransactions(txResponse.data)
        setAccounts(accountsData)
        setCommunications(commsResponse.data)
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
      setVerifySuccess(
        `Verification submitted for review (status: ${result.identityVerificationStatus})`
      )
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

  const handleDeleteClient = async () => {
    if (!clientId) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      await deleteClient(clientId)
      navigate('/agent/clients', {
        replace: true,
        state: { successMessage: `Client ${client?.firstName} ${client?.lastName} deleted` },
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setDeleteError(err.message || 'Failed to delete client')
      } else {
        setDeleteError('An unexpected error occurred')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSendCommunication = async (e: FormEvent) => {
    e.preventDefault()
    if (!clientId) return
    if (!composeData.toEmail.trim() || !composeData.subject.trim() || !composeData.body.trim()) {
      setComposeError('All fields are required')
      return
    }
    setIsSending(true)
    setComposeError('')
    setComposeSuccess('')
    try {
      await sendCommunication({
        clientId,
        channel: 'email',
        toEmail: composeData.toEmail,
        subject: composeData.subject,
        body: composeData.body,
      })
      setComposeSuccess('Email queued successfully')
      setShowComposeForm(false)
      setComposeData({ toEmail: '', subject: '', body: '' })
      // Refresh communications
      const commsResponse = await listClientCommunications(clientId, { limit: 10 })
      setCommunications(commsResponse.data)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setComposeError(err.message || 'Failed to send email')
      } else {
        setComposeError('An unexpected error occurred')
      }
    } finally {
      setIsSending(false)
    }
  }

  if (isLoading) {
    return (
      <SidebarLayout items={sidebarNav}>
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
      <SidebarLayout items={sidebarNav}>
        <div className="bg-danger/10 border border-danger rounded-lg p-4 mt-6">
          <p className="text-danger">{error || 'Client not found'}</p>
        </div>
        <button
          onClick={() => navigate(isAdmin ? '/admin' : '/agent/clients')}
          className="mt-4 px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm"
        >
          Back to Clients
        </button>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout items={sidebarNav}>
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
                statusColors[client.identityVerificationStatus] ??
                'bg-background-light text-text-muted'
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
            <div className="flex items-center space-x-2">
              <button
                onClick={() => navigate(`/agent/clients/${clientId}/edit`)}
                className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium"
              >
                Edit Client
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded bg-danger hover:bg-danger-hover text-white text-sm font-medium"
              >
                Delete Client
              </button>
              {client.identityVerificationStatus === 'unverified' && (
                <button
                  onClick={() => setShowVerifyForm(v => !v)}
                  className="px-4 py-2 rounded bg-success hover:bg-success-hover text-white text-sm font-medium"
                >
                  {showVerifyForm ? 'Cancel Verification' : 'Submit for KYC Verification'}
                </button>
              )}
            </div>
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
                <dt className="text-xs text-text-muted font-medium uppercase tracking-wider">
                  {label}
                </dt>
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
                  onChange={e =>
                    setVerifyData({ ...verifyData, nric: e.target.value.toUpperCase() })
                  }
                  className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isVerifying}
                />
                <p className="text-xs text-text-muted mt-1">
                  Singapore NRIC format: S/T/F/G/M + 7 digits + letter
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Document Reference
                </label>
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
                  {isVerifying ? 'Submitting...' : 'Submit for Review'}
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

        {/* Admin Verification Review Panel */}
        {isAdmin && client.identityVerificationStatus === 'pending' && (
          <div className="bg-card border border-warning rounded-lg p-6">
            <h2 className="text-lg font-bold text-text mb-2">Pending Verification Review</h2>
            <p className="text-sm text-text-muted mb-4">
              This client has submitted identity documents for KYC verification. Review and approve
              or reject.
            </p>
            {reviewError && (
              <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                <p className="text-danger text-sm">{reviewError}</p>
              </div>
            )}
            <div className="flex space-x-3">
              <button
                onClick={() => handleReviewVerification('approve')}
                disabled={isReviewing}
                className="px-6 py-2 bg-success hover:bg-success-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {isReviewing ? 'Processing...' : 'Approve'}
              </button>
              <button
                onClick={() => handleReviewVerification('reject')}
                disabled={isReviewing}
                className="px-6 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {isReviewing ? 'Processing...' : 'Reject'}
              </button>
            </div>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
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
                            tx.transaction === 'D'
                              ? 'bg-success/20 text-success'
                              : 'bg-warning/20 text-warning'
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

        {/* Bank Accounts */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Bank Accounts</h2>
            <button
              onClick={() => navigate(`/agent/clients/${client.clientId}/accounts`)}
              className="text-primary hover:underline text-sm"
            >
              Manage accounts →
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-sm">No bank accounts found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-light">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Account ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Initial Deposit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map(acct => (
                    <tr key={acct.accountId} className="hover:bg-background-light">
                      <td className="px-6 py-3 text-sm text-text font-mono">
                        {acct.accountId.slice(0, 8)}…
                      </td>
                      <td className="px-6 py-3 text-sm text-text">{acct.accountType}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            acct.accountStatus === 'Active'
                              ? 'bg-success/20 text-success'
                              : acct.accountStatus === 'Pending'
                                ? 'bg-warning/20 text-warning'
                                : 'bg-background-light text-text-muted'
                          }`}
                        >
                          {acct.accountStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text text-right font-medium">
                        {formatAmount(acct.initialDeposit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Communications */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Communications</h2>
            <button
              onClick={() => {
                setShowComposeForm(v => !v)
                if (!showComposeForm && client) {
                  setComposeData(d => ({ ...d, toEmail: client.emailAddress }))
                }
              }}
              className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium"
            >
              {showComposeForm ? 'Cancel' : 'Compose Email'}
            </button>
          </div>

          {composeSuccess && (
            <div className="mx-6 mt-4 bg-success/10 border border-success rounded-lg p-3">
              <p className="text-success text-sm">{composeSuccess}</p>
            </div>
          )}

          {showComposeForm && (
            <div className="p-6 border-b border-border">
              {composeError && (
                <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                  <p className="text-danger text-sm">{composeError}</p>
                </div>
              )}
              <form onSubmit={handleSendCommunication} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">
                    To Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    value={composeData.toEmail}
                    onChange={e => setComposeData({ ...composeData, toEmail: e.target.value })}
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isSending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">
                    Subject <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={composeData.subject}
                    onChange={e => setComposeData({ ...composeData, subject: e.target.value })}
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isSending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">
                    Body <span className="text-danger">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={composeData.body}
                    onChange={e => setComposeData({ ...composeData, body: e.target.value })}
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isSending}
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={isSending}
                    className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {isSending ? 'Sending...' : 'Send Email'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowComposeForm(false)}
                    className="px-6 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {communications.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-sm">No communications found</div>
          ) : (
            <div className="divide-y divide-border">
              {communications.map(comm => (
                <div key={comm.communicationId} className="px-6 py-4 hover:bg-background-light">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-text">{comm.subject}</p>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        comm.status === 'sent'
                          ? 'bg-success/20 text-success'
                          : comm.status === 'queued'
                            ? 'bg-warning/20 text-warning'
                            : 'bg-danger/20 text-danger'
                      }`}
                    >
                      {comm.status}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    To: {comm.toEmail} · {formatDate(comm.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Client Confirmation Modal */}
        {showDeleteConfirm && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            data-testid="delete-client-modal"
          >
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-bold text-text mb-2">Delete Client</h2>
              <p className="text-text-muted text-sm mb-4">
                Are you sure you want to delete{' '}
                <strong>
                  {client.firstName} {client.lastName}
                </strong>
                ? This action cannot be undone.
              </p>
              {deleteError && (
                <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                  <p className="text-danger text-sm">{deleteError}</p>
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteError('')
                  }}
                  className="px-4 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-medium"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Client'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  )
}
