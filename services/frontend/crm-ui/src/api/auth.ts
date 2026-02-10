import { apiPost, apiGet } from "./client";
import type {
  LoginRequest,
  TokenResponse,
  RefreshRequest,
  User,
} from "./types";

const AUTH_BASE = "/api/auth";
const AGENTS_BASE = "/api/agents";

/**
 * Authenticate user and return access token
 */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  return apiPost<TokenResponse, LoginRequest>(
    `${AUTH_BASE}/login`,
    credentials,
    {
      skipAuth: true,
    },
  );
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(
  refreshToken: string,
): Promise<TokenResponse> {
  return apiPost<TokenResponse, RefreshRequest>(
    `${AUTH_BASE}/refresh`,
    {
      refreshToken,
    },
    {
      skipAuth: true,
    },
  );
}

/**
 * Get current authenticated user profile
 */
export async function getCurrentUser(): Promise<User> {
  return apiGet<User>(`${AGENTS_BASE}/me`);
}
