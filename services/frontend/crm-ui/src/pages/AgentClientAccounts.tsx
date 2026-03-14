import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  getClientById,
  listClientAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from '@/api/clients'
import type {
  Client,
  Account,
  AccountCreateRequest,
  AccountUpdateRequest,
  AccountType,
  AccountStatus,
} from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'

const agentNav: NavItem[] = [
  { label: 'Home', to: '/agent', end: true },
  { label: 'My Clients', to: '/agent/clients' },
  { label: 'Create Client', to: '/agent/clients/new' },
  { label: 'Transactions', to: '/agent/transactions' },
  { label: 'AML Alerts', to: '/agent/aml-alerts' },
]

const accountStatusColors: Record<string, string> = {
  Active: 'bg-success/20 text-success',
  Inactive: 'bg-background-light text-text-muted',
  Pending: 'bg-warning/20 text-warning',
}

type ModalMode = 'create' | 'edit' | null

export function AgentClientAccounts() {
  const { clientId } = useParams<{ clientId: string }>()
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [client, setClient] = useState<Client | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [formData, setFormData] = useState<AccountCreateRequest>({
    clientId: clientId || '',
    accountType: 'Savings',
    accountStatus: 'Active',
    openingDate: new Date().toISOString().split('T')[0],
    initialDeposit: 0,
    currency: 'SGD',
    branchId: '',
  })
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete state
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const loadData = async () => {
    if (!clientId) return
    setIsLoading(true)
    setError('')
    try {
      const [clientData, accountsData] = await Promise.all([
        getClientById(clientId),
        listClientAccounts(clientId),
      ])
      setClient(clientData)
      setAccounts(accountsData)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout()
      else setError(err instanceof ApiError ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const openCreateModal = () => {
    setFormData({
      clientId: clientId || '',
      accountType: 'Savings',
      accountStatus: 'Active',
      openingDate: new Date().toISOString().split('T')[0],
      initialDeposit: 0,
      currency: 'SGD',
      branchId: '',
    })
    setFormError('')
    setEditingAccount(null)
    setModalMode('create')
  }

  const openEditModal = (account: Account) => {
    setEditingAccount(account)
    setFormData({
      clientId: account.clientId,
      accountType: account.accountType,
      accountStatus: account.accountStatus,
      openingDate: account.openingDate,
      initialDeposit: account.initialDeposit,
      currency: account.currency,
      branchId: account.branchId,
    })
    setFormError('')
    setModalMode('edit')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!formData.branchId.trim()) {
      setFormError('Branch ID is required')
      return
    }
    if (modalMode === 'create' && formData.initialDeposit < 0) {
      setFormError('Initial deposit cannot be negative')
      return
    }

    setIsSubmitting(true)
    try {
      if (modalMode === 'create') {
        await createAccount(formData)
      } else if (modalMode === 'edit' && editingAccount) {
        const updateData: AccountUpdateRequest = {
          accountType: formData.accountType,
          accountStatus: formData.accountStatus,
          branchId: formData.branchId,
        }
        await updateAccount(editingAccount.accountId, updateData)
      }
      setModalMode(null)
      await loadData()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setFormError(err.message || 'Operation failed')
      } else {
        setFormError('An unexpected error occurred')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingAccountId) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      await deleteAccount(deletingAccountId)
      setDeletingAccountId(null)
      await loadData()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) logout()
        else setDeleteError(err.message || 'Failed to delete account')
      } else {
        setDeleteError('An unexpected error occurred')
      }
    } finally {
      setIsDeleting(false)
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
              onClick={() => navigate(`/agent/clients/${clientId}`)}
              className="text-text-muted hover:text-text text-sm"
            >
              ← {client.firstName} {client.lastName}
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">Bank Accounts</h1>
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
        {/* Account list */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-bold text-text">Accounts</h2>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium"
            >
              + New Account
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-sm">
              No accounts found for this client.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-light">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Account ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Client ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Opened
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Initial Deposit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Currency
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Branch
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map(acct => (
                    <tr key={acct.accountId} className="hover:bg-background-light">
                      <td className="px-6 py-3 text-sm text-text font-mono">
                        {acct.accountId.slice(0, 8)}…
                      </td>
                      <td className="px-6 py-3 text-sm text-text">
                        {acct.clientId}
                      </td>
                      <td className="px-6 py-3 text-sm text-text">{acct.accountType}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${accountStatusColors[acct.accountStatus] ?? ''}`}
                        >
                          {acct.accountStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text">
                        {formatDate(acct.openingDate)}
                      </td>
                      <td className="px-6 py-3 text-sm text-text text-right font-medium">
                        {formatAmount(acct.initialDeposit)}
                      </td>
                      <td className="px-6 py-3 text-sm text-text">
                        {acct.currency}
                      </td>
                      <td className="px-6 py-3 text-sm text-text">{acct.branchId}</td>
                      <td className="px-6 py-3 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(acct)}
                          className="text-primary hover:underline text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingAccountId(acct.accountId)}
                          className="text-danger hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create / Edit Modal */}
        {modalMode && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            data-testid="account-modal"
          >
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-lg mx-4">
              <h2 className="text-lg font-bold text-text mb-4">
                {modalMode === 'create' ? 'Create Account' : 'Edit Account'}
              </h2>
              {formError && (
                <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                  <p className="text-danger text-sm">{formError}</p>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Client ID</label>
                  <input
                    type="text"
                    value={formData.clientId}
                    readOnly
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text-muted"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Account Type</label>
                  <select
                    value={formData.accountType}
                    onChange={e =>
                      setFormData({ ...formData, accountType: e.target.value as AccountType })
                    }
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text"
                    disabled={isSubmitting}
                  >
                    <option value="Savings">Savings</option>
                    <option value="Checking">Checking</option>
                    <option value="Business">Business</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Account Status</label>
                  <select
                    value={formData.accountStatus}
                    onChange={e =>
                      setFormData({ ...formData, accountStatus: e.target.value as AccountStatus })
                    }
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text"
                    disabled={isSubmitting}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                {modalMode === 'create' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text mb-1">
                        Initial Deposit (SGD)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.initialDeposit}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            initialDeposit: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text mb-1">Currency</label>
                      <input
                        type="text"
                        value={formData.currency}
                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                        className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text mb-1">
                        Opening Date
                      </label>
                      <input
                        type="date"
                        value={formData.openingDate}
                        onChange={e => setFormData({ ...formData, openingDate: e.target.value })}
                        className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text"
                        disabled={isSubmitting}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-text mb-1">
                    Branch ID <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.branchId}
                    onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full px-4 py-2 bg-background-light border border-border rounded-lg text-text"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="px-4 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-medium"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {isSubmitting
                      ? 'Saving...'
                      : modalMode === 'create'
                        ? 'Create Account'
                        : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingAccountId && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            data-testid="delete-account-modal"
          >
            <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-bold text-text mb-2">Delete Account</h2>
              <p className="text-text-muted text-sm mb-4">
                Are you sure you want to delete this account? This action cannot be undone.
              </p>
              {deleteError && (
                <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
                  <p className="text-danger text-sm">{deleteError}</p>
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setDeletingAccountId(null)
                    setDeleteError('')
                  }}
                  className="px-4 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-medium"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  )
}
