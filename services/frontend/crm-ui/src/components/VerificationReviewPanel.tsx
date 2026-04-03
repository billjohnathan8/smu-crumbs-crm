import { getVerificationDocument } from '@/api/clients'
import type { VerificationDocument } from '@/api/types'
import { useEffect, useMemo, useState } from 'react'

type VerificationReviewPanelProps = {
  clientId: string
  primaryDocumentType?: string | null
  primaryDocumentRef?: string | null
  addressDocumentType?: string | null
  addressDocumentRef?: string | null
  reviewError: string
  isReviewing: boolean
  onApprove: () => void
  onReject: () => void
}

export function VerificationReviewPanel({
  clientId,
  primaryDocumentType,
  primaryDocumentRef,
  addressDocumentType,
  addressDocumentRef,
  reviewError,
  isReviewing,
  onApprove,
  onReject,
}: VerificationReviewPanelProps) {
  const [documents, setDocuments] = useState<{
    primary: VerificationDocument | null
    address: VerificationDocument | null
  }>({
    primary: null,
    address: null,
  })
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [documentError, setDocumentError] = useState('')

  useEffect(() => {
    let cancelled = false
    const hasAnyDocumentRef = Boolean(primaryDocumentRef || addressDocumentRef)
    if (!hasAnyDocumentRef) return

    const loadDocuments = async () => {
      setIsLoadingDocuments(true)
      setDocumentError('')
      try {
        const [primary, address] = await Promise.allSettled([
          getVerificationDocument(clientId, 'primary'),
          getVerificationDocument(clientId, 'address'),
        ])
        if (cancelled) return
        setDocuments({
          primary: primary.status === 'fulfilled' ? primary.value : null,
          address: address.status === 'fulfilled' ? address.value : null,
        })
        if (primary.status === 'rejected' && address.status === 'rejected') {
          setDocumentError('Unable to load verification documents for review.')
        }
      } finally {
        if (!cancelled) setIsLoadingDocuments(false)
      }
    }

    void loadDocuments()

    return () => {
      cancelled = true
    }
  }, [clientId, primaryDocumentRef, addressDocumentRef])

  const { dataUrl: primaryDataUrl, objectUrl: primaryBlobUrl } = useDocumentUrls(documents.primary)
  const { dataUrl: addressDataUrl, objectUrl: addressBlobUrl } = useDocumentUrls(documents.address)

  return (
    <div className="bg-card border border-warning rounded-lg p-6">
      <h2 className="text-lg font-bold text-text mb-2">Pending Verification Review</h2>
      <p className="text-sm text-text-muted mb-4">
        This client has submitted identity documents for KYC verification. Review and approve or
        reject.
      </p>

      <div className="mb-5 rounded-lg border border-border bg-background-lighter p-4">
        <h3 className="mb-3 text-sm font-semibold text-text">Uploaded Documents</h3>
        {isLoadingDocuments && <p className="text-sm text-text-muted">Loading documents...</p>}
        {(documentError || (!isLoadingDocuments && !documents.primary && !documents.address)) && (
          <p className="text-sm text-danger">
            {documentError || 'No uploaded verification documents were found.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DocumentCard
            title="Primary Identity"
            docType={primaryDocumentType}
            docRef={primaryDocumentRef}
            dataUrl={primaryDataUrl}
            blobUrl={primaryBlobUrl}
            mimeType={documents.primary?.mimeType}
          />
          <DocumentCard
            title="Proof of Address"
            docType={addressDocumentType}
            docRef={addressDocumentRef}
            dataUrl={addressDataUrl}
            blobUrl={addressBlobUrl}
            mimeType={documents.address?.mimeType}
          />
        </div>
      </div>

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

function toDataUrl(document: VerificationDocument | null): string {
  if (!document || !document.documentBase64 || !document.mimeType) {
    return ''
  }
  return `data:${document.mimeType};base64,${document.documentBase64}`
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

function useDocumentUrls(document: VerificationDocument | null) {
  const dataUrl = useMemo(() => toDataUrl(document), [document])
  const objectUrl = useMemo(() => {
    if (!document?.documentBase64 || !document.mimeType) {
      return ''
    }

    const blob = new Blob([base64ToArrayBuffer(document.documentBase64)], {
      type: document.mimeType,
    })
    return URL.createObjectURL(blob)
  }, [document])

  useEffect(() => {
    if (!objectUrl) return

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  return { dataUrl, objectUrl }
}

function DocumentCard({
  title,
  docType,
  docRef,
  dataUrl,
  blobUrl,
  mimeType,
}: {
  title: string
  docType?: string | null
  docRef?: string | null
  dataUrl: string
  blobUrl: string
  mimeType?: string
}) {
  const isImage = Boolean(mimeType?.startsWith('image/'))
  const isPdf = mimeType === 'application/pdf'

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <p className="text-sm text-text">{docType || '-'}</p>
      <p className="mb-2 text-xs text-text-muted break-all">{docRef || '-'}</p>
      {isImage && dataUrl ? (
        <img
          src={dataUrl}
          alt={`${title} document`}
          className="max-h-48 w-full rounded border border-border object-contain"
        />
      ) : null}
      {isPdf && blobUrl ? (
        <a
          href={blobUrl}
          target="_blank"
          rel="noopener"
          className="inline-block rounded bg-background px-3 py-1.5 text-xs text-text hover:bg-background-light"
        >
          Open PDF
        </a>
      ) : null}
      {!dataUrl && <p className="text-xs text-text-muted">Preview unavailable</p>}
    </div>
  )
}
