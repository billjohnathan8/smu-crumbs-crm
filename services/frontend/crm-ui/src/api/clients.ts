import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client'
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
} from './types'

const CLIENTS_BASE = '/api/clients'
const ACCOUNTS_BASE = '/api/accounts'

export interface ListClientsParams {
  limit?: number
  offset?: number
  q?: string
}

export interface ListClientAccountsParams {
  limit?: number
  offset?: number
}

export interface ReassignRequest {
  fromUserId: string
  toUserId: string
}

export interface ReassignResponse {
  count: number
}

/**
 * List clients (users see only their own, admins see all)
 */
export async function listClients(params?: ListClientsParams): Promise<PaginatedResponse<Client>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())
  if (params?.offset !== undefined) query.append('offset', params.offset.toString())
  if (params?.q) query.append('q', params.q)

  const endpoint = query.toString() ? `${CLIENTS_BASE}?${query.toString()}` : CLIENTS_BASE
  return apiGet<PaginatedResponse<Client>>(endpoint)
}

/**
 * Get client by ID
 */
export async function getClientById(clientId: string): Promise<Client> {
  return apiGet<Client>(`${CLIENTS_BASE}/${clientId}`)
}

/**
 * Create client profile
 */
export async function createClient(data: ClientCreateRequest): Promise<Client> {
  return apiPost<Client, ClientCreateRequest>(CLIENTS_BASE, data)
}

/**
 * Update client information
 */
export async function updateClient(clientId: string, data: ClientUpdateRequest): Promise<Client> {
  return apiPut<Client, ClientUpdateRequest>(`${CLIENTS_BASE}/${clientId}`, data)
}

/**
 * Delete client profile
 */
export async function deleteClient(clientId: string): Promise<void> {
  return apiDelete<void>(`${CLIENTS_BASE}/${clientId}`)
}

/**
 * Count clients assigned to a specific agent
 */
export async function countClientsByAgent(assignedUserId: string): Promise<number> {
  const res = await apiGet<{ count: number }>(
    `${CLIENTS_BASE}/count?assignedUserId=${encodeURIComponent(assignedUserId)}`
  )
  return res.count
}

/**
 * Reassign all clients from one agent to another
 */
export async function reassignClients(data: ReassignRequest): Promise<ReassignResponse> {
  return apiPost<ReassignResponse, ReassignRequest>(`${CLIENTS_BASE}/reassign`, data)
}

/**
 * Upload verification documents from public verify link flow (no bearer auth).
 */
export async function uploadVerificationDocs(
  clientId: string,
  data: UploadVerificationDocsRequest,
  idempotencyKey?: string
): Promise<VerifyClientResponse> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }
  return apiPost<VerifyClientResponse, UploadVerificationDocsRequest>(
    `${CLIENTS_BASE}/${clientId}/upload-verify`,
    data,
    { skipAuth: true, headers }
  )
}

/**
 * Review a pending verification (admin only — approve or reject)
 */
export async function reviewVerification(
  clientId: string,
  data: ReviewVerificationRequest
): Promise<VerifyClientResponse> {
  return apiPatch<VerifyClientResponse, ReviewVerificationRequest>(
    `${CLIENTS_BASE}/${clientId}/verify/review`,
    data
  )
}

/**
 * List accounts for a client
 */
export async function listClientAccountsPaginated(
  clientId: string,
  params?: ListClientAccountsParams
): Promise<PaginatedResponse<Account>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())
  if (params?.offset !== undefined) query.append('offset', params.offset.toString())

  const endpoint = query.toString()
    ? `${CLIENTS_BASE}/${clientId}/accounts?${query.toString()}`
    : `${CLIENTS_BASE}/${clientId}/accounts`
  return apiGet<PaginatedResponse<Account>>(endpoint)
}

/**
 * List accounts for a client (data only helper).
 */
export async function listClientAccounts(
  clientId: string,
  params?: ListClientAccountsParams
): Promise<Account[]> {
  const response = await listClientAccountsPaginated(clientId, params)
  return response.data
}

/**
 * Create account for a client
 */
export async function createAccount(data: AccountCreateRequest): Promise<Account> {
  return apiPost<Account, AccountCreateRequest>(ACCOUNTS_BASE, data)
}

/**
 * Get account by ID
 */
export async function getAccountById(accountId: string): Promise<Account> {
  return apiGet<Account>(`${ACCOUNTS_BASE}/${accountId}`)
}

/**
 * Update account details.
 */
export async function updateAccount(
  accountId: string,
  data: AccountUpdateRequest
): Promise<Account> {
  return apiPut<Account, AccountUpdateRequest>(`${ACCOUNTS_BASE}/${accountId}`, data)
}

/**
 * Delete account
 */
export async function deleteAccount(accountId: string): Promise<void> {
  return apiDelete<void>(`${ACCOUNTS_BASE}/${accountId}`)
}
