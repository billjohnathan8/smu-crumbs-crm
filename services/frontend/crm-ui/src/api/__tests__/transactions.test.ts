import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  listClientTransactions,
  startTransactionImport,
  getTransactionImportBatch,
} from '../transactions'
import * as client from '../client'
import type {
  Transaction,
  CreateTransactionRequest,
  UpdateTransactionRequest,
  PaginatedResponse,
  ImportBatch,
  ImportTransactionsRequest,
} from '../types'

vi.mock('../client')

describe('transactions API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listTransactions', () => {
    it('should list transactions without params', async () => {
      const mockResponse: PaginatedResponse<Transaction> = {
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listTransactions()

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions')
      expect(result).toEqual(mockResponse)
    })

    it('should list transactions with limit and offset', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listTransactions({ limit: 25, offset: 50 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions?limit=25&offset=50')
    })

    it('should filter transactions by clientId', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listTransactions({ clientId: 'client-123' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions?clientId=client-123')
    })

    it('should filter transactions by status', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listTransactions({ status: 'Completed' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions?status=Completed')
    })

    it('should filter transactions by transaction kind', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listTransactions({ transaction: 'D' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions?transaction=D')
    })

    it('should filter transactions by date range', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listTransactions({
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
      })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/transactions?fromDate=2024-01-01&toDate=2024-01-31'
      )
    })

    it('should list transactions with all params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listTransactions({
        limit: 20,
        offset: 40,
        clientId: 'client-123',
        status: 'Pending',
        transaction: 'W',
        fromDate: '2024-01-01',
        toDate: '2024-12-31',
      })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/transactions?limit=20&offset=40&clientId=client-123&status=Pending&transaction=W&fromDate=2024-01-01&toDate=2024-12-31'
      )
    })
  })

  describe('getTransactionById', () => {
    it('should get transaction by ID', async () => {
      const mockTransaction: Transaction = {
        id: 'txn-123',
        clientId: 'client-456',
        transaction: 'D',
        amount: 1000,
        date: '2024-01-15',
        status: 'Completed',
        importedAt: '2024-01-15T10:30:00Z',
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockTransaction)

      const result = await getTransactionById('txn-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions/txn-123')
      expect(result).toEqual(mockTransaction)
    })
  })

  describe('createTransaction', () => {
    it('should create deposit transaction', async () => {
      const createRequest: CreateTransactionRequest = {
        clientId: 'client-123',
        transaction: 'D',
        amount: 500,
        date: '2024-01-20',
        status: 'Completed',
      }

      const mockTransaction: Transaction = {
        id: 'txn-new',
        clientId: 'client-123',
        transaction: 'D',
        amount: 500,
        date: '2024-01-20',
        status: 'Completed',
        importedAt: '2024-01-20T14:00:00Z',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockTransaction)

      const result = await createTransaction(createRequest)

      expect(client.apiPost).toHaveBeenCalledWith('/api/transactions', createRequest)
      expect(result).toEqual(mockTransaction)
    })

    it('should create withdrawal transaction', async () => {
      const createRequest: CreateTransactionRequest = {
        clientId: 'client-123',
        transaction: 'W',
        amount: 200,
        date: '2024-01-20',
        status: 'Pending',
      }

      const mockTransaction: Transaction = {
        id: 'txn-withdrawal',
        ...createRequest,
        importedAt: '2024-01-20T15:00:00Z',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockTransaction)

      const result = await createTransaction(createRequest)

      expect(result.transaction).toBe('W')
    })
  })

  describe('deleteTransaction', () => {
    it('should delete transaction', async () => {
      vi.spyOn(client, 'apiDelete').mockResolvedValue(undefined)

      await deleteTransaction('txn-123')

      expect(client.apiDelete).toHaveBeenCalledWith('/api/transactions/txn-123')
    })
  })

  describe('updateTransaction', () => {
    it('should update transaction fields', async () => {
      const payload: UpdateTransactionRequest = {
        status: 'Pending',
        amount: 750,
      }

      const updated: Transaction = {
        id: 'txn-123',
        clientId: 'client-456',
        transaction: 'D',
        amount: 750,
        date: '2024-01-15',
        status: 'Pending',
      }

      vi.spyOn(client, 'apiPut').mockResolvedValue(updated)

      const result = await updateTransaction('txn-123', payload)

      expect(client.apiPut).toHaveBeenCalledWith('/api/transactions/txn-123', payload)
      expect(result).toEqual(updated)
    })
  })

  describe('startTransactionImport', () => {
    it('should treat empty import payload as undefined', async () => {
      const mockBatch: ImportBatch = {
        importBatchId: 'imp_empty',
        status: 'queued',
        requestedClientId: null,
        requestedAt: '2026-03-20T12:00:00Z',
        startedAt: null,
        finishedAt: null,
        totalRecords: 0,
        importedRecords: 0,
        failedRecords: 0,
        errorMessage: null,
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockBatch)

      await startTransactionImport({})

      expect(client.apiPost).toHaveBeenCalledWith('/api/transactions/import', undefined)
    })

    it('should trigger transaction import without payload', async () => {
      const mockBatch: ImportBatch = {
        importBatchId: 'imp_7',
        status: 'queued',
        requestedClientId: null,
        requestedAt: '2026-03-20T12:00:00Z',
        startedAt: null,
        finishedAt: null,
        totalRecords: 0,
        importedRecords: 0,
        failedRecords: 0,
        errorMessage: null,
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockBatch)

      const result = await startTransactionImport()

      expect(client.apiPost).toHaveBeenCalledWith('/api/transactions/import', undefined)
      expect(result).toEqual(mockBatch)
    })

    it('should trigger transaction import with optional filters', async () => {
      const payload: ImportTransactionsRequest = {
        clientId: 'clt_100',
        sourcePath: '/mock-sftp/transactions-2026-03.csv',
      }

      const mockBatch: ImportBatch = {
        importBatchId: 'imp_8',
        status: 'running',
        requestedClientId: 'clt_100',
        requestedAt: '2026-03-20T12:00:00Z',
        startedAt: '2026-03-20T12:00:01Z',
        finishedAt: null,
        totalRecords: 0,
        importedRecords: 0,
        failedRecords: 0,
        errorMessage: null,
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockBatch)

      const result = await startTransactionImport(payload)

      expect(client.apiPost).toHaveBeenCalledWith('/api/transactions/import', payload)
      expect(result).toEqual(mockBatch)
    })
  })

  describe('listClientTransactions', () => {
    it('should list client transactions without pagination params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listClientTransactions('client-abc')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-abc/transactions')
    })

    it('should list client transactions with pagination params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 5, offset: 10 },
      })

      await listClientTransactions('client-abc', { limit: 5, offset: 10 })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients/client-abc/transactions?limit=5&offset=10'
      )
    })
  })

  describe('getTransactionImportBatch', () => {
    it('should fetch import batch status by id', async () => {
      const mockBatch: ImportBatch = {
        importBatchId: 'imp_9',
        status: 'completed',
        requestedClientId: 'clt_100',
        requestedAt: '2026-03-20T12:00:00Z',
        startedAt: '2026-03-20T12:00:01Z',
        finishedAt: '2026-03-20T12:00:02Z',
        totalRecords: 10,
        importedRecords: 10,
        failedRecords: 0,
        errorMessage: null,
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockBatch)

      const result = await getTransactionImportBatch('imp_9')

      expect(client.apiGet).toHaveBeenCalledWith('/api/transactions/imports/imp_9')
      expect(result).toEqual(mockBatch)
    })
  })
})
