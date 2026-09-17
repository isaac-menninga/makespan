import type { BuilderDraft } from './types'

export type ValidationResult = {
  isValid: boolean
  problemErrors: string[]
  machineErrors: Record<string, string>
  jobErrors: Record<string, { message?: string; operationErrors?: Record<string, string> }>
}

export function getMachineUsage(draft: BuilderDraft): Set<string> {
  const used = new Set<string>()
  for (const job of draft.jobs) {
    for (const operation of job.operations) {
      if (operation.machineId) used.add(operation.machineId)
    }
  }
  for (const machineId of Object.keys(draft.setupTimes)) {
    used.add(machineId)
  }
  for (const window of draft.downtimeWindows) {
    used.add(window.machineId)
  }
  return used
}

export function validateDraft(draft: BuilderDraft): ValidationResult {
  const problemErrors: string[] = []
  const machineErrors: Record<string, string> = {}
  const jobErrors: ValidationResult['jobErrors'] = {}

  const idsByName = new Map<string, string[]>()
  for (const machine of draft.machines) {
    if (!machine.name.trim()) {
      machineErrors[machine.id] = 'Machine name is required.'
      continue
    }
    idsByName.set(machine.name, [...(idsByName.get(machine.name) ?? []), machine.id])
  }
  for (const ids of idsByName.values()) {
    if (ids.length > 1) {
      for (const id of ids) machineErrors[id] = 'Machine names must be unique.'
    }
  }

  const machineIds = new Set(draft.machines.map((machine) => machine.id))

  if (draft.jobs.length === 0) {
    problemErrors.push('At least one job is required.')
  }

  for (const [machineId, value] of Object.entries(draft.setupTimes)) {
    if (!machineIds.has(machineId)) {
      problemErrors.push('A setup time references a machine that no longer exists.')
    } else if (value < 0) {
      problemErrors.push('A setup time must be 0 or greater.')
    }
  }

  for (const window of draft.downtimeWindows) {
    if (!machineIds.has(window.machineId)) {
      problemErrors.push('A downtime window references a machine that no longer exists.')
    } else if (window.end <= window.start) {
      problemErrors.push("A downtime window's end must be after its start.")
    }
  }

  for (const job of draft.jobs) {
    if (job.operations.length === 0) {
      jobErrors[job.id] = { message: 'A job must have at least one operation.' }
      continue
    }

    const operationErrors: Record<string, string> = {}
    for (const operation of job.operations) {
      if (!operation.machineId || !machineIds.has(operation.machineId)) {
        operationErrors[operation.id] = 'Select a machine.'
      } else if (!Number.isFinite(operation.duration) || operation.duration <= 0) {
        operationErrors[operation.id] = 'Duration must be greater than 0.'
      }
    }

    let message: string | undefined
    if (job.dueDate != null && job.dueDate < 0) {
      message = 'Due date must be 0 or greater.'
    } else if (job.weight != null && job.weight < 1) {
      message = 'Weight must be at least 1.'
    }

    if (message || Object.keys(operationErrors).length > 0) {
      jobErrors[job.id] = {
        ...(message ? { message } : {}),
        ...(Object.keys(operationErrors).length > 0 ? { operationErrors } : {}),
      }
    }
  }

  const isValid =
    problemErrors.length === 0 &&
    Object.keys(machineErrors).length === 0 &&
    Object.keys(jobErrors).length === 0

  return { isValid, problemErrors, machineErrors, jobErrors }
}
