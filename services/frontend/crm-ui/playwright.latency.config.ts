import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Playwright configuration for Frontend Latency / E2E Latency tests.
 *
 * These tests validate that all frontend operations complete within 5 seconds
 * (CS301 requirement) while ensuring core user flows have reliable expected behavior.
 *
 * Tests use route mocking and do NOT require a real backend.
 * Integration tests requiring real backend are in tests/integration/.
 *
 * Run with: npm run test:e2e:latency
 */
export default defineConfig({
  ...baseConfig,
  workers: process.env.CI ? 2 : 1,
  testIgnore: ["e2e/integration/**"],
});
