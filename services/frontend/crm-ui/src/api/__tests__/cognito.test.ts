import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AUTH_MODE,
  COGNITO_DOMAIN,
  COGNITO_CLIENT_ID,
  COGNITO_REDIRECT_URI,
  buildCognitoLoginUrl,
  buildCognitoLogoutUrl,
  consumeExpectedOauthState,
  exchangeCodeForTokens,
} from '../cognito'

describe('cognito api helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds hosted ui login and logout urls', () => {
    const loginUrl = buildCognitoLoginUrl()
    const logoutUrl = buildCognitoLogoutUrl()

    expect(['local', 'hybrid', 'cognito']).toContain(AUTH_MODE)
    expect(loginUrl).toContain(`https://${COGNITO_DOMAIN}/login?`)
    expect(loginUrl).toContain(`client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}`)
    expect(loginUrl).toContain(`redirect_uri=${encodeURIComponent(COGNITO_REDIRECT_URI)}`)
    expect(loginUrl).toContain('state=')
    expect(logoutUrl).toContain(`https://${COGNITO_DOMAIN}/logout?`)
    expect(logoutUrl).toContain(`client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}`)
    expect(consumeExpectedOauthState()).toBeTruthy()
  })

  it('exchanges authorization code for tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'access',
        id_token: 'id',
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await exchangeCodeForTokens('test-code')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/oauth2/token'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.stringContaining('grant_type=authorization_code'),
      })
    )
    expect(result).toEqual({
      access_token: 'access',
      id_token: 'id',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  })

  it('throws on non-ok token exchange responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue('bad request'),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(exchangeCodeForTokens('bad')).rejects.toThrow('Authentication failed')
  })

  it('enables cognito in hybrid mode when domain and client id are configured', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_AUTH_MODE', 'hybrid')
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'bank.auth.ap-southeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-123')

    const module = await import('../cognito')

    expect(module.AUTH_MODE).toBe('hybrid')
    expect(module.isCognitoEnabled).toBe(true)
  })
})
