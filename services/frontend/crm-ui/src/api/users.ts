import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  PaginatedResponse,
  UserRole,
} from './types'

const BASE = '/api/users'

export interface ListUsersParams {
  limit?: number
  offset?: number
  role?: UserRole
}

export interface ListArchivedUsersParams extends ListUsersParams {}

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
export async function getUserById(
  userId: string,
  options?: { includeArchived?: boolean }
): Promise<User> {
  const query = new URLSearchParams()
  if (options?.includeArchived) query.append('includeArchived', 'true')
  const endpoint = query.toString() ? `${BASE}/${userId}?${query.toString()}` : `${BASE}/${userId}`
  return apiGet<User>(endpoint)
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
export async function deleteUser(userId: string, reason?: string): Promise<void> {
  const query = new URLSearchParams()
  if (reason && reason.trim()) query.append('reason', reason.trim())
  const endpoint = query.toString() ? `${BASE}/${userId}?${query.toString()}` : `${BASE}/${userId}`
  return apiDelete<void>(endpoint)
}

/**
 * Disable user (admin only)
 */
export async function disableUser(userId: string): Promise<User> {
  return apiPost<User>(`${BASE}/${userId}/disable`)
}

/**
 * List archived users.
 */
export async function listArchivedUsers(params?: ListArchivedUsersParams): Promise<PaginatedResponse<User>> {
  const query = new URLSearchParams()
  if (params?.limit) query.append('limit', params.limit.toString())
  if (params?.offset) query.append('offset', params.offset.toString())
  if (params?.role) query.append('role', params.role)

  const endpoint = query.toString() ? `${BASE}/archives?${query.toString()}` : `${BASE}/archives`
  return apiGet<PaginatedResponse<User>>(endpoint)
}

/**
 * Reinstate archived user (root-admin only).
 */
export async function reinstateUser(userId: string): Promise<User> {
  return apiPost<User>(`${BASE}/${userId}/reinstate`)
}

/**
 * Reset user password (admin only)
 */
export async function resetUserPassword(userId: string, email: string): Promise<void> {
  return apiPost<void>(`${BASE}/${userId}/reset-password`, { email })
}
