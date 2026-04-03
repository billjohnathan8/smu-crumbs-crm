import { describe, it, expect } from 'vitest'
import {
  COUNTRY_OPTIONS,
  getPostalCodeRule,
  isPostalCodeValidForCountry,
} from '../postalCodeRules'

describe('postalCodeRules', () => {
  it('exposes supported country options including fallback', () => {
    expect(COUNTRY_OPTIONS).toContain('Singapore')
    expect(COUNTRY_OPTIONS).toContain('Other')
  })

  it('matches rules case-insensitively and trims country input', () => {
    const rule = getPostalCodeRule('  singapore  ')
    expect(rule.country).toBe('Singapore')
    expect(rule.hint).toContain('6 digits')
  })

  it('falls back to Other rule for unknown countries', () => {
    const rule = getPostalCodeRule('Mars')
    expect(rule.country).toBe('Other')
    expect(rule.hint).toContain('4-10')
  })

  it('validates country-specific formats', () => {
    expect(isPostalCodeValidForCountry('Singapore', '238801')).toBe(true)
    expect(isPostalCodeValidForCountry('United States', '12345-6789')).toBe(true)
    expect(isPostalCodeValidForCountry('Japan', '1234567')).toBe(true)
    expect(isPostalCodeValidForCountry('Japan', '123-4567')).toBe(true)
  })

  it('rejects empty, too short, and too long values', () => {
    expect(isPostalCodeValidForCountry('Singapore', '')).toBe(false)
    expect(isPostalCodeValidForCountry('Singapore', '12')).toBe(false)
    expect(isPostalCodeValidForCountry('Singapore', '12345678901')).toBe(false)
  })

  it('applies fallback validation for unknown countries', () => {
    expect(isPostalCodeValidForCountry('Unknownland', 'A12-9')).toBe(true)
    expect(isPostalCodeValidForCountry('Unknownland', '!!!')).toBe(false)
  })
})
