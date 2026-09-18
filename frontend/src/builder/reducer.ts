import { produce } from 'immer'
import { generateId } from './id'
import { getMachineUsage } from './validate'
import type { BuilderDraft, JobDraft, OperationDraft } from './types'

export type BuilderAction =
  | { type: 'setName'; name: string }
  | { type: 'addMachine' }
  | { type: 'renameMachine'; machineId: string; name: string }
  | { type: 'removeMachine'; machineId: string }
  | { type: 'addJob' }
  | { type: 'removeJob'; jobId: string }
  | { type: 'addOperation'; jobId: string }
  | { type: 'removeOperation'; jobId: string; operationId: string }
  | { type: 'reorderOperation'; jobId: string; operationId: string; direction: 'up' | 'down' }
  | {
      type: 'updateOperation'
      jobId: string
      operationId: string
      field: 'machineId' | 'duration'
      value: string | number
    }
  | { type: 'setJobDueDate'; jobId: string; dueDate: number | undefined }
  | { type: 'setJobWeight'; jobId: string; weight: number | undefined }
  | { type: 'setJobName'; jobId: string; name: string }

export function newOperation(machineId: string): OperationDraft {
  return { id: generateId(), machineId, duration: 1 }
}

export function newJob(machineId: string): JobDraft {
  return { id: generateId(), operations: [newOperation(machineId)] }
}

export const builderReducer = produce((draft: BuilderDraft, action: BuilderAction) => {
  switch (action.type) {
    case 'setName': {
      draft.name = action.name
      break
    }
    case 'addMachine': {
      draft.machines.push({ id: generateId(), name: '' })
      break
    }
    case 'renameMachine': {
      const machine = draft.machines.find((m) => m.id === action.machineId)
      if (machine) machine.name = action.name
      break
    }
    case 'removeMachine': {
      const usage = getMachineUsage(draft)
      if (!usage.has(action.machineId)) {
        draft.machines = draft.machines.filter((m) => m.id !== action.machineId)
      }
      break
    }
    case 'addJob': {
      draft.jobs.push(newJob(draft.machines[0]?.id ?? ''))
      break
    }
    case 'removeJob': {
      if (draft.jobs.length > 1) {
        draft.jobs = draft.jobs.filter((j) => j.id !== action.jobId)
      }
      break
    }
    case 'addOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) job.operations.push(newOperation(draft.machines[0]?.id ?? ''))
      break
    }
    case 'removeOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job && job.operations.length > 1) {
        job.operations = job.operations.filter((op) => op.id !== action.operationId)
      }
      break
    }
    case 'reorderOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (!job) break
      const index = job.operations.findIndex((op) => op.id === action.operationId)
      const targetIndex = action.direction === 'up' ? index - 1 : index + 1
      if (index === -1 || targetIndex < 0 || targetIndex >= job.operations.length) break
      const [operation] = job.operations.splice(index, 1)
      job.operations.splice(targetIndex, 0, operation)
      break
    }
    case 'updateOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      const operation = job?.operations.find((op) => op.id === action.operationId)
      if (!operation) break
      if (action.field === 'machineId') {
        operation.machineId = String(action.value)
      } else {
        operation.duration = Number(action.value)
      }
      break
    }
    case 'setJobDueDate': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) {
        job.dueDate = action.dueDate
        if (action.dueDate == null) job.weight = undefined
      }
      break
    }
    case 'setJobWeight': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) job.weight = action.weight
      break
    }
    case 'setJobName': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) job.name = action.name === '' ? undefined : action.name
      break
    }
    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
})
