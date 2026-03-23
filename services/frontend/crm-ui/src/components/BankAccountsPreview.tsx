import type { Account } from '@/api/types'

type BankAccountsPreviewProps = {
  accounts: Account[]
  formatAmount: (amount: number) => string
  onManageAccounts: () => void
}

export function BankAccountsPreview({
  accounts,
  formatAmount,
  onManageAccounts,
}: BankAccountsPreviewProps) {
  return (
    <div className="bg-card  rounded-lg">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">Bank Accounts</h2>
        <button onClick={onManageAccounts} className="text-primary hover:underline text-sm">
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
                <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                  Account ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-normal text-text-muted uppercase tracking-wider">
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
                      className={`px-2 py-1 rounded text-xs font-normal ${
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
                  <td className="px-6 py-3 text-sm text-text text-right font-normal">
                    {formatAmount(acct.initialDeposit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
