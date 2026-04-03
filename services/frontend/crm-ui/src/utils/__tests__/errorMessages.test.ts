import { describe, expect, it } from 'vitest'
import { getUserFriendlyErrorMessage } from '../errorMessages'

describe('getUserFriendlyErrorMessage', () => {
  it('returns generic message when error code is missing', () => {
    expect(getUserFriendlyErrorMessage()).toBe('An unexpected error occurred. Please try again.')
  })

  it('returns mapped message for known code', () => {
    expect(getUserFriendlyErrorMessage('unauthorized')).toBe(
      'Your session has expired. Please log in again.'
    )
  })

  it('returns generic message for unknown code', () => {
    expect(getUserFriendlyErrorMessage('server_error')).toBe(
      'An unexpected error occurred. Please try again.'
    )
  })
})
