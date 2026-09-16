import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relativeTime'

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-16T12:00:00Z')

  it('formats a time from two days ago', () => {
    expect(formatRelativeTime('2026-09-14T12:00:00Z', now)).toBe('2 days ago')
  })

  it('formats a time from a few minutes ago', () => {
    expect(formatRelativeTime('2026-09-16T11:55:00Z', now)).toBe('5 minutes ago')
  })
})
