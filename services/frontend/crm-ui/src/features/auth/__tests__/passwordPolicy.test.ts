import { describe, expect, it } from 'vitest'
import { getPasswordRules, getPasswordStrength } from '@/features/auth/passwordPolicy'

describe('passwordPolicy', () => {
  it('returns medium when required rules pass but length is under good threshold', () => {
    expect(getPasswordStrength('Abcdef1!')).toBe('medium')
  })

  it('returns good when required rules pass and length is at least 12', () => {
    expect(getPasswordStrength('Abcdefghij1!')).toBe('good')
  })

  it('marks only measurable policy checks as required', () => {
    const rules = getPasswordRules('Abcdef1!')
    const requiredRules = rules.filter(rule => rule.required)
    const optionalRules = rules.filter(rule => !rule.required)

    expect(requiredRules).toHaveLength(4)
    expect(optionalRules).toHaveLength(1)
    expect(optionalRules[0].label).toMatch(/at least 12 characters/i)
  })
})
