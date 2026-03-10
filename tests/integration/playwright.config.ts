import { defineConfig, devices } from '@playwright/test';

/**
 * Integration test configuration for Scroogebank CRM.
 * 
 * These tests require the full system to be running:
 * - Frontend (React UI) on localhost:4173
 * - All backend microservices (agent, client, transaction, log, etc.) on localhost:8080
 * - PostgreSQL database
 * - LocalStack for AWS services
 * 
 * Run system setup:
 *   make dev-setup && make test-and-spinup-all
 * 
 * Run tests:
 *   npm test
 */
export default defineConfig({
  testDir: './',
  fullyParallel: false, // Integration tests should run sequentially to avoid DB conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid concurrent DB operations
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Uncomment to auto-start the system (requires docker-compose)
  webServer: {
    command: 'make test-and-spinup-all',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  */
});
