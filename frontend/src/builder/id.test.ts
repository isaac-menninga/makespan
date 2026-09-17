import { describe, expect, it } from 'vitest'
import { generateId } from './id'

describe('generateId', () => {
  it('generates unique ids', () => {
    expect(generateId()).not.toBe(generateId())
  })

  it('generates a UUID-shaped string', () => {
    expect(generateId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})
