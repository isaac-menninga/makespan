import { useMemo, useReducer } from 'react'
import { useBlocker } from 'react-router'
import { generateId } from './id'
import { builderReducer, newJob } from './reducer'
import { getMachineUsage, validateDraft, type ValidationResult } from './validate'
import { BuilderHeader } from './BuilderHeader'
import { MachineList } from './MachineList'
import { JobCard } from './JobCard'
import type { BuilderDraft } from './types'

export function createEmptyDraft(): BuilderDraft {
  const machineId = generateId()
  return {
    name: '',
    machines: [{ id: machineId, name: '' }],
    jobs: [newJob(machineId)],
    setupTimes: {},
    downtimeWindows: [],
  }
}

type BuilderFormProps = {
  initialDraft: BuilderDraft
  savedDraft: BuilderDraft
  onBack: () => void
  onSave: (draft: BuilderDraft) => void
  isSaving: boolean
  justSaved?: boolean
  saveErrors?: ValidationResult
  onSolve?: () => void
  isStartingSolve?: boolean
  solveError?: string
}

export function BuilderForm({
  initialDraft,
  savedDraft,
  onBack,
  onSave,
  isSaving,
  justSaved,
  saveErrors,
  onSolve,
  isStartingSolve,
  solveError,
}: BuilderFormProps) {
  const [draft, dispatch] = useReducer(builderReducer, initialDraft)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const canSolve = Boolean(onSolve) && !isDirty
  const blocker = useBlocker(isDirty)
  const validation = useMemo(() => validateDraft(draft), [draft])
  const usage = useMemo(() => getMachineUsage(draft), [draft])
  const errors = saveErrors ?? validation

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <BuilderHeader
        name={draft.name}
        onChangeName={(name) => dispatch({ type: 'setName', name })}
        onBack={onBack}
        onSave={() => onSave(draft)}
        canSave={validation.isValid}
        isSaving={isSaving}
        justSaved={justSaved && !isDirty}
        onSolve={onSolve}
        canSolve={canSolve}
        isStartingSolve={isStartingSolve ?? false}
      />

      {errors.problemErrors.length > 0 ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errors.problemErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      {solveError ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{solveError}</div>
      ) : null}

      <MachineList
        machines={draft.machines}
        errors={errors.machineErrors}
        usage={usage}
        onAdd={() => dispatch({ type: 'addMachine' })}
        onRename={(machineId, name) => dispatch({ type: 'renameMachine', machineId, name })}
        onRemove={(machineId) => dispatch({ type: 'removeMachine', machineId })}
      />

      <section>
        <h2 className="text-lg font-medium text-slate-800">Jobs</h2>
        <div className="mt-2 space-y-4">
          {draft.jobs.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              jobNumber={index + 1}
              machines={draft.machines}
              error={errors.jobErrors[job.id]}
              canRemove={draft.jobs.length > 1}
              onAddOperation={() => dispatch({ type: 'addOperation', jobId: job.id })}
              onRemoveOperation={(operationId) =>
                dispatch({ type: 'removeOperation', jobId: job.id, operationId })
              }
              onReorderOperation={(operationId, direction) =>
                dispatch({ type: 'reorderOperation', jobId: job.id, operationId, direction })
              }
              onChangeOperationMachine={(operationId, machineId) =>
                dispatch({
                  type: 'updateOperation',
                  jobId: job.id,
                  operationId,
                  field: 'machineId',
                  value: machineId,
                })
              }
              onChangeOperationDuration={(operationId, duration) =>
                dispatch({
                  type: 'updateOperation',
                  jobId: job.id,
                  operationId,
                  field: 'duration',
                  value: duration,
                })
              }
              onSetDueDate={(dueDate) => dispatch({ type: 'setJobDueDate', jobId: job.id, dueDate })}
              onSetWeight={(weight) => dispatch({ type: 'setJobWeight', jobId: job.id, weight })}
              onSetName={(name) => dispatch({ type: 'setJobName', jobId: job.id, name })}
              onRemoveJob={() => dispatch({ type: 'removeJob', jobId: job.id })}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'addJob' })}
          className="mt-2 text-sm font-medium text-accent hover:underline"
        >
          + Add Job
        </button>
      </section>

      {blocker.state === 'blocked' ? (
        <div
          role="alertdialog"
          aria-label="Unsaved changes"
          className="fixed inset-0 flex items-center justify-center bg-black/30"
        >
          <div className="rounded-md bg-white p-4 shadow-lg">
            <p className="text-sm text-slate-700">You have unsaved changes. Leave anyway?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => blocker.reset()} className="text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => blocker.proceed()} className="text-sm text-red-600">
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
