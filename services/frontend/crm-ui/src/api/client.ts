import type { ErrorResponse } from './types'
import { getUserFriendlyErrorMessage } from '@/utils/errorMessages'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  error: string
  requestId?: string

  constructor(status: number, error: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.error = error
    this.requestId = requestId
  }
}

export interface RequestOptions extends RequestInit {
  timeout?: number
  skipAuth?: boolean
}

const DEFAULT_TIMEOUT = 5000 // 5 seconds max latency requirement

/**
 * Get the stored auth token from localStorage
 */
export function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
}

/**
 * Store auth token in localStorage
 */
export function setAuthToken(token: string): void {
  localStorage.setItem('authToken', token)
}

/**
 * Remove auth token from localStorage
 */
export function clearAuthToken(): void {
  localStorage.removeItem('authToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('currentUser')
}

/**
 * Base API request function with error handling, timeout, and auth
 */
export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, skipAuth = false, ...fetchOptions } = options

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }

  // Add auth token unless explicitly skipped
  if (!skipAuth) {
    const token = getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // Create timeout signal and always clear the timer once the request settles.
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeout)
  const signal = fetchOptions.signal
    ? AbortSignal.any([fetchOptions.signal, timeoutController.signal])
    : timeoutController.signal

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal,
    })

    // Handle non-OK responses
    if (!response.ok) {
      let errorData: ErrorResponse
      try {
        errorData = await response.json()
      } catch {
        errorData = {
          error: 'unknown_error',
          message: `Request failed with status ${response.status}`,
        }
      }

      throw new ApiError(
        response.status,
        errorData.error,
        getUserFriendlyErrorMessage(errorData.error),
        errorData.requestId
      )
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    // Parse JSON response
    const data = await response.json()
    return data as T
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    // Check for AbortError (can be DOMException or Error)
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new ApiError(408, 'request_timeout', getUserFriendlyErrorMessage('request_timeout'), undefined)
    }

    if (error instanceof Error) {
      throw new ApiError(0, 'network_error', getUserFriendlyErrorMessage('network_error'), undefined)
    }

    throw new ApiError(0, 'unknown_error', getUserFriendlyErrorMessage('unknown_error'), undefined)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * GET request
 */
export async function apiGet<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'GET' })
}

/**
 * POST request
 */
export async function apiPost<T, D = unknown>(
  endpoint: string,
  data?: D,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
}

/**
 * PUT request
 */
export async function apiPut<T, D = unknown>(
  endpoint: string,
  data: D,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/**
 * PATCH request
 */
export async function apiPatch<T, D = unknown>(
  endpoint: string,
  data: D,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/**
 * DELETE request
 */
export async function apiDelete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'DELETE' })
}
