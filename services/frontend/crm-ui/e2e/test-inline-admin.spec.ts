import { test, expect } from '@playwright/test'

test('inline admin login test', async ({ page }) => {
  // Set up route mocking inline
  await page.route('**/api/**', (route) => {
    const url = route.request().url()

    if (url.includes('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-admin-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
        }),
      })
    }

    if (url.includes('/api/agents/me')) {
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

    route.continue()
  })

  // Navigate and test
  await page.goto('http://localhost:4173/login')

  await page.fill('input[type="email"]', 'admin@example.com')
  await page.fill('input[type="password"]', 'password123')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('http://localhost:4173/admin')
  await expect(page.getByText('Admin Dashboard')).toBeVisible()
})
