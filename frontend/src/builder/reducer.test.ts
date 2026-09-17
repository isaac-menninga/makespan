import { describe, expect, it } from 'vitest'
import { builderReducer } from './reducer'
import type { BuilderDraft } from './types'

function baseDraft(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('builderReducer', () => {
  it('setName updates the name', () => {
    const result = builderReducer(baseDraft(), { type: 'setName', name: 'Renamed' })
    expect(result.name).toBe('Renamed')
  })

  it('addMachine appends a new, empty-named machine', () => {
    const result = builderReducer(baseDraft(), { type: 'addMachine' })
    expect(result.machines).toHaveLength(2)
    expect(result.machines[1].name).toBe('')
  })

  it('renameMachine updates only the targeted machine, leaving operation references untouched', () => {
    const result = builderReducer(baseDraft(), {
      type: 'renameMachine',
      machineId: 'm1',
      name: 'Renamed',
    })
    expect(result.machines[0].name).toBe('Renamed')
    expect(result.jobs[0].operations[0].machineId).toBe('m1')
  })

  it('removeMachine removes a machine that is not in use', () => {
    const draft = baseDraft()
    draft.machines.push({ id: 'm2', name: 'M2' })
    const result = builderReducer(draft, { type: 'removeMachine', machineId: 'm2' })
    expect(result.machines).toHaveLength(1)
  })

  it('removeMachine is a no-op for a machine referenced by an operation', () => {
    const draft = baseDraft()
    const result = builderReducer(draft, { type: 'removeMachine', machineId: 'm1' })
    expect(result.machines).toHaveLength(1)
  })

  it('addJob appends a job seeded with one operation on the first machine', () => {
    const result = builderReducer(baseDraft(), { type: 'addJob' })
    expect(result.jobs).toHaveLength(2)
    expect(result.jobs[1].operations).toHaveLength(1)
    expect(result.jobs[1].operations[0].machineId).toBe('m1')
  })

  it('removeJob removes a job when more than one exists', () => {
    const draft = builderReducer(baseDraft(), { type: 'addJob' })
    const result = builderReducer(draft, { type: 'removeJob', jobId: draft.jobs[0].id })
    expect(result.jobs).toHaveLength(1)
  })

  it('removeJob is a no-op when it is the last job', () => {
    const result = builderReducer(baseDraft(), { type: 'removeJob', jobId: 'j1' })
    expect(result.jobs).toHaveLength(1)
  })

  it('addOperation appends an operation to the targeted job', () => {
    const result = builderReducer(baseDraft(), { type: 'addOperation', jobId: 'j1' })
    expect(result.jobs[0].operations).toHaveLength(2)
  })

  it('removeOperation removes an operation when more than one exists', () => {
    const draft = builderReducer(baseDraft(), { type: 'addOperation', jobId: 'j1' })
    const result = builderReducer(draft, {
      type: 'removeOperation',
      jobId: 'j1',
      operationId: 'o1',
    })
    expect(result.jobs[0].operations).toHaveLength(1)
    expect(result.jobs[0].operations[0].id).not.toBe('o1')
  })

  it('removeOperation is a no-op when it is the last operation in the job', () => {
    const result = builderReducer(baseDraft(), {
      type: 'removeOperation',
      jobId: 'j1',
      operationId: 'o1',
    })
    expect(result.jobs[0].operations).toHaveLength(1)
  })

  it('reorderOperation swaps an operation with its neighbor', () => {
    let draft = builderReducer(baseDraft(), { type: 'addOperation', jobId: 'j1' })
    const secondId = draft.jobs[0].operations[1].id
    draft = builderReducer(draft, {
      type: 'reorderOperation',
      jobId: 'j1',
      operationId: secondId,
      direction: 'up',
    })
    expect(draft.jobs[0].operations[0].id).toBe(secondId)
  })

  it('reorderOperation is a no-op at the boundary', () => {
    const result = builderReducer(baseDraft(), {
      type: 'reorderOperation',
      jobId: 'j1',
      operationId: 'o1',
      direction: 'up',
    })
    expect(result.jobs[0].operations[0].id).toBe('o1')
  })

  it('updateOperation updates the machine reference', () => {
    const draft = baseDraft()
    draft.machines.push({ id: 'm2', name: 'M2' })
    const result = builderReducer(draft, {
      type: 'updateOperation',
      jobId: 'j1',
      operationId: 'o1',
      field: 'machineId',
      value: 'm2',
    })
    expect(result.jobs[0].operations[0].machineId).toBe('m2')
  })

  it('updateOperation updates the duration', () => {
    const result = builderReducer(baseDraft(), {
      type: 'updateOperation',
      jobId: 'j1',
      operationId: 'o1',
      field: 'duration',
      value: 7,
    })
    expect(result.jobs[0].operations[0].duration).toBe(7)
  })

  it('setJobDueDate and setJobWeight update the targeted job', () => {
    let draft = builderReducer(baseDraft(), { type: 'setJobDueDate', jobId: 'j1', dueDate: 10 })
    draft = builderReducer(draft, { type: 'setJobWeight', jobId: 'j1', weight: 2 })
    expect(draft.jobs[0].dueDate).toBe(10)
    expect(draft.jobs[0].weight).toBe(2)
  })

  it('never mutates the input draft', () => {
    const draft = baseDraft()
    const result = builderReducer(draft, { type: 'setName', name: 'Renamed' })
    expect(draft.name).toBe('Demo')
    expect(result).not.toBe(draft)
  })
})
