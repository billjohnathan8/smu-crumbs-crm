export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const SPECIAL_CHARACTER_REGEX = /[^A-Za-z0-9\s]/

export type PasswordRule = {
  label: string
  passed: boolean
}

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    {
      label: `Use ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      passed: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      label: 'Include lowercase and uppercase letters (case-sensitive)',
      passed: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    {
      label: 'Include at least one number',
      passed: /[0-9]/.test(password),
    },
    {
      label: 'Include at least one special character',
      passed: SPECIAL_CHARACTER_REGEX.test(password),
    },
  ]
}

export function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  const rules = getPasswordRules(password)
  const passedCount = rules.filter(rule => rule.passed).length
  const longEnoughForStrong = password.length >= 12

  if (passedCount <= 1) return 'weak'
  if (passedCount < rules.length || !longEnoughForStrong) return 'medium'
  return 'strong'
}

export function getPasswordStrengthPercent(strength: 'weak' | 'medium' | 'strong'): number {
  if (strength === 'weak') return 33
  if (strength === 'medium') return 66
  return 100
}
