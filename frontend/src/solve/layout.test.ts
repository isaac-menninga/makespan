import { describe, expect, it } from 'vitest'
import { computeGanttLayout } from './layout'

describe('computeGanttLayout', () => {
  it('maps each operation to its machine row index and time fractions of the makespan', () => {
    const layout = computeGanttLayout(
      [
        { job_index: 0, operation_index: 0, machine_id: 'M2', start: 0, end: 5 },
        { job_index: 0, operation_index: 1, machine_id: 'M1', start: 5, end: 10 },
      ],
      ['M1', 'M2'],
    )

    expect(layout[0]).toMatchObject({ jobIndex: 0, operationIndex: 0, rowIndex: 1, x: 0, width: 0.5 })
    expect(layout[1]).toMatchObject({ jobIndex: 0, operationIndex: 1, rowIndex: 0, x: 0.5, width: 0.5 })
  })

  it('assigns row index from the machines array position, not from the schedule', () => {
    const layout = computeGanttLayout(
      [{ job_index: 0, operation_index: 0, machine_id: 'M1', start: 0, end: 4 }],
      ['M1', 'M2', 'M3'],
    )
    // M2 and M3 are idle (no operations) but still occupy real rows — GanttChart
    // renders their row labels from `machines` directly, not from this layout.
    expect(layout).toHaveLength(1)
    expect(layout[0].rowIndex).toBe(0)
  })

  it('does not divide by zero for an empty schedule', () => {
    expect(computeGanttLayout([], ['M1'])).toEqual([])
  })

  it('falls back to row 0 for an operation referencing a machine not in the list', () => {
    const layout = computeGanttLayout(
      [{ job_index: 0, operation_index: 0, machine_id: 'UNKNOWN', start: 0, end: 1 }],
      ['M1'],
    )
    expect(layout[0].rowIndex).toBe(0)
  })
})
