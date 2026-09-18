import { OperationRow } from './OperationRow'
import type { MachineDraft, JobDraft } from './types'

type JobCardProps = {
  job: JobDraft
  jobNumber: number
  machines: MachineDraft[]
  error?: { message?: string; operationErrors?: Record<string, string> }
  canRemove: boolean
  onAddOperation: () => void
  onRemoveOperation: (operationId: string) => void
  onReorderOperation: (operationId: string, direction: 'up' | 'down') => void
  onChangeOperationMachine: (operationId: string, machineId: string) => void
  onChangeOperationDuration: (operationId: string, duration: number) => void
  onSetDueDate: (dueDate: number | undefined) => void
  onSetWeight: (weight: number | undefined) => void
  onSetName: (name: string) => void
  onRemoveJob: () => void
}

export function JobCard({
  job,
  jobNumber,
  machines,
  error,
  canRemove,
  onAddOperation,
  onRemoveOperation,
  onReorderOperation,
  onChangeOperationMachine,
  onChangeOperationDuration,
  onSetDueDate,
  onSetWeight,
  onSetName,
  onRemoveJob,
}: JobCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-slate-900">Job {jobNumber}</h3>
          <label className="flex items-center gap-1 text-sm">
            Name
            <input
              type="text"
              value={job.name ?? ''}
              onChange={(e) => onSetName(e.target.value)}
              placeholder="Optional"
              className="w-40 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onRemoveJob}
          disabled={!canRemove}
          className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Remove Job
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {job.operations.map((operation, index) => (
          <OperationRow
            key={operation.id}
            operation={operation}
            machines={machines}
            error={error?.operationErrors?.[operation.id]}
            canMoveUp={index > 0}
            canMoveDown={index < job.operations.length - 1}
            canRemove={job.operations.length > 1}
            onChangeMachine={(machineId) => onChangeOperationMachine(operation.id, machineId)}
            onChangeDuration={(duration) => onChangeOperationDuration(operation.id, duration)}
            onMoveUp={() => onReorderOperation(operation.id, 'up')}
            onMoveDown={() => onReorderOperation(operation.id, 'down')}
            onRemove={() => onRemoveOperation(operation.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAddOperation}
        className="mt-2 text-sm font-medium text-accent hover:underline"
      >
        + Add Operation
      </button>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          Due date
          <input
            type="number"
            value={job.dueDate ?? ''}
            onChange={(e) => onSetDueDate(e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-20 rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-1">
          Weight
          <input
            type="number"
            value={job.weight ?? ''}
            onChange={(e) => onSetWeight(e.target.value === '' ? undefined : Number(e.target.value))}
            disabled={job.dueDate == null}
            className="w-16 rounded-md border border-slate-300 px-2 py-1 disabled:bg-slate-100"
          />
        </label>
      </div>

      {error?.message ? <p className="mt-2 text-xs text-red-600">{error.message}</p> : null}
    </div>
  )
}
