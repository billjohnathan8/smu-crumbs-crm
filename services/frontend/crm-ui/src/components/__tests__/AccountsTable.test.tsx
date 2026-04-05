import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountsTable } from '../AccountsTable'
import type { Account } from '@/api/types'

describe('AccountsTable', () => {
  it('renders empty state when there are no accounts', () => {
    render(
      <AccountsTable
        accounts={[]}
        formatDate={() => '-'}
        formatAmount={amount => `SGD ${amount}`}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('No accounts found for this client.')).toBeInTheDocument()
  })

  it('renders account row and triggers edit/delete handlers', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    const account: Account = {
      accountId: 'acct_1',
      clientId: 'clt_1',
      accountType: 'Savings',
      accountStatus: 'Active',
      openingDate: '2026-01-01',
      initialDeposit: 1200,
      currency: 'SGD',
      branchId: 'SG-001',
    }

    render(
      <AccountsTable
        accounts={[account]}
        formatDate={() => '01 Jan 2026'}
        formatAmount={amount => `SGD ${amount}`}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText('acct_1')).toBeInTheDocument()
    expect(screen.getByText('01 Jan 2026')).toBeInTheDocument()
    expect(screen.getByText('SGD 1200')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(account)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('acct_1')
  })

  it('renders unknown account status using fallback class branch', () => {
    const account = {
      accountId: 'acct_2',
      clientId: 'clt_2',
      accountType: 'Checking',
      accountStatus: 'Dormant',
      openingDate: '2026-01-02',
      initialDeposit: 300,
      currency: 'USD',
      branchId: 'US-001',
    } as unknown as Account

    render(
      <AccountsTable
        accounts={[account]}
        formatDate={() => '02 Jan 2026'}
        formatAmount={amount => `USD ${amount}`}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('Dormant')).toBeInTheDocument()
  })
})
