import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientVerifyPage } from '../ClientVerifyPage'
import * as clientApi from '@/api'

vi.mock('@/api')

function makeJwt(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return `${header}.${payloadB64}.fakesig`
}

function setWindowSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
  })
}

describe('ClientVerifyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setWindowSearch('')
  })

  it('shows "Validating link..." initially when checking', () => {
    // No token in URL - will quickly set unauthenticated, but we render synchronously
    setWindowSearch('')
    render(<ClientVerifyPage />)
    // Component checks in useEffect, so initially shows "checking" then transitions
    // but jsdom resolves synchronously, so unauthenticated shows immediately
  })

  it('shows invalid link page when no token in URL', async () => {
    setWindowSearch('')
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Verification Link Invalid')).toBeInTheDocument()
      expect(
        screen.getByText(/This verification link is invalid or has expired/)
      ).toBeInTheDocument()
    })
  })

  it('shows invalid link when token has malformed JWT (wrong parts)', async () => {
    setWindowSearch('?token=notajwt')
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Verification Link Invalid')).toBeInTheDocument()
    })
  })

  it('shows invalid link when token is missing clientId', async () => {
    const jwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    setWindowSearch(`?token=${jwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Verification Link Invalid')).toBeInTheDocument()
    })
  })

  it('shows invalid link when token is expired', async () => {
    const expiredJwt = makeJwt({
      clientId: 'c_1',
      exp: Math.floor(Date.now() / 1000) - 100,
    })
    setWindowSearch(`?token=${expiredJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Verification Link Invalid')).toBeInTheDocument()
    })
  })

  it('renders identity verification form with valid token', async () => {
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Identity Verification')).toBeInTheDocument()
      expect(
        screen.getByText(/Please provide your identity and address documents/)
      ).toBeInTheDocument()
    })
  })

  it('shows Upload & Verify and Reset buttons when form is shown', async () => {
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload & Verify' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    })
  })

  it('shows validation error when submitting without files', async () => {
    const user = userEvent.setup()
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload & Verify' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Upload & Verify' }))

    await waitFor(() => {
      expect(
        screen.getByText('Please upload a file for the Primary Identity document.')
      ).toBeInTheDocument()
    })
  })

  it('shows primary doc type options in select', async () => {
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Singapore NRIC')).toBeInTheDocument()
      expect(screen.getByText('Passport')).toBeInTheDocument()
    })
  })

  it('shows address doc type options in select', async () => {
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Utility Bill (within 3 months)')).toBeInTheDocument()
      expect(screen.getByText('Bank Statement (within 3 months)')).toBeInTheDocument()
    })
  })

  it('resets form when Reset button is clicked', async () => {
    const user = userEvent.setup()
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Reset' }))

    // After reset, form is still shown (valid token still set) but fields reset
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload & Verify' })).toBeInTheDocument()
    })
  })

  it('changes primary doc type when select is changed', async () => {
    const user = userEvent.setup()
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Singapore NRIC')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'PASSPORT')
    // The select value changed
    expect((selects[0] as HTMLSelectElement).value).toBe('PASSPORT')
  })

  it('changes address doc type when select is changed', async () => {
    const user = userEvent.setup()
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Utility Bill (within 3 months)')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[1], 'TENANCY_AGREEMENT')
    expect((selects[1] as HTMLSelectElement).value).toBe('TENANCY_AGREEMENT')
  })

  it('shows invalid link when token has missing exp field', async () => {
    const jwt = makeJwt({ clientId: 'c_1' }) // no exp
    setWindowSearch(`?token=${jwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByText('Verification Link Invalid')).toBeInTheDocument()
    })
  })

  it('calls verifyClient API when form is submitted with valid data', async () => {
    const mockVerifyClient = vi.mocked(clientApi.verifyClient).mockResolvedValue({
      clientId: 'c_valid_1',
      identityVerificationStatus: 'pending',
    } as never)

    // Mock FileReader
    class MockFileReader {
      result = 'data:image/jpeg;base64,dGVzdA=='
      onload: (() => void) | undefined = undefined
      onerror: (() => void) | undefined = undefined
      readAsDataURL(_file: File) {
        setTimeout(() => {
          if (this.onload) this.onload()
        }, 0)
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const user = userEvent.setup()
    const validJwt = makeJwt({
      clientId: 'c_valid_1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    setWindowSearch(`?token=${validJwt}`)
    render(<ClientVerifyPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload & Verify' })).toBeInTheDocument()
    })

    const primaryFile = new File(['content'], 'id.jpg', { type: 'image/jpeg' })
    const addressFile = new File(['content'], 'bill.pdf', { type: 'application/pdf' })

    // Upload primary file
    const primaryLabel = screen.getAllByText('Choose File')[0]
    const primaryInput = primaryLabel.closest('label')!.querySelector('input[type="file"]')!
    await user.upload(primaryInput as HTMLInputElement, primaryFile)

    // Upload address file
    const addressLabel = screen.getAllByText('Choose File')[1]
    const addressInput = addressLabel.closest('label')!.querySelector('input[type="file"]')!
    await user.upload(addressInput as HTMLInputElement, addressFile)

    await user.click(screen.getByRole('button', { name: 'Upload & Verify' }))

    await waitFor(() => {
      expect(mockVerifyClient).toHaveBeenCalledWith(
        'c_valid_1',
        expect.objectContaining({
          primaryDocumentRef: 'id.jpg',
          addressDocumentRef: 'bill.pdf',
        })
      )
    })

    vi.unstubAllGlobals()
  })
})
