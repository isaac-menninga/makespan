import { Link } from 'react-router'

type ProblemCardProps = {
  id: string
  name: string
  machineCount: number
  jobCount: number
  subtitle?: string
}

export function ProblemCard({ id, name, machineCount, jobCount, subtitle }: ProblemCardProps) {
  return (
    <Link
      to={`/problems/${id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent hover:shadow-md"
    >
      <h3 className="font-medium text-slate-900">{name}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {machineCount} {machineCount === 1 ? 'machine' : 'machines'} · {jobCount}{' '}
        {jobCount === 1 ? 'job' : 'jobs'}
      </p>
      {subtitle ? <p className="mt-2 text-xs text-slate-400">{subtitle}</p> : null}
    </Link>
  )
}
