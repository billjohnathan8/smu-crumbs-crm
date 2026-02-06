import { test, expect, Route } from '@playwright/test'
import { setAuthState } from '../helpers/auth'

test.describe('Protected Route Access (Flow 9)', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies and storage
    await context.clearCookies()

    // Set up minimal API mocking to prevent hanging requests
    await page.route('**/api/**', (route: Route) => {
      const url = route.request().url()

      // Skip Vite dev server requests
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

      // Mock auth endpoints
      if (url.includes('/api/agents/me') && route.request().method() === 'GET') {
        const authHeader = route.request().headers()['authorization']

        if (!authHeader || authHeader === 'Bearer null') {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'unauthorized', message: 'Not authenticated' }),
          })
        }

        // Determine role from token
        const role = authHeader.includes('admin') ? 'admin' : 'agent'

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: `${role}-1`,
            firstName: role === 'admin' ? 'Admin' : 'Agent',
            lastName: 'User',
            email: `${role}@example.com`,
            role,
            status: 'active',
          }),
        })
      }

      // Mock other endpoints generically
      if (url.includes('/api/agents') && route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], pagination: { limit: 10, offset: 0, total: 0 } }),
        })
      }

      if (url.includes('/api/clients')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], pagination: { limit: 10, offset: 0, total: 0 } }),
        })
      }

      if (url.includes('/api/transactions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
        })
      }

      if (url.includes('/api/logs')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], pagination: { limit: 10, offset: 0, total: 0 } }),
        })
      }

      // Default: return 404 for unmocked endpoints
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not_found', message: 'Endpoint not mocked' }),
      })
    })
  })

  test('should redirect unauthenticated user to login when accessing /admin', async ({
    page,
  }) => {
    await test.step('Navigate to /admin without authentication', async () => {
      await page.goto('/admin')
    })

    await test.step('Verify redirect to /login', async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 })
    })
  })

  test('should redirect unauthenticated user to login when accessing /agent', async ({
    page,
  }) => {
    await test.step('Navigate to /agent without authentication', async () => {
      await page.goto('/agent')
    })

    await test.step('Verify redirect to /login', async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 })
    })
  })

  test('should redirect unauthenticated user to login when accessing /admin/accounts', async ({
    page,
  }) => {
    await test.step('Navigate to /admin/accounts without authentication', async () => {
      await page.goto('/admin/accounts')
    })

    await test.step('Verify redirect to /login', async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 })
    })
  })

  test('should redirect unauthenticated user to login when accessing /agent/clients/new', async ({
    page,
  }) => {
    await test.step('Navigate to /agent/clients/new without authentication', async () => {
      await page.goto('/agent/clients/new')
    })

    await test.step('Verify redirect to /login', async () => {
      await expect(page).toHaveURL(/\/login$/, { timeout: 5000 })
    })
  })

  test('should show Access Denied when admin tries to access agent routes', async ({ page }) => {
    await test.step('Set up admin authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'admin')
    })

    await test.step('Navigate to /agent (agent-only route)', async () => {
      await page.goto('/agent')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify Access Denied message is shown', async () => {
      await expect(page.getByText('Access Denied')).toBeVisible({ timeout: 5000 })
      await expect(
        page.getByText("You don't have permission to access this page.")
      ).toBeVisible()
    })

    await test.step('Verify Go Back button is present', async () => {
      await expect(page.getByRole('button', { name: /go back/i })).toBeVisible()
    })
  })

  test('should show Access Denied when admin tries to access /agent/clients/new', async ({
    page,
  }) => {
    await test.step('Set up admin authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'admin')
    })

    await test.step('Navigate to /agent/clients/new (agent-only route)', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify Access Denied message is shown', async () => {
      await expect(page.getByText('Access Denied')).toBeVisible({ timeout: 5000 })
    })
  })

  test('should show Access Denied when agent tries to access admin routes', async ({ page }) => {
    await test.step('Set up agent authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'agent')
    })

    await test.step('Navigate to /admin (admin-only route)', async () => {
      await page.goto('/admin')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify Access Denied message is shown', async () => {
      await expect(page.getByText('Access Denied')).toBeVisible({ timeout: 5000 })
      await expect(
        page.getByText("You don't have permission to access this page.")
      ).toBeVisible()
    })
  })

  test('should show Access Denied when agent tries to access /admin/accounts', async ({
    page,
  }) => {
    await test.step('Set up agent authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'agent')
    })

    await test.step('Navigate to /admin/accounts (admin-only route)', async () => {
      await page.goto('/admin/accounts')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify Access Denied message is shown', async () => {
      await expect(page.getByText('Access Denied')).toBeVisible({ timeout: 5000 })
    })
  })

  test('should allow admin to access admin routes', async ({ page }) => {
    await test.step('Set up admin authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'admin')
    })

    await test.step('Navigate to /admin', async () => {
      await page.goto('/admin')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify admin dashboard is shown', async () => {
      await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 5000 })
      // Should NOT see Access Denied
      await expect(page.getByText('Access Denied')).not.toBeVisible()
    })
  })

  test('should allow agent to access agent routes', async ({ page }) => {
    await test.step('Set up agent authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'agent')
    })

    await test.step('Navigate to /agent', async () => {
      await page.goto('/agent')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify agent dashboard is shown', async () => {
      await expect(page.getByText('Agent Dashboard')).toBeVisible({ timeout: 5000 })
      // Should NOT see Access Denied
      await expect(page.getByText('Access Denied')).not.toBeVisible()
    })
  })
})
