/**
 * Cognito configuration derived from environment variables.
 *
 * When VITE_AUTH_MODE is 'cognito' or 'hybrid', the frontend can redirect users
 * to the Cognito Hosted UI for SSO login and exchange the authorization code for
 * tokens on the /auth/callback route.
 *
 * Environment variables:
 *   VITE_AUTH_MODE         - 'local' | 'hybrid' | 'cognito' (default: 'local')
 *   VITE_COGNITO_DOMAIN    - Cognito Hosted UI domain (e.g. myapp.auth.ap-southeast-1.amazoncognito.com)
 *   VITE_COGNITO_CLIENT_ID - Cognito App Client ID
 *   VITE_COGNITO_REDIRECT_URI - OAuth callback URL (e.g. https://app.example.com/auth/callback)
 */

export type AuthMode = 'local' | 'hybrid' | 'cognito'

export const AUTH_MODE: AuthMode = (() => {
  const raw = (import.meta.env.VITE_AUTH_MODE ?? 'local').toLowerCase().trim()
  if (raw === 'cognito' || raw === 'hybrid') return raw
  return 'local'
})()

export const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? ''
export const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? ''
export const COGNITO_REDIRECT_URI =
  import.meta.env.VITE_COGNITO_REDIRECT_URI ?? `${window.location.origin}/auth/callback`

export const COGNITO_SCOPES = 'openid email profile'

/** True when Cognito SSO login should be available in the UI. */
export const isCognitoEnabled =
  (AUTH_MODE === 'cognito' || AUTH_MODE === 'hybrid') && !!COGNITO_DOMAIN && !!COGNITO_CLIENT_ID

/** Build the Cognito Hosted UI authorization URL (PKCE code flow). */
export function buildCognitoLoginUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: COGNITO_SCOPES,
  })
  return `https://${COGNITO_DOMAIN}/login?${params.toString()}`
}

/** Build the Cognito Hosted UI logout URL. */
export function buildCognitoLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: window.location.origin + '/login',
  })
  return `https://${COGNITO_DOMAIN}/logout?${params.toString()}`
}

/** Exchange an authorization code for Cognito tokens. */
export async function exchangeCodeForTokens(code: string): Promise<CognitoTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    code,
  })

  const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cognito token exchange failed: ${text}`)
  }

  return response.json()
}

export interface CognitoTokenResponse {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}
