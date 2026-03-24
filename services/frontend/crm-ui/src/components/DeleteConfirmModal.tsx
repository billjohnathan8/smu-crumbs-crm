type DeleteConfirmModalProps = {
  title: string
  message: string
  error?: string
  isLoading?: boolean
  onCancel: () => void
  onConfirm: () => void
  testId?: string
}

export function DeleteConfirmModal({
  title,
  message,
  error,
  isLoading = false,
  onCancel,
  onConfirm,
  testId,
}: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid={testId}
    >
      <div className="bg-card  rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-bold text-text mb-2">{title}</h2>
        <p className="text-text-muted text-sm mb-4">{message}</p>

        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-normal"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-sm font-normal disabled:opacity-50"
          >
            {isLoading ? 'Deleting...' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
