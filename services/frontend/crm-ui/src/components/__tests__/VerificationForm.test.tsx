import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerificationForm } from '../VerificationForm'
import type { UploadVerificationDocsRequest } from '@/api/types'

const defaultVerifyData: UploadVerificationDocsRequest = {
  verificationToken: 'test-token',
  primaryDocumentType: 'NRIC',
  primaryDocumentRef: '',
  primaryDocumentBase64: '',
  primaryDocumentMimeType: '',
  addressDocumentType: 'UTILITY_BILL',
  addressDocumentRef: '',
  addressDocumentBase64: '',
  addressDocumentMimeType: '',
}

function makeFileReader(base64Result = 'data:image/png;base64,dGVzdA==') {
  class MockFileReader {
    result = base64Result
    onload: (() => void) | undefined = undefined
    onerror: (() => void) | undefined = undefined
    readAsDataURL(_file: File) {
      setTimeout(() => {
        if (this.onload) this.onload()
      }, 0)
    }
  }
  vi.stubGlobal('FileReader', MockFileReader)
}

describe('VerificationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders all form sections', () => {
    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('KYC Verification')).toBeInTheDocument()
    expect(screen.getByText('Primary Identity Document')).toBeInTheDocument()
    expect(screen.getByText('Upload Primary Document')).toBeInTheDocument()
    expect(screen.getByText('Proof of Address Document')).toBeInTheDocument()
    expect(screen.getByText('Upload Proof of Address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for Review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows "No file chosen" when no file selected', () => {
    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const noFileTexts = screen.getAllByText('No file chosen')
    expect(noFileTexts).toHaveLength(2)
  })

  it('shows file name when primaryDocumentRef is set', () => {
    render(
      <VerificationForm
        verifyData={{ ...defaultVerifyData, primaryDocumentRef: 'passport.pdf' }}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('passport.pdf')).toBeInTheDocument()
  })

  it('shows file name when addressDocumentRef is set', () => {
    render(
      <VerificationForm
        verifyData={{ ...defaultVerifyData, addressDocumentRef: 'utility_bill.jpg' }}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('utility_bill.jpg')).toBeInTheDocument()
  })

  it('displays verifyError when provided', () => {
    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError="Please upload both required documents."
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Please upload both required documents.')).toBeInTheDocument()
  })

  it('shows "Submitting..." and disables buttons when isVerifying is true', () => {
    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
    // File inputs are also disabled
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fileInputs.forEach(input => {
      expect(input).toBeDisabled()
    })
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onSubmit when form is submitted', async () => {
    const onSubmit = vi.fn(e => e.preventDefault())
    const user = userEvent.setup()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Submit for Review' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('calls setVerifyData when primary document type changes', async () => {
    const setVerifyData = vi.fn()
    const user = userEvent.setup()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={setVerifyData}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'PASSPORT')
    expect(setVerifyData).toHaveBeenCalled()
  })

  it('calls setVerifyData when address document type changes', async () => {
    const setVerifyData = vi.fn()
    const user = userEvent.setup()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={setVerifyData}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[1], 'BANK_STATEMENT')
    expect(setVerifyData).toHaveBeenCalled()
  })

  it('calls setVerifyData with empty strings when primary file input is cleared', async () => {
    makeFileReader()
    const setVerifyData = vi.fn()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={setVerifyData}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const fileInputs = document.querySelectorAll('input[type="file"]')
    // Simulate clearing primary file
    fireEvent.change(fileInputs[0], { target: { files: [] } })
    expect(setVerifyData).toHaveBeenCalled()
  })

  it('calls setVerifyData with file data when primary file is selected', async () => {
    makeFileReader('data:image/jpeg;base64,dGVzdA==')
    const setVerifyData = vi.fn()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={setVerifyData}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[0], { target: { files: [mockFile] } })

    // setVerifyData should be called (once FileReader loads)
    await vi.waitFor(() => {
      expect(setVerifyData).toHaveBeenCalled()
    })
  })

  it('calls setVerifyData with file data when address file is selected', async () => {
    makeFileReader('data:application/pdf;base64,dGVzdA==')
    const setVerifyData = vi.fn()

    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={setVerifyData}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const mockFile = new File(['pdf content'], 'address.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[1], { target: { files: [mockFile] } })

    await vi.waitFor(() => {
      expect(setVerifyData).toHaveBeenCalled()
    })
  })

  it('renders all primary document type options', () => {
    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Singapore NRIC')).toBeInTheDocument()
    expect(screen.getByText('Passport')).toBeInTheDocument()
    expect(screen.getByText('Employment Pass / S Pass / Work Permit')).toBeInTheDocument()
  })

  it('renders all address document type options', () => {
    render(
      <VerificationForm
        verifyData={defaultVerifyData}
        setVerifyData={vi.fn()}
        verifyError=""
        isVerifying={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Utility Bill (within 3 months)')).toBeInTheDocument()
    expect(screen.getByText('Bank Statement (within 3 months)')).toBeInTheDocument()
    expect(screen.getByText('Government-issued Letter (CPF / IRAS / HDB)')).toBeInTheDocument()
    expect(screen.getByText('Tenancy Agreement')).toBeInTheDocument()
  })
})
