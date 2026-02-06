import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  disableUser,
  deleteUser,
  resetUserPassword,
} from '../users'
import * as client from '../client'
import type { User, CreateUserRequest, UpdateUserRequest, PaginatedResponse } from '../types'

vi.mock('../client')

describe('users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listUsers', () => {
    it('should list users without params', async () => {
      const mockResponse: PaginatedResponse<User> = {
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockResponse)

      const result = await listUsers()

      expect(client.apiGet).toHaveBeenCalledWith('/api/agents')
      expect(result).toEqual(mockResponse)
    })

    it('should list users with limit and offset', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listUsers({ limit: 25, offset: 50 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/agents?limit=25&offset=50')
    })

    it('should filter users by role', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listUsers({ role: 'admin' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/agents?role=admin')
    })

    it('should list users with all params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listUsers({ limit: 20, offset: 40, role: 'agent' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/agents?limit=20&offset=40&role=agent')
    })
  })

  describe('getUserById', () => {
    it('should get user by ID', async () => {
      const mockUser: User = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'agent',
        status: 'active',
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockUser)

      const result = await getUserById('user-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/agents/user-123')
      expect(result).toEqual(mockUser)
    })
  })

  describe('createUser', () => {
    it('should create user with all fields', async () => {
      const createRequest: CreateUserRequest = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: 'agent',
        sendInviteEmail: true,
      }

      const mockUser: User = {
        id: 'user-new',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: 'agent',
        status: 'active',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockUser)

      const result = await createUser(createRequest)

      expect(client.apiPost).toHaveBeenCalledWith('/api/agents', createRequest)
      expect(result).toEqual(mockUser)
    })

    it('should create admin user', async () => {
      const createRequest: CreateUserRequest = {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        role: 'admin',
        sendInviteEmail: false,
      }

      const mockUser: User = {
        id: 'user-admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockUser)

      const result = await createUser(createRequest)

      expect(result.role).toBe('admin')
    })
  })

  describe('updateUser', () => {
    it('should update user', async () => {
      const updateRequest: UpdateUserRequest = {
        firstName: 'John',
        lastName: 'Updated',
      }

      const mockUser: User = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'Updated',
        email: 'john@example.com',
        role: 'agent',
        status: 'active',
      }

      vi.spyOn(client, 'apiPut').mockResolvedValue(mockUser)

      const result = await updateUser('user-123', updateRequest)

      expect(client.apiPut).toHaveBeenCalledWith('/api/agents/user-123', updateRequest)
      expect(result).toEqual(mockUser)
    })
  })

  describe('disableUser', () => {
    it('should disable user', async () => {
      const mockUser: User = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'agent',
        status: 'disabled',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockUser)

      const result = await disableUser('user-123')

      expect(client.apiPost).toHaveBeenCalledWith('/api/agents/user-123/disable')
      expect(result.status).toBe('disabled')
    })
  })

  describe('deleteUser', () => {
    it('should delete user', async () => {
      vi.spyOn(client, 'apiDelete').mockResolvedValue(undefined)

      await deleteUser('user-123')

      expect(client.apiDelete).toHaveBeenCalledWith('/api/agents/user-123')
    })
  })

  describe('resetUserPassword', () => {
    it('should send password reset email', async () => {
      vi.spyOn(client, 'apiPost').mockResolvedValue(undefined)

      await resetUserPassword('user-123', 'user@example.com')

      expect(client.apiPost).toHaveBeenCalledWith('/api/agents/user-123/reset-password', {
        email: 'user@example.com',
      })
    })
  })
})
