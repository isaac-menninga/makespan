import { describe, expect, it } from 'vitest'
import { hydrate, hydrateSpec, serialize } from './transform'
import type { BuilderDraft } from './types'

describe('hydrateSpec', () => {
  it('assigns an id to every machine, job, and operation', () => {
    const draft = hydrateSpec({
      machines: ['M1', 'M2'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 3 }] }],
    })

    expect(draft.machines).toHaveLength(2)
    expect(draft.machines[0].id).toBeTruthy()
    expect(draft.jobs[0].id).toBeTruthy()
    expect(draft.jobs[0].operations[0].id).toBeTruthy()
  })

  it('points an operation at its machine by id, not by name', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 3 }] }],
    })

    expect(draft.jobs[0].operations[0].machineId).toBe(draft.machines[0].id)
  })

  it('maps due_dates onto the job at that index', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [
        { operations: [{ machine_id: 'M1', duration: 1 }] },
        { operations: [{ machine_id: 'M1', duration: 2 }] },
      ],
      constraints: { due_dates: [{ job_index: 1, due: 10, weight: 2 }] },
    })

    expect(draft.jobs[0].dueDate).toBeUndefined()
    expect(draft.jobs[1].dueDate).toBe(10)
    expect(draft.jobs[1].weight).toBe(2)
  })

  it('converts setup_times and downtime_windows to machine-id keys', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {
        setup_times: { M1: 5 },
        downtime_windows: [{ machine_id: 'M1', start: 0, end: 10 }],
      },
    })

    const machineId = draft.machines[0].id
    expect(draft.setupTimes).toEqual({ [machineId]: 5 })
    expect(draft.downtimeWindows).toEqual([{ machineId, start: 0, end: 10 }])
  })

  it('preserves an unresolvable machine reference rather than silently dropping it', () => {
    // Backend guarantees GET-returned data always has valid references, so this
    // path is only exercised by the shared fixtures in Task 4 (which feed in
    // deliberately invalid wire-format data) — it must not eat the evidence
    // validateDraft needs to flag it.
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M2', duration: 1 }] }],
      constraints: { setup_times: { M2: 5 } },
    })

    expect(draft.jobs[0].operations[0].machineId).toBe('M2')
    expect(draft.setupTimes).toEqual({ M2: 5 })
  })

  it('hydrateSpec carries a job name through', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }], name: 'Rush order' }],
    })
    expect(draft.jobs[0].name).toBe('Rush order')
  })
})

describe('hydrate', () => {
  it('carries the problem name through', () => {
    const draft = hydrate({
      id: 'abc',
      name: 'My problem',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    })

    expect(draft.name).toBe('My problem')
  })
})

describe('serialize', () => {
  function draft(overrides: Partial<BuilderDraft> = {}): BuilderDraft {
    return {
      name: 'Demo',
      machines: [{ id: 'm1', name: 'M1' }],
      jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
      setupTimes: {},
      downtimeWindows: [],
      ...overrides,
    }
  }

  it('converts machine ids back to names in operations', () => {
    const result = serialize(draft())
    expect(result.jobs[0].operations[0].machine_id).toBe('M1')
  })

  it('computes due_dates from job order and the dueDate/weight fields', () => {
    const result = serialize(
      draft({
        jobs: [
          { id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 1 }] },
          {
            id: 'j2',
            operations: [{ id: 'o2', machineId: 'm1', duration: 1 }],
            dueDate: 10,
            weight: 3,
          },
        ],
      }),
    )

    expect(result.constraints?.due_dates).toEqual([{ job_index: 1, due: 10, weight: 3 }])
  })

  it('defaults weight to 1 when a due date has no explicit weight', () => {
    const result = serialize(
      draft({
        jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 1 }], dueDate: 5 }],
      }),
    )

    expect(result.constraints?.due_dates).toEqual([{ job_index: 0, due: 5, weight: 1 }])
  })

  it('converts setupTimes and downtimeWindows back to machine-name keys', () => {
    const result = serialize(
      draft({
        setupTimes: { m1: 5 },
        downtimeWindows: [{ machineId: 'm1', start: 0, end: 10 }],
      }),
    )

    expect(result.constraints?.setup_times).toEqual({ M1: 5 })
    expect(result.constraints?.downtime_windows).toEqual([{ machine_id: 'M1', start: 0, end: 10 }])
  })

  it('serialize includes a job name when set, and omits it when unset', () => {
    const draft_input: BuilderDraft = {
      name: 'Demo',
      machines: [{ id: 'm1', name: 'M1' }],
      jobs: [
        { id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 1 }], name: 'Rush order' },
        { id: 'j2', operations: [{ id: 'o2', machineId: 'm1', duration: 1 }] },
      ],
      setupTimes: {},
      downtimeWindows: [],
    }
    const result = serialize(draft_input)
    expect(result.jobs[0].name).toBe('Rush order')
    expect(result.jobs[1].name).toBeUndefined()
  })
})

describe('round trip', () => {
  it('hydrate then serialize reproduces the original problem shape', () => {
    const original = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1', 'M2'],
      jobs: [
        {
          operations: [
            { machine_id: 'M1', duration: 3 },
            { machine_id: 'M2', duration: 2 },
          ],
        },
        { operations: [{ machine_id: 'M2', duration: 4 }] },
      ],
      constraints: {
        setup_times: { M1: 2 },
        due_dates: [{ job_index: 1, due: 20, weight: 1 }],
        downtime_windows: [{ machine_id: 'M2', start: 0, end: 5 }],
      },
    }

    const result = serialize(hydrate(original))

    expect(result).toEqual({
      name: original.name,
      machines: original.machines,
      jobs: original.jobs,
      constraints: original.constraints,
    })
  })
})
