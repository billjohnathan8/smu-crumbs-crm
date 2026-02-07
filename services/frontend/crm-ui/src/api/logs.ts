import { apiGet, apiPost } from './client'
import type { LogEntry, CreateLogRequest, PaginatedResponse, LogAction } from './types'

const BASE = '/api/logs'

export interface ListLogsParams {
  limit?: number
  offset?: number
  clientId?: string
  agentId?: string
  action?: LogAction
  from?: string
  to?: string
}

/**
 * List logs (agents see only their own logs, admins see all)
 */
export async function listLogs(params?: ListLogsParams): Promise<PaginatedResponse<LogEntry>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())
  if (params?.clientId) query.append('clientId', params.clientId)
  if (params?.agentId) query.append('agentId', params.agentId)
  if (params?.action) query.append('action', params.action)
  if (params?.from) query.append('from', params.from)
  if (params?.to) query.append('to', params.to)

  const endpoint = query.toString() ? `${BASE}?${query.toString()}` : BASE
  return apiGet<PaginatedResponse<LogEntry>>(endpoint)
}

/**
 * Get log entry by ID
 */
export async function getLogById(logId: string): Promise<LogEntry> {
  return apiGet<LogEntry>(`${BASE}/${logId}`)
}

/**
 * Create log entry
 */
export async function createLog(data: CreateLogRequest): Promise<LogEntry> {
  return apiPost<LogEntry, CreateLogRequest>(BASE, data)
}

/**
 * List logs for a specific client
 */
export async function listClientLogs(
  clientId: string,
  params?: { limit?: number; offset?: number }
): Promise<PaginatedResponse<LogEntry>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())

  const endpoint = query.toString()
    ? `/api/clients/${clientId}/logs?${query.toString()}`
    : `/api/clients/${clientId}/logs`
  return apiGet<PaginatedResponse<LogEntry>>(endpoint)
}
