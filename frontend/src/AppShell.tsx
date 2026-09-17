import { Link, Outlet } from 'react-router'

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <nav className="w-48 shrink-0 border-r border-slate-200 p-4">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          Makespan
        </Link>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
