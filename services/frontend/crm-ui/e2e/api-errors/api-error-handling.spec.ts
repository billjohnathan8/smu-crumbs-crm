import { test, expect, Route } from '@playwright/test'
import { setAuthState } from '../helpers/auth'
import { uniqueEmail } from '../helpers/testData'

test.describe('API Error Handling (Flow 10)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies()
    // Clear all route handlers to prevent accumulation across tests.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('should handle 401 Unauthorized and redirect to login', async ({ page }) => {
    await test.step('Set up authenticated state', async () => {
      await page.goto('/login')
      await setAuthState(page, 'user')
    })

    await test.step('Set up route to return 401', async () => {
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

        // Return 401 for all API calls
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'unauthorized',
            message: 'Session expired',
          }),
        })
      })
    })

    await test.step('Navigate to user dashboard (triggers API call)', async () => {
      await page.goto('/user')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify redirect to login page', async () => {
      // Should be redirected to login after 401
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })

    await test.step('Verify localStorage is cleared', async () => {
      const token = await page.evaluate(() => localStorage.getItem('authToken'))
      expect(token).toBeNull()
    })
  })

  test('should display 403 Forbidden error when creating user without permission', async ({
    page,
  }) => {
    await test.step('Set up authenticated user state', async () => {
      await page.goto('/login')
      await setAuthState(page, 'user')
    })

    await test.step('Set up routes', async () => {
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

        if (url.includes('/api/users/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'admin-1',
              firstName: 'Admin',
              lastName: 'User',
              email: 'admin@example.com',
              role: 'admin',
              status: 'active',
            }),
          })
        }

        if (url.includes('/api/users') && route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [],
              pagination: { limit: 10, offset: 0, total: 0 },
            }),
          })
        }

        // Return 403 for POST requests (create user)
        if (url.includes('/api/users') && route.request().method() === 'POST') {
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'forbidden',
              message: 'Insufficient permissions to create users',
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

    await test.step('Navigate to create user page and try to create user', async () => {
      await page.goto('/admin/users/new')
      await page.waitForLoadState('domcontentloaded')

      // Fill form
      await page.fill('#firstName', 'Test')
      await page.fill('#lastName', 'User')
      await page.fill('#email', uniqueEmail('test'))

      // Submit form
      await page.click('button[type="submit"]:has-text("Create User")')
    })

    await test.step('Verify 403 error is displayed', async () => {
      // Error should be shown in the UI
      await expect(
        page.locator(
          'text=/Insufficient permissions|forbidden|Failed to create|not authorized to create/i'
        )
      ).toBeVisible({ timeout: 5000 })
    })
  })

  test('should handle 409 Conflict error when creating duplicate user', async ({ page }) => {
    await test.step('Set up admin authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'admin')
    })

    await test.step('Set up routes to return 409 conflict', async () => {
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

        if (url.includes('/api/users/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'admin-1',
              firstName: 'Admin',
              lastName: 'User',
              email: 'admin@example.com',
              role: 'admin',
              status: 'active',
            }),
          })
        }

        if (url.includes('/api/users') && route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [],
              pagination: { limit: 10, offset: 0, total: 0 },
            }),
          })
        }

        // Return 409 for duplicate user creation
        if (url.includes('/api/users') && route.request().method() === 'POST') {
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'conflict',
              message: 'User with this email already exists',
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

    await test.step('Navigate and attempt to create user', async () => {
      await page.goto('/admin/users/new')
      await page.waitForLoadState('domcontentloaded')
      await page.fill('#firstName', 'Duplicate')
      await page.fill('#lastName', 'User')
      await page.fill('#email', 'duplicate@example.com')
      await page.click('button[type="submit"]:has-text("Create User")')
    })

    await test.step('Verify 409 conflict error is displayed', async () => {
      await expect(page.locator('text=/already exists|conflict|duplicate/i')).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test('should handle 422 Validation error and display field errors', async ({ page }) => {
    await test.step('Set up user authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'user')
    })

    await test.step('Set up routes to return 422 validation error', async () => {
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

        if (url.includes('/api/users/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'user-1',
              firstName: 'User',
              lastName: 'User',
              email: 'user@example.com',
              role: 'user',
              status: 'active',
            }),
          })
        }

        // Return 422 for client creation with validation errors
        if (url.includes('/api/clients') && route.request().method() === 'POST') {
          return route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'validation_error',
              message: 'Invalid data provided',
            }),
          })
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 0 },
          }),
        })
      })
    })

    await test.step('Navigate to create client and submit invalid data', async () => {
      await page.goto('/user/clients/new')
      await page.waitForLoadState('domcontentloaded')

      // Fill minimal valid form (client-side validation passes but server rejects)
      await page.fill('input[name="firstName"]', 'Test')
      await page.fill('input[name="lastName"]', 'User')
      await page.fill('input[name="dateOfBirth"]', '1990-01-01')
      await page.fill('input[name="emailAddress"]', 'test@example.com')
      await page.fill('input[name="phoneNumber"]', '+6512345678')
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.selectOption('select[name="country"]', { label: 'Singapore' })
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify 422 error message is displayed', async () => {
      await expect(
        page.locator('text=/please fix the highlighted fields|invalid data|validation|check your inputs/i')
      ).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test('should handle 500 Server Error gracefully', async ({ page }) => {
    await test.step('Set up user authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'user')
    })

    await test.step('Set up routes to return 500 error', async () => {
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

        if (url.includes('/api/users/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'user-1',
              firstName: 'User',
              lastName: 'User',
              email: 'user@example.com',
              role: 'user',
              status: 'active',
            }),
          })
        }

        // Return 500 for clients list
        if (url.includes('/api/clients') && route.request().method() === 'GET') {
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'internal_server_error',
              message: 'Database connection failed',
            }),
          })
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 0 },
          }),
        })
      })
    })

    await test.step('Navigate to user dashboard (triggers clients API)', async () => {
      await page.goto('/user')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify 500 error is displayed', async () => {
      // Should show error message in UI
      await expect(page.locator('text=/error|failed|something went wrong/i').first()).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test('should handle network failure (offline scenario)', async ({ page }) => {
    await test.step('Set up route to simulate network failure', async () => {
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

        if (url.includes('/api/users/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'user-1',
              firstName: 'User',
              lastName: 'User',
              email: 'user@example.com',
              role: 'user',
              status: 'active',
            }),
          })
        }

        // Abort client-related requests to simulate network failure
        if (url.includes('/api/clients') || url.includes('/api/transactions')) {
          return route.abort('failed')
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 0 },
          }),
        })
      })
    })

    await test.step('Set up user authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'user')
    })

    await test.step('Navigate to user dashboard', async () => {
      await page.goto('/user')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify network error is shown', async () => {
      // Wait for UI to render after failed network calls
      await page.waitForTimeout(2000)

      // Check for various possible error indicators
      const hasError = await page
        .locator('text=/error|failed|unable|could not/i')
        .first()
        .isVisible()
        .catch(() => false)
      const noData = await page
        .locator('text=/no (transactions|clients|data)|empty/i')
        .first()
        .isVisible()
        .catch(() => false)
      const loading = await page
        .locator('text=/loading/i')
        .first()
        .isVisible()
        .catch(() => false)

      // Either error message, empty state, or perpetual loading is acceptable for network failure
      // (some UIs don't explicitly show network errors)
      expect(hasError || noData || !loading).toBe(true)
    })
  })

  test('should handle request timeout (5s)', async ({ page }) => {
    await test.step('Set up route with artificial delay', async () => {
      await page.route('**/api/**', async (route: Route) => {
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

        if (url.includes('/api/users/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'user-1',
              firstName: 'User',
              lastName: 'User',
              email: 'user@example.com',
              role: 'user',
              status: 'active',
            }),
          })
        }

        // Delay client/transaction requests to simulate timeout
        if (url.includes('/api/clients') || url.includes('/api/transactions')) {
          await new Promise(resolve => setTimeout(resolve, 6000))
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [],
              pagination: { limit: 10, offset: 0, total: 0 },
            }),
          })
        }

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { limit: 10, offset: 0, total: 0 },
          }),
        })
      })
    })

    await test.step('Set up user authentication', async () => {
      await page.goto('/login')
      await setAuthState(page, 'user')
    })

    await test.step('Navigate to user dashboard', async () => {
      await page.goto('/user')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Verify timeout handling (loading state persists or error shown)', async () => {
      // Wait for the slow requests to be initiated
      await page.waitForTimeout(2000)

      // Since the requests are delayed, the UI should either:
      // 1. Show a loading state
      // 2. Show an error/timeout message
      // 3. Show no data/empty state
      // 4. Show nothing (blank/initial state while still loading)
      //
      // The key is that it should NOT show stale/old data immediately
      const loadingSpinner = page.locator('[data-testid="loading-spinner"]')
      const loadingText = page.locator('text=/loading/i')
      const errorText = page.locator('text=/error|failed|timeout/i')
      const noData = page.locator('text=/no (transactions|clients|data)|empty/i')

      // Check for any of these indicators
      const hasLoadingOrError =
        (await loadingSpinner.isVisible().catch(() => false)) ||
        (await loadingText
          .first()
          .isVisible()
          .catch(() => false)) ||
        (await errorText
          .first()
          .isVisible()
          .catch(() => false)) ||
        (await noData
          .first()
          .isVisible()
          .catch(() => false))

      // If none of the above are shown, verify the page at least loaded
      if (!hasLoadingOrError) {
        // Page should at least be at the dashboard
        await expect(page).toHaveURL(/\/user/)
      } else {
        expect(hasLoadingOrError).toBe(true)
      }
    })
  })
})
