import { apiPost, apiGet } from './client'
import type {
  LoginRequest,
  TokenResponse,
  RefreshRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  User,
} from './types'

const AUTH_BASE = '/api/auth'
const USERS_BASE = '/api/users'

/**
 * Authenticate user and return access token
 */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  return apiPost<TokenResponse, LoginRequest>(`${AUTH_BASE}/login`, credentials, {
    skipAuth: true,
  })
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  return apiPost<TokenResponse, RefreshRequest>(
    `${AUTH_BASE}/refresh`,
    {
      refreshToken,
    },
    {
      skipAuth: true,
    }
  )
}

/**
 * Get current authenticated user profile
 */
export async function getCurrentUser(): Promise<User> {
  return apiGet<User>(`${USERS_BASE}/me`)
}

/**
 * Request a password reset link for the provided email.
 */
export async function requestPasswordResetLink(payload: ForgotPasswordRequest): Promise<void> {
  return apiPost<void, ForgotPasswordRequest>(`${AUTH_BASE}/forgot-password`, payload, {
    skipAuth: true,
  })
}

/**
 * Reset password with token and replacement credentials.
 */
export async function resetPassword(payload: ResetPasswordRequest): Promise<void> {
  return apiPost<void, ResetPasswordRequest>(`${AUTH_BASE}/reset-password`, payload, {
    skipAuth: true,
  })
}
