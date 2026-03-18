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
import type { Client, Account, AccountCreateRequest, AccountUpdateRequest } from '@/api/types'
import { ApiError } from '@/api/client'
import { SidebarLayout, type NavItem } from '@/components/SidebarDrawer'
import { AccountsTable } from '@/components/AccountsTable'
import { AccountFormModal } from '@/components/AccountFormModal'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'

type ModalMode = 'create' | 'edit' | null

const userNav: NavItem[] = [
  { label: 'Home', to: '/user', end: true },
  { label: 'My Clients', to: '/user/clients' },
  { label: 'Create Client', to: '/user/clients/new' },
  { label: 'Transactions', to: '/user/transactions' },
  { label: 'AML Alerts', to: '/user/aml-alerts' },
]

const adminNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },
  { label: 'All Clients', to: '/admin/clients' },
  { label: 'Create Client', to: '/admin/clients/new' },
  { label: 'Communications', to: '/admin/communications' },
  { label: 'Transactions', to: '/admin/transactions' },
  { label: 'AML Alerts', to: '/admin/aml-alerts' },
  { label: 'User Management', to: '/admin/adminusermanagement' },
]

export function ClientAccountsPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isUser = user?.role === 'user'
  const isAdmin = user?.role === 'admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const isManagementUser = isAdmin || isSuperAdmin

  const basePath = isManagementUser ? '/admin' : '/user'
  const sidebarNav = isManagementUser ? adminNav : userNav
  const listPagePath = `${basePath}/clients`
  const clientDetailsPath = `${basePath}/clients/${clientId}`

  const [client, setClient] = useState<Client | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

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
      if (err instanceof ApiError && err.status === 401) {
        logout()
      } else if (err instanceof ApiError && err.status === 403) {
        setError(
          isUser
            ? 'You are not allowed to access this client.'
            : 'You are not allowed to access these accounts.'
        )
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load data')
      }
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
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setFormError('You are not allowed to perform this action.')
        } else {
          setFormError(err.message || 'Operation failed')
        }
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
        if (err.status === 401) {
          logout()
        } else if (err.status === 403) {
          setDeleteError('You are not allowed to delete this account.')
        } else {
          setDeleteError(err.message || 'Failed to delete account')
        }
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
    new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
    }).format(amount)

  if (isLoading) {
    return (
      <SidebarLayout items={sidebarNav}>
        <div className="flex items-center justify-center h-64">
          <div
            data-testid="loading-spinner"
            className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary"
          />
        </div>
      </SidebarLayout>
    )
  }

  if (error || !client) {
    return (
      <SidebarLayout items={sidebarNav}>
        <div className="mt-6 rounded-lg border border-danger bg-danger/10 p-4">
          <p className="text-danger">{error || 'Client not found'}</p>
        </div>
        <button
          onClick={() => navigate(listPagePath)}
          className="mt-4 rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover"
        >
          Back to Clients
        </button>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout items={sidebarNav}>
      <nav>
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate(basePath)} className="text-text-muted hover:text-text">
              Dashboard
            </button>
            <span className="text-text-muted">/</span>
            <button
              onClick={() => navigate(listPagePath)}
              className="text-text-muted hover:text-text"
            >
              {isManagementUser ? 'All Clients' : 'My Clients'}
            </button>
            <span className="text-text-muted">/</span>
            <button
              onClick={() => navigate(clientDetailsPath)}
              className="text-text-muted hover:text-text"
            >
              {client.firstName} {client.lastName}
            </button>
            <span className="text-text-muted">/</span>
            <h1 className="text-xl font-bold text-text">Bank Accounts</h1>
          </div>

          <button
            onClick={logout}
            className="rounded-lg bg-danger px-4 py-2 font-medium text-white transition-colors hover:bg-danger-hover"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="mt-6 space-y-6">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-bold text-text">Accounts</h2>
            <button
              onClick={openCreateModal}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              + New Account
            </button>
          </div>

          <AccountsTable
            accounts={accounts}
            formatDate={formatDate}
            formatAmount={formatAmount}
            onEdit={openEditModal}
            onDelete={setDeletingAccountId}
          />
        </div>

        {modalMode && (
          <AccountFormModal
            modalMode={modalMode}
            formData={formData}
            setFormData={setFormData}
            formError={formError}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onClose={() => setModalMode(null)}
          />
        )}

        {deletingAccountId && (
          <DeleteConfirmModal
            title="Delete Account"
            message="Are you sure you want to delete this account? This action cannot be undone."
            error={deleteError}
            isLoading={isDeleting}
            onCancel={() => {
              setDeletingAccountId(null)
              setDeleteError('')
            }}
            onConfirm={handleDelete}
            testId="delete-account-modal"
          />
        )}
      </main>
    </SidebarLayout>
  )
}
