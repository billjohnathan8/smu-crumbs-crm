import type { FormEvent } from 'react'
import type { VerifyClientRequest } from '@/api/types'

type VerificationFormProps = {
  verifyData: VerifyClientRequest
  setVerifyData: React.Dispatch<React.SetStateAction<VerifyClientRequest>>
  verifyError: string
  isVerifying: boolean
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

export function VerificationForm({
  verifyData,
  setVerifyData,
  verifyError,
  isVerifying,
  onSubmit,
  onCancel,
}: VerificationFormProps) {
  return (
    <div className="bg-card  rounded-lg p-6">
      <h2 className="text-lg font-bold text-text mb-4">KYC Verification</h2>

      {verifyError && (
        <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
          <p className="text-danger text-sm">{verifyError}</p>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-normal text-text mb-1">
            NRIC <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. S1234567D"
            value={verifyData.nric}
            onChange={e => setVerifyData({ ...verifyData, nric: e.target.value.toUpperCase() })}
            className="w-full px-4 py-2 bg-background-light  rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isVerifying}
          />
          <p className="text-xs text-text-muted mt-1">
            Singapore NRIC format: S/T/F/G/M + 7 digits + letter
          </p>
        </div>

        <div>
          <label className="block text-sm font-normal text-text mb-1">Document Reference</label>
          <input
            type="text"
            placeholder="Optional scan/document reference ID"
            value={verifyData.documentRef || ''}
            onChange={e => setVerifyData({ ...verifyData, documentRef: e.target.value })}
            className="w-full px-4 py-2 bg-background-light  rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isVerifying}
          />
        </div>

        <div className="flex space-x-3">
          <button
            type="submit"
            disabled={isVerifying}
            className="px-6 py-2 bg-success hover:bg-success-hover text-white rounded-lg text-sm font-normal disabled:opacity-50"
          >
            {isVerifying ? 'Submitting...' : 'Submit for Review'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 bg-background-light hover:bg-background-lighter text-text rounded-lg text-sm font-normal"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
