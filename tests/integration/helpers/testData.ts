/**
 * Generate unique test data to avoid conflicts
 */

const TEST_RUN_TAG = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
let uniqueCounter = 0;

function nextUniqueCounter(): number {
  uniqueCounter += 1;
  return uniqueCounter;
}

/**
 * Generate a unique timestamp-based ID
 */
export function uniqueId(): string {
  return `test-${TEST_RUN_TAG}-${nextUniqueCounter()}`;
}

/**
 * Generate a unique email address
 */
export function uniqueEmail(prefix = "test"): string {
  return `${prefix}-${TEST_RUN_TAG}-${nextUniqueCounter()}@example.com`;
}

/**
 * Generate a unique phone number (E164 format for Singapore)
 */
export function uniquePhone(): string {
  const rand = Math.floor(Math.random() * 90000000) + 10000000;
  return `+65 ${rand.toString().substring(0, 4)} ${rand.toString().substring(4)}`;
}

/**
 * Get a date of birth for a specific age (in years)
 */
export function dobForAge(age: number): string {
  const today = new Date();
  const year = today.getFullYear() - age;
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
