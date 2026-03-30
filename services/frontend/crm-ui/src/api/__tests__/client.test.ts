/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  apiRequest,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from '../client'

describe('ApiError', () => {
  it('should create ApiError with all properties', () => {
    const error = new ApiError(404, 'not_found', 'Resource not found', 'req-123')

    expect(error.name).toBe('ApiError')
    expect(error.status).toBe(404)
    expect(error.error).toBe('not_found')
    expect(error.message).toBe('Resource not found')
    expect(error.requestId).toBe('req-123')
  })

  it('should create ApiError without requestId', () => {
    const error = new ApiError(500, 'server_error', 'Internal server error')

    expect(error.status).toBe(500)
    expect(error.requestId).toBeUndefined()
  })
})

describe('Token management', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should get auth token from localStorage', () => {
    localStorage.setItem('authToken', 'test-token')
    expect(getAuthToken()).toBe('test-token')
  })

  it('should return null when no token exists', () => {
    expect(getAuthToken()).toBeNull()
  })

  it('should set auth token in localStorage', () => {
    setAuthToken('new-token')
    expect(localStorage.getItem('authToken')).toBe('new-token')
  })

  it('should clear all auth-related data from localStorage', () => {
    localStorage.setItem('authToken', 'token')
    localStorage.setItem('refreshToken', 'refresh')
    localStorage.setItem('currentUser', '{}')

    clearAuthToken()

    expect(localStorage.getItem('authToken')).toBeNull()
    expect(localStorage.getItem('refreshToken')).toBeNull()
    expect(localStorage.getItem('currentUser')).toBeNull()
  })
})

describe('apiRequest', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should make successful GET request', async () => {
    const mockData = { id: '1', name: 'Test' }
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    })

    const result = await apiRequest('/test')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    )
    // Verify the signal property exists (for timeout handling)
    const callArgs = (globalThis.fetch as any).mock.calls[0][1]
    expect(callArgs.signal).toBeDefined()
    expect(callArgs.signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual(mockData)
  })

  it('should include auth token in request headers when available', async () => {
    localStorage.setItem('authToken', 'test-token')
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await apiRequest('/test')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('should skip auth token when skipAuth is true', async () => {
    localStorage.setItem('authToken', 'test-token')
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await apiRequest('/test', { skipAuth: true })

    const call = (globalThis.fetch as any).mock.calls[0][1]
    expect(call.headers['Authorization']).toBeUndefined()
  })

  it('should handle 204 No Content response', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    const result = await apiRequest('/test')

    expect(result).toBeUndefined()
  })

  it('should throw ApiError on 400 error with JSON response', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'validation_error',
        message: 'Invalid input',
        requestId: 'req-456',
      }),
    })

    try {
      await apiRequest('/test')
      expect.fail('Should have thrown ApiError')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        status: 400,
        error: 'validation_error',
        message: 'Invalid input',
        requestId: 'req-456',
      })
    }
  })

  it('should throw ApiError on 401 Unauthorized', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'unauthorized',
        message: 'Authentication required',
      }),
    })

    await expect(apiRequest('/test')).rejects.toMatchObject({
      status: 401,
      error: 'unauthorized',
    })
  })

  it('should throw ApiError on 404 Not Found', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'not_found',
        message: 'Resource not found',
      }),
    })

    await expect(apiRequest('/test')).rejects.toMatchObject({
      status: 404,
      error: 'not_found',
    })
  })

  it('should throw ApiError on 500 error', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'server_error',
        message: 'Internal server error',
      }),
    })

    await expect(apiRequest('/test')).rejects.toMatchObject({
      status: 500,
      error: 'server_error',
    })
  })

  it('should handle error response without JSON body', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Not JSON')
      },
    })

    await expect(apiRequest('/test')).rejects.toMatchObject({
      status: 500,
      error: 'unknown_error',
      message: 'Request failed with status 500',
    })
  })

  it('should handle timeout error', async () => {
    // Don't use fake timers - test with a very short real timeout
    let abortCalled = false

    ;(globalThis.fetch as any).mockImplementationOnce((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        // Listen for abort event
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            abortCalled = true
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        }
        // Never resolve - will timeout
      })
    })

    // Use a very short timeout
    const promise = apiRequest('/test', { timeout: 50 })

    // Wait for the promise to reject
    await expect(promise).rejects.toMatchObject({
      status: 408,
      error: 'request_timeout',
    })

    // Verify abort was called
    expect(abortCalled).toBe(true)
  })

  it('should handle network error', async () => {
    ;(globalThis.fetch as any).mockRejectedValueOnce(new Error('Network failure'))

    await expect(apiRequest('/test')).rejects.toMatchObject({
      status: 0,
      error: 'network_error',
      message: 'Network error occurred',
    })
  })

  it('should handle unknown error', async () => {
    ;(globalThis.fetch as any).mockRejectedValueOnce('unknown')

    await expect(apiRequest('/test')).rejects.toMatchObject({
      status: 0,
      error: 'unknown_error',
      message: 'An unknown error occurred',
    })
  })

  it('should use custom timeout', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await apiRequest('/test', { timeout: 10000 })

    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('should merge custom headers with default headers', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await apiRequest('/test', {
      headers: {
        'X-Custom-Header': 'custom-value',
      },
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
        }),
      })
    )
  })
})

describe('HTTP method helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn() as any
  })

  it('should make GET request', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    })

    await apiGet('/test')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('should make POST request with data', async () => {
    const postData = { name: 'Test' }
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: '1', ...postData }),
    })

    await apiPost('/test', postData)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(postData),
      })
    )
  })

  it('should make POST request without data', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await apiPost('/test')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        method: 'POST',
        body: undefined,
      })
    )
  })

  it('should make PUT request with data', async () => {
    const putData = { name: 'Updated' }
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', ...putData }),
    })

    await apiPut('/test/1', putData)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(putData),
      })
    )
  })

  it('should make DELETE request', async () => {
    ;(globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    await apiDelete('/test/1')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/test/1',
      expect.objectContaining({
        method: 'DELETE',
      })
    )
  })
})
