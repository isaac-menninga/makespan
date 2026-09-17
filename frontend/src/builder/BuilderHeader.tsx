type BuilderHeaderProps = {
  name: string
  onChangeName: (name: string) => void
  onBack: () => void
  onSave: () => void
  canSave: boolean
  isSaving: boolean
  justSaved?: boolean
}

export function BuilderHeader({
  name,
  onChangeName,
  onBack,
  onSave,
  canSave,
  isSaving,
  justSaved,
}: BuilderHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button type="button" onClick={onBack} className="text-sm text-accent hover:underline">
        ← Back to Gallery
      </button>
      <input
        type="text"
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Problem name"
        aria-label="Problem name"
        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-lg font-semibold"
      />
      <button
        type="button"
        disabled
        title="Coming in a later phase"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-400"
      >
        Solve
      </button>
      {justSaved ? <span className="text-sm text-slate-500">Saved</span> : null}
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave || isSaving}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
