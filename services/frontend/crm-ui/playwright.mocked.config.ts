import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  // Mocked E2E excludes full-stack integration specs run in a separate job.
  testIgnore: ["e2e/integration/**"],
});
