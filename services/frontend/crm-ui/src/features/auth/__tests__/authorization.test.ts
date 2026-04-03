import { describe, expect, it } from 'vitest'
import { isRootAdminUser } from '../authorization'

describe('isRootAdminUser', () => {
  it('returns true for seeded root id', () => {
    expect(isRootAdminUser({ id: 'usr_1', role: 'admin' })).toBe(true)
  })

  it('returns true for canonical root email with admin role', () => {
    expect(isRootAdminUser({ id: 'custom-root-id', email: 'admin@crm.com', role: 'admin' })).toBe(
      true
    )
  })

  it('returns false for non-root email', () => {
    expect(isRootAdminUser({ id: 'custom-root-id', email: 'alice@example.com', role: 'admin' })).toBe(
      false
    )
  })
})
