import { uploadVerificationDocs, type UploadVerificationDocsRequest } from '@/api'
import { ApiError } from '@/api/client'
import { useState, useEffect, type FormEvent } from 'react'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

const PRIMARY_ID_TYPES = [
  { value: 'NRIC', label: 'Singapore NRIC' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'EMPLOYMENT_PASS', label: 'Employment Pass / S Pass / Work Permit' },
]

const PROOF_OF_ADDRESS_TYPES = [
  { value: 'UTILITY_BILL', label: 'Utility Bill (within 3 months)' },
  { value: 'BANK_STATEMENT', label: 'Bank Statement (within 3 months)' },
  { value: 'GOVERNMENT_LETTER', label: 'Government-issued Letter (CPF / IRAS / HDB)' },
  { value: 'TENANCY_AGREEMENT', label: 'Tenancy Agreement' },
]

type AuthState = 'checking' | 'valid' | 'unauthenticated'
type JwtPayload = { clientId: string; exp?: number }

interface DocumentSection {
  docType: string
  file: File | null
}

const emptyDoc = (defaultType: string): DocumentSection => ({
  docType: defaultType,
  file: null,
})

export function ClientVerifyPage() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [clientId, setClientId] = useState('')
  const [token, setToken] = useState('')
  const [primaryId, setPrimaryId] = useState<DocumentSection>(emptyDoc('NRIC'))
  const [proofOfAddress, setProofOfAddress] = useState<DocumentSection>(emptyDoc('UTILITY_BILL'))
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    try {
      const qp = new URLSearchParams(window.location.search)
      const jwt = qp.get('token')
      if (!jwt) {
        setAuthState('unauthenticated')
        return
      }

      // Decode
      const payload = decodeJwtPayload(jwt)
      if (!payload) {
        setAuthState('unauthenticated')
        return
      }

      // Retrieve clientId
      if (!payload.clientId || !payload.exp) {
        setAuthState('unauthenticated')
        return
      }

      // TTL (JWT expiration)
      const expiry = payload.exp * 1000
      const now = Date.now()
      if (expiry < now) {
        setAuthState('unauthenticated')
        return
      }

      // set state
      setToken(jwt)
      setClientId(payload.clientId)
      setAuthState('valid')
    } catch {
      setAuthState('unauthenticated')
    }
  }, [])

  const validate = (): string | null => {
    if (!clientId.trim()) return 'Client ID is required.'

    // Primary ID validation
    if (!primaryId.docType) return 'Please select a Primary Identity document type.'
    if (!primaryId.file) return 'Please upload a file for the Primary Identity document.'
    if (primaryId.file && primaryId.file.size > MAX_FILE_BYTES)
      return 'Primary document must be under 5 MB.'

    // Proof of address validation
    if (!proofOfAddress.docType) return 'Please select a Proof of Address document type.'
    if (!proofOfAddress.file) return 'Please upload a file for the Proof of Address document.'
    if (proofOfAddress.file && proofOfAddress.file.size > MAX_FILE_BYTES)
      return 'Proof of address must be under 5 MB.'

    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const err = validate()
    if (err) {
      setMessage({ type: 'error', text: err })
      return
    }

    setIsLoading(true)
    try {
      const [primaryBase64, addressBase64] = await Promise.all([
        toBase64(primaryId.file!),
        toBase64(proofOfAddress.file!),
      ])

      const body: UploadVerificationDocsRequest = {
        verificationToken: token,

        primaryDocumentType: primaryId.docType as UploadVerificationDocsRequest['primaryDocumentType'],
        primaryDocumentRef: primaryId.file!.name,
        primaryDocumentBase64: primaryBase64,
        primaryDocumentMimeType: primaryId.file!.type,

        addressDocumentType:
          proofOfAddress.docType as UploadVerificationDocsRequest['addressDocumentType'],
        addressDocumentRef: proofOfAddress.file!.name,
        addressDocumentBase64: addressBase64,
        addressDocumentMimeType: proofOfAddress.file!.type,
      }

      await uploadVerificationDocs(clientId, body)
      setMessage({
        type: 'success',
        text: 'Documents uploaded and verification requested. Thank you.',
      })
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage({ type: 'error', text: error.message || 'Upload failed. Please try again.' })
      } else {
        setMessage({ type: 'error', text: 'Upload failed. Please try again.' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setClientId('')
    setToken('')
    setPrimaryId(emptyDoc('NRIC'))
    setProofOfAddress(emptyDoc('UTILITY_BILL'))
    setMessage(null)
  }

  // Helper Function
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        // result is "data:image/jpeg;base64,/9j/4AAQ..." — strip the prefix
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const decodeJwtPayload = (token: string): JwtPayload | null => {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null

      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')

      const decoded = atob(payload)
      return JSON.parse(decoded) as JwtPayload
    } catch {
      return null
    }
  }

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Validating link...
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Verification Link Invalid</h1>
          <p className="text-sm text-gray-500">
            This verification link is invalid or has expired. Please request a new verification
            email.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Identity Verification</h1>
          <p className="mt-1 text-sm text-gray-500">
            Please provide your identity and address documents to complete verification.
          </p>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          {/* ── Primary Identity Document ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Primary Identity Document
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                Accepted: Singapore NRIC, Passport, Employment / S Pass / Work Permit
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={primaryId.docType}
                  onChange={e =>
                    setPrimaryId(prev => ({ ...prev, docType: e.target.value, nric: '' }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                >
                  {PRIMARY_ID_TYPES.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Document <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm 
                      font-medium text-gray-700 hover:bg-gray-50 transition ${
                        isLoading ? 'opacity-50 pointer-events-none' : ''
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Choose File
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e =>
                        setPrimaryId(prev => ({
                          ...prev,
                          file: e.target.files ? e.target.files[0] : null,
                        }))
                      }
                      disabled={isLoading}
                    />
                  </label>
                  <span className="text-sm text-gray-500 truncate max-w-xs">
                    {primaryId.file ? primaryId.file.name : 'No file chosen'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">Accepted formats: JPG, PNG, PDF</p>
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* ── Proof of Address ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Proof of Address
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                Accepted: Utility bill, bank statement, government letter, or tenancy agreement
                (dated within 3 months where applicable)
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={proofOfAddress.docType}
                  onChange={e => setProofOfAddress(prev => ({ ...prev, docType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                >
                  {PROOF_OF_ADDRESS_TYPES.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Document <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm 
                      font-medium text-gray-700 hover:bg-gray-50 transition ${
                        isLoading ? 'opacity-50 pointer-events-none' : ''
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Choose File
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e =>
                        setProofOfAddress(prev => ({
                          ...prev,
                          file: e.target.files ? e.target.files[0] : null,
                        }))
                      }
                      disabled={isLoading}
                    />
                  </label>
                  <span className="text-sm text-gray-500 truncate max-w-xs">
                    {proofOfAddress.file ? proofOfAddress.file.name : 'No file chosen'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">Accepted formats: JPG, PNG, PDF</p>
              </div>
            </div>
          </section>

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 
                text-white text-sm font-semibold rounded-lg transition"
            >
              {isLoading ? 'Uploading...' : 'Upload & Verify'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
