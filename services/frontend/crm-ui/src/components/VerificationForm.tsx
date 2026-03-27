import type { FormEvent } from 'react'
import type { UploadVerificationDocsRequest } from '@/api/types'

/**
 * @deprecated Legacy internal verification-upload form retained for compatibility/tests only.
 * Canonical public upload flow is implemented by `ClientVerifyPage` at `/verify-client`.
 */
const PRIMARY_ID_TYPES = [
  { value: 'NRIC', label: 'Singapore NRIC' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'EMPLOYMENT_PASS', label: 'Employment Pass / S Pass / Work Permit' },
] as const

const PROOF_OF_ADDRESS_TYPES = [
  { value: 'UTILITY_BILL', label: 'Utility Bill (within 3 months)' },
  { value: 'BANK_STATEMENT', label: 'Bank Statement (within 3 months)' },
  { value: 'GOVERNMENT_LETTER', label: 'Government-issued Letter (CPF / IRAS / HDB)' },
  { value: 'TENANCY_AGREEMENT', label: 'Tenancy Agreement' },
] as const

type VerificationFormProps = {
  verifyData: UploadVerificationDocsRequest
  setVerifyData: React.Dispatch<React.SetStateAction<UploadVerificationDocsRequest>>
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
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handlePrimaryFileChange = async (file: File | null) => {
    if (!file) {
      setVerifyData(prev => ({
        ...prev,
        primaryDocumentRef: '',
        primaryDocumentBase64: '',
        primaryDocumentMimeType: '',
      }))
      return
    }

    const base64 = await toBase64(file)
    setVerifyData(prev => ({
      ...prev,
      primaryDocumentRef: file.name,
      primaryDocumentBase64: base64,
      primaryDocumentMimeType: file.type,
    }))
  }

  const handleAddressFileChange = async (file: File | null) => {
    if (!file) {
      setVerifyData(prev => ({
        ...prev,
        addressDocumentRef: '',
        addressDocumentBase64: '',
        addressDocumentMimeType: '',
      }))
      return
    }

    const base64 = await toBase64(file)
    setVerifyData(prev => ({
      ...prev,
      addressDocumentRef: file.name,
      addressDocumentBase64: base64,
      addressDocumentMimeType: file.type,
    }))
  }

  return (
    <div className="bg-card  rounded-lg p-6">
      <h2 className="text-lg font-bold text-text mb-4">KYC Verification</h2>

      {verifyError && (
        <div className="bg-danger/10 border border-danger rounded-lg p-3 mb-4">
          <p className="text-danger text-sm">{verifyError}</p>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-normal text-text mb-1">
            Primary Identity Document <span className="text-danger">*</span>
          </label>
          <select
            value={verifyData.primaryDocumentType}
            onChange={e =>
              setVerifyData(prev => ({
                ...prev,
                primaryDocumentType: e.target
                  .value as UploadVerificationDocsRequest['primaryDocumentType'],
              }))
            }
            className="w-full px-4 py-2 bg-background-light rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isVerifying}
          >
            {PRIMARY_ID_TYPES.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-normal text-text mb-1">
            Upload Primary Document <span className="text-danger">*</span>
          </label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={e => void handlePrimaryFileChange(e.target.files?.[0] ?? null)}
            className="w-full px-4 py-2 bg-background-light rounded-lg text-text text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-white"
            disabled={isVerifying}
          />
          <p className="text-xs text-text-muted mt-1">
            {verifyData.primaryDocumentRef || 'No file chosen'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-normal text-text mb-1">
            Proof of Address Document <span className="text-danger">*</span>
          </label>
          <select
            value={verifyData.addressDocumentType}
            onChange={e =>
              setVerifyData(prev => ({
                ...prev,
                addressDocumentType: e.target
                  .value as UploadVerificationDocsRequest['addressDocumentType'],
              }))
            }
            className="w-full px-4 py-2 bg-background-light rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isVerifying}
          >
            {PROOF_OF_ADDRESS_TYPES.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-normal text-text mb-1">
            Upload Proof of Address <span className="text-danger">*</span>
          </label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={e => void handleAddressFileChange(e.target.files?.[0] ?? null)}
            className="w-full px-4 py-2 bg-background-light rounded-lg text-text text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-white"
            disabled={isVerifying}
          />
          <p className="text-xs text-text-muted mt-1">
            {verifyData.addressDocumentRef || 'No file chosen'}
          </p>
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
            className="px-6 py-2 bg-background-light hover:bg-gray-200 text-text rounded-lg text-sm font-normal border-2 border-border hover:border-text-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
