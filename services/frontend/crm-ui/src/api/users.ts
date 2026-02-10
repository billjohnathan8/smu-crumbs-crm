import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  PaginatedResponse,
  UserRole,
} from './types'

const BASE = '/api/agents'

export interface ListUsersParams {
  limit?: number
  offset?: number
  role?: UserRole
}

/**
 * List users (admin only)
 */
export async function listUsers(params?: ListUsersParams): Promise<PaginatedResponse<User>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())
  if (params?.role) query.append('role', params.role)

  const endpoint = query.toString() ? `${BASE}?${query.toString()}` : BASE
  return apiGet<PaginatedResponse<User>>(endpoint)
}

/**
 * Get user by ID (admin only)
 */
export async function getUserById(userId: string): Promise<User> {
  return apiGet<User>(`${BASE}/${userId}`)
}

/**
 * Create user (admin only)
 */
export async function createUser(data: CreateUserRequest): Promise<User> {
  return apiPost<User, CreateUserRequest>(BASE, data)
}

/**
 * Update user (admin only)
 */
export async function updateUser(userId: string, data: UpdateUserRequest): Promise<User> {
  return apiPut<User, UpdateUserRequest>(`${BASE}/${userId}`, data)
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(userId: string): Promise<void> {
  return apiDelete<void>(`${BASE}/${userId}`)
}

/**
 * Disable user (admin only)
 */
export async function disableUser(userId: string): Promise<User> {
  return apiPost<User>(`${BASE}/${userId}/disable`)
}

/**
 * Reset user password (admin only)
 */
export async function resetUserPassword(userId: string, email: string): Promise<void> {
  return apiPost<void>(`${BASE}/${userId}/reset-password`, { email })
}
