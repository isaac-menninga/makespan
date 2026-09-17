import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useParams } from 'react-router'
import { useCreateProblem, useCreateSolve, useProblem, useUpdateProblem } from '../api/queries'
import { BuilderForm, createEmptyDraft } from './BuilderForm'
import { hydrate, serialize } from './transform'
import { mapValidationErrors, type FastAPIValidationError } from './mapValidationErrors'
import type { ValidationResult } from './validate'
import type { BuilderDraft } from './types'

function isHTTPValidationError(error: unknown): error is { detail: FastAPIValidationError[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'detail' in error &&
    Array.isArray((error as { detail: unknown }).detail)
  )
}

function NewProblemBuilder() {
  const navigate = useNavigate()
  const createProblem = useCreateProblem()
  const [saveErrors, setSaveErrors] = useState<ValidationResult>()
  const [initialDraft] = useState(createEmptyDraft)
  const [savedDraft, setSavedDraft] = useState<BuilderDraft>(initialDraft)

  return (
    <BuilderForm
      initialDraft={initialDraft}
      savedDraft={savedDraft}
      onBack={() => navigate('/')}
      isSaving={createProblem.isPending}
      saveErrors={saveErrors}
      onSave={(draft: BuilderDraft) => {
        setSaveErrors(undefined)
        createProblem.mutate(serialize(draft), {
          onSuccess: (created) => {
            // Flush the "saved" snapshot synchronously so BuilderForm's
            // isDirty check (and useBlocker's predicate, which re-registers
            // via an effect) sees a clean draft *before* we navigate away.
            // Without this, the navigate() below races the state update and
            // the unsaved-changes dialog blocks the post-save redirect,
            // leaving the record created server-side but the user stuck on
            // /problems/new with Save re-enabled (risking a duplicate POST).
            flushSync(() => setSavedDraft(draft))
            navigate(`/problems/${created.id}`, { replace: true })
          },
          onError: (error) => {
            setSaveErrors(
              isHTTPValidationError(error) ? mapValidationErrors(error.detail, draft) : undefined,
            )
          },
        })
      }}
    />
  )
}

function ExistingProblemBuilder({ id }: { id: string }) {
  const navigate = useNavigate()
  const problem = useProblem(id)
  const updateProblem = useUpdateProblem(id)
  const [saveErrors, setSaveErrors] = useState<ValidationResult>()
  const [savedDraft, setSavedDraft] = useState<BuilderDraft>()
  const createSolve = useCreateSolve()
  const [solveError, setSolveError] = useState<string>()

  // Memoized on problem.data's reference (TanStack Query keeps the same
  // reference across re-renders when the underlying data hasn't changed) so
  // the ids minted by hydrate() stay stable across re-renders — including
  // while the problem is still loading, when problem.data is undefined.
  // Without this, any re-render before the first successful save (e.g.
  // after a failed save attempt) would call hydrate() again, mint fresh
  // crypto.randomUUID() ids, and make the dirty-check see a "changed" draft
  // even though the user never touched anything. Must be called
  // unconditionally (before the early returns below) to satisfy the rules
  // of hooks.
  const initialDraft = useMemo(
    () => (problem.data ? hydrate(problem.data) : undefined),
    [problem.data],
  )

  if (problem.isPending) {
    return <main className="mx-auto max-w-3xl p-8 text-slate-500">Loading…</main>
  }

  if (problem.isError) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-sm text-red-600">
        Couldn't load this problem.{' '}
        <button className="underline" onClick={() => problem.refetch()}>
          Retry
        </button>
      </main>
    )
  }

  const currentSavedDraft = savedDraft ?? initialDraft!

  return (
    <BuilderForm
      key={problem.data.id}
      initialDraft={currentSavedDraft}
      savedDraft={currentSavedDraft}
      onBack={() => navigate('/')}
      isSaving={updateProblem.isPending}
      justSaved={updateProblem.isSuccess}
      saveErrors={saveErrors}
      onSave={(draft: BuilderDraft) => {
        setSaveErrors(undefined)
        updateProblem.mutate(serialize(draft), {
          onSuccess: () => setSavedDraft(draft),
          onError: (error) => {
            setSaveErrors(
              isHTTPValidationError(error) ? mapValidationErrors(error.detail, draft) : undefined,
            )
          },
        })
      }}
      onSolve={() => {
        setSolveError(undefined)
        createSolve.mutate(
          { problem_id: id, time_limit_seconds: 30 },
          {
            onSuccess: (solve) => navigate(`/problems/${id}/solves/${solve.id}`),
            onError: () => setSolveError("Couldn't start the solve. Try again."),
          },
        )
      }}
      isStartingSolve={createSolve.isPending}
      solveError={solveError}
    />
  )
}

export function BuilderPage() {
  const { id } = useParams()
  return id ? <ExistingProblemBuilder id={id} /> : <NewProblemBuilder />
}
