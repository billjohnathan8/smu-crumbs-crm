import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type {
  Transaction,
  CreateTransactionRequest,
  UpdateTransactionRequest,
  PaginatedResponse,
  TransactionStatus,
  TransactionKind,
  ImportBatch,
  ImportTransactionsRequest,
} from './types'

const BASE = '/api/transactions'

export interface ListTransactionsParams {
  limit?: number
  offset?: number
  clientId?: string
  status?: TransactionStatus
  transaction?: TransactionKind
  fromDate?: string
  toDate?: string
}

/**
 * List transactions (users see only their clients' transactions, admins see all)
 */
export async function listTransactions(
  params?: ListTransactionsParams
): Promise<PaginatedResponse<Transaction>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())
  if (params?.clientId) query.append('clientId', params.clientId)
  if (params?.status) query.append('status', params.status)
  if (params?.transaction) query.append('transaction', params.transaction)
  if (params?.fromDate) query.append('fromDate', params.fromDate)
  if (params?.toDate) query.append('toDate', params.toDate)

  const endpoint = query.toString() ? `${BASE}?${query.toString()}` : BASE
  return apiGet<PaginatedResponse<Transaction>>(endpoint)
}

/**
 * Get transaction by ID
 */
export async function getTransactionById(transactionId: string): Promise<Transaction> {
  return apiGet<Transaction>(`${BASE}/${transactionId}`)
}

/**
 * Create transaction (admin only)
 */
export async function createTransaction(data: CreateTransactionRequest): Promise<Transaction> {
  return apiPost<Transaction, CreateTransactionRequest>(BASE, data)
}

/**
 * Update transaction (admin only)
 */
export async function updateTransaction(
  transactionId: string,
  data: UpdateTransactionRequest
): Promise<Transaction> {
  return apiPut<Transaction, UpdateTransactionRequest>(`${BASE}/${transactionId}`, data)
}

/**
 * Delete transaction (admin only)
 */
export async function deleteTransaction(transactionId: string): Promise<void> {
  return apiDelete<void>(`${BASE}/${transactionId}`)
}

/**
 * List transactions for a specific client
 */
export async function listClientTransactions(
  clientId: string,
  params?: { limit?: number; offset?: number }
): Promise<PaginatedResponse<Transaction>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())

  const endpoint = query.toString()
    ? `/api/clients/${clientId}/transactions?${query.toString()}`
    : `/api/clients/${clientId}/transactions`
  return apiGet<PaginatedResponse<Transaction>>(endpoint)
}

/**
 * Trigger a transaction import and return the created batch.
 */
export async function startTransactionImport(
  data?: ImportTransactionsRequest
): Promise<ImportBatch> {
  const payload = data && (data.clientId || data.sourcePath) ? data : undefined
  return apiPost<ImportBatch, ImportTransactionsRequest | undefined>(`${BASE}/import`, payload, {
    timeout: 15_000,
  })
}

/**
 * Get the latest status for a transaction import batch.
 */
export async function getTransactionImportBatch(importBatchId: string): Promise<ImportBatch> {
  return apiGet<ImportBatch>(`${BASE}/imports/${importBatchId}`)
}
