import { expect } from '@playwright/test';

/**
 * Measures the latency of an async operation and asserts it's under the threshold.
 *
 * This utility is used to validate the CS301 requirement that frontend operations
 * must complete within 5 seconds.
 *
 * @param operation - Async function to measure
 * @param operationName - Human-readable name for logging
 * @param thresholdMs - Maximum allowed latency in milliseconds (default: 5000)
 * @returns The result of the operation
 * @throws Error if latency exceeds threshold or operation fails
 *
 * @example
 * ```typescript
 * await measureLatency(async () => {
 *   await page.goto('/dashboard');
 *   await expect(page.locator('h1')).toBeVisible();
 * }, 'Dashboard load', 5000);
 * ```
 */
export async function measureLatency<T>(
  operation: () => Promise<T>,
  operationName: string,
  thresholdMs: number = 5000
): Promise<T> {
  const startTime = performance.now();

  try {
    const result = await operation();
    const endTime = performance.now();
    const latencyMs = endTime - startTime;

    logPerformanceMetric(operationName, latencyMs, thresholdMs, latencyMs <= thresholdMs);

    // Assert CS301 latency requirement
    expect(latencyMs,
      `[PERF] ${operationName} took ${latencyMs.toFixed(2)}ms (threshold: ${thresholdMs}ms)`
    ).toBeLessThanOrEqual(thresholdMs);

    return result;
  } catch (error) {
    const endTime = performance.now();
    const latencyMs = endTime - startTime;
    logPerformanceMetric(operationName, latencyMs, thresholdMs, false);
    throw error;
  }
}

/**
 * Logs performance metrics in a standardized format.
 * Output format: [PERF] STATUS | Operation Name | XXXms / THRESHOLDms (XX.X%)
 *
 * @param operationName - Name of the operation
 * @param latencyMs - Measured latency in milliseconds
 * @param threshold - Threshold that was checked against
 * @param passed - Whether the operation passed the threshold check
 */
export function logPerformanceMetric(
  operationName: string,
  latencyMs: number,
  threshold: number,
  passed: boolean
): void {
  const status = passed ? 'PASS' : 'FAIL';
  const percentage = ((latencyMs / threshold) * 100).toFixed(1);

  console.warn(
    `[PERF] ${status} | ${operationName} | ` +
    `${latencyMs.toFixed(2)}ms / ${threshold}ms (${percentage}%)`
  );
}

/**
 * Measures latency with a warning threshold in addition to the hard limit.
 * Useful for detecting performance degradation before it becomes a failure.
 *
 * @param operation - Async function to measure
 * @param operationName - Human-readable name for logging
 * @param warningMs - Latency threshold to log a warning (default: 3000ms)
 * @param thresholdMs - Maximum allowed latency in milliseconds (default: 5000ms)
 * @returns The result of the operation
 */
export async function measureLatencyWithWarning<T>(
  operation: () => Promise<T>,
  operationName: string,
  warningMs: number = 3000,
  thresholdMs: number = 5000
): Promise<T> {
  const startTime = performance.now();

  try {
    const result = await operation();
    const endTime = performance.now();
    const latencyMs = endTime - startTime;

    // Log warning if exceeds warning threshold but not failure threshold
    if (latencyMs > warningMs && latencyMs <= thresholdMs) {
      console.warn(
        `[PERF] WARN | ${operationName} | ` +
        `${latencyMs.toFixed(2)}ms exceeds warning threshold ${warningMs}ms ` +
        `(but within limit ${thresholdMs}ms)`
      );
    }

    logPerformanceMetric(operationName, latencyMs, thresholdMs, latencyMs <= thresholdMs);

    expect(latencyMs,
      `[PERF] ${operationName} took ${latencyMs.toFixed(2)}ms (threshold: ${thresholdMs}ms)`
    ).toBeLessThanOrEqual(thresholdMs);

    return result;
  } catch (error) {
    const endTime = performance.now();
    const latencyMs = endTime - startTime;
    logPerformanceMetric(operationName, latencyMs, thresholdMs, false);
    throw error;
  }
}
