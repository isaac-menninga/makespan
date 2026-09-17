import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SolvePage } from './SolvePage'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: '/problems/:id/solves/:solveId', element: <SolvePage /> }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />, { wrapper })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const problem = {
  id: 'p1',
  name: 'Demo Problem',
  created_at: '2026-01-01T00:00:00Z',
  machines: ['M1', 'M2'],
  jobs: [{ operations: [{ machine_id: 'M1', duration: 5 }] }],
  constraints: {},
}

function stubFetch(solve: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((request: Request) =>
      Promise.resolve(
        request.url.includes('/api/problems/') ? jsonResponse(problem) : jsonResponse(solve),
      ),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SolvePage', () => {
  it('shows a live progress panel while running', async () => {
    stubFetch({
      id: 's1',
      status: 'running',
      best_objective: 42,
      best_bound: 30,
      elapsed_seconds: 5,
      schedule: null,
      objective_mode: 'makespan',
    })
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByText(/solving/i)).toBeInTheDocument()
    expect(screen.getByText(/best so far: 42/i)).toBeInTheDocument()
  })

  it('shows the Gantt chart and stats once completed', async () => {
    stubFetch({
      id: 's1',
      status: 'completed',
      best_objective: 20,
      best_bound: 20,
      elapsed_seconds: 3.2,
      schedule: [{ job_index: 0, operation_index: 0, machine_id: 'M1', start: 0, end: 5 }],
      objective_mode: 'makespan',
    })
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByText(/makespan: 20/i)).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /gantt chart/i })).toBeInTheDocument()
  })

  it('labels the objective as a weighted score when the solve used due dates', async () => {
    stubFetch({
      id: 's1',
      status: 'completed',
      best_objective: 15,
      best_bound: 15,
      elapsed_seconds: 2,
      schedule: [],
      objective_mode: 'weighted',
    })
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByText(/weighted score: 15/i)).toBeInTheDocument()
  })

  it('renders elapsed time as 0.0s when a completed solve has no elapsed_seconds', async () => {
    stubFetch({
      id: 's1',
      status: 'completed',
      best_objective: 5,
      best_bound: 5,
      elapsed_seconds: null,
      schedule: [],
      objective_mode: 'makespan',
    })
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByText(/elapsed: 0\.0s/i)).toBeInTheDocument()
  })

  it('shows the failure message with no Gantt when the solve failed', async () => {
    stubFetch({
      id: 's1',
      status: 'failed',
      best_objective: null,
      best_bound: null,
      elapsed_seconds: 1,
      schedule: null,
      objective_mode: 'makespan',
      message: 'This problem is infeasible.',
    })
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByText('This problem is infeasible.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /gantt chart/i })).not.toBeInTheDocument()
  })

  it('shows an error with retry when the solve fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) =>
        Promise.resolve(
          request.url.includes('/api/problems/')
            ? jsonResponse(problem)
            : jsonResponse({ detail: 'boom' }, 500),
        ),
      ),
    )
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('links back to the Builder', async () => {
    stubFetch({
      id: 's1',
      status: 'running',
      best_objective: null,
      best_bound: null,
      elapsed_seconds: 0,
      schedule: null,
      objective_mode: 'makespan',
    })
    renderAt('/problems/p1/solves/s1')
    expect(await screen.findByRole('link', { name: /back to builder/i })).toHaveAttribute(
      'href',
      '/problems/p1',
    )
  })
})
