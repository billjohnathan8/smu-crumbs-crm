import type { Account } from '@/api/types'

const accountStatusColors: Record<string, string> = {
  Active: 'bg-success/20 text-success',
  Inactive: 'bg-background-light text-text-muted',
  Pending: 'bg-warning/20 text-warning',
}

type AccountsTableProps = {
  accounts: Account[]
  formatDate: (dateStr?: string) => string
  formatAmount: (amount: number) => string
  onEdit: (account: Account) => void
  onDelete: (accountId: string) => void
}

export function AccountsTable({
  accounts,
  formatDate,
  formatAmount,
  onEdit,
  onDelete,
}: AccountsTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="p-6 text-center text-text-muted text-sm">
        No accounts found for this client.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-background-light">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Account ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Client ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Opened
            </th>
            <th className="px-6 py-3 text-right text-xs font-normal text-text-muted uppercase tracking-wider">
              Initial Deposit
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Currency
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Branch
            </th>
            <th className="px-6 py-3 text-right text-xs font-normal text-text-muted uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map(acct => (
            <tr key={acct.accountId} className="hover:bg-background-light">
              <td className="px-6 py-3 text-sm text-text font-mono">{acct.accountId}</td>
              <td className="px-6 py-3 text-sm text-text">{acct.clientId}</td>
              <td className="px-6 py-3 text-sm text-text">{acct.accountType}</td>
              <td className="px-6 py-3">
                <span
                  className={`px-2 py-1 rounded text-xs font-normal ${
                    accountStatusColors[acct.accountStatus] ?? ''
                  }`}
                >
                  {acct.accountStatus}
                </span>
              </td>
              <td className="px-6 py-3 text-sm text-text">{formatDate(acct.openingDate)}</td>
              <td className="px-6 py-3 text-sm text-text text-right font-normal">
                {formatAmount(acct.initialDeposit)}
              </td>
              <td className="px-6 py-3 text-sm text-text">{acct.currency}</td>
              <td className="px-6 py-3 text-sm text-text">{acct.branchId}</td>
              <td className="px-6 py-3 text-right space-x-2">
                <button
                  onClick={() => onEdit(acct)}
                  className="text-primary hover:underline text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(acct.accountId)}
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
  )
}
