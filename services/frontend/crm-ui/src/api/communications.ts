import { apiGet, apiPost, apiPatch, type RequestOptions } from './client'
import type { Communication, PaginatedResponse, UpdateCommunicationStatusRequest } from './types'

const BASE = '/api/communications'

export interface SendCommunicationRequest {
  clientId: string
  channel: 'email'
  toEmail: string
  subject: string
  body: string
}

export interface ListClientCommunicationsParams {
  limit?: number
  offset?: number
}

/**
 * Send a communication (email) to a client.
 */
export async function sendCommunication(data: SendCommunicationRequest): Promise<Communication> {
  return apiPost<Communication, SendCommunicationRequest>(BASE, data)
}

/**
 * List communications for a specific client.
 */
export async function listClientCommunications(
  clientId: string,
  params?: ListClientCommunicationsParams,
  options?: RequestOptions
): Promise<PaginatedResponse<Communication>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())
  if (params?.offset !== undefined) query.append('offset', params.offset.toString())

  const endpoint = query.toString()
    ? `/api/clients/${clientId}/communications?${query.toString()}`
    : `/api/clients/${clientId}/communications`
  return options
    ? apiGet<PaginatedResponse<Communication>>(endpoint, options)
    : apiGet<PaginatedResponse<Communication>>(endpoint)
}

/**
 * Get a single communication by ID.
 */
export async function getCommunicationById(
  communicationId: string,
  options?: RequestOptions
): Promise<Communication> {
  return options
    ? apiGet<Communication>(`${BASE}/${communicationId}`, options)
    : apiGet<Communication>(`${BASE}/${communicationId}`)
}

/**
 * Get a single communication by provider message ID.
 */
export async function getCommunicationByProviderMessageId(
  providerMessageId: string,
  options?: RequestOptions
): Promise<Communication> {
  return options
    ? apiGet<Communication>(`${BASE}/provider/${providerMessageId}`, options)
    : apiGet<Communication>(`${BASE}/provider/${providerMessageId}`)
}

export interface ListQueuedCommunicationsParams {
  limit?: number
  status?: 'queued' | 'sent' | 'failed'
  createdFrom?: string
  createdTo?: string
  recipient?: string
  subject?: string
  client?: string
  sender?: string
}

export interface ListCommunicationsParams extends ListQueuedCommunicationsParams {
  offset?: number
}

/**
 * List queued/pending communications (admin only).
 */
export async function listQueuedCommunications(
  params?: ListQueuedCommunicationsParams,
  options?: RequestOptions
): Promise<PaginatedResponse<Communication>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())
  if (params?.status) query.append('status', params.status)
  if (params?.createdFrom) query.append('createdFrom', params.createdFrom)
  if (params?.createdTo) query.append('createdTo', params.createdTo)
  if (params?.recipient) query.append('recipient', params.recipient)
  if (params?.subject) query.append('subject', params.subject)
  if (params?.client) query.append('client', params.client)
  if (params?.sender) query.append('sender', params.sender)

  const endpoint = query.toString() ? `${BASE}/queued?${query.toString()}` : `${BASE}/queued`
  return options
    ? apiGet<PaginatedResponse<Communication>>(endpoint, options)
    : apiGet<PaginatedResponse<Communication>>(endpoint)
}

/**
 * List communications (admin only) with pagination and optional filters.
 */
export async function listCommunications(
  params?: ListCommunicationsParams,
  options?: RequestOptions
): Promise<PaginatedResponse<Communication>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())
  if (params?.offset !== undefined) query.append('offset', params.offset.toString())
  if (params?.status) query.append('status', params.status)
  if (params?.createdFrom) query.append('createdFrom', params.createdFrom)
  if (params?.createdTo) query.append('createdTo', params.createdTo)
  if (params?.recipient) query.append('recipient', params.recipient)
  if (params?.subject) query.append('subject', params.subject)
  if (params?.client) query.append('client', params.client)
  if (params?.sender) query.append('sender', params.sender)

  const endpoint = query.toString() ? `${BASE}?${query.toString()}` : BASE
  return options
    ? apiGet<PaginatedResponse<Communication>>(endpoint, options)
    : apiGet<PaginatedResponse<Communication>>(endpoint)
}

/**
 * Update a communication's status by communication ID (admin only).
 */
export async function updateCommunicationStatus(
  communicationId: string,
  data: UpdateCommunicationStatusRequest
): Promise<Communication> {
  return apiPatch<Communication, UpdateCommunicationStatusRequest>(
    `${BASE}/${communicationId}/status`,
    data
  )
}

/**
 * Update a communication's status by provider message ID (admin only).
 */
export async function updateCommunicationStatusByProviderMessageId(
  providerMessageId: string,
  data: UpdateCommunicationStatusRequest
): Promise<Communication> {
  return apiPatch<Communication, UpdateCommunicationStatusRequest>(
    `${BASE}/provider/${providerMessageId}/status`,
    data
  )
}
