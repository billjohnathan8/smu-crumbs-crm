import type { Client } from '@/api/types'

const statusColors: Record<string, string> = {
  unverified: 'bg-background-light text-text-muted',
  pending: 'bg-warning/20 text-warning',
  verified: 'bg-success/20 text-success',
  rejected: 'bg-danger/20 text-danger',
}

type ClientTableProps = {
  clients: Client[]
  onView: (clientId: string) => void
}

export function ClientTable({ clients, onView }: ClientTableProps) {
  if (clients.length === 0) {
    return <div className="p-6 text-center text-text-muted">No clients found</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-background-light">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
              KYC Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.map(client => (
            <tr
              key={client.clientId}
              className="hover:bg-background-light cursor-pointer"
              onClick={() => onView(client.clientId)}
            >
              <td className="px-6 py-4 text-sm font-medium text-text">
                {client.firstName} {client.lastName}
              </td>
              <td className="px-6 py-4 text-sm text-text-muted">{client.emailAddress}</td>
              <td className="px-6 py-4 text-sm text-text-muted">{client.phoneNumber}</td>
              <td className="px-6 py-4">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    statusColors[client.identityVerificationStatus] ??
                    'bg-background-light text-text-muted'
                  }`}
                >
                  {client.identityVerificationStatus}
                </span>
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={e => {
                    e.stopPropagation()
                    onView(client.clientId)
                  }}
                  className="text-primary hover:underline text-sm"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
