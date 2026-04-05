import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { User } from '@/api/types'

const mockApiLogin = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockSetAuthToken = vi.fn()
const mockClearAuthToken = vi.fn()
const mockGetAuthToken = vi.fn<() => string | null>(() => null)
const mockExchangeCodeForTokens = vi.fn()
const mockBuildCognitoLogoutUrl = vi.fn(() => 'https://cognito.example/logout')

const sampleUser: User = {
  id: 'usr_1',
  firstName: 'Sam',
  lastName: 'Lee',
  email: 'sam@example.com',
  role: 'admin',
  status: 'active',
}

async function importAuthContext(options?: { isCognitoEnabled?: boolean; authMode?: string }) {
  vi.resetModules()

  vi.doMock('@/api/auth', () => ({
    login: mockApiLogin,
    getCurrentUser: mockGetCurrentUser,
  }))

  vi.doMock('@/api/client', () => ({
    setAuthToken: mockSetAuthToken,
    clearAuthToken: mockClearAuthToken,
    getAuthToken: mockGetAuthToken,
    setSessionExpiryHandler: vi.fn(),
  }))

  vi.doMock('@/api/cognito', () => ({
    isCognitoEnabled: options?.isCognitoEnabled ?? false,
    AUTH_MODE: options?.authMode ?? 'local',
    exchangeCodeForTokens: mockExchangeCodeForTokens,
    buildCognitoLogoutUrl: mockBuildCognitoLogoutUrl,
  }))

  return import('../AuthContext')
}

describe('AuthContext cognito and bypass paths', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('supports loginWithCognitoCode and stores tokens/user', async () => {
    mockExchangeCodeForTokens.mockResolvedValue({
      access_token: 'access-1',
      id_token: 'id-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      token_type: 'Bearer',
    })
    mockGetCurrentUser.mockResolvedValue(sampleUser)

    const { AuthProvider, useAuth } = await importAuthContext({
      isCognitoEnabled: true,
      authMode: 'cognito',
    })

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.loginWithCognitoCode('code-123')
    })

    expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('code-123')
    expect(mockSetAuthToken).toHaveBeenCalledWith('access-1')
    expect(localStorage.getItem('refreshToken')).toBe('refresh-1')
    expect(localStorage.getItem('idToken')).toBeNull()
    expect(localStorage.getItem('currentUser')).toBe(JSON.stringify(sampleUser))
    expect(result.current.user).toEqual(sampleUser)
  })

  it('redirects through cognito logout when cognito mode is enabled', async () => {
    mockGetCurrentUser.mockResolvedValue(sampleUser)
    mockGetAuthToken.mockReturnValue('token')
    localStorage.setItem('currentUser', JSON.stringify(sampleUser))

    const { AuthProvider, useAuth } = await importAuthContext({
      isCognitoEnabled: true,
      authMode: 'cognito',
    })

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.logout()
    })

    expect(mockClearAuthToken).toHaveBeenCalled()
    expect(mockBuildCognitoLogoutUrl).toHaveBeenCalled()
  })

  it('does not redirect through cognito logout when mode is not cognito', async () => {
    mockGetCurrentUser.mockResolvedValue(sampleUser)
    mockGetAuthToken.mockReturnValue('token')
    localStorage.setItem('currentUser', JSON.stringify(sampleUser))

    const { AuthProvider, useAuth } = await importAuthContext({
      isCognitoEnabled: true,
      authMode: 'local',
    })

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.logout()
    })

    expect(mockClearAuthToken).toHaveBeenCalled()
    expect(mockBuildCognitoLogoutUrl).not.toHaveBeenCalled()
  })

  it('clears auth and throws when loginWithCognitoCode fails', async () => {
    mockExchangeCodeForTokens.mockRejectedValue(new Error('bad code'))

    const { AuthProvider, useAuth } = await importAuthContext({
      isCognitoEnabled: true,
      authMode: 'cognito',
    })

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      act(async () => {
        await result.current.loginWithCognitoCode('bad-code')
      })
    ).rejects.toThrow('Authentication failed')

    expect(mockClearAuthToken).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })

  it('supports DEV bypass initialization and bypass login credentials', async () => {
    vi.stubEnv('VITE_BYPASS_AUTH', 'true')
    vi.stubEnv('VITE_BYPASS_ROLE', 'super_admin')

    const { AuthProvider, useAuth } = await importAuthContext()

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user?.role).toBe('super_admin')

    await act(async () => {
      await result.current.login({
        email: 'admin@example.com',
        password: 'password123',
      })
    })

    expect(result.current.user?.role).toBe('admin')
  })

  it('rejects invalid bypass credentials', async () => {
    vi.stubEnv('VITE_BYPASS_AUTH', 'true')

    const { AuthProvider, useAuth } = await importAuthContext()

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      act(async () => {
        await result.current.login({
          email: 'bad@example.com',
          password: 'wrong',
        })
      })
    ).rejects.toThrow('Invalid email or password')
  })
})
