import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendCommunication,
  listClientCommunications,
  getCommunicationById,
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
  })

  describe('getCommunicationById', () => {
    it('should get a communication by ID', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue(mockComm)

      const result = await getCommunicationById('comm-1')

      expect(client.apiGet).toHaveBeenCalledWith('/api/communications/comm-1')
      expect(result).toEqual(mockComm)
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
