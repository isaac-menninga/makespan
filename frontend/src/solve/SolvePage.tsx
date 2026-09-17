import { Link, useParams } from 'react-router'
import { useProblem, useSolve } from '../api/queries'
import { GanttChart } from './GanttChart'
import type { ScheduledOperationApi } from './layout'

const TIME_LIMIT_SECONDS = 30

function objectiveLabel(objectiveMode: string | null | undefined): string {
  return objectiveMode === 'weighted' ? 'Weighted score' : 'Makespan'
}

export function SolvePage() {
  const { id, solveId } = useParams<{ id: string; solveId: string }>()
  const problem = useProblem(id!)
  const solve = useSolve(solveId!)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <Link to={`/problems/${id}`} className="text-sm text-accent hover:underline">
          ← Back to Builder
        </Link>
        {problem.data ? (
          <h1 className="text-lg font-semibold text-slate-900">{problem.data.name}</h1>
        ) : null}
      </div>

      {solve.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : solve.isError ? (
        <div className="text-sm text-red-600">
          Couldn't load this solve.{' '}
          <button className="underline" onClick={() => solve.refetch()}>
            Retry
          </button>
        </div>
      ) : solve.data.status === 'failed' ? (
        <p className="text-sm text-red-600">{solve.data.message ?? 'This solve failed.'}</p>
      ) : solve.data.status === 'completed' ? (
        <div className="space-y-4">
          <div className="flex gap-6 text-sm text-slate-700">
            <span>
              {objectiveLabel(solve.data.objective_mode)}: {solve.data.best_objective}
            </span>
            <span>Elapsed: {(solve.data.elapsed_seconds ?? 0).toFixed(1)}s</span>
          </div>
          {problem.data ? (
            <GanttChart
              schedule={(solve.data.schedule ?? []) as ScheduledOperationApi[]}
              machines={problem.data.machines}
            />
          ) : (
            <p className="text-slate-500">Loading chart…</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-700">Solving…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${Math.min(
                  100,
                  ((solve.data.elapsed_seconds ?? 0) / TIME_LIMIT_SECONDS) * 100,
                )}%`,
              }}
            />
          </div>
          {solve.data.best_objective != null ? (
            <p className="text-sm text-slate-600">
              Best so far: {solve.data.best_objective}
              {solve.data.best_bound != null ? ` (bound: ${solve.data.best_bound})` : ''}
            </p>
          ) : null}
        </div>
      )}
    </main>
  )
}
