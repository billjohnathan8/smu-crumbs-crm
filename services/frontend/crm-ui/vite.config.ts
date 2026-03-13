import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import path from "path";

const DEFAULT_DEV_API_PROXY_TARGET = "http://localhost:8080";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyEnabled = env.VITE_API_PROXY_ENABLED !== "false";
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || DEFAULT_DEV_API_PROXY_TARGET;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@/api": path.resolve(__dirname, "./src/api"),
        "@/app": path.resolve(__dirname, "./src/app"),
        "@/components": path.resolve(__dirname, "./src/components"),
        "@/features": path.resolve(__dirname, "./src/features"),
        "@/lib": path.resolve(__dirname, "./src/lib"),
        "@/pages": path.resolve(__dirname, "./src/pages"),
        "@/test": path.resolve(__dirname, "./src/test"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: apiProxyEnabled
        ? {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/e2e/**",
        "**/.{idea,git,cache,output,temp}/**",
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov", "json-summary"],
        reportsDirectory: "./coverage",
        exclude: [
          "node_modules/",
          "src/test/",
          "**/*.d.ts",
          "**/*.config.*",
          "**/mockData",
          "dist/",
          "e2e/",
        ],
        thresholds: {
          lines: 55,
          branches: 56,
          functions: 33,
          statements: 54,
        },
      },
    },
  };
});
