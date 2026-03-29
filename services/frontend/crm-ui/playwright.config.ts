import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const useExternalBaseUrl = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL === "true";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Increase timeout to allow for performance measurements
  timeout: 10000, // 10 seconds (5s for operation + overhead)
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["json", { outputFile: "test-results/frontend-latency-results.json" }],
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Enable verbose logging for performance measurements
    video: process.env.CI ? "retain-on-failure" : "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Separate project configuration for dedicated performance tests
  // Run with: npx playwright test --project=performance
  // projects: [
  //   {
  //     name: "functional",
  //     testMatch: /.*\.spec\.ts/,
  //     testIgnore: /performance\.spec\.ts/,
  //   },
  //   {
  //     name: "performance",
  //     testMatch: /performance\.spec\.ts/,
  //     retries: 0, // No retries for performance tests (want true measurements)
  //   },
  // ],

  // For containerized integration tests, CI can provide an already-running
  // external URL and skip launching a local preview server.
  webServer: useExternalBaseUrl
    ? undefined
    : {
        command: "npm run build && npm run preview",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
