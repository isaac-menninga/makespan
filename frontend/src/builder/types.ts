import type { components } from '../api/schema'

type ApiOperation = components['schemas']['Operation']

export type OperationDraft = Omit<ApiOperation, 'machine_id'> & {
  id: string
  /** References a MachineDraft.id — never a machine name. */
  machineId: string
}

export type JobDraft = {
  id: string
  operations: OperationDraft[]
  dueDate?: number
  weight?: number
}

export type MachineDraft = {
  id: string
  name: string
}

export type DowntimeWindowDraft = {
  machineId: string
  start: number
  end: number
}

export type BuilderDraft = {
  name: string
  machines: MachineDraft[]
  jobs: JobDraft[]
  /** Keyed by machine id, not name. Not edited by this phase's UI. */
  setupTimes: Record<string, number>
  /** Not edited by this phase's UI. */
  downtimeWindows: DowntimeWindowDraft[]
}
