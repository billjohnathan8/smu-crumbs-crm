import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendCommunication,
  listClientCommunications,
  getCommunicationById,
  getCommunicationByProviderMessageId,
  listCommunications,
  listQueuedCommunications,
  updateCommunicationStatus,
  updateCommunicationStatusByProviderMessageId,
} from '../communications'
import * as client from '../client'
import type { Communication, PaginatedResponse } from '../types'

vi.mock('../client')

const mockComm: Communication = {
  communicationId: 'comm-1',
  clientId: 'client-123',
  userId: 'user-1',
  channel: 'email',
  toEmail: 'john@example.com',
  subject: 'Welcome',
  body: 'Hello John',
  status: 'queued',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('communications API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendCommunication', () => {
    it('should send a communication', async () => {
      vi.spyOn(client, 'apiPost').mockResolvedValue(mockComm)

      const result = await sendCommunication({
        clientId: 'client-123',
        channel: 'email',
        toEmail: 'john@example.com',
        subject: 'Welcome',
        body: 'Hello John',
      })

      expect(client.apiPost).toHaveBeenCalledWith('/api/communications', {
        clientId: 'client-123',
        channel: 'email',
        toEmail: 'john@example.com',
        subject: 'Welcome',
        body: 'Hello John',
      })
      expect(result).toEqual(mockComm)
    })
  })

  describe('listClientCommunications', () => {
    it('should list communications for a client without params', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [mockComm],
        pagination: { limit: 10, offset: 0, total: 1 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listClientCommunications('client-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/clients/client-123/communications')
      expect(result).toEqual(mockResponse)
    })

    it('should list communications with pagination params', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [],
        pagination: { limit: 20, offset: 10, total: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listClientCommunications('client-123', { limit: 20, offset: 10 })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients/client-123/communications?limit=20&offset=10'
      )
    })

    it('should pass request options when listing client communications', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [],
        pagination: { limit: 10, offset: 0, total: 0 },
      }
      const options = { headers: { 'X-Test': '1' } }
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listClientCommunications('client-123', { limit: 10 }, options)

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/clients/client-123/communications?limit=10',
        options
      )
    })
  })

  describe('getCommunicationById', () => {
    it('should get a communication by ID', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockComm)

      const result = await getCommunicationById('comm-1')

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications/comm-1')
      expect(result).toEqual(mockComm)
    })

    it('should pass request options when getting communication by ID', async () => {
      const options = { signal: new AbortController().signal }
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockComm)

      await getCommunicationById('comm-1', options)

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications/comm-1', options)
    })
  })

  describe('getCommunicationByProviderMessageId', () => {
    it('should get a communication by provider message ID', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockComm)

      const result = await getCommunicationByProviderMessageId('ses-msg-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications/provider/ses-msg-123')
      expect(result).toEqual(mockComm)
    })

    it('should pass request options when getting communication by provider message ID', async () => {
      const options = { headers: { 'X-Correlation-Id': 'corr-1' } }
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockComm)

      await getCommunicationByProviderMessageId('ses-msg-123', options)

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/communications/provider/ses-msg-123',
        options
      )
    })
  })

  describe('listQueuedCommunications', () => {
    it('should list queued communications without params', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [mockComm],
        pagination: { limit: 50, offset: 0, total: 1 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listQueuedCommunications()

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications/queued')
      expect(result).toEqual(mockResponse)
    })

    it('should list queued communications with limit param', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [],
        pagination: { limit: 100, offset: 0, total: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listQueuedCommunications({ limit: 100 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications/queued?limit=100')
    })

    it('should list queued communications with filter params', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [],
        pagination: { limit: 50, offset: 0, total: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listQueuedCommunications({
        limit: 50,
        status: 'failed',
        createdFrom: '2026-04-01T00:00:00.000Z',
        createdTo: '2026-04-02T00:00:00.000Z',
        recipient: 'example.com',
        subject: 'verification',
        client: 'clt_1',
        sender: 'usr_1',
      })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/communications/queued?limit=50&status=failed&createdFrom=2026-04-01T00%3A00%3A00.000Z&createdTo=2026-04-02T00%3A00%3A00.000Z&recipient=example.com&subject=verification&client=clt_1&sender=usr_1'
      )
    })
  })

  describe('listCommunications', () => {
    it('should list communications without params', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [],
        pagination: { limit: 50, offset: 0, total: 0 },
      }
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listCommunications()

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications')
    })

    it('should list communications with pagination and filters', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [mockComm],
        pagination: { limit: 10, offset: 20, total: 101 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listCommunications({
        limit: 10,
        offset: 20,
        status: 'sent',
        recipient: 'example.com',
      })

      expect(client.apiGet).toHaveBeenCalledWith(
        '/api/communications?limit=10&offset=20&status=sent&recipient=example.com'
      )
      expect(result).toEqual(mockResponse)
    })

    it('should pass request options when listing communications', async () => {
      const mockResponse: PaginatedResponse<Communication> = {
        data: [],
        pagination: { limit: 1, offset: 0, total: 0 },
      }
      const options = { headers: { 'X-Request-Id': 'req-1' } }
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      await listCommunications({ status: 'queued' }, options)

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications?status=queued', options)
    })
  })

  describe('updateCommunicationStatus', () => {
    it('should update communication status by ID', async () => {
      const updatedComm = { ...mockComm, status: 'sent' as const }
      vi.spyOn(client, 'apiPatch').mockResolvedValue(updatedComm)

      const result = await updateCommunicationStatus('comm-1', { status: 'sent' })

      expect(client.apiPatch).toHaveBeenCalledWith('/api/communications/comm-1/status', {
        status: 'sent',
      })
      expect(result).toEqual(updatedComm)
    })
  })

  describe('updateCommunicationStatusByProviderMessageId', () => {
    it('should update communication status by provider message ID', async () => {
      const updatedComm = { ...mockComm, status: 'sent' as const }
      vi.spyOn(client, 'apiPatch').mockResolvedValue(updatedComm)

      const result = await updateCommunicationStatusByProviderMessageId('ses-msg-123', {
        status: 'sent',
      })

      expect(client.apiPatch).toHaveBeenCalledWith(
        '/api/communications/provider/ses-msg-123/status',
        { status: 'sent' }
      )
      expect(result).toEqual(updatedComm)
    })
  })
})
