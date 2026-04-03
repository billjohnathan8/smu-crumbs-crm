export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const SPECIAL_CHARACTER_REGEX = /[^A-Za-z0-9\s]/

export type PasswordRule = {
  label: string
  passed: boolean
  required: boolean
}

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    {
      label: `Use ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      passed: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
      required: true,
    },
    {
      label: 'Include lowercase and uppercase letters (case-sensitive)',
      passed: /[a-z]/.test(password) && /[A-Z]/.test(password),
      required: true,
    },
    {
      label: 'Include at least one number',
      passed: /[0-9]/.test(password),
      required: true,
    },
    {
      label: 'Include at least one special character',
      passed: SPECIAL_CHARACTER_REGEX.test(password),
      required: true,
    },
    {
      label: 'Use at least 12 characters for Good strength',
      passed: password.length >= 12,
      required: false,
    },
  ]
}

export function getPasswordStrength(password: string): 'weak' | 'medium' | 'good' {
  const rules = getPasswordRules(password)
  const requiredRules = rules.filter(rule => rule.required)
  const requiredPassedCount = requiredRules.filter(rule => rule.passed).length
  const allRequiredPassed = requiredPassedCount === requiredRules.length
  const goodBonusPassed = rules.some(rule => !rule.required && rule.passed)

  if (requiredPassedCount <= 1) return 'weak'
  if (!allRequiredPassed) return 'medium'
  return goodBonusPassed ? 'good' : 'medium'
}

export function getPasswordStrengthPercent(strength: 'weak' | 'medium' | 'good'): number {
  if (strength === 'weak') return 33
  if (strength === 'medium') return 66
  return 100
}
