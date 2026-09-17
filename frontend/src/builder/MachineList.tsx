import { MachineRow } from './MachineRow'
import type { MachineDraft } from './types'

type MachineListProps = {
  machines: MachineDraft[]
  errors: Record<string, string>
  usage: Set<string>
  onAdd: () => void
  onRename: (machineId: string, name: string) => void
  onRemove: (machineId: string) => void
}

export function MachineList({ machines, errors, usage, onAdd, onRename, onRemove }: MachineListProps) {
  return (
    <section>
      <h2 className="text-lg font-medium text-slate-800">Machines</h2>
      <div className="mt-2 space-y-2">
        {machines.map((machine) => (
          <MachineRow
            key={machine.id}
            machine={machine}
            error={errors[machine.id]}
            inUse={usage.has(machine.id)}
            onRename={(name) => onRename(machine.id, name)}
            onRemove={() => onRemove(machine.id)}
          />
        ))}
      </div>
      <button type="button" onClick={onAdd} className="mt-2 text-sm font-medium text-accent hover:underline">
        + Add Machine
      </button>
    </section>
  )
}
