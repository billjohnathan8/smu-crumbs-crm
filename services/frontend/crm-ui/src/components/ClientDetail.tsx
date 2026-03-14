import type { Client } from '@/api/types'

type ClientDetailProps = {
  client: Client
  formatDate: (dateStr?: string) => string
  onEdit?: () => void
  onDelete?: () => void
  onToggleVerify?: () => void
  showVerifyButton: boolean
  showVerifyForm: boolean
}

export function ClientDetail({
  client,
  formatDate,
  onEdit,
  onDelete,
  onToggleVerify,
  showVerifyButton,
  showVerifyForm,
}: ClientDetailProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-text">Client Profile</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={onEdit}
            className="px-4 py-2 rounded bg-primary hover:bg-primary-hover text-white text-sm font-medium"
          >
            Edit Client
          </button>
          <button
            onClick={onDelete}
            className="px-4 py-2 rounded bg-danger hover:bg-danger-hover text-white text-sm font-medium"
          >
            Delete Client
          </button>
          {showVerifyButton && (
            <button
              onClick={onToggleVerify}
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
  )
}