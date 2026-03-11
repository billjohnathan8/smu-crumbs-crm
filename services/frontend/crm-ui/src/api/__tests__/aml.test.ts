import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAmlAlert, getAmlAlertById, listAmlAlerts, updateAmlAlertReview } from '../aml'
import * as client from '../client'
import type { AmlAlert, CreateAmlAlertRequest, PaginatedResponse } from '../types'

vi.mock('../client')

describe('aml API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists AML alerts without params', async () => {
    const mockResponse: PaginatedResponse<AmlAlert> = {
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    }
    vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

    const result = await listAmlAlerts()

    expect(client.apiGet).toHaveBeenCalledWith('/api/aml/alerts')
    expect(result).toEqual(mockResponse)
  })

  it('lists AML alerts with filters', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 10, offset: 0 },
    })

    await listAmlAlerts({
      limit: 20,
      offset: 40,
      clientId: 'clt_1',
      alertType: 'STRUCTURING',
      reviewStatus: 'Pending',
    })

    expect(client.apiGet).toHaveBeenCalledWith(
      '/api/aml/alerts?limit=20&offset=40&clientId=clt_1&alertType=STRUCTURING&reviewStatus=Pending'
    )
  })

  it('gets AML alert by id', async () => {
    const mockAlert: AmlAlert = {
      alertId: 'aml_1',
      clientId: 'clt_1',
      transactionId: 'txn_1',
      alertType: 'STRUCTURING',
      description: 'Structuring',
      detectedAt: '2026-03-01T00:00:00Z',
      reviewStatus: 'Pending',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    }
    vi.spyOn(client, 'apiGet').mockResolvedValue(mockAlert)

    const result = await getAmlAlertById('aml_1')

    expect(client.apiGet).toHaveBeenCalledWith('/api/aml/alerts/aml_1')
    expect(result).toEqual(mockAlert)
  })

  it('creates AML alert', async () => {
    const request: CreateAmlAlertRequest = {
      alertId: 'aml_1',
      clientId: 'clt_1',
      transactionId: 'txn_1',
      alertType: 'STRUCTURING',
      description: 'Structuring',
      detectedAt: '2026-03-01T00:00:00Z',
      reviewStatus: 'Pending',
    }
    const response: AmlAlert = {
      alertId: request.alertId,
      clientId: request.clientId,
      transactionId: request.transactionId,
      alertType: request.alertType,
      description: request.description,
      detectedAt: request.detectedAt,
      reviewStatus: 'Pending',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    }
    vi.spyOn(client, 'apiPost').mockResolvedValue(response)

    const result = await createAmlAlert(request)

    expect(client.apiPost).toHaveBeenCalledWith('/api/aml/alerts', request)
    expect(result).toEqual(response)
  })

  it('updates AML alert review status', async () => {
    const response: AmlAlert = {
      alertId: 'aml_1',
      clientId: 'clt_1',
      transactionId: 'txn_1',
      alertType: 'STRUCTURING',
      description: 'Structuring',
      detectedAt: '2026-03-01T00:00:00Z',
      reviewStatus: 'Confirmed',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:01:00Z',
    }
    vi.spyOn(client, 'apiPut').mockResolvedValue(response)

    const result = await updateAmlAlertReview('aml_1', { reviewStatus: 'Confirmed' })

    expect(client.apiPut).toHaveBeenCalledWith('/api/aml/alerts/aml_1/review', {
      reviewStatus: 'Confirmed',
    })
    expect(result).toEqual(response)
  })
})
