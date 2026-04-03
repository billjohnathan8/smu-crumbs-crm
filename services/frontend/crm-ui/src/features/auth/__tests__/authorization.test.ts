import { describe, expect, it } from 'vitest'
import { isRootAdminUser } from '../authorization'

describe('isRootAdminUser', () => {
  it('returns false for nullish user', () => {
    expect(isRootAdminUser(null)).toBe(false)
    expect(isRootAdminUser(undefined)).toBe(false)
  })

  it('returns true for seeded root id', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'admin' })).toBe(true)
  })

  it('returns true for legacy numeric root id and superadmin role', () => {
    expect(isRootAdminUser({ id: '1', role: 'superadmin' })).toBe(true)
  })

  it('returns false for root id with non-root role', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'user' })).toBe(false)
  })

  it('returns true for canonical root email with admin role', () => {
    expect(isRootAdminUser({ id: 'custom-root-id', email: 'admin@crm.com', role: 'admin' })).toBe(
      true
    )
  })

  it('returns true for canonical root email when role is missing', () => {
    expect(isRootAdminUser({ email: 'admin@crm.com' })).toBe(true)
  })

  it('normalizes user fields before evaluation', () => {
    expect(isRootAdminUser({ id: ' USR_1 ', role: ' ADMIN ' })).toBe(true)
  })

  it('returns false for non-root email', () => {
    expect(
      isRootAdminUser({ id: 'custom-root-id', email: 'alice@example.com', role: 'admin' })
    ).toBe(false)
  })
})
