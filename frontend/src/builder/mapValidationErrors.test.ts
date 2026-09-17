import { describe, expect, it } from 'vitest'
import { mapValidationErrors } from './mapValidationErrors'
import type { BuilderDraft } from './types'

function draft(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('mapValidationErrors', () => {
  it('maps a machines[N] error to that machine by position', () => {
    const result = mapValidationErrors(
      [{ loc: ['body', 'machines', 0], msg: 'bad machine' }],
      draft(),
    )
    expect(result.machineErrors.m1).toBe('bad machine')
  })

  it('maps a jobs[N].operations[M].duration error to that operation by position', () => {
    const result = mapValidationErrors(
      [{ loc: ['body', 'jobs', 0, 'operations', 0, 'duration'], msg: 'bad duration' }],
      draft(),
    )
    expect(result.jobErrors.j1?.operationErrors?.o1).toBe('bad duration')
  })

  it('maps a jobs[N] error with no sub-path to that job as a message', () => {
    const result = mapValidationErrors([{ loc: ['body', 'jobs', 0], msg: 'bad job' }], draft())
    expect(result.jobErrors.j1?.message).toBe('bad job')
  })

  it('falls back to a problem-level error for an unrecognized or whole-model location', () => {
    const result = mapValidationErrors([{ loc: ['body'], msg: 'cross-field problem' }], draft())
    expect(result.problemErrors).toEqual(['cross-field problem'])
  })

  it('always reports isValid as false', () => {
    const result = mapValidationErrors([{ loc: ['body'], msg: 'x' }], draft())
    expect(result.isValid).toBe(false)
  })
})
