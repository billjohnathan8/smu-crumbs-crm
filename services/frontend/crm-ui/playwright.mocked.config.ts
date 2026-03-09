import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Playwright configuration for MOCKED e2e tests.
 * 
 * These tests use route mocking and do NOT require a real backend.
 * Integration tests requiring real backend are in tests/integration/.
 * 
 * Run with: npm run e2e:mocked
 */
export default defineConfig({
  ...baseConfig,
  testIgnore: ["e2e/integration/**", "e2e/api-errors/**"],
});
