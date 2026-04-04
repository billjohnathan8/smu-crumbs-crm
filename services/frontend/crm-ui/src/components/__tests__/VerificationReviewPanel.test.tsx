import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { VerificationReviewPanel } from '../VerificationReviewPanel'
import * as clientsApi from '@/api/clients'

vi.mock('@/api/clients', () => ({
  getVerificationDocument: vi.fn(),
}))

describe('VerificationReviewPanel document loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-url'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('shows no-document message when no refs are provided', () => {
    render(
      <VerificationReviewPanel
        clientId="clt_1"
        reviewError=""
        isReviewing={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    )

    expect(screen.getByText('No uploaded verification documents were found.')).toBeInTheDocument()
    expect(clientsApi.getVerificationDocument).not.toHaveBeenCalled()
  })

  it('renders image and pdf previews when documents load successfully', async () => {
    vi.mocked(clientsApi.getVerificationDocument)
      .mockResolvedValueOnce({
        documentBase64: 'ZmFrZS1pbWFnZQ==',
        mimeType: 'image/jpeg',
      } as never)
      .mockResolvedValueOnce({
        documentBase64: 'ZmFrZS1wZGY=',
        mimeType: 'application/pdf',
      } as never)

    render(
      <VerificationReviewPanel
        clientId="clt_1"
        primaryDocumentType="NRIC"
        primaryDocumentRef="ref-primary"
        addressDocumentType="UTILITY_BILL"
        addressDocumentRef="ref-address"
        reviewError=""
        isReviewing={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    )

    expect(screen.getByText('Loading documents...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByAltText('Primary Identity document')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open PDF' })).toBeInTheDocument()
    })

    expect(clientsApi.getVerificationDocument).toHaveBeenNthCalledWith(1, 'clt_1', 'primary')
    expect(clientsApi.getVerificationDocument).toHaveBeenNthCalledWith(2, 'clt_1', 'address')
  })

  it('shows document load error when both document requests fail', async () => {
    vi.mocked(clientsApi.getVerificationDocument)
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockRejectedValueOnce(new Error('address failed'))

    render(
      <VerificationReviewPanel
        clientId="clt_1"
        primaryDocumentRef="ref-primary"
        addressDocumentRef="ref-address"
        reviewError=""
        isReviewing={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText('Unable to load verification documents for review.')
      ).toBeInTheDocument()
    })
  })

  it('renders fallback preview-unavailable text when mime/base64 is missing', async () => {
    vi.mocked(clientsApi.getVerificationDocument)
      .mockResolvedValueOnce({
        mimeType: 'image/jpeg',
      } as never)
      .mockResolvedValueOnce({
        documentBase64: '',
        mimeType: '',
      } as never)

    render(
      <VerificationReviewPanel
        clientId="clt_1"
        primaryDocumentRef="ref-primary"
        addressDocumentRef="ref-address"
        reviewError=""
        isReviewing={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByText('Preview unavailable').length).toBeGreaterThanOrEqual(1)
    })
  })
})
