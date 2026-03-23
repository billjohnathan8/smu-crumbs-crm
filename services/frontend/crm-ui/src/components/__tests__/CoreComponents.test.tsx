import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AccountFormModal } from '../AccountFormModal'
import { BankAccountsPreview } from '../BankAccountsPreview'
import { CommunicationsPanel } from '../CommunicationsPanel'
import { RecentTransactionsTable } from '../RecentTransactionsTable'
import { SidebarLayout, type NavItem } from '../SidebarDrawer'
import { VerificationForm } from '../VerificationForm'
import { VerificationReviewPanel } from '../VerificationReviewPanel'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ThemeProvider } from '@/features/theme/ThemeContext'
import type { Account, AccountCreateRequest, Communication, VerifyClientRequest } from '@/api/types'

const baseFormData: AccountCreateRequest = {
  clientId: 'clt_1',
  accountType: 'Savings',
  accountStatus: 'Active',
  openingDate: '2026-03-21',
  initialDeposit: 100,
  currency: 'SGD',
  branchId: 'br_1',
}

describe('core components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles create mode interactions in AccountFormModal', async () => {
    const user = userEvent.setup()
    const setFormData = vi.fn()
    const onSubmit = vi.fn(e => e.preventDefault())
    const onClose = vi.fn()

    render(
      <AccountFormModal
        modalMode="create"
        formData={baseFormData}
        setFormData={setFormData}
        formError="Form failed"
        isSubmitting={false}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    )

    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument()
    expect(screen.getByText('Form failed')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('SGD')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-03-21')).toBeInTheDocument()

    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Checking')
    expect(setFormData).toHaveBeenCalledWith({ ...baseFormData, accountType: 'Checking' })

    await user.clear(screen.getByDisplayValue('100'))
    expect(setFormData).toHaveBeenCalledWith({ ...baseFormData, initialDeposit: 0 })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('handles edit mode state in AccountFormModal', () => {
    render(
      <AccountFormModal
        modalMode="edit"
        formData={baseFormData}
        setFormData={vi.fn()}
        formError=""
        isSubmitting
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Edit Account' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('100')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('SGD')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('2026-03-21')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })

  it('renders empty and populated states in BankAccountsPreview', async () => {
    const user = userEvent.setup()
    const onManageAccounts = vi.fn()
    const formatAmount = vi.fn((amount: number) => `SGD ${amount}`)

    const { rerender } = render(
      <BankAccountsPreview
        accounts={[]}
        formatAmount={formatAmount}
        onManageAccounts={onManageAccounts}
      />
    )

    expect(screen.getByText('No bank accounts found')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Manage accounts/i }))
    expect(onManageAccounts).toHaveBeenCalledTimes(1)

    const accounts: Account[] = [
      {
        accountId: 'account-0001-abc',
        clientId: 'clt_1',
        accountType: 'Savings',
        accountStatus: 'Active',
        openingDate: '2026-01-01',
        initialDeposit: 10,
        currency: 'SGD',
        branchId: 'br_1',
      },
      {
        accountId: 'account-0002-abc',
        clientId: 'clt_1',
        accountType: 'Checking',
        accountStatus: 'Pending',
        openingDate: '2026-01-02',
        initialDeposit: 20,
        currency: 'SGD',
        branchId: 'br_2',
      },
      {
        accountId: 'account-0003-abc',
        clientId: 'clt_1',
        accountType: 'Business',
        accountStatus: 'Inactive',
        openingDate: '2026-01-03',
        initialDeposit: 30,
        currency: 'SGD',
        branchId: 'br_3',
      },
    ]

    rerender(
      <BankAccountsPreview
        accounts={accounts}
        formatAmount={formatAmount}
        onManageAccounts={onManageAccounts}
      />
    )

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(formatAmount).toHaveBeenCalledTimes(3)
  })

  it('renders empty and populated states in RecentTransactionsTable', async () => {
    const user = userEvent.setup()
    const onViewAll = vi.fn()
    const formatAmount = vi.fn((amount: number) => `SGD ${amount}`)

    const { rerender } = render(
      <RecentTransactionsTable
        transactions={[]}
        formatAmount={formatAmount}
        onViewAll={onViewAll}
      />
    )

    expect(screen.getByText('No transactions found')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /View all/i }))
    expect(onViewAll).toHaveBeenCalledTimes(1)

    rerender(
      <RecentTransactionsTable
        transactions={[
          {
            id: 't1',
            clientId: 'clt_1',
            transaction: 'D',
            amount: 100,
            date: '2026-01-01',
            status: 'Completed',
          },
          {
            id: 't2',
            clientId: 'clt_1',
            transaction: 'W',
            amount: 50,
            date: '2026-01-02',
            status: 'Pending',
          },
          {
            id: 't3',
            clientId: 'clt_1',
            transaction: 'W',
            amount: 25,
            date: '2026-01-03',
            status: 'Failed',
          },
        ]}
        formatAmount={formatAmount}
        onViewAll={onViewAll}
      />
    )

    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.getAllByText('Withdrawal')).toHaveLength(2)
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(formatAmount).toHaveBeenCalledTimes(3)
  })

  it('handles field updates and actions in VerificationForm', async () => {
    const user = userEvent.setup()
    const verifyData: VerifyClientRequest = { nric: '', documentRef: '' }
    const setVerifyData = vi.fn()
    const onSubmit = vi.fn(e => e.preventDefault())
    const onCancel = vi.fn()

    render(
      <VerificationForm
        verifyData={verifyData}
        setVerifyData={setVerifyData}
        verifyError="Verification failed"
        isVerifying={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText('Verification failed')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('e.g. S1234567D'), {
      target: { value: 's1234567d' },
    })
    expect(setVerifyData).toHaveBeenCalledWith({ ...verifyData, nric: 'S1234567D' })

    fireEvent.change(screen.getByPlaceholderText('Optional scan/document reference ID'), {
      target: { value: 'doc-1' },
    })
    expect(setVerifyData).toHaveBeenLastCalledWith({ ...verifyData, documentRef: 'doc-1' })

    await user.click(screen.getByRole('button', { name: 'Submit for Review' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders disabled verification form while submitting', () => {
    render(
      <VerificationForm
        verifyData={{ nric: 'S1234567D', documentRef: 'doc' }}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
    expect(screen.getByPlaceholderText('e.g. S1234567D')).toBeDisabled()
    expect(screen.getByPlaceholderText('Optional scan/document reference ID')).toBeDisabled()
  })

  it('handles actions in VerificationReviewPanel', async () => {
    const user = userEvent.setup()
    const onApprove = vi.fn()
    const onReject = vi.fn()

    const { rerender } = render(
      <VerificationReviewPanel
        reviewError="Review failed"
        isReviewing={false}
        onApprove={onApprove}
        onReject={onReject}
      />
    )

    expect(screen.getByText('Review failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)

    rerender(
      <VerificationReviewPanel
        reviewError=""
        isReviewing
        onApprove={onApprove}
        onReject={onReject}
      />
    )

    expect(screen.getAllByRole('button', { name: 'Processing...' })).toHaveLength(2)
  })

  it('supports compose and editable-status flows in CommunicationsPanel', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const onSubmit = vi.fn(e => e.preventDefault())
    const onUpdateStatus = vi.fn()
    const setShowComposeForm = vi.fn()
    const setComposeData = vi.fn()
    const setStatusUpdates = vi.fn()

    const communications: Communication[] = [
      {
        communicationId: 'com_1',
        clientId: 'clt_1',
        userId: 'usr_1',
        channel: 'email',
        toEmail: 'a@example.com',
        subject: 'Queued message',
        body: 'Body A',
        status: 'queued',
        createdAt: '2026-03-20T00:00:00Z',
        updatedAt: '2026-03-20T00:00:00Z',
      },
      {
        communicationId: 'com_2',
        clientId: 'clt_2',
        userId: 'usr_1',
        channel: 'email',
        toEmail: 'b@example.com',
        subject: 'Sent message',
        body: 'Body B',
        status: 'sent',
        createdAt: '2026-03-20T00:00:00Z',
        updatedAt: '2026-03-20T00:00:00Z',
      },
      {
        communicationId: 'com_3',
        clientId: 'clt_3',
        userId: 'usr_1',
        channel: 'email',
        toEmail: 'c@example.com',
        subject: 'Failed message',
        body: 'Body C',
        status: 'failed',
        createdAt: '2026-03-20T00:00:00Z',
        updatedAt: '2026-03-20T00:00:00Z',
      },
    ]

    render(
      <CommunicationsPanel
        communications={communications}
        formatDate={() => '20 Mar 2026'}
        onRefresh={onRefresh}
        showComposeForm={false}
        setShowComposeForm={setShowComposeForm}
        composeData={{ toEmail: '', subject: '', body: '' }}
        setComposeData={setComposeData}
        onSubmit={onSubmit}
        defaultEmail="default@example.com"
        editableStatuses
        statusUpdates={{ com_1: 'queued', com_2: 'sent', com_3: 'failed' }}
        setStatusUpdates={setStatusUpdates}
        onUpdateStatus={onUpdateStatus}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Compose Email' }))
    expect(setShowComposeForm).toHaveBeenCalledTimes(1)
    expect(setComposeData).toHaveBeenCalledTimes(1)
    const toggleFn = setShowComposeForm.mock.calls[0][0] as (prev: boolean) => boolean
    expect(toggleFn(false)).toBe(true)

    const composeFn = setComposeData.mock.calls[0][0] as (prev: {
      toEmail: string
      subject: string
      body: string
    }) => { toEmail: string; subject: string; body: string }
    expect(composeFn({ toEmail: '', subject: 'x', body: 'y' })).toEqual({
      toEmail: 'default@example.com',
      subject: 'x',
      body: 'y',
    })

    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'sent' },
    })
    expect(setStatusUpdates).toHaveBeenCalledTimes(1)
    const statusFn = setStatusUpdates.mock.calls.at(-1)?.[0] as (
      prev: Record<string, string>
    ) => Record<string, string>
    const nextStatuses = statusFn({ com_1: 'queued', com_2: 'sent', com_3: 'failed' })
    expect(nextStatuses).toHaveProperty('com_1')

    await user.click(screen.getAllByRole('button', { name: 'Update' })[0])
    expect(onUpdateStatus).toHaveBeenCalledWith('com_1')
  })

  it('renders compose form and non-editable list mode in CommunicationsPanel', async () => {
    const user = userEvent.setup()
    const setComposeData = vi.fn()
    const setShowComposeForm = vi.fn()
    const onSubmit = vi.fn(e => e.preventDefault())

    render(
      <CommunicationsPanel
        communications={[
          {
            communicationId: 'com_9',
            clientId: 'clt_9',
            userId: 'usr_9',
            channel: 'email',
            toEmail: 'x@example.com',
            subject: 'Subject',
            body: 'Body',
            status: 'queued',
            createdAt: '2026-03-20T00:00:00Z',
            updatedAt: '2026-03-20T00:00:00Z',
          },
        ]}
        formatDate={() => 'formatted-date'}
        showComposeForm
        setShowComposeForm={setShowComposeForm}
        composeData={{ toEmail: 'old@example.com', subject: 'old', body: 'old body' }}
        setComposeData={setComposeData}
        composeSuccess="Sent successfully"
        composeError="Compose failed"
        onSubmit={onSubmit}
      />
    )

    expect(screen.getByText('Sent successfully')).toBeInTheDocument()
    expect(screen.getByText('Compose failed')).toBeInTheDocument()

    await user.type(screen.getByDisplayValue('old@example.com'), 'new')
    await user.type(screen.getByDisplayValue('old'), ' subject')
    await user.type(screen.getByDisplayValue('old body'), ' updated')
    expect(setComposeData).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Send Email' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[1])
    expect(setShowComposeForm).toHaveBeenCalledWith(false)
    expect(screen.getByText(/To: x@example.com/)).toBeInTheDocument()
  })

  it('renders disabled compose controls and empty message', () => {
    render(
      <CommunicationsPanel
        communications={[]}
        formatDate={() => '-'}
        emptyMessage="Nothing here"
        showComposeForm
        setShowComposeForm={vi.fn()}
        composeData={{ toEmail: '', subject: '', body: '' }}
        setComposeData={vi.fn()}
        onSubmit={vi.fn()}
        isSending
      />
    )

    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()
  })

  it('toggles SidebarLayout collapsed state', async () => {
    const user = userEvent.setup()
    const items: NavItem[] = [
      { label: 'Home', to: '/admin', end: true },
      { label: 'Clients', to: '/admin/clients' },
    ]

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/admin']}>
            <SidebarLayout items={items}>
              <p>Page body</p>
            </SidebarLayout>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    )

    expect(screen.getByAltText('ScroogeBank')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/admin')
    expect(screen.getByText('Page body')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button')[1])
    expect(screen.queryByAltText('ScroogeBank')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button'))
    expect(screen.getByAltText('ScroogeBank')).toBeInTheDocument()
  })
})
