export interface PostalCodeRule {
  country: string
  regex: RegExp
  hint: string
}

const FALLBACK_RULE: PostalCodeRule = {
  country: 'Other',
  regex: /^[A-Za-z0-9][A-Za-z0-9 -]{3,9}$/,
  hint: '4-10 letters, numbers, spaces, or hyphens',
}

const RULES: PostalCodeRule[] = [
  { country: 'Singapore', regex: /^\d{6}$/, hint: '6 digits (e.g. 238801)' },
  { country: 'United States', regex: /^\d{5}(?:-\d{4})?$/, hint: '12345 or 12345-6789' },
  {
    country: 'United Kingdom',
    regex: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    hint: 'UK postcode format (e.g. SW1A 1AA)',
  },
  { country: 'Canada', regex: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, hint: 'A1A 1A1' },
  { country: 'Australia', regex: /^\d{4}$/, hint: '4 digits (e.g. 3000)' },
  { country: 'Germany', regex: /^\d{5}$/, hint: '5 digits (e.g. 10115)' },
  { country: 'France', regex: /^\d{5}$/, hint: '5 digits (e.g. 75001)' },
  { country: 'India', regex: /^\d{6}$/, hint: '6 digits (e.g. 110001)' },
  { country: 'Japan', regex: /^\d{3}-?\d{4}$/, hint: '123-4567 or 1234567' },
  FALLBACK_RULE,
]

export const COUNTRY_OPTIONS = RULES.map(rule => rule.country)

export function getPostalCodeRule(country: string): PostalCodeRule {
  const normalized = country.trim().toLowerCase()
  return RULES.find(rule => rule.country.toLowerCase() === normalized) ?? FALLBACK_RULE
}

export function isPostalCodeValidForCountry(country: string, postalCode: string): boolean {
  const normalizedPostalCode = postalCode.trim()
  if (
    !normalizedPostalCode ||
    normalizedPostalCode.length < 4 ||
    normalizedPostalCode.length > 10
  ) {
    return false
  }
  return getPostalCodeRule(country).regex.test(normalizedPostalCode)
}
