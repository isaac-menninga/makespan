import { generateId } from './id'
import type { components } from '../api/schema'
import type {
  BuilderDraft,
  DowntimeWindowDraft,
  JobDraft,
  MachineDraft,
  OperationDraft,
} from './types'

type ApiProblemOut = components['schemas']['ProblemOut']
type ApiProblemIn = components['schemas']['ProblemIn']

type ProblemSpecLike = {
  machines: string[]
  jobs: { operations: { machine_id: string; duration: number }[] }[]
  constraints?: {
    setup_times?: Record<string, number>
    due_dates?: { job_index: number; due: number; weight: number }[]
    downtime_windows?: { machine_id: string; start: number; end: number }[]
  }
}

export function hydrateSpec(
  spec: ProblemSpecLike,
): Pick<BuilderDraft, 'machines' | 'jobs' | 'setupTimes' | 'downtimeWindows'> {
  const machines: MachineDraft[] = spec.machines.map((name) => ({ id: generateId(), name }))
  const machineIdByName = new Map(machines.map((machine) => [machine.name, machine.id]))

  const jobs: JobDraft[] = spec.jobs.map((job) => ({
    id: generateId(),
    operations: job.operations.map(
      (operation): OperationDraft => ({
        id: generateId(),
        machineId: machineIdByName.get(operation.machine_id) ?? operation.machine_id,
        duration: operation.duration,
      }),
    ),
  }))

  for (const dueDate of spec.constraints?.due_dates ?? []) {
    const job = jobs[dueDate.job_index]
    if (job) {
      job.dueDate = dueDate.due
      job.weight = dueDate.weight
    }
  }

  const setupTimes: Record<string, number> = {}
  for (const [machineName, value] of Object.entries(spec.constraints?.setup_times ?? {})) {
    setupTimes[machineIdByName.get(machineName) ?? machineName] = value
  }

  const downtimeWindows: DowntimeWindowDraft[] = (spec.constraints?.downtime_windows ?? []).map(
    (window) => ({
      machineId: machineIdByName.get(window.machine_id) ?? window.machine_id,
      start: window.start,
      end: window.end,
    }),
  )

  return { machines, jobs, setupTimes, downtimeWindows }
}

export function hydrate(problem: ApiProblemOut): BuilderDraft {
  return {
    name: problem.name,
    ...hydrateSpec(problem),
  }
}

export function serialize(draft: BuilderDraft): ApiProblemIn {
  const machineNameById = new Map(draft.machines.map((machine) => [machine.id, machine.name]))

  const setupTimes: Record<string, number> = {}
  for (const [machineId, value] of Object.entries(draft.setupTimes)) {
    const machineName = machineNameById.get(machineId)
    if (machineName) setupTimes[machineName] = value
  }

  const dueDates = draft.jobs.flatMap((job, jobIndex) =>
    job.dueDate != null
      ? [{ job_index: jobIndex, due: job.dueDate, weight: job.weight ?? 1 }]
      : [],
  )

  const downtimeWindows = draft.downtimeWindows.flatMap((window) => {
    const machineName = machineNameById.get(window.machineId)
    return machineName ? [{ machine_id: machineName, start: window.start, end: window.end }] : []
  })

  return {
    name: draft.name,
    machines: draft.machines.map((machine) => machine.name),
    jobs: draft.jobs.map((job) => ({
      operations: job.operations.map((operation) => ({
        machine_id: machineNameById.get(operation.machineId) ?? operation.machineId,
        duration: operation.duration,
      })),
    })),
    constraints: {
      setup_times: setupTimes,
      due_dates: dueDates,
      downtime_windows: downtimeWindows,
    },
  }
}
