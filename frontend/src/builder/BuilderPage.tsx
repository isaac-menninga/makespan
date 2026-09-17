import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useCreateProblem, useProblem, useUpdateProblem } from '../api/queries'
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

  return (
    <BuilderForm
      initialDraft={initialDraft}
      savedDraft={initialDraft}
      onBack={() => navigate('/')}
      isSaving={createProblem.isPending}
      saveErrors={saveErrors}
      onSave={(draft: BuilderDraft) => {
        setSaveErrors(undefined)
        createProblem.mutate(serialize(draft), {
          onSuccess: (created) => navigate(`/problems/${created.id}`, { replace: true }),
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

  const currentSavedDraft = savedDraft ?? hydrate(problem.data)

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
    />
  )
}

export function BuilderPage() {
  const { id } = useParams()
  return id ? <ExistingProblemBuilder id={id} /> : <NewProblemBuilder />
}
