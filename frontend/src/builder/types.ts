import type { components } from '../api/schema'

type ApiOperation = components['schemas']['Operation']

export type OperationDraft = Omit<ApiOperation, 'machine_id' | 'duration'> & {
  id: string
  /** References a MachineDraft.id — never a machine name. */
  machineId: string
  /**
   * Raw text as typed, not a parsed number — avoids the classic controlled
   * `<input type="number">` bug where the browser won't redisplay text that
   * parses to the same value it already shows (e.g. typing over a "0" can
   * get stuck as "03"). Parsed to a number only at validation and at the
   * API-serialization boundary.
   */
  duration: string
}

export type JobDraft = {
  id: string
  operations: OperationDraft[]
  /** Raw text as typed; see OperationDraft.duration for why. */
  dueDate?: string
  /** Raw text as typed; see OperationDraft.duration for why. */
  weight?: string
  name?: string
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
