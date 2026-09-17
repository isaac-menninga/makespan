export type ScheduledOperationApi = {
  job_index: number
  operation_index: number
  machine_id: string
  start: number
  end: number
}

export type GanttBarLayout = {
  jobIndex: number
  operationIndex: number
  machineId: string
  rowIndex: number
  start: number
  end: number
  /** Fraction of the plot width, 0..1. */
  x: number
  /** Fraction of the plot width, 0..1. */
  width: number
}

export function computeGanttLayout(
  schedule: ScheduledOperationApi[],
  machines: string[],
): GanttBarLayout[] {
  const makespan = Math.max(1, ...schedule.map((operation) => operation.end))
  const rowIndexByMachine = new Map(machines.map((machineId, index) => [machineId, index]))

  return schedule.map((operation) => ({
    jobIndex: operation.job_index,
    operationIndex: operation.operation_index,
    machineId: operation.machine_id,
    rowIndex: rowIndexByMachine.get(operation.machine_id) ?? 0,
    start: operation.start,
    end: operation.end,
    x: operation.start / makespan,
    width: (operation.end - operation.start) / makespan,
  }))
}
