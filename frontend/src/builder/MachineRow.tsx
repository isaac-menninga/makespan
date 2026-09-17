import type { MachineDraft } from './types'

type MachineRowProps = {
  machine: MachineDraft
  error?: string
  inUse: boolean
  onRename: (name: string) => void
  onRemove: () => void
}

export function MachineRow({ machine, error, inUse, onRename, onRemove }: MachineRowProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={machine.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Machine name"
        aria-label="Machine name"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={inUse}
        title={inUse ? 'This machine is in use' : undefined}
        className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        Remove
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
