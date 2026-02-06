import { Page } from '@playwright/test'

export async function setupAdminRoutes(page: Page) {
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

    if (url.includes('/api/agents') && route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'agent-1',
              firstName: 'Agent',
              lastName: 'One',
              email: 'agent1@example.com',
              role: 'agent',
              status: 'active',
            },
            {
              id: 'agent-2',
              firstName: 'Agent',
              lastName: 'Two',
              email: 'agent2@example.com',
              role: 'agent',
              status: 'active',
            },
          ],
          pagination: {
            limit: 10,
            offset: 0,
            total: 2,
          },
        }),
      })
    }

    if (url.includes('/api/clients')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { limit: 10, offset: 0, total: 5 },
        }),
      })
    }

    if (url.includes('/api/logs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              logId: 'log-1',
              action: 'CREATE',
              attributeName: 'client',
              agentId: 'agent-1',
              clientId: 'client-1',
              dateTime: '2024-01-15T10:30:00Z',
            },
          ],
          pagination: { limit: 10, offset: 0, total: 10 },
        }),
      })
    }

    route.continue()
  })
}

export async function setupAgentRoutes(page: Page) {
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

    if (url.includes('/api/clients') && route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          clientId: 'new-client-123',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          gender: 'Male',
          emailAddress: 'john.doe@example.com',
          phoneNumber: '+65 12345678',
          address: '123 Main St',
          city: 'Singapore',
          state: 'Singapore',
          country: 'Singapore',
          postalCode: '123456',
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
          pagination: { limit: 10, offset: 0, total: 3 },
        }),
      })
    }

    if (url.includes('/api/transactions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'txn-1',
              clientId: 'client-1',
              transaction: 'D',
              amount: 1000.0,
              date: '2024-01-15T10:30:00Z',
              status: 'Completed',
            },
            {
              id: 'txn-2',
              clientId: 'client-2',
              transaction: 'W',
              amount: 500.0,
              date: '2024-01-16T14:20:00Z',
              status: 'Pending',
            },
          ],
          pagination: { limit: 20, offset: 0, total: 2 },
        }),
      })
    }

    if (url.includes('/api/logs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { limit: 10, offset: 0, total: 0 },
        }),
      })
    }

    route.continue()
  })
}
