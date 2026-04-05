import { describe, expect, it } from 'vitest'
import { isRootAdminUser } from '../authorization'

describe('isRootAdminUser', () => {
  it('returns false for nullish user', () => {
    expect(isRootAdminUser(null)).toBe(false)
    expect(isRootAdminUser(undefined)).toBe(false)
  })

  it('trusts explicit backend isRootAdmin=true claim', () => {
    expect(isRootAdminUser({ id: 'custom-id', role: 'user', isRootAdmin: true })).toBe(true)
  })

  it('trusts explicit backend isRootAdmin=false claim', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'admin', isRootAdmin: false })).toBe(false)
  })

  it('returns true for seeded root id', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'admin' })).toBe(true)
  })

  it('returns true for seeded root id with superadmin role alias', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'superadmin' })).toBe(true)
  })

  it('returns false for root id with non-root role', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'user' })).toBe(false)
  })

  it('returns false for legacy numeric root id fallback', () => {
    expect(isRootAdminUser({ id: '1', role: 'admin' })).toBe(false)
  })

  it('returns false when role is missing', () => {
    expect(isRootAdminUser({ id: 'usr_1' })).toBe(false)
  })

  it('normalizes user fields before evaluation', () => {
    expect(isRootAdminUser({ id: ' USR_1 ', role: ' ADMIN ' })).toBe(true)
  })

  it('returns false for non-root identity without explicit claim', () => {
    expect(isRootAdminUser({ id: 'custom-root-id', role: 'admin' })).toBe(false)
  })
})
