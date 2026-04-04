import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  listArchivedUsers,
  reinstateUser,
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

      expect(client.apiGet).toHaveBeenCalledWith('/api/users')
      expect(result).toEqual(mockResponse)
    })

    it('should list users with limit and offset', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listUsers({ limit: 25, offset: 50 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/users?limit=25&offset=50')
    })

    it('should filter users by role', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listUsers({ role: 'admin' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/users?role=admin')
    })

    it('should list users with all params', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 },
      })

      await listUsers({ limit: 20, offset: 40, role: 'user' })

      expect(client.apiGet).toHaveBeenCalledWith('/api/users?limit=20&offset=40&role=user')
    })
  })

  describe('getUserById', () => {
    it('should get user by ID', async () => {
      const mockUser: User = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'user',
        status: 'active',
      }

      vi.spyOn(client, 'apiGet').mockResolvedValue(mockUser)

      const result = await getUserById('user-123')

      expect(client.apiGet).toHaveBeenCalledWith('/api/users/user-123')
      expect(result).toEqual(mockUser)
    })

    it('should include archived users when requested', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({} as User)

      await getUserById('user-123', { includeArchived: true })

      expect(client.apiGet).toHaveBeenCalledWith('/api/users/user-123?includeArchived=true')
    })
  })

  describe('createUser', () => {
    it('should create user with all fields', async () => {
      const createRequest: CreateUserRequest = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: 'user',
        sendInviteEmail: true,
      }

      const mockUser: User = {
        id: 'user-new',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        role: 'user',
        status: 'active',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockUser)

      const result = await createUser(createRequest)

      expect(client.apiPost).toHaveBeenCalledWith('/api/users', createRequest)
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
        role: 'user',
        status: 'active',
      }

      vi.spyOn(client, 'apiPut').mockResolvedValue(mockUser)

      const result = await updateUser('user-123', updateRequest)

      expect(client.apiPut).toHaveBeenCalledWith('/api/users/user-123', updateRequest)
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
        role: 'user',
        status: 'disabled',
      }

      vi.spyOn(client, 'apiPost').mockResolvedValue(mockUser)

      const result = await disableUser('user-123')

      expect(client.apiPost).toHaveBeenCalledWith('/api/users/user-123/disable')
      expect(result.status).toBe('disabled')
    })
  })

  describe('deleteUser', () => {
    it('should delete user', async () => {
      vi.spyOn(client, 'apiDelete').mockResolvedValue(undefined)

      await deleteUser('user-123')

      expect(client.apiDelete).toHaveBeenCalledWith('/api/users/user-123')
    })

    it('should pass archive reason when provided', async () => {
      vi.spyOn(client, 'apiDelete').mockResolvedValue(undefined)

      await deleteUser('user-123', 'offboarding')

      expect(client.apiDelete).toHaveBeenCalledWith('/api/users/user-123?reason=offboarding')
    })
  })

  describe('listArchivedUsers', () => {
    it('should list archived users by role', async () => {
      vi.spyOn(client, 'apiGet').mockResolvedValue({ data: [], pagination: { total: 0, limit: 10, offset: 0 } })

      await listArchivedUsers({ role: 'user', limit: 20, offset: 40 })

      expect(client.apiGet).toHaveBeenCalledWith('/api/users/archives?limit=20&offset=40&role=user')
    })
  })

  describe('reinstateUser', () => {
    it('should call reinstate endpoint', async () => {
      vi.spyOn(client, 'apiPost').mockResolvedValue({} as User)

      await reinstateUser('user-123')

      expect(client.apiPost).toHaveBeenCalledWith('/api/users/user-123/reinstate')
    })
  })

  describe('resetUserPassword', () => {
    it('should send password reset email', async () => {
      vi.spyOn(client, 'apiPost').mockResolvedValue(undefined)

      await resetUserPassword('user-123', 'user@example.com')

      expect(client.apiPost).toHaveBeenCalledWith('/api/users/user-123/reset-password', {
        email: 'user@example.com',
      })
    })
  })
})
