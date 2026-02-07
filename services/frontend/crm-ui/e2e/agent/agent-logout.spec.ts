import { test, expect, Route } from '@playwright/test'
import { setAuthState } from '../helpers/auth'

test.describe('Agent Logout Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('/login')
    await setAuthState(page, 'agent')

    // Set up minimal API mocking
    await page.route('**/api/**', (route: Route) => {
      const url = route.request().url()

      if (
        url.includes('/@vite') ||
        url.includes('/@fs') ||
        url.includes('/@id') ||
        url.includes('.js') ||
        url.includes('.ts') ||
        url.includes('.jsx') ||
        url.includes('.tsx') ||
        url.includes('.css')
      ) {
        return route.continue()
      }

      if (url.includes('/api/agents/me')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'agent-1',
            firstName: 'Agent',
            lastName: 'User',
            email: 'agent@example.com',
            role: 'agent',
            status: 'active',
          }),
        })
      }

      if (url.includes('/api/clients')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 0 },
          }),
        })
      }

      if (url.includes('/api/transactions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { limit: 20, offset: 0, total: 0 },
          }),
        })
      }

      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not_found' }),
      })
    })
  })

  test('should logout from agent dashboard', async ({ page }) => {
    await test.step('Navigate to agent dashboard', async () => {
      await page.goto('/agent')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify agent is logged in', async () => {
      await expect(page.getByText('Agent Dashboard')).toBeVisible()
    })

    await test.step('Click logout button', async () => {
      await page.click('button:has-text("Logout")')
    })

    await test.step('Verify redirect to login page', async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })

    await test.step('Verify auth state is cleared', async () => {
      const authToken = await page.evaluate(() => localStorage.getItem('authToken'))
      const currentUser = await page.evaluate(() => localStorage.getItem('currentUser'))

      expect(authToken).toBeNull()
      expect(currentUser).toBeNull()
    })

    await test.step('Verify cannot access protected route after logout', async () => {
      await page.goto('/agent')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })
  })

  test('should logout from agent create client page', async ({ page }) => {
    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify on create client page', async () => {
      await expect(page.getByRole('heading', { name: 'Create Client' })).toBeVisible()
    })

    await test.step('Click logout button', async () => {
      await page.click('button:has-text("Logout")')
    })

    await test.step('Verify redirect to login page', async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })

    await test.step('Verify auth state is cleared', async () => {
      const authToken = await page.evaluate(() => localStorage.getItem('authToken'))
      expect(authToken).toBeNull()
    })
  })

  test('should logout from agent transactions page', async ({ page }) => {
    await test.step('Navigate to transactions page', async () => {
      await page.goto('/agent/transactions')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify on transactions page', async () => {
      await expect(page.getByText('Transactions')).toBeVisible()
    })

    await test.step('Click logout button', async () => {
      await page.click('button:has-text("Logout")')
    })

    await test.step('Verify redirect to login page', async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })

    await test.step('Verify auth state is cleared', async () => {
      const authToken = await page.evaluate(() => localStorage.getItem('authToken'))
      expect(authToken).toBeNull()
    })
  })
})
