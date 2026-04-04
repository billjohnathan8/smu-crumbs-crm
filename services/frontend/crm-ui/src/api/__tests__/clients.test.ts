import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  countClientsByAgent,
  reassignClients,
  uploadVerificationDocs,
  reviewVerification,
  resendVerificationLink,
  getVerificationDocument,
  createAccount,
  getAccountById,
  getAccountOpeningOptions,
  updateAccount,
  deleteAccount,
  listClientAccounts,
  listClientAccountsPaginated,
} from '../clients'
import * as client from '../client'
import type {
  Client,
  ClientCreateRequest,
  ClientUpdateRequest,
  UploadVerificationDocsRequest,
  VerifyClientResponse,
  ReviewVerificationRequest,
  Account,
  AccountCreateRequest,
  AccountUpdateRequest,
  PaginatedResponse,
} from '../types'

vi.mock('../client')

describe('clients API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listClients', () => {
    it('should list clients without query params', async () => {
      const mockResponse: PaginatedResponse<Client> = {
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listClients()

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients')
      expect(result).toEqual(mockResponse)
    })

    it('should list clients with limit and offset', async () => {
      const mockResponse: PaginatedResponse<Client> = {
        data: [],
        pagination: { total: 100, limit: 20, offset: 40 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listClients({ limit: 20, offset: 40 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients?limit=20&offset=40')
    })

    it('should list clients with search query', async () => {
      const mockResponse: PaginatedResponse<Client> = {
        data: [],
        pagination: { total: 5, limit: 10, offset: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listClients({ q: 'john doe' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients?q=john+doe')
    })

    it('should list clients with all params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listClients({ limit: 10, offset: 20, q: 'search term' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients?limit=10&offset=20&q=search+term')
    })

    it('should list clients with status and assignee filters', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listClients({ kycStatus: 'pending', assignedUserId: 'user-789' })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients?kycStatus=pending&assignedUserId=user-789'
      )
    })

    it('should include zero-valued pagination params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 0, offset: 0 },
      })

      await listClients({ limit: 0, offset: 0 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients?limit=0&offset=0')
    })

    it('should pass request options when provided', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listClients({ q: 'john' }, { timeout: 15000 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients?q=john', { timeout: 15000 })
    })
  })

  describe('getClientById', () => {
    it('should get client by ID', async () => {
      const mockClient: Client = {
        clientId: 'client-123',
        firstName: 'John',
        lastName: 'Doe',
        emailAddress: 'john@example.com',
        phoneNumber: '+6512345678',
        dateOfBirth: '1990-01-01',
        gender: 'Male',
        address: '123 Main St',
        city: 'Singapore',
        state: 'Singapore',
        country: 'Singapore',
        postalCode: '123456',
        identityVerificationStatus: 'verified',
        assignedUserId: 'user-456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockClient)

      const result = await getClientById('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123')
      expect(result).toEqual(mockClient)
    })

    it('should pass request options when provided', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({ clientId: 'client-123' } as Client)

      await getClientById('client-123', { timeout: 5000 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123', { timeout: 5000 })
    })
  })

  describe('countClientsByAgent', () => {
    it('should return count for assigned agent', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({ count: 12 })

      const result = await countClientsByAgent('agent+1@example.com')

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients/count?assignedUserId=agent%2B1%40example.com'
      )
      expect(result).toBe(12)
    })
  })

  describe('reassignClients', () => {
    it('should reassign clients and return affected count', async () => {
      const request = { fromUserId: 'usr_old', toUserId: 'usr_new' }
      vi.spyOn(client, 'apiPost').mockResolvedValue({ count: 5 })

      const result = await reassignClients(request)

      expect(client.apiPost).toHaveBeenCalledWith('/api/clients/reassign', request)
      expect(result.count).toBe(5)
    })
  })

  describe('createClient', () => {
    it('should create client', async () => {
      const createRequest: ClientCreateRequest = {
        firstName: 'Jane',
        lastName: 'Smith',
        emailAddress: 'jane@example.com',
        phoneNumber: '+6587654321',
        dateOfBirth: '1995-05-15',
        gender: 'Female',
        address: '456 Oak Ave',
        city: 'Singapore',
        state: 'Singapore',
        country: 'Singapore',
        postalCode: '654321',
      }

      const mockClient: Client = {
        clientId: 'client-new',
        ...createRequest,
        identityVerificationStatus: 'unverified',
        assignedUserId: 'user-123',
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockClient)

      const result = await createClient(createRequest)

      expect(client.apiPost).toHaveBeenCalledWith('/api/clients', createRequest)
      expect(result).toEqual(mockClient)
    })
  })

  describe('updateClient', () => {
    it('should update client', async () => {
      const updateRequest: ClientUpdateRequest = {
        phoneNumber: '+6599999999',
        address: '789 New Street',
      }

      const mockClient: Client = {
        clientId: 'client-123',
        firstName: 'John',
        lastName: 'Doe',
        emailAddress: 'john@example.com',
        phoneNumber: '+6599999999',
        dateOfBirth: '1990-01-01',
        gender: 'Male',
        address: '789 New Street',
        city: 'Singapore',
        state: 'Singapore',
        country: 'Singapore',
        postalCode: '123456',
        identityVerificationStatus: 'verified',
        assignedUserId: 'user-456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-16T00:00:00Z',
      }

      vi.spyOn(client, 'apiPut').mockResolvedValue(mockClient)

      const result = await updateClient('client-123', updateRequest)

      expect(client.apiPut).toHaveBeenCalledWith('/api/clients/client-123', updateRequest)
      expect(result).toEqual(mockClient)
    })
  })

  describe('deleteClient', () => {
    it('should delete client', async () => {
      vi.spyOn(client, 'apiDelete').mockResolvedValue(undefined)

      await deleteClient('client-123')

      expect(client.apiDelete).toHaveBeenCalledWith('/api/clients/client-123')
    })
  })

  describe('uploadVerificationDocs', () => {
    it('should upload verification documents via public endpoint', async () => {
      const verifyRequest: UploadVerificationDocsRequest = {
        verificationToken: '123123123123',
        primaryDocumentType: 'NRIC',
        primaryDocumentRef: 'asdfasdfasdf',
        primaryDocumentBase64: 'asdfasdfasdf',
        primaryDocumentMimeType: 'image/jpeg',
        addressDocumentType: 'UTILITY_BILL',
        addressDocumentRef: 'asdfasdfasdf',
        addressDocumentBase64: 'asdfasdfasdf',
        addressDocumentMimeType: 'image/jpeg',
      }

      const mockResponse: VerifyClientResponse = {
        clientId: 'client-123',
        identityVerificationStatus: 'verified',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockResponse)

      const result = await uploadVerificationDocs('client-123', verifyRequest)

      expect(client.apiPost).toHaveBeenCalledWith(
        '/api/clients/client-123/upload-verify',
        verifyRequest,
        { skipAuth: true, headers: {}, timeout: 60000 }
      )
      expect(result).toEqual(mockResponse)
    })

    it('should send idempotency key when provided', async () => {
      const verifyRequest: UploadVerificationDocsRequest = {
        verificationToken: '123123123123',
        primaryDocumentType: 'NRIC',
        primaryDocumentRef: 'asdfasdfasdf',
        primaryDocumentBase64: 'asdfasdfasdf',
        primaryDocumentMimeType: 'image/jpeg',
        addressDocumentType: 'UTILITY_BILL',
        addressDocumentRef: 'asdfasdfasdf',
        addressDocumentBase64: 'asdfasdfasdf',
        addressDocumentMimeType: 'image/jpeg',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue({
        clientId: 'client-123',
        identityVerificationStatus: 'pending',
      })

      await uploadVerificationDocs('client-123', verifyRequest, 'idem-1')

      expect(client.apiPost).toHaveBeenCalledWith(
        '/api/clients/client-123/upload-verify',
        verifyRequest,
        { skipAuth: true, headers: { 'Idempotency-Key': 'idem-1' }, timeout: 60000 }
      )
    })

    it('should return pending verification response', async () => {
      const verifyRequest: UploadVerificationDocsRequest = {
        verificationToken: '123123123123',
        primaryDocumentType: 'NRIC',
        primaryDocumentRef: 'asdfasdfasdf',
        primaryDocumentBase64: 'asdfasdfasdf',
        primaryDocumentMimeType: 'image/jpeg',
        addressDocumentType: 'UTILITY_BILL',
        addressDocumentRef: 'asdfasdfasdf',
        addressDocumentBase64: 'asdfasdfasdf',
        addressDocumentMimeType: 'image/jpeg',
      }

      const mockResponse: VerifyClientResponse = {
        clientId: 'client-999',
        identityVerificationStatus: 'pending',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockResponse)

      const result = await uploadVerificationDocs('client-999', verifyRequest)

      expect(result.identityVerificationStatus).toBe('pending')
    })
  })

  describe('reviewVerification', () => {
    it('should review pending verification with approve action', async () => {
      const reviewRequest: ReviewVerificationRequest = {
        action: 'approve',
      }

      const mockResponse: VerifyClientResponse = {
        clientId: 'client-123',
        identityVerificationStatus: 'verified',
      }

      vi.spyOn(client, 'apiPatch').mockResolvedValue(mockResponse)

      const result = await reviewVerification('client-123', reviewRequest)

      expect(client.apiPatch).toHaveBeenCalledWith(
        '/api/clients/client-123/verify/review',
        reviewRequest
      )
      expect(result).toEqual(mockResponse)
    })

    it('should review pending verification with reject action', async () => {
      const reviewRequest: ReviewVerificationRequest = {
        action: 'reject',
      }

      const mockResponse: VerifyClientResponse = {
        clientId: 'client-123',
        identityVerificationStatus: 'rejected',
      }

      vi.spyOn(client, 'apiPatch').mockResolvedValue(mockResponse)

      const result = await reviewVerification('client-123', reviewRequest)

      expect(result.identityVerificationStatus).toBe('rejected')
    })
  })

  describe('resendVerificationLink', () => {
    it('should resend verification link and return current status', async () => {
      const mockResponse: VerifyClientResponse = {
        clientId: 'client-123',
        identityVerificationStatus: 'rejected',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockResponse)

      const result = await resendVerificationLink('client-123')

      expect(client.apiPost).toHaveBeenCalledWith('/api/clients/client-123/verify/resend')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getVerificationDocument', () => {
    it('should fetch verification document by kind', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        clientId: 'client-123',
        documentKind: 'primary',
        mimeType: 'image/jpeg',
        fileName: 'nric.jpg',
        contentBase64: 'base64data',
      })

      const result = await getVerificationDocument('client-123', 'primary')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123/verify/documents/primary')
      expect(result.documentKind).toBe('primary')
    })
  })

  describe('createAccount', () => {
    it('should create account for client', async () => {
      const accountRequest: AccountCreateRequest = {
        clientId: 'client-123',
        accountType: 'Savings',
        accountStatus: 'Active',
        openingDate: '2024-01-15',
        initialDeposit: 1000,
        currency: 'SGD',
        branchId: 'branch-001',
      }

      const mockAccount: Account = {
        accountId: 'account-new',
        clientId: 'client-123',
        accountType: 'Savings',
        accountStatus: 'Active',
        openingDate: '2024-01-15',
        initialDeposit: 1000,
        currency: 'SGD',
        branchId: 'branch-001',
        createdAt: '2024-01-15T00:00:00Z',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockAccount)

      const result = await createAccount(accountRequest)

      expect(client.apiPost).toHaveBeenCalledWith('/api/accounts', accountRequest)
      expect(result).toEqual(mockAccount)
    })
  })

  describe('getAccountOpeningOptions', () => {
    it('should fetch account opening options for a client', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        clientId: 'client-123',
        defaultBranchId: 'SG-001',
        canOverrideBranch: true,
        authorizedBranches: ['SG-001', 'SG-002'],
        allowedCurrencies: ['SGD', 'USD'],
        branchAllowedCurrencies: { 'SG-001': ['SGD', 'USD'], 'SG-002': ['SGD'] },
        accountTypeAllowedCurrencies: { Savings: ['SGD'] },
      })

      const result = await getAccountOpeningOptions('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/account-opening-options?clientId=client-123')
      expect(result.defaultBranchId).toBe('SG-001')
    })
  })

  describe('updateAccount', () => {
    it('should update account details', async () => {
      const updateRequest: AccountUpdateRequest = {
        accountStatus: 'Inactive',
        branchId: 'branch-002',
      }

      const mockAccount: Account = {
        accountId: 'account-1',
        clientId: 'client-123',
        accountType: 'Savings',
        accountStatus: 'Inactive',
        openingDate: '2024-01-15',
        initialDeposit: 1000,
        currency: 'SGD',
        branchId: 'branch-002',
        createdAt: '2024-01-15T00:00:00Z',
      }

      vi.spyOn(client, 'apiPut').mockResolvedValue(mockAccount)

      const result = await updateAccount('account-1', updateRequest)

      expect(client.apiPut).toHaveBeenCalledWith('/api/accounts/account-1', updateRequest)
      expect(result).toEqual(mockAccount)
    })
  })

  describe('getAccountById', () => {
    it('should fetch account by id', async () => {
      const mockAccount = {
        accountId: 'account-9',
        clientId: 'client-9',
        accountType: 'Savings',
        accountStatus: 'Active',
        openingDate: '2024-01-01',
        initialDeposit: 100,
        currency: 'SGD',
        branchId: 'SG-001',
        createdAt: '2024-01-01T00:00:00Z',
      } as Account

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockAccount)

      const result = await getAccountById('account-9')

      expect(client.apiGet).toHaveBeenCalledWith('/api/accounts/account-9')
      expect(result.accountId).toBe('account-9')
    })
  })

  describe('deleteAccount', () => {
    it('should delete account by id', async () => {
      vi.spyOn(client, 'apiDelete').mockResolvedValue(undefined)

      await deleteAccount('account-9')

      expect(client.apiDelete).toHaveBeenCalledWith('/api/accounts/account-9')
    })
  })

  describe('listClientAccountsPaginated', () => {
    it('should return account response without pagination query', async () => {
      const mockResponse: PaginatedResponse<Account> = {
        data: [],
        pagination: { limit: 10, offset: 0, total: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listClientAccountsPaginated('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123/accounts')
      expect(result).toEqual(mockResponse)
    })

    it('should return paginated account response', async () => {
      const mockResponse: PaginatedResponse<Account> = {
        data: [],
        pagination: { limit: 20, offset: 40, total: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listClientAccountsPaginated('client-123', { limit: 20, offset: 40 })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients/client-123/accounts?limit=20&offset=40'
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe('listClientAccounts', () => {
    it('should get account data helper result without pagination params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { limit: 10, offset: 0, total: 0 },
      })

      const result = await listClientAccounts('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123/accounts')
      expect(result).toEqual([])
    })

    it('should get all accounts for a client', async () => {
      const mockAccounts: Account[] = [
        {
          accountId: 'account-1',
          clientId: 'client-123',
          accountType: 'Savings',
          accountStatus: 'Active',
          openingDate: '2024-01-01',
          initialDeposit: 1000,
          currency: 'SGD',
          branchId: 'branch-001',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          accountId: 'account-2',
          clientId: 'client-123',
          accountType: 'Checking',
          accountStatus: 'Active',
          openingDate: '2024-01-05',
          initialDeposit: 500,
          currency: 'SGD',
          branchId: 'branch-001',
          createdAt: '2024-01-05T00:00:00Z',
        },
      ]

      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: mockAccounts,
        pagination: { limit: 50, offset: 0, total: 2 },
      })

      const result = await listClientAccounts('client-123', { limit: 50, offset: 0 })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients/client-123/accounts?limit=50&offset=0'
      )
      expect(result).toEqual(mockAccounts)
      expect(result).toHaveLength(2)
    })
  })
})
