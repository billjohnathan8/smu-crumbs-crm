import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import * as authApi from '@/api/auth'
import * as client from '@/api/client'
import type { TokenResponse, User } from '@/api/types'

vi.mock('@/api/auth')
vi.mock('@/api/client')

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should throw error when useAuth is used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth must be used within AuthProvider')
  })

  it('should initialize with loading state', async () => {
    // Set up a token and user to trigger the async initialization
    localStorage.setItem('authToken', 'test-token')
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'user',
        status: 'active',
      })
    )

    vi.spyOn(client, 'getAuthToken').mockReturnValue('test-token')
    vi.spyOn(authApi, 'getCurrentUser').mockImplementation(
      () => new Promise(() => {}) // Never resolves to keep loading state
    )

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    expect(result.current.isLoading).toBe(true)
  })

  it('should restore user from localStorage on mount', async () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    }

    localStorage.setItem('authToken', 'mock-token')
    localStorage.setItem('currentUser', JSON.stringify(mockUser))

    vi.spyOn(client, 'getAuthToken').mockReturnValue('mock-token')
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('should clear user if token is invalid on mount', async () => {
    localStorage.setItem('authToken', 'invalid-token')
    localStorage.setItem('currentUser', JSON.stringify({ id: '1' }))

    vi.spyOn(client, 'getAuthToken').mockReturnValue('invalid-token')
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('Unauthorized'))
    vi.spyOn(client, 'clearAuthToken')

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(client.clearAuthToken).toHaveBeenCalled()
  })

  it('should login successfully and store token', async () => {
    const mockTokenResponse: TokenResponse = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
    }

    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    }

    vi.spyOn(authApi, 'login').mockResolvedValue(mockTokenResponse)
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(mockUser)
    vi.spyOn(client, 'setAuthToken')
    vi.spyOn(client, 'getAuthToken').mockReturnValue(null)

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.login({
        email: 'john@example.com',
        password: 'password123',
      })
    })

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'john@example.com',
      password: 'password123',
    })
    expect(client.setAuthToken).toHaveBeenCalledWith('new-access-token')
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh-token')
    expect(localStorage.getItem('currentUser')).toBe(JSON.stringify(mockUser))
    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('should logout and clear storage', async () => {
    const mockUser: User = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'user',
      status: 'active',
    }

    localStorage.setItem('authToken', 'mock-token')
    localStorage.setItem('refreshToken', 'mock-refresh-token')
    localStorage.setItem('currentUser', JSON.stringify(mockUser))

    vi.spyOn(client, 'getAuthToken').mockReturnValue('mock-token')
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(mockUser)
    vi.spyOn(client, 'clearAuthToken')

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      result.current.logout()
    })

    expect(client.clearAuthToken).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should handle login errors', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new Error('Invalid credentials'))
    vi.spyOn(client, 'getAuthToken').mockReturnValue(null)

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await expect(
      act(async () => {
        await result.current.login({
          email: 'wrong@example.com',
          password: 'wrongpass',
        })
      })
    ).rejects.toThrow('Invalid credentials')

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
