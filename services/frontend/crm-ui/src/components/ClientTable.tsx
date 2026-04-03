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
  showAssignedAgent?: boolean
  agentNameMap?: Record<string, string>
}

export function ClientTable({
  clients,
  onView,
  showAssignedAgent = false,
  agentNameMap = {},
}: ClientTableProps) {
  if (clients.length === 0) {
    return <div className="p-6 text-center text-text-subtle">No clients found</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-background-light">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
              KYC Status
            </th>
            {showAssignedAgent && (
              <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
                Assigned Agent
              </th>
            )}
            <th className="px-6 py-3 text-left text-xs font-normal text-text-muted uppercase tracking-wider">
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
              <td className="px-6 py-4 text-sm font-normal text-text">
                {client.firstName} {client.lastName}
              </td>
              <td className="px-6 py-4 text-sm text-text-muted">{client.emailAddress}</td>
              <td className="px-6 py-4 text-sm text-text-muted">{client.phoneNumber}</td>
              <td className="px-6 py-4">
                <span
                  className={`px-2 py-1 rounded text-xs font-normal ${
                    statusColors[client.identityVerificationStatus] ??
                    'bg-background-light text-text-muted'
                  }`}
                >
                  {client.identityVerificationStatus}
                </span>
              </td>
              {showAssignedAgent && (
                <td className="px-6 py-4 text-sm text-text-muted">
                  {client.assignedUserId
                    ? agentNameMap[client.assignedUserId] || client.assignedUserId
                    : '-'}
                </td>
              )}
              <td className="px-6 py-4">
                <button
                  onClick={e => {
                    e.stopPropagation()
                    onView(client.clientId)
                  }}
                  className="underline-hover text-primary text-sm"
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
