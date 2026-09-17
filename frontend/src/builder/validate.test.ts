import { describe, expect, it } from 'vitest'
import { getMachineUsage, validateDraft } from './validate'
import type { BuilderDraft } from './types'

function validDraft(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('validateDraft', () => {
  it('accepts a minimal valid draft', () => {
    expect(validateDraft(validDraft()).isValid).toBe(true)
  })

  it('rejects an empty machine name', () => {
    const draft = validDraft()
    draft.machines[0].name = ''
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.machineErrors.m1).toBeTruthy()
  })

  it('rejects duplicate machine names', () => {
    const draft = validDraft()
    draft.machines.push({ id: 'm2', name: 'M1' })
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.machineErrors.m1).toBeTruthy()
    expect(result.machineErrors.m2).toBeTruthy()
  })

  it('rejects an empty jobs list', () => {
    const draft = validDraft()
    draft.jobs = []
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.problemErrors.length).toBeGreaterThan(0)
  })

  it('rejects a job with zero operations', () => {
    const draft = validDraft()
    draft.jobs[0].operations = []
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.jobErrors.j1?.message).toBeTruthy()
  })

  it('rejects an operation with no machine selected', () => {
    const draft = validDraft()
    draft.jobs[0].operations[0].machineId = ''
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.jobErrors.j1?.operationErrors?.o1).toBeTruthy()
  })

  it('rejects an operation with duration <= 0', () => {
    const draft = validDraft()
    draft.jobs[0].operations[0].duration = 0
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.jobErrors.j1?.operationErrors?.o1).toBeTruthy()
  })

  it('rejects a negative due date', () => {
    const draft = validDraft()
    draft.jobs[0].dueDate = -1
    expect(validateDraft(draft).isValid).toBe(false)
  })

  it('rejects a weight below 1', () => {
    const draft = validDraft()
    draft.jobs[0].dueDate = 5
    draft.jobs[0].weight = 0
    expect(validateDraft(draft).isValid).toBe(false)
  })

  it('rejects a setup time referencing an unknown machine', () => {
    const draft = validDraft()
    draft.setupTimes = { unknown: 5 }
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.problemErrors.length).toBeGreaterThan(0)
  })

  it('rejects a downtime window with end <= start', () => {
    const draft = validDraft()
    draft.downtimeWindows = [{ machineId: 'm1', start: 10, end: 5 }]
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.problemErrors.length).toBeGreaterThan(0)
  })
})

describe('getMachineUsage', () => {
  it('reports machines referenced by an operation', () => {
    expect(getMachineUsage(validDraft()).has('m1')).toBe(true)
  })

  it('reports machines referenced by setup times or downtime windows', () => {
    const draft = validDraft()
    draft.jobs[0].operations[0].machineId = ''
    draft.setupTimes = { m1: 5 }
    expect(getMachineUsage(draft).has('m1')).toBe(true)
  })

  it('does not report an unused machine', () => {
    const draft = validDraft()
    draft.machines.push({ id: 'm2', name: 'M2' })
    expect(getMachineUsage(draft).has('m2')).toBe(false)
  })
})
