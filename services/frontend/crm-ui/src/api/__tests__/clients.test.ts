import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  verifyClient,
  createAccount,
  listClientAccounts,
} from '../clients'
import * as client from '../client'
import type {
  Client,
  ClientCreateRequest,
  ClientUpdateRequest,
  VerifyClientRequest,
  VerifyClientResponse,
  Account,
  AccountCreateRequest,
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
        assignedAgentId: 'agent-456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockClient)

      const result = await getClientById('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123')
      expect(result).toEqual(mockClient)
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
        assignedAgentId: 'agent-123',
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
        assignedAgentId: 'agent-456',
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

  describe('verifyClient', () => {
    it('should verify client identity', async () => {
      const verifyRequest: VerifyClientRequest = {
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

      const result = await verifyClient('client-123', verifyRequest)

      expect(client.apiPost).toHaveBeenCalledWith('/api/clients/client-123/verify', verifyRequest)
      expect(result).toEqual(mockResponse)
    })

    it('should return pending verification response', async () => {
      const verifyRequest: VerifyClientRequest = {
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

      const result = await verifyClient('client-999', verifyRequest)

      expect(result.identityVerificationStatus).toBe('pending')
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

  describe('listClientAccounts', () => {
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

      const result = await listClientAccounts('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123/accounts')
      expect(result).toEqual(mockAccounts)
      expect(result).toHaveLength(2)
    })
  })
})
