import { apiGet, apiPost, apiPatch } from './client'
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
  params?: ListClientCommunicationsParams
): Promise<PaginatedResponse<Communication>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())
  if (params?.offset !== undefined) query.append('offset', params.offset.toString())

  const endpoint = query.toString()
    ? `/api/clients/${clientId}/communications?${query.toString()}`
    : `/api/clients/${clientId}/communications`
  return apiGet<PaginatedResponse<Communication>>(endpoint)
}

/**
 * Get a single communication by ID.
 */
export async function getCommunicationById(communicationId: string): Promise<Communication> {
  return apiGet<Communication>(`${BASE}/${communicationId}`)
}

export interface ListQueuedCommunicationsParams {
  limit?: number
}

/**
 * List queued/pending communications (admin only).
 */
export async function listQueuedCommunications(
  params?: ListQueuedCommunicationsParams
): Promise<PaginatedResponse<Communication>> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.append('limit', params.limit.toString())

  const endpoint = query.toString() ? `${BASE}/queued?${query.toString()}` : `${BASE}/queued`
  return apiGet<PaginatedResponse<Communication>>(endpoint)
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
