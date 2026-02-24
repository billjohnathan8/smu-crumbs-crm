import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type {
  Client,
  ClientCreateRequest,
  ClientUpdateRequest,
  VerifyClientRequest,
  VerifyClientResponse,
  Account,
  AccountCreateRequest,
  PaginatedResponse,
} from './types'

const CLIENTS_BASE = '/api/clients'
const ACCOUNTS_BASE = '/api/accounts'

export interface ListClientsParams {
  limit?: number
  offset?: number
  q?: string
}

/**
 * List clients (agents see only their own, admins see all)
 */
export async function listClients(params?: ListClientsParams): Promise<PaginatedResponse<Client>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())
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
 * Verify client identity
 */
export async function verifyClient(
  clientId: string,
  data: VerifyClientRequest
): Promise<VerifyClientResponse> {
  return apiPost<VerifyClientResponse, VerifyClientRequest>(
    `${CLIENTS_BASE}/${clientId}/verify`,
    data
  )
}

/**
 * List accounts for a client
 */
export async function listClientAccounts(clientId: string): Promise<Account[]> {
  const response = await apiGet<PaginatedResponse<Account>>(`${CLIENTS_BASE}/${clientId}/accounts`)
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
 * Delete account
 */
export async function deleteAccount(accountId: string): Promise<void> {
  return apiDelete<void>(`${ACCOUNTS_BASE}/${accountId}`)
}
