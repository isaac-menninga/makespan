import type { MachineDraft, OperationDraft } from './types'

type OperationRowProps = {
  operation: OperationDraft
  machines: MachineDraft[]
  error?: string
  canMoveUp: boolean
  canMoveDown: boolean
  canRemove: boolean
  onChangeMachine: (machineId: string) => void
  onChangeDuration: (duration: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function OperationRow({
  operation,
  machines,
  error,
  canMoveUp,
  canMoveDown,
  canRemove,
  onChangeMachine,
  onChangeDuration,
  onMoveUp,
  onMoveDown,
  onRemove,
}: OperationRowProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={operation.machineId}
        onChange={(e) => onChangeMachine(e.target.value)}
        aria-label="Machine"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">Select a machine</option>
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.name || '(unnamed machine)'}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        value={operation.duration}
        onChange={(e) => onChangeDuration(e.target.value)}
        aria-label="Duration"
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move operation up">
        ↑
      </button>
      <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move operation down">
        ↓
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        Remove
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
