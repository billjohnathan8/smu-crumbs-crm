import { apiGet, apiPost, apiPut } from './client'
import type {
  AmlAlert,
  AmlAlertType,
  AmlReviewStatus,
  CreateAmlAlertRequest,
  PaginatedResponse,
  UpdateAmlAlertReviewRequest,
} from './types'

const BASE = '/api/aml/alerts'
const AML_ALERTS_LIST_TIMEOUT_MS = 15000

export interface ListAmlAlertsParams {
  limit?: number
  offset?: number
  clientId?: string
  alertType?: AmlAlertType
  reviewStatus?: AmlReviewStatus
  detectedDate?: string // ISO 8601 date string (YYYY-MM-DD)
}

/**
 * List AML alerts with optional filtering.
 */
export async function listAmlAlerts(
  params?: ListAmlAlertsParams
): Promise<PaginatedResponse<AmlAlert>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())
  if (params?.clientId) query.append('clientId', params.clientId)
  if (params?.alertType) query.append('alertType', params.alertType)
  if (params?.reviewStatus) query.append('reviewStatus', params.reviewStatus)
  if (params?.detectedDate) query.append('detectedDate', params.detectedDate)

  const endpoint = query.toString() ? `${BASE}?${query.toString()}` : BASE
  return apiGet<PaginatedResponse<AmlAlert>>(endpoint, { timeout: AML_ALERTS_LIST_TIMEOUT_MS })
}

/**
 * Get AML alert by ID.
 */
export async function getAmlAlertById(alertId: string): Promise<AmlAlert> {
  return apiGet<AmlAlert>(`${BASE}/${alertId}`)
}

/**
 * Create AML alert.
 */
export async function createAmlAlert(data: CreateAmlAlertRequest): Promise<AmlAlert> {
  return apiPost<AmlAlert, CreateAmlAlertRequest>(BASE, data)
}

/**
 * Update AML alert review status.
 */
export async function updateAmlAlertReview(
  alertId: string,
  data: UpdateAmlAlertReviewRequest
): Promise<AmlAlert> {
  return apiPut<AmlAlert, UpdateAmlAlertReviewRequest>(`${BASE}/${alertId}/review`, data)
}

/**
 * Trigger manual AML scan (admin-only).
 */
export async function triggerAmlScan(): Promise<{ status: string; message: string; triggeredBy: string }> {
  return apiPost<{ status: string; message: string; triggeredBy: string }, {}>('/api/aml/trigger', {})
}
