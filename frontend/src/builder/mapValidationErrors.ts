import type { BuilderDraft } from './types'
import type { ValidationResult } from './validate'

export type FastAPIValidationError = { loc: (string | number)[]; msg: string }

export function mapValidationErrors(
  detail: FastAPIValidationError[],
  draft: BuilderDraft,
): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    problemErrors: [],
    machineErrors: {},
    jobErrors: {},
  }

  for (const error of detail) {
    const [, section, index, sub, subIndex, field] = error.loc

    if (section === 'machines' && typeof index === 'number') {
      const machine = draft.machines[index]
      if (machine) {
        result.machineErrors[machine.id] = error.msg
        continue
      }
    }

    if (section === 'jobs' && typeof index === 'number') {
      const job = draft.jobs[index]
      if (job) {
        if (sub === 'operations' && typeof subIndex === 'number' && field) {
          const operation = job.operations[subIndex]
          if (operation) {
            const existing = result.jobErrors[job.id] ?? {}
            result.jobErrors[job.id] = {
              ...existing,
              operationErrors: { ...existing.operationErrors, [operation.id]: error.msg },
            }
            continue
          }
        }
        result.jobErrors[job.id] = { ...result.jobErrors[job.id], message: error.msg }
        continue
      }
    }

    result.problemErrors.push(error.msg)
  }

  return result
}
