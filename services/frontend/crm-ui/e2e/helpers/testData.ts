/**
 * Generate unique test data to avoid conflicts
 */

/**
 * Generate a unique timestamp-based ID
 */
export function uniqueId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique email address
 */
export function uniqueEmail(prefix = "test"): string {
  return `${prefix}-${Date.now()}@example.com`;
}

/**
 * Generate a unique phone number (E164 format for Singapore)
 */
export function uniquePhone(): string {
  const rand = Math.floor(Math.random() * 90000000) + 10000000;
  return `+65${rand.toString()}`;
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
