/**
 * Forgot Password Flow Integration Tests
 *
 * These tests require a REAL backend with database and run against a full-stack environment.
 *
 * Expected backend support for full E2E:
 * - POST /api/auth/forgot-password
 * - POST /api/auth/reset-password
 * - TEST-ONLY endpoint to retrieve latest reset token for a user (enabled only in local/test profile), e.g.
 *   GET /api/test/password-reset/latest-token?email=admin@crm.com
 *
 * Run with: npm run e2e:integration:real
 */

import { test, expect, request as playwrightRequest } from '@playwright/test'
import { requireE2eEnv } from './helpers/e2eEnv.js'

const ROOT_ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL ?? 'admin@crm.com').trim()
const ROOT_ADMIN_PASSWORD = requireE2eEnv('E2E_ADMIN_PASSWORD')
const TEST_USER_BASE_PASSWORD = process.env.E2E_FORGOT_PASSWORD_BASE ?? 'ForgotBase123!'
const TEST_USER_NEW_PASSWORD = process.env.E2E_FORGOT_PASSWORD_NEW ?? 'ForgotNext123!'

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function expectOkJson(response: import('@playwright/test').APIResponse, operation: string) {
  const body = await response.text()
  expect(response.ok(), `${operation} failed: ${response.status()} ${response.statusText()}\n${body}`).toBeTruthy()
  return body ? JSON.parse(body) : {}
}

async function fetchLatestResetToken(baseURL: string, email: string) {
  const api = await playwrightRequest.newContext({ baseURL })

  const response = await api.get(`/api/test/password-reset/latest-token?email=${encodeURIComponent(email)}`)
  expect(response.ok(), 'Expected test helper endpoint to return 200').toBeTruthy()

  const body = await response.json()
  expect(body.token, 'Expected test helper endpoint to return token').toBeTruthy()

  await api.dispose()
  return body.token as string
}

async function loginViaApi(baseURL: string, email: string, password: string): Promise<string> {
  const api = await playwrightRequest.newContext({ baseURL })
  const response = await api.post('/api/auth/login', {
    data: { email, password },
  })
  const payload = (await expectOkJson(response, `login as ${email}`)) as { accessToken: string }
  await api.dispose()
  expect(payload.accessToken, `Missing access token for ${email}`).toBeTruthy()
  return payload.accessToken
}

async function createTestUser(baseURL: string, email: string, password: string): Promise<void> {
  const adminToken = await loginViaApi(baseURL, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD)
  const api = await playwrightRequest.newContext({ baseURL })
  const response = await api.post('/api/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      firstName: 'Forgot',
      lastName: 'Password',
      email,
      role: 'user',
      sendInviteEmail: false,
      temporaryPassword: password,
    },
  })

  if (response.status() === 409) {
    await api.dispose()
    return
  }

  await expectOkJson(response, `create forgot-password test user ${email}`)
  await api.dispose()
}

test.describe('Forgot Password Full Integration', () => {
  test.describe.configure({ mode: 'serial' })

  test('should request reset, reset password with token, and login with new password', async ({
    page,
    baseURL,
  }) => {
    if (!baseURL) {
      throw new Error('Playwright baseURL is required for this test')
    }

    const testEmail = `forgot-password-${uniqueSuffix()}@example.com`
    await createTestUser(baseURL, testEmail, TEST_USER_BASE_PASSWORD)

    // Step 1: request forgot-password
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByRole('button', { name: /Forgot your password\?/i }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)

    await page.fill('[data-testid="email-input"]', testEmail)
    await page.click('[data-testid="forgot-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Check Your Email' }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('If an account with that email exists'),
    ).toBeVisible()

    // WILL FAIL: BE not yet has a way to fetch the token.
    const token = await fetchLatestResetToken(baseURL, testEmail)

    // Reset password
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`)
    await expect(page).toHaveURL(/\/reset-password\?token=/)

    await page.fill('[data-testid="new-password-input"]', TEST_USER_NEW_PASSWORD)
    await page.fill('[data-testid="confirm-password-input"]', TEST_USER_NEW_PASSWORD)
    await page.click('[data-testid="reset-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Password Reset Successful' }),
    ).toBeVisible({ timeout: 10000 })

    // Try new password
    await page.getByRole('button', { name: 'Go to Login' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.fill('[data-testid="email-input"]', testEmail)
    await page.fill('[data-testid="password-input"]', TEST_USER_NEW_PASSWORD)
    await page.click('[data-testid="login-submit-button"]')

    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'User Dashboard' })).toBeVisible()

  })

  test('should restore original password after reset flow', async ({ page, baseURL }) => {
    if (!baseURL) {
      throw new Error('Playwright baseURL is required for this test')
    }

    const testEmail = `forgot-password-${uniqueSuffix()}@example.com`
    await createTestUser(baseURL, testEmail, TEST_USER_BASE_PASSWORD)

    // First reset from base -> new password.
    await page.goto('/forgot-password')
    await expect(page).toHaveURL(/\/forgot-password$/)

    await page.fill('[data-testid="email-input"]', testEmail)
    await page.click('[data-testid="forgot-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Check Your Email' }),
    ).toBeVisible({ timeout: 10000 })

    let token = await fetchLatestResetToken(baseURL, testEmail)

    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`)
    await expect(page).toHaveURL(/\/reset-password\?token=/)

    await page.fill('[data-testid="new-password-input"]', TEST_USER_NEW_PASSWORD)
    await page.fill('[data-testid="confirm-password-input"]', TEST_USER_NEW_PASSWORD)
    await page.click('[data-testid="reset-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Password Reset Successful' }),
    ).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Go to Login' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.fill('[data-testid="email-input"]', testEmail)
    await page.fill('[data-testid="password-input"]', TEST_USER_NEW_PASSWORD)
    await page.click('[data-testid="login-submit-button"]')
    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 })

    // Trigger forgot password again and restore new -> base password.
    await page.goto('/forgot-password')
    await expect(page).toHaveURL(/\/forgot-password$/)

    await page.fill('[data-testid="email-input"]', testEmail)
    await page.click('[data-testid="forgot-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Check Your Email' }),
    ).toBeVisible({ timeout: 10000 })

    token = await fetchLatestResetToken(baseURL, testEmail)

    // Reset back to original password
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`)
    await expect(page).toHaveURL(/\/reset-password\?token=/)

    await page.fill('[data-testid="new-password-input"]', TEST_USER_BASE_PASSWORD)
    await page.fill('[data-testid="confirm-password-input"]', TEST_USER_BASE_PASSWORD)
    await page.click('[data-testid="reset-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Password Reset Successful' }),
    ).toBeVisible({ timeout: 10000 })

    // Verify original password works again
    await page.getByRole('button', { name: 'Go to Login' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.fill('[data-testid="email-input"]', testEmail)
    await page.fill('[data-testid="password-input"]', TEST_USER_BASE_PASSWORD)
    await page.click('[data-testid="login-submit-button"]')

    await expect(page).toHaveURL(/\/user$/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'User Dashboard' })).toBeVisible()
  })
})
