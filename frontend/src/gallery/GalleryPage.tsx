import { Link } from 'react-router'
import { usePresets, useSavedProblems } from '../api/queries'
import { ProblemCard } from './ProblemCard'
import { formatRelativeTime } from './relativeTime'

function CardSkeleton() {
  return <div data-testid="card-skeleton" className="h-24 animate-pulse rounded-lg bg-slate-100" />
}

export function GalleryPage() {
  const presets = usePresets()
  const savedProblems = useSavedProblems()

  return (
    <main className="mx-auto max-w-(--content-max-width) p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Gallery</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-800">Presets</h2>
        {presets.isPending ? (
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : presets.isError ? (
          <div className="mt-4 text-sm text-red-600">
            Couldn't load presets.{' '}
            <button className="underline" onClick={() => presets.refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {presets.data.map((preset) => (
              <ProblemCard
                key={preset.id}
                id={preset.id}
                name={preset.name}
                machineCount={preset.machines.length}
                jobCount={preset.jobs.length}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-800">Your Problems</h2>
          <Link
            to="/problems/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            New Problem
          </Link>
        </div>
        {savedProblems.isPending ? (
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <CardSkeleton />
          </div>
        ) : savedProblems.isError ? (
          <div className="mt-4 text-sm text-red-600">
            Couldn't load your problems.{' '}
            <button className="underline" onClick={() => savedProblems.refetch()}>
              Retry
            </button>
          </div>
        ) : savedProblems.data.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            You don't have any saved problems yet. Start with{' '}
            <Link to="/problems/new" className="text-accent underline">
              New Problem
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {savedProblems.data.map((problem) => (
              <ProblemCard
                key={problem.id}
                id={problem.id}
                name={problem.name}
                machineCount={problem.machine_count}
                jobCount={problem.job_count}
                subtitle={formatRelativeTime(problem.created_at)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
