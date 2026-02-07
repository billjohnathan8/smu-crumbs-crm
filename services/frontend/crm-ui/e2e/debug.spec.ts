import { test } from '@playwright/test'

test('debug console errors', async ({ page }) => {
  // Capture console messages
  page.on('console', (msg) => {
    console.warn(`[BROWSER ${msg.type()}]:`, msg.text())
  })

  // Capture page errors
  page.on('pageerror', (error) => {
    console.error('[PAGE ERROR]:', error.message)
    console.error('[STACK]:', error.stack)
  })

  // Set up route mocking just like the actual tests
  await page.route('**/api/**', (route) => {
    const url = route.request().url()

    if (url.includes('/api/auth/login')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-agent-token',
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
          id: 'agent-1',
          firstName: 'Agent',
          lastName: 'User',
          email: 'agent@example.com',
          role: 'agent',
          status: 'active',
        }),
      })
    }

    route.continue()
  })

  // Navigate to the app
  await page.goto('http://localhost:4173/login')

  // Take initial screenshot
  await page.screenshot({ path: 'debug-before-fill.png', fullPage: true })

  console.warn('Page title:', await page.title())
  console.warn('Page URL:', page.url())

  // Try to fill the form like the actual tests
  console.warn('Waiting for email input...')
  await page.fill('input[type="email"]', 'agent@example.com')
  console.warn('Email filled!')

  await page.fill('input[type="password"]', 'password123')
  console.warn('Password filled!')

  await page.screenshot({ path: 'debug-after-fill.png', fullPage: true })

  await page.click('button[type="submit"]')
  console.warn('Submit clicked!')

  await page.waitForTimeout(2000)

  await page.screenshot({ path: 'debug-after-submit.png', fullPage: true })
  console.warn('Final URL:', page.url())
})
