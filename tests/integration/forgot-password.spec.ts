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

const ROOT_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@crm.com'
const ROOT_ADMIN_OLD_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Scrooge@Bank2026!'
const ROOT_ADMIN_NEW_PASSWORD = process.env.E2E_ADMIN_NEW_PASSWORD ?? 'AdminReset123!'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login$/)

  await page.fill('[data-testid="email-input"]', email)
  await page.fill('[data-testid="password-input"]', password)
  await page.click('[data-testid="login-submit-button"]')
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

test.describe('Forgot Password Full Integration', () => {
  test('should request reset, reset password with token, and login with new password', async ({
    page,
    baseURL,
  }) => {
    if (!baseURL) {
      throw new Error('Playwright baseURL is required for this test')
    }

    // Step 1: request forgot-password
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByRole('button', { name: /Forgot your password\?/i }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)

    await page.fill('[data-testid="email-input"]', ROOT_ADMIN_EMAIL)
    await page.click('[data-testid="forgot-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Check Your Email' }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('If an account with that email exists'),
    ).toBeVisible()

    // WILL FAIL: BE not yet has a way to fetch the token.
    const token = await fetchLatestResetToken(baseURL, ROOT_ADMIN_EMAIL)

    // Reset password
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`)
    await expect(page).toHaveURL(/\/reset-password\?token=/)

    await page.fill('[data-testid="new-password-input"]', ROOT_ADMIN_NEW_PASSWORD)
    await page.fill('[data-testid="confirm-password-input"]', ROOT_ADMIN_NEW_PASSWORD)
    await page.click('[data-testid="reset-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Password Reset Successful' }),
    ).toBeVisible({ timeout: 10000 })

    // Try new password
    await page.getByRole('button', { name: 'Go to Login' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.fill('[data-testid="email-input"]', ROOT_ADMIN_EMAIL)
    await page.fill('[data-testid="password-input"]', ROOT_ADMIN_NEW_PASSWORD)
    await page.click('[data-testid="login-submit-button"]')

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  })

  test('should restore original password after reset flow', async ({ page, baseURL }) => {
    if (!baseURL) {
      throw new Error('Playwright baseURL is required for this test')
    }

    // Log in using the new password from the previous test.
    await login(page, ROOT_ADMIN_EMAIL, ROOT_ADMIN_NEW_PASSWORD)
    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })

    // Trigger forgot password again
    await page.goto('/forgot-password')
    await expect(page).toHaveURL(/\/forgot-password$/)

    await page.fill('[data-testid="email-input"]', ROOT_ADMIN_EMAIL)
    await page.click('[data-testid="forgot-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Check Your Email' }),
    ).toBeVisible({ timeout: 10000 })

    const token = await fetchLatestResetToken(baseURL, ROOT_ADMIN_EMAIL)

    // Reset back to original password
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`)
    await expect(page).toHaveURL(/\/reset-password\?token=/)

    await page.fill('[data-testid="new-password-input"]', ROOT_ADMIN_OLD_PASSWORD)
    await page.fill('[data-testid="confirm-password-input"]', ROOT_ADMIN_OLD_PASSWORD)
    await page.click('[data-testid="reset-password-submit-button"]')

    await expect(
      page.getByRole('heading', { name: 'Password Reset Successful' }),
    ).toBeVisible({ timeout: 10000 })

    // Verify original password works again
    await page.getByRole('button', { name: 'Go to Login' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.fill('[data-testid="email-input"]', ROOT_ADMIN_EMAIL)
    await page.fill('[data-testid="password-input"]', ROOT_ADMIN_OLD_PASSWORD)
    await page.click('[data-testid="login-submit-button"]')

    await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  })
})
