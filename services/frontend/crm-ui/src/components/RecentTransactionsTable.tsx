import type { Transaction } from '@/api/types'

type RecentTransactionsTableProps = {
  transactions: Transaction[]
  formatAmount: (amount: number) => string
  onViewAll: () => void
}

export function RecentTransactionsTable({
  transactions,
  formatAmount,
  onViewAll,
}: RecentTransactionsTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">Recent Transactions</h2>
        <button
          onClick={onViewAll}
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
  )
}