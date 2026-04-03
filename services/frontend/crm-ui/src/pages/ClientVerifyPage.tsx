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
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const queryParams = new URLSearchParams(window.location.search)
      const jwt = hashParams.get('token') || queryParams.get('token')
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
      window.history.replaceState(null, '', window.location.pathname)
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

        primaryDocumentType:
          primaryId.docType as UploadVerificationDocsRequest['primaryDocumentType'],
        primaryDocumentRef: primaryId.file!.name,
        primaryDocumentBase64: primaryBase64,
        primaryDocumentMimeType: primaryId.file!.type,

        addressDocumentType:
          proofOfAddress.docType as UploadVerificationDocsRequest['addressDocumentType'],
        addressDocumentRef: proofOfAddress.file!.name,
        addressDocumentBase64: addressBase64,
        addressDocumentMimeType: proofOfAddress.file!.type,
      }

      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      await uploadVerificationDocs(clientId, body, idempotencyKey)
      setMessage({
        type: 'success',
        text: 'Documents uploaded and verification requested. Thank you.',
      })
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage({
          type: 'error',
          text: 'Upload failed. Please request a new verification link.',
        })
      } else {
        setMessage({
          type: 'error',
          text: 'Upload failed. Please request a new verification link.',
        })
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
      <div className="dark min-h-screen flex items-center justify-center bg-background text-text-muted">
        Validating link...
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-sm p-8 text-center">
          <h1 className="text-xl font-bold text-text mb-2">Verification Link Invalid</h1>
          <p className="text-sm text-text-muted">
            This verification link is invalid or has expired. Please request a new verification
            email.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-sm p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text">Identity Verification</h1>
          <p className="mt-1 text-sm text-text-muted">
            Please provide your identity and address documents to complete verification.
          </p>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
              message.type === 'error'
                ? 'bg-danger/15 text-danger border border-danger/50'
                : 'bg-success/15 text-success border border-success/50'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          {/* ── Primary Identity Document ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-subtle">
                Primary Identity Document
              </h2>
              <p className="mt-1 text-xs text-text-subtle">
                Accepted: Singapore NRIC, Passport, Employment / S Pass / Work Permit
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Document Type <span className="text-danger">*</span>
                </label>
                <select
                  value={primaryId.docType}
                  onChange={e => setPrimaryId(prev => ({ ...prev, docType: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background-light text-text focus:outline-none focus:ring-2 focus:ring-primary"
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
                <label className="block text-sm font-medium text-text mb-1">
                  Upload Document <span className="text-danger">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm 
                      font-medium text-text hover:bg-background-light transition ${
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
                  <span className="text-sm text-text-muted truncate max-w-xs">
                    {primaryId.file ? primaryId.file.name : 'No file chosen'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-subtle">Accepted formats: JPG, PNG, PDF</p>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* ── Proof of Address ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-subtle">
                Proof of Address
              </h2>
              <p className="mt-1 text-xs text-text-subtle">
                Accepted: Utility bill, bank statement, government letter, or tenancy agreement
                (dated within 3 months where applicable)
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Document Type <span className="text-danger">*</span>
                </label>
                <select
                  value={proofOfAddress.docType}
                  onChange={e => setProofOfAddress(prev => ({ ...prev, docType: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background-light text-text focus:outline-none focus:ring-2 focus:ring-primary"
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
                <label className="block text-sm font-medium text-text mb-1">
                  Upload Document <span className="text-danger">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm 
                      font-medium text-text hover:bg-background-light transition ${
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
                  <span className="text-sm text-text-muted truncate max-w-xs">
                    {proofOfAddress.file ? proofOfAddress.file.name : 'No file chosen'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-subtle">Accepted formats: JPG, PNG, PDF</p>
              </div>
            </div>
          </section>

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-60 
                text-white text-sm font-semibold rounded-lg transition"
            >
              {isLoading ? 'Uploading...' : 'Upload & Verify'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading}
              className="px-6 py-2.5 border border-border text-text text-sm font-medium rounded-lg hover:bg-background-light transition disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
