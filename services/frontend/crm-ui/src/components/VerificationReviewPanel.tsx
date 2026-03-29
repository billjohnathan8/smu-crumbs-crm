type VerificationReviewPanelProps = {
  reviewError: string
  isReviewing: boolean
  onApprove: () => void
  onReject: () => void
}

export function VerificationReviewPanel({
  reviewError,
  isReviewing,
  onApprove,
  onReject,
}: VerificationReviewPanelProps) {
  return (
    <div className="bg-card border border-warning rounded-lg p-6">
      <h2 className="text-lg font-bold text-text mb-2">Pending Verification Review</h2>
      <p className="text-sm text-text-muted mb-4">
        This client has submitted identity documents for KYC verification. Review and approve or
        reject.
      </p>

      {reviewError && (
        <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
          <p className="text-danger text-sm">{reviewError}</p>
        </div>
      )}

      <div className="flex space-x-3">
        <button
          onClick={onApprove}
          disabled={isReviewing}
          className="px-6 py-2 bg-success hover:bg-success-hover text-white rounded-lg text-sm font-normal disabled:opacity-50"
        >
          {isReviewing ? 'Processing...' : 'Approve'}
        </button>
        <button
          onClick={onReject}
          disabled={isReviewing}
          className="px-6 py-2 gradient-dark-red hover:opacity-80 text-white rounded-lg text-sm font-normal disabled:opacity-50 transition-opacity"
        >
          {isReviewing ? 'Processing...' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
