import { test, expect, Route } from '@playwright/test'
import { setAuthState } from '../helpers/auth'
import { uniqueEmail, uniquePhone, dobForAge } from '../helpers/testData'

test.describe('Agent Create Client - Validation (Flow 6)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('/login')
    await setAuthState(page, 'agent')
  })

  test('should validate invalid email format', async ({ page }) => {
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

        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not_found' }),
        })
      })
    })

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill form with invalid email', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(25))
      await page.fill('input[name="emailAddress"]', 'invalid-email')
      await page.fill('input[name="phoneNumber"]', '+65 12345678')
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify email validation error', async () => {
      await expect(page.getByText(/invalid email format/i)).toBeVisible()
    })
  })

  test('should validate invalid phone format', async ({ page }) => {
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

        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not_found' }),
        })
      })
    })

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill form with invalid phone', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(25))
      await page.fill('input[name="emailAddress"]', uniqueEmail('john'))
      await page.fill('input[name="phoneNumber"]', '123') // Too short
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify phone validation error', async () => {
      await expect(page.getByText(/invalid phone format|min 8 digits/i)).toBeVisible()
    })
  })

  test('should validate age < 18 years', async ({ page }) => {
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

        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not_found' }),
        })
      })
    })

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill form with age < 18', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(17)) // 17 years old
      await page.fill('input[name="emailAddress"]', uniqueEmail('john'))
      await page.fill('input[name="phoneNumber"]', uniquePhone())
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify age validation error', async () => {
      await expect(page.getByText(/must be at least 18 years old/i)).toBeVisible()
    })
  })

  test('should validate age > 100 years', async ({ page }) => {
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

        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not_found' }),
        })
      })
    })

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill form with age > 100', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(101)) // 101 years old
      await page.fill('input[name="emailAddress"]', uniqueEmail('john'))
      await page.fill('input[name="phoneNumber"]', uniquePhone())
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify age validation error', async () => {
      await expect(page.getByText(/cannot exceed 100 years/i)).toBeVisible()
    })
  })

  test('should handle 409 conflict for duplicate client', async ({ page }) => {
    await test.step('Set up routes to return 409', async () => {
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

        if (url.includes('/api/clients') && route.request().method() === 'POST') {
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'conflict',
              message: 'A client with this email already exists',
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

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill and submit valid form', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(25))
      await page.fill('input[name="emailAddress"]', 'existing@example.com')
      await page.fill('input[name="phoneNumber"]', uniquePhone())
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify 409 conflict error is shown', async () => {
      await expect(page.getByText(/already exists|conflict/i)).toBeVisible({ timeout: 5000 })
    })
  })

  test('should handle 422 validation error from server', async ({ page }) => {
    await test.step('Set up routes to return 422', async () => {
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

        if (url.includes('/api/clients') && route.request().method() === 'POST') {
          return route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'validation_error',
              message: 'Invalid data provided. Please check your inputs.',
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

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill and submit form', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(25))
      await page.fill('input[name="emailAddress"]', uniqueEmail('john'))
      await page.fill('input[name="phoneNumber"]', uniquePhone())
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify 422 validation error is shown', async () => {
      await expect(page.getByText(/invalid data|check your inputs/i)).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test('should handle 401 unauthorized during creation', async ({ page }) => {
    await test.step('Set up routes to return 401', async () => {
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

        if (url.includes('/api/clients') && route.request().method() === 'POST') {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'unauthorized',
              message: 'Session expired',
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

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill and submit form', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(25))
      await page.fill('input[name="emailAddress"]', uniqueEmail('john'))
      await page.fill('input[name="phoneNumber"]', uniquePhone())
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify redirect to login', async () => {
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })
  })

  test('should cancel form and navigate back', async ({ page }) => {
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

        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not_found' }),
        })
      })
    })

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill form partially', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
    })

    await test.step('Click Dashboard link to navigate back', async () => {
      await page.click('a:has-text("Dashboard")')
    })

    await test.step('Verify navigation to agent dashboard', async () => {
      await expect(page).toHaveURL(/\/agent$/, { timeout: 5000 })
    })
  })

  test('should successfully create client with valid data', async ({ page }) => {
    await test.step('Set up routes for successful creation', async () => {
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

        if (url.includes('/api/clients') && route.request().method() === 'POST') {
          const body = route.request().postDataJSON()
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              clientId: 'new-client-123',
              firstName: body.firstName,
              lastName: body.lastName,
              dateOfBirth: body.dateOfBirth,
              gender: body.gender,
              emailAddress: body.emailAddress,
              phoneNumber: body.phoneNumber,
              address: body.address,
              city: body.city,
              state: body.state,
              country: body.country,
              postalCode: body.postalCode,
              identityVerificationStatus: 'unverified',
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

        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not_found' }),
        })
      })
    })

    await test.step('Navigate to create client page', async () => {
      await page.goto('/agent/clients/new')
      await page.waitForLoadState('domcontentloaded')
    })

    await test.step('Fill and submit valid form', async () => {
      await page.fill('input[name="firstName"]', 'John')
      await page.fill('input[name="lastName"]', 'Doe')
      await page.fill('input[name="dateOfBirth"]', dobForAge(30))
      await page.fill('input[name="emailAddress"]', uniqueEmail('john'))
      await page.fill('input[name="phoneNumber"]', uniquePhone())
      await page.fill('input[name="address"]', '123 Test St')
      await page.fill('input[name="city"]', 'Singapore')
      await page.fill('input[name="state"]', 'Singapore')
      await page.fill('input[name="country"]', 'Singapore')
      await page.fill('input[name="postalCode"]', '123456')

      await page.click('button[type="submit"]')
    })

    await test.step('Verify redirect to agent dashboard', async () => {
      await expect(page).toHaveURL(/\/agent$/, { timeout: 5000 })
    })
  })
})
