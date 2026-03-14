import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { Communication, CommunicationStatus } from '@/api/types'
import type { SendCommunicationRequest } from '@/api/communications'

type ComposeData = Omit<SendCommunicationRequest, 'clientId' | 'channel'>

type CommunicationsPanelProps = {
  communications: Communication[]
  formatDate: (dateStr?: string) => string

  title?: string
  emptyMessage?: string
  refreshLabel?: string
  onRefresh?: () => void
  isRefreshing?: boolean

  showComposeForm?: boolean
  setShowComposeForm?: Dispatch<SetStateAction<boolean>>
  composeData?: ComposeData
  setComposeData?: Dispatch<SetStateAction<ComposeData>>
  composeSuccess?: string
  composeError?: string
  isSending?: boolean
  onSubmit?: (e: FormEvent) => void
  defaultEmail?: string

  editableStatuses?: boolean
  statusUpdates?: Record<string, CommunicationStatus>
  setStatusUpdates?: Dispatch<SetStateAction<Record<string, CommunicationStatus>>>
  isUpdating?: Record<string, boolean>
  onUpdateStatus?: (communicationId: string) => void
}

export function CommunicationsPanel({
  communications,
  formatDate,
  title = 'Communications',
  emptyMessage = 'No communications found',
  refreshLabel = 'Refresh',
  onRefresh,
  isRefreshing = false,

  showComposeForm = false,
  setShowComposeForm,
  composeData,
  setComposeData,
  composeSuccess = '',
  composeError = '',
  isSending = false,
  onSubmit,
  defaultEmail,

  editableStatuses = false,
  statusUpdates,
  setStatusUpdates,
  isUpdating = {},
  onUpdateStatus,
}: CommunicationsPanelProps) {
  const canCompose =
    setShowComposeForm && composeData && setComposeData && onSubmit

  const toggleCompose = () => {
    if (!setShowComposeForm) return

    setShowComposeForm(prev => !prev)

    if (!showComposeForm && defaultEmail && setComposeData) {
      setComposeData(prev => ({ ...prev, toEmail: defaultEmail }))
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-lg font-bold text-text">{title}</h2>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="rounded bg-background-light px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-background-lighter disabled:opacity-50"
            >
              {refreshLabel}
            </button>
          )}

          {canCompose && (
            <button
              onClick={toggleCompose}
              disabled={isSending}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {showComposeForm ? 'Cancel' : 'Compose Email'}
            </button>
          )}
        </div>
      </div>

      {composeSuccess && (
        <div className="mx-6 mt-4 rounded-lg border border-success bg-success/10 p-3">
          <p className="text-sm text-success">{composeSuccess}</p>
        </div>
      )}

      {canCompose && showComposeForm && composeData && setComposeData && onSubmit && (
        <div className="border-b border-border p-6">
          {composeError && (
            <div className="mb-4 rounded-lg border border-danger bg-danger/10 p-3">
              <p className="text-sm text-danger">{composeError}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="max-w-lg space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                To Email <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                value={composeData.toEmail}
                onChange={e => setComposeData(prev => ({ ...prev, toEmail: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background-light px-4 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isSending}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                Subject <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={composeData.subject}
                onChange={e => setComposeData(prev => ({ ...prev, subject: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background-light px-4 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isSending}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text">
                Body <span className="text-danger">*</span>
              </label>
              <textarea
                rows={4}
                value={composeData.body}
                onChange={e => setComposeData(prev => ({ ...prev, body: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background-light px-4 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isSending}
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={isSending}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {isSending ? 'Sending...' : 'Send Email'}
              </button>
              <button
                type="button"
                onClick={() => setShowComposeForm(false)}
                disabled={isSending}
                className="rounded-lg bg-background-light px-6 py-2 text-sm font-medium text-text hover:bg-background-lighter disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {communications.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">{emptyMessage}</div>
      ) : editableStatuses ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background-light">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {communications.map(comm => (
                <tr key={comm.communicationId} className="hover:bg-background-light">
                  <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-text-muted">
                    {comm.communicationId}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-text">
                    {comm.toEmail}
                  </td>
                  <td className="max-w-xs truncate px-6 py-4 text-sm text-text">
                    {comm.subject}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <select
                      value={statusUpdates?.[comm.communicationId] ?? comm.status}
                      onChange={e =>
                        setStatusUpdates?.(prev => ({
                          ...prev,
                          [comm.communicationId]: e.target.value as CommunicationStatus,
                        }))
                      }
                      className="rounded border border-border bg-background-light px-2 py-1 text-sm text-text"
                    >
                      <option value="queued">queued</option>
                      <option value="sent">sent</option>
                      <option value="failed">failed</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-text">
                    {formatDate(comm.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <button
                      onClick={() => onUpdateStatus?.(comm.communicationId)}
                      disabled={isUpdating?.[comm.communicationId]}
                      className="rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {isUpdating?.[comm.communicationId] ? 'Saving...' : 'Update'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {communications.map(comm => (
            <div key={comm.communicationId} className="px-6 py-4 hover:bg-background-light">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium text-text">{comm.subject}</p>
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    comm.status === 'sent'
                      ? 'bg-success/20 text-success'
                      : comm.status === 'queued'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-danger/20 text-danger'
                  }`}
                >
                  {comm.status}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                To: {comm.toEmail} · {formatDate(comm.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}