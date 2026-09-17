# Frontend Phase 3 (Solve View) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Builder's disabled "Solve" placeholder with a working Solve view at `/problems/:id/solves/:solveId` — start a solve, poll its live progress, and render the finished schedule as a custom interactive SVG Gantt chart.

**Architecture:** Two new TanStack Query hooks (`useCreateSolve`, `useSolve`, the latter polling via `refetchInterval`) drive a new `SolvePage`. The Gantt chart is a pure layout function (`computeGanttLayout`) plus a thin SVG-rendering component, mirroring the pure-logic/component split Phase 2 used for its reducer and validation. The Solve button's enabling logic lives inside `BuilderForm` (which already computes the dirty-check the button needs), not `BuilderPage`.

**Tech Stack:** Same as Phases 1-2 (Vite, React 19, TypeScript, Tailwind CSS 4, React Router 8 data router, TanStack Query 5, openapi-fetch, Vitest + React Testing Library). No new dependencies — the Gantt chart is hand-rolled SVG, no charting library.

**Spec:** `docs/superpowers/specs/2026-09-16-frontend-phase3-solve-view-design.md`

## Global Constraints

- Package manager: **npm only** for the frontend.
- TypeScript **strict mode** — all new code must satisfy the existing `tsconfig.app.json`.
- Tailwind's `slate` scale for surfaces/text, `--color-accent` for primary actions/links — light mode only, matching every prior phase.
- No backend changes — `POST /api/solves`, `GET /api/solves/{id}`, and `GET /api/problems/{id}` already support everything this plan needs, and `frontend/src/api/schema.ts` already contains their generated types (`SolveCreate`, `SolveStatus`) from an earlier project phase — no `npm run generate-types` step needed.
- Gantt chart colors come from the `dataviz` skill's validated default categorical palette (`references/palette.md`), used unmodified — 8 hues, fixed order, never re-ordered per chart. Beyond 8 concurrent jobs the color cycles (`jobIndex % 8`); a per-job color legend is intentionally not built (job counts are unbounded and a legend enumerating dozens of entries wouldn't be practical) — instead, every bar's native tooltip states its job/operation number in text, so job identity is never color-alone even without a legend.
- Solve-view polling tests are written as independent per-status renders (mock `fetch` to return one fixed `status`, assert the resulting UI), not as a simulated real-time `pending → running → completed` sequence driven by fake timers. `refetchInterval`'s actual interval logic is covered separately by a pure, directly-unit-tested function (`getSolveRefetchInterval`) — combining Vitest fake timers with React Testing Library's `waitFor` is a well-known source of flaky/deadlocked tests, and the per-status approach verifies the same rendering behavior without that risk.
- Every task must leave `uv run pytest` (backend, unaffected by this plan but still verified) and `npm run lint`, `npm test`, `npm run build` (frontend) all green before committing.

---

## Task 1: API hooks — `useCreateSolve`, `useSolve`, `getSolveRefetchInterval`

**Files:**
- Modify: `frontend/src/api/queries.ts`
- Modify: `frontend/src/api/queries.test.tsx`

**Interfaces:**
- Produces: `useCreateSolve()`, `useSolve(id)`, `getSolveRefetchInterval(status)` from `queries.ts` — consumed by Task 4 (`SolvePage.tsx`) and Task 5 (`BuilderPage.tsx`).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/api/queries.test.tsx`, add `getSolveRefetchInterval, useCreateSolve, useSolve` to the existing import from `./queries`, making it:

```ts
import {
  useCreateProblem,
  useProblem,
  useSavedProblems,
  usePresets,
  useUpdateProblem,
  getSolveRefetchInterval,
  useCreateSolve,
  useSolve,
} from './queries'
```

Then append these tests to the end of the file:

```ts
describe('getSolveRefetchInterval', () => {
  it('polls every second while pending or running', () => {
    expect(getSolveRefetchInterval('pending')).toBe(1000)
    expect(getSolveRefetchInterval('running')).toBe(1000)
  })

  it('stops polling once terminal, or when the status is unknown', () => {
    expect(getSolveRefetchInterval('completed')).toBe(false)
    expect(getSolveRefetchInterval('failed')).toBe(false)
    expect(getSolveRefetchInterval(undefined)).toBe(false)
  })
})

describe('useCreateSolve', () => {
  it('POSTs the payload and returns the created solve', async () => {
    const created = {
      id: 'solve-1',
      status: 'pending',
      best_objective: null,
      best_bound: null,
      elapsed_seconds: null,
      schedule: null,
      objective_mode: 'makespan',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(created)))

    const { result } = renderHook(() => useCreateSolve(), { wrapper })
    result.current.mutate({ problem_id: 'abc', time_limit_seconds: 30 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(created)
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).method).toBe('POST')
  })
})

describe('useSolve', () => {
  it('fetches a solve by id', async () => {
    const solve = {
      id: 'solve-1',
      status: 'running',
      best_objective: 42,
      best_bound: 30,
      elapsed_seconds: 5,
      schedule: null,
      objective_mode: 'makespan',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(solve)))

    const { result } = renderHook(() => useSolve('solve-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(solve)
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).url).toContain('/api/solves/solve-1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/api/queries.test.tsx
```

Expected: FAIL — `getSolveRefetchInterval`, `useCreateSolve`, `useSolve` are not exported from `queries.ts`.

- [ ] **Step 3: Implement the additions**

In `frontend/src/api/queries.ts`, change the top import block from:

```ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
import type { components } from './schema'

type ProblemIn = components['schemas']['ProblemIn']
```

to:

```ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
import type { components } from './schema'

type ProblemIn = components['schemas']['ProblemIn']
type SolveCreate = components['schemas']['SolveCreate']
```

Then append to the end of the file:

```ts
export function getSolveRefetchInterval(status: string | undefined): number | false {
  return status === 'pending' || status === 'running' ? 1000 : false
}

export function useCreateSolve() {
  return useMutation({
    mutationFn: async (payload: SolveCreate) => {
      const { data, error } = await apiClient.POST('/api/solves', { body: payload })
      if (error || !data) throw error || new Error('Failed to start solve')
      return data
    },
  })
}

export function useSolve(id: string) {
  return useQuery({
    queryKey: ['solve', id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/solves/{solve_id}', {
        params: { path: { solve_id: id } },
      })
      if (error || !data) throw error || new Error('Failed to load solve')
      return data
    },
    refetchInterval: (query) => getSolveRefetchInterval(query.state.data?.status),
  })
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/api/queries.test.tsx
```

Expected: PASS (all cases, including the pre-existing hooks' tests).

- [ ] **Step 5: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/queries.ts frontend/src/api/queries.test.tsx
git commit -m "$(cat <<'EOF'
feat: add useCreateSolve/useSolve query hooks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Gantt layout — pure geometry function

**Files:**
- Create: `frontend/src/solve/layout.ts`
- Test: `frontend/src/solve/layout.test.ts`

**Interfaces:**
- Produces: `ScheduledOperationApi` type, `GanttBarLayout` type, `computeGanttLayout(schedule, machines): GanttBarLayout[]` from `layout.ts` — consumed by Task 3 (`GanttChart.tsx`) and Task 4 (`SolvePage.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/solve/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeGanttLayout } from './layout'

describe('computeGanttLayout', () => {
  it('maps each operation to its machine row index and time fractions of the makespan', () => {
    const layout = computeGanttLayout(
      [
        { job_index: 0, operation_index: 0, machine_id: 'M2', start: 0, end: 5 },
        { job_index: 0, operation_index: 1, machine_id: 'M1', start: 5, end: 10 },
      ],
      ['M1', 'M2'],
    )

    expect(layout[0]).toMatchObject({ jobIndex: 0, operationIndex: 0, rowIndex: 1, x: 0, width: 0.5 })
    expect(layout[1]).toMatchObject({ jobIndex: 0, operationIndex: 1, rowIndex: 0, x: 0.5, width: 0.5 })
  })

  it('assigns row index from the machines array position, not from the schedule', () => {
    const layout = computeGanttLayout(
      [{ job_index: 0, operation_index: 0, machine_id: 'M1', start: 0, end: 4 }],
      ['M1', 'M2', 'M3'],
    )
    // M2 and M3 are idle (no operations) but still occupy real rows — GanttChart
    // renders their row labels from `machines` directly, not from this layout.
    expect(layout).toHaveLength(1)
    expect(layout[0].rowIndex).toBe(0)
  })

  it('does not divide by zero for an empty schedule', () => {
    expect(computeGanttLayout([], ['M1'])).toEqual([])
  })

  it('falls back to row 0 for an operation referencing a machine not in the list', () => {
    const layout = computeGanttLayout(
      [{ job_index: 0, operation_index: 0, machine_id: 'UNKNOWN', start: 0, end: 1 }],
      ['M1'],
    )
    expect(layout[0].rowIndex).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/solve/layout.test.ts
```

Expected: FAIL — `frontend/src/solve/layout.ts` does not exist.

- [ ] **Step 3: Implement `layout.ts`**

Create `frontend/src/solve/layout.ts`:

```ts
export type ScheduledOperationApi = {
  job_index: number
  operation_index: number
  machine_id: string
  start: number
  end: number
}

export type GanttBarLayout = {
  jobIndex: number
  operationIndex: number
  machineId: string
  rowIndex: number
  start: number
  end: number
  /** Fraction of the plot width, 0..1. */
  x: number
  /** Fraction of the plot width, 0..1. */
  width: number
}

export function computeGanttLayout(
  schedule: ScheduledOperationApi[],
  machines: string[],
): GanttBarLayout[] {
  const makespan = Math.max(1, ...schedule.map((operation) => operation.end))
  const rowIndexByMachine = new Map(machines.map((machineId, index) => [machineId, index]))

  return schedule.map((operation) => ({
    jobIndex: operation.job_index,
    operationIndex: operation.operation_index,
    machineId: operation.machine_id,
    rowIndex: rowIndexByMachine.get(operation.machine_id) ?? 0,
    start: operation.start,
    end: operation.end,
    x: operation.start / makespan,
    width: (operation.end - operation.start) / makespan,
  }))
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/solve/layout.test.ts
```

Expected: PASS (all cases).

- [ ] **Step 5: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/solve/layout.ts frontend/src/solve/layout.test.ts
git commit -m "$(cat <<'EOF'
feat: add pure Gantt chart layout computation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `GanttChart` — SVG rendering + job highlighting

**Files:**
- Create: `frontend/src/solve/GanttBar.tsx`
- Create: `frontend/src/solve/GanttChart.tsx`
- Test: `frontend/src/solve/GanttChart.test.tsx`

**Interfaces:**
- Consumes: `computeGanttLayout`, `ScheduledOperationApi`, `GanttBarLayout` from `layout.ts` (Task 2).
- Produces: `GanttChart` (props: `schedule: ScheduledOperationApi[]`, `machines: string[]`) from `GanttChart.tsx` — consumed by Task 4 (`SolvePage.tsx`).

- [ ] **Step 1: Implement `GanttBar.tsx`**

Create `frontend/src/solve/GanttBar.tsx`:

```tsx
import type { GanttBarLayout } from './layout'

type GanttBarProps = {
  bar: GanttBarLayout
  x: number
  y: number
  width: number
  height: number
  color: string
  isDimmed: boolean
  onHover: (jobIndex: number | null) => void
  onToggle: (jobIndex: number) => void
}

export function GanttBar({
  bar,
  x,
  y,
  width,
  height,
  color,
  isDimmed,
  onHover,
  onToggle,
}: GanttBarProps) {
  return (
    <rect
      data-testid={`gantt-bar-${bar.jobIndex}-${bar.operationIndex}`}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={4}
      fill={color}
      opacity={isDimmed ? 0.35 : 1}
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(bar.jobIndex)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onToggle(bar.jobIndex)}
    >
      <title>
        {`Job ${bar.jobIndex + 1}, operation ${bar.operationIndex + 1} on ${bar.machineId}: ${bar.start}–${bar.end}`}
      </title>
    </rect>
  )
}
```

- [ ] **Step 2: Write the failing tests for `GanttChart`**

Create `frontend/src/solve/GanttChart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GanttChart } from './GanttChart'

const schedule = [
  { job_index: 0, operation_index: 0, machine_id: 'M1', start: 0, end: 5 },
  { job_index: 1, operation_index: 0, machine_id: 'M2', start: 0, end: 3 },
  { job_index: 0, operation_index: 1, machine_id: 'M2', start: 5, end: 8 },
]

describe('GanttChart', () => {
  it('renders one bar per scheduled operation', () => {
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)
    expect(screen.getByTestId('gantt-bar-0-0')).toBeInTheDocument()
    expect(screen.getByTestId('gantt-bar-1-0')).toBeInTheDocument()
    expect(screen.getByTestId('gantt-bar-0-1')).toBeInTheDocument()
  })

  it('renders a row label for every machine, including one with no scheduled operations', () => {
    render(<GanttChart schedule={schedule} machines={['M1', 'M2', 'M3']} />)
    expect(screen.getByText('M3')).toBeInTheDocument()
  })

  it('dims other jobs while hovering one operation', async () => {
    const user = userEvent.setup()
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    await user.hover(screen.getByTestId('gantt-bar-0-0'))

    expect(screen.getByTestId('gantt-bar-0-0')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('gantt-bar-0-1')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('gantt-bar-1-0')).toHaveAttribute('opacity', '0.35')
  })

  it('pins a highlight on click that survives the mouse leaving', async () => {
    const user = userEvent.setup()
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    await user.click(screen.getByTestId('gantt-bar-0-0'))
    await user.unhover(screen.getByTestId('gantt-bar-0-0'))

    expect(screen.getByTestId('gantt-bar-0-1')).toHaveAttribute('opacity', '1')
    expect(screen.getByTestId('gantt-bar-1-0')).toHaveAttribute('opacity', '0.35')
  })

  it('unpins when the same bar is clicked again', async () => {
    const user = userEvent.setup()
    render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

    await user.click(screen.getByTestId('gantt-bar-0-0'))
    await user.click(screen.getByTestId('gantt-bar-0-0'))

    expect(screen.getByTestId('gantt-bar-1-0')).toHaveAttribute('opacity', '1')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/solve/GanttChart.test.tsx
```

Expected: FAIL — `frontend/src/solve/GanttChart.tsx` does not exist.

- [ ] **Step 4: Implement `GanttChart.tsx`**

Create `frontend/src/solve/GanttChart.tsx`:

```tsx
import { useState } from 'react'
import { computeGanttLayout, type ScheduledOperationApi } from './layout'
import { GanttBar } from './GanttBar'

// The dataviz skill's validated default categorical palette (light mode),
// used unmodified, in its fixed order. See Global Constraints in the plan
// for why colors cycle past 8 jobs instead of growing a legend.
const CATEGORICAL_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]

const ROW_HEIGHT = 48
const BAR_INSET_Y = 8
const BAR_GAP_X = 2
const LEFT_MARGIN = 120
const RIGHT_MARGIN = 20
const TOP_MARGIN = 24
const BOTTOM_MARGIN = 24
const PLOT_WIDTH = 860
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1]

function colorForJob(jobIndex: number): string {
  return CATEGORICAL_COLORS[jobIndex % CATEGORICAL_COLORS.length]
}

type GanttChartProps = {
  schedule: ScheduledOperationApi[]
  machines: string[]
}

export function GanttChart({ schedule, machines }: GanttChartProps) {
  const [hoveredJob, setHoveredJob] = useState<number | null>(null)
  const [pinnedJob, setPinnedJob] = useState<number | null>(null)
  const highlightedJob = pinnedJob ?? hoveredJob

  const layout = computeGanttLayout(schedule, machines)
  const makespan = Math.max(1, ...schedule.map((operation) => operation.end))
  const plotHeight = machines.length * ROW_HEIGHT
  const height = TOP_MARGIN + plotHeight + BOTTOM_MARGIN
  const width = LEFT_MARGIN + PLOT_WIDTH + RIGHT_MARGIN

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Solve schedule Gantt chart"
      className="w-full"
    >
      {machines.map((machineId, rowIndex) => (
        <text
          key={machineId}
          x={LEFT_MARGIN - 8}
          y={TOP_MARGIN + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-slate-600 text-xs"
        >
          {machineId}
        </text>
      ))}

      {AXIS_TICKS.map((fraction) => (
        <g key={fraction}>
          <line
            x1={LEFT_MARGIN + fraction * PLOT_WIDTH}
            x2={LEFT_MARGIN + fraction * PLOT_WIDTH}
            y1={TOP_MARGIN}
            y2={TOP_MARGIN + plotHeight}
            stroke="#e1e0d9"
            strokeWidth={1}
          />
          <text
            x={LEFT_MARGIN + fraction * PLOT_WIDTH}
            y={TOP_MARGIN + plotHeight + 16}
            textAnchor="middle"
            className="fill-slate-400 text-xs"
          >
            {Math.round(fraction * makespan)}
          </text>
        </g>
      ))}

      {layout.map((bar) => (
        <GanttBar
          key={`${bar.jobIndex}-${bar.operationIndex}`}
          bar={bar}
          x={LEFT_MARGIN + bar.x * PLOT_WIDTH + BAR_GAP_X / 2}
          y={TOP_MARGIN + bar.rowIndex * ROW_HEIGHT + BAR_INSET_Y}
          width={Math.max(0, bar.width * PLOT_WIDTH - BAR_GAP_X)}
          height={ROW_HEIGHT - BAR_INSET_Y * 2}
          color={colorForJob(bar.jobIndex)}
          isDimmed={highlightedJob !== null && highlightedJob !== bar.jobIndex}
          onHover={setHoveredJob}
          onToggle={(jobIndex) =>
            setPinnedJob((current) => (current === jobIndex ? null : jobIndex))
          }
        />
      ))}
    </svg>
  )
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx vitest run src/solve/GanttChart.test.tsx
```

Expected: PASS (all cases).

- [ ] **Step 6: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/solve/GanttBar.tsx frontend/src/solve/GanttChart.tsx frontend/src/solve/GanttChart.test.tsx
git commit -m "$(cat <<'EOF'
feat: add interactive Gantt chart with cross-row job highlighting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `SolvePage` — live progress, completed/failed states, routing

**Files:**
- Create: `frontend/src/solve/SolvePage.tsx`
- Test: `frontend/src/solve/SolvePage.test.tsx`
- Modify: `frontend/src/AppRoutes.tsx`
- Modify: `frontend/src/AppRoutes.test.tsx`

**Interfaces:**
- Consumes: `useProblem` (existing, Phase 2) and `useSolve` (Task 1) from `../api/queries.ts`; `GanttChart` from `./GanttChart.tsx` (Task 3); `ScheduledOperationApi` from `./layout.ts` (Task 2).
- Produces: `SolvePage` (named export, no props) from `SolvePage.tsx` — wired into `AppRoutes.tsx`'s `/problems/:id/solves/:solveId` route.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/solve/SolvePage.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/solve/SolvePage.test.tsx
```

Expected: FAIL — `frontend/src/solve/SolvePage.tsx` does not exist.

- [ ] **Step 3: Implement `SolvePage.tsx`**

Create `frontend/src/solve/SolvePage.tsx`:

```tsx
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
            <span>Elapsed: {solve.data.elapsed_seconds?.toFixed(1)}s</span>
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
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/solve/SolvePage.test.tsx
```

Expected: PASS (all cases).

- [ ] **Step 5: Add the route**

Replace `frontend/src/AppRoutes.tsx` with:

```tsx
import type { RouteObject } from 'react-router'
import { GalleryPage } from './gallery/GalleryPage'
import { BuilderPage } from './builder/BuilderPage'
import { SolvePage } from './solve/SolvePage'

export const routes: RouteObject[] = [
  { path: '/', element: <GalleryPage /> },
  { path: '/problems/new', element: <BuilderPage /> },
  { path: '/problems/:id', element: <BuilderPage /> },
  { path: '/problems/:id/solves/:solveId', element: <SolvePage /> },
]
```

- [ ] **Step 6: Add a routing test**

In `frontend/src/AppRoutes.test.tsx`, add this test inside the existing `describe('routes', ...)` block:

```tsx
  it('renders the Solve view on the solve route', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/problems/abc/solves/xyz')
    expect(await screen.findByText(/loading/i)).toBeInTheDocument()
  })
```

- [ ] **Step 7: Run the routing test**

```bash
npx vitest run src/AppRoutes.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/solve/SolvePage.tsx frontend/src/solve/SolvePage.test.tsx frontend/src/AppRoutes.tsx frontend/src/AppRoutes.test.tsx
git commit -m "$(cat <<'EOF'
feat: add SolvePage with live progress and completed/failed states

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire the Solve trigger into the Builder

**Files:**
- Modify: `frontend/src/builder/BuilderHeader.tsx`
- Modify: `frontend/src/builder/BuilderForm.tsx`
- Modify: `frontend/src/builder/BuilderForm.test.tsx`
- Modify: `frontend/src/builder/BuilderPage.tsx`
- Modify: `frontend/src/builder/BuilderPage.test.tsx`

**Interfaces:**
- Consumes: `useCreateSolve` from `../api/queries.ts` (Task 1).
- Produces: `BuilderForm` gains `onSolve?: () => void`, `isStartingSolve?: boolean`, `solveError?: string` props (all optional, backward compatible with every existing call site).

- [ ] **Step 1: Update `BuilderHeader.tsx`**

Replace `frontend/src/builder/BuilderHeader.tsx` with:

```tsx
type BuilderHeaderProps = {
  name: string
  onChangeName: (name: string) => void
  onBack: () => void
  onSave: () => void
  canSave: boolean
  isSaving: boolean
  justSaved?: boolean
  onSolve?: () => void
  canSolve: boolean
  isStartingSolve: boolean
}

export function BuilderHeader({
  name,
  onChangeName,
  onBack,
  onSave,
  canSave,
  isSaving,
  justSaved,
  onSolve,
  canSolve,
  isStartingSolve,
}: BuilderHeaderProps) {
  const solveTitle = !onSolve
    ? 'Save this problem before solving'
    : !canSolve
      ? 'Save your changes first'
      : undefined

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
        onClick={onSolve}
        disabled={!onSolve || !canSolve || isStartingSolve}
        title={solveTitle}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
      >
        {isStartingSolve ? 'Starting…' : 'Solve'}
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
```

- [ ] **Step 2: Write the failing tests for `BuilderForm`'s Solve wiring**

In `frontend/src/builder/BuilderForm.test.tsx`, add these tests inside the existing `describe('BuilderForm', ...)` block, right after the `'renders problem-level errors passed in via saveErrors'` test:

```tsx
  it('disables Solve when onSolve is not provided (e.g. an unsaved new problem)', () => {
    renderBuilderForm()
    expect(screen.getByText('Solve')).toBeDisabled()
  })

  it('disables Solve while there are unsaved changes', async () => {
    const user = userEvent.setup()
    renderBuilderForm({ onSolve: vi.fn() })
    await user.type(screen.getByLabelText('Machine name'), 'M1')
    expect(screen.getByText('Solve')).toBeDisabled()
  })

  it('enables Solve and calls onSolve when the draft is clean', async () => {
    const user = userEvent.setup()
    const onSolve = vi.fn()
    renderBuilderForm({
      initialDraft: draftWithTwoMachines(),
      savedDraft: draftWithTwoMachines(),
      onSolve,
    })
    expect(screen.getByText('Solve')).not.toBeDisabled()
    await user.click(screen.getByText('Solve'))
    expect(onSolve).toHaveBeenCalled()
  })

  it('shows a solve-start error when provided', () => {
    renderBuilderForm({ solveError: "Couldn't start the solve. Try again." })
    expect(screen.getByText("Couldn't start the solve. Try again.")).toBeInTheDocument()
  })
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/builder/BuilderForm.test.tsx
```

Expected: FAIL — `BuilderForm` doesn't yet accept `onSolve`/`isStartingSolve`/`solveError`, and `BuilderHeader`'s Solve button isn't wired to them yet (it will still render as permanently `disabled` from the old hardcoded markup until Step 4).

- [ ] **Step 4: Implement the `BuilderForm.tsx` changes**

In `frontend/src/builder/BuilderForm.tsx`, change the `BuilderFormProps` type from:

```tsx
type BuilderFormProps = {
  initialDraft: BuilderDraft
  savedDraft: BuilderDraft
  onBack: () => void
  onSave: (draft: BuilderDraft) => void
  isSaving: boolean
  justSaved?: boolean
  saveErrors?: ValidationResult
}
```

to:

```tsx
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
```

Change the function signature from:

```tsx
export function BuilderForm({
  initialDraft,
  savedDraft,
  onBack,
  onSave,
  isSaving,
  justSaved,
  saveErrors,
}: BuilderFormProps) {
```

to:

```tsx
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
```

Right after the line `const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)`, add:

```tsx
  const canSolve = Boolean(onSolve) && !isDirty
```

Change the `<BuilderHeader ... />` call from:

```tsx
      <BuilderHeader
        name={draft.name}
        onChangeName={(name) => dispatch({ type: 'setName', name })}
        onBack={onBack}
        onSave={() => onSave(draft)}
        canSave={validation.isValid}
        isSaving={isSaving}
        justSaved={justSaved}
      />
```

to:

```tsx
      <BuilderHeader
        name={draft.name}
        onChangeName={(name) => dispatch({ type: 'setName', name })}
        onBack={onBack}
        onSave={() => onSave(draft)}
        canSave={validation.isValid}
        isSaving={isSaving}
        justSaved={justSaved}
        onSolve={onSolve}
        canSolve={canSolve}
        isStartingSolve={isStartingSolve ?? false}
      />
```

And right after the closing `)}` of the existing `{errors.problemErrors.length > 0 ? (...) : null}` block, add:

```tsx
      {solveError ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{solveError}</div>
      ) : null}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx vitest run src/builder/BuilderForm.test.tsx
```

Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 6: Write the failing test for `BuilderPage`'s Solve wiring**

In `frontend/src/builder/BuilderPage.test.tsx`, change the `renderAt` helper's route list from:

```tsx
    [
      { path: '/problems/new', element: <BuilderPage /> },
      { path: '/problems/:id', element: <BuilderPage /> },
      { path: '/other', element: <p>Elsewhere</p> },
    ],
```

to:

```tsx
    [
      { path: '/problems/new', element: <BuilderPage /> },
      { path: '/problems/:id', element: <BuilderPage /> },
      { path: '/problems/:id/solves/:solveId', element: <p>Solve View</p> },
      { path: '/other', element: <p>Elsewhere</p> },
    ],
```

Then add this test inside the existing `describe('BuilderPage', ...)` block:

```tsx
  it('starts a solve and navigates to the solve view', async () => {
    const user = userEvent.setup()
    const problem = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    const createdSolve = {
      id: 'solve-1',
      status: 'pending',
      best_objective: null,
      best_bound: null,
      elapsed_seconds: null,
      schedule: null,
      objective_mode: 'makespan',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) =>
        Promise.resolve(
          request.method === 'POST' && request.url.includes('/api/solves')
            ? jsonResponse(createdSolve, 202)
            : jsonResponse(problem),
        ),
      ),
    )

    const { router } = renderAt('/problems/abc')
    await screen.findByLabelText('Problem name')
    await user.click(screen.getByText('Solve'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/problems/abc/solves/solve-1'))
  })

  it('shows an error near the Solve button when starting a solve fails', async () => {
    const user = userEvent.setup()
    const problem = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) =>
        Promise.resolve(
          request.method === 'POST' && request.url.includes('/api/solves')
            ? jsonResponse({ detail: 'boom' }, 500)
            : jsonResponse(problem),
        ),
      ),
    )

    renderAt('/problems/abc')
    await screen.findByLabelText('Problem name')
    await user.click(screen.getByText('Solve'))

    expect(await screen.findByText(/couldn't start the solve/i)).toBeInTheDocument()
  })
```

- [ ] **Step 7: Run it to verify it fails**

```bash
npx vitest run src/builder/BuilderPage.test.tsx
```

Expected: FAIL — `ExistingProblemBuilder` doesn't call `useCreateSolve` or pass `onSolve` yet.

- [ ] **Step 8: Implement the `BuilderPage.tsx` changes**

In `frontend/src/builder/BuilderPage.tsx`, change the import line from:

```tsx
import { useCreateProblem, useProblem, useUpdateProblem } from '../api/queries'
```

to:

```tsx
import { useCreateProblem, useCreateSolve, useProblem, useUpdateProblem } from '../api/queries'
```

In `ExistingProblemBuilder`, add `useCreateSolve` and a `solveError` state right after the existing `const [savedDraft, setSavedDraft] = useState<BuilderDraft>()` line:

```tsx
  const createSolve = useCreateSolve()
  const [solveError, setSolveError] = useState<string>()
```

Change the `<BuilderForm ... />` call from:

```tsx
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
```

to:

```tsx
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
```

- [ ] **Step 9: Run it to verify it passes**

```bash
npx vitest run src/builder/BuilderPage.test.tsx
```

Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 10: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/builder/BuilderHeader.tsx frontend/src/builder/BuilderForm.tsx frontend/src/builder/BuilderForm.test.tsx frontend/src/builder/BuilderPage.tsx frontend/src/builder/BuilderPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: wire the Solve button to start a solve and navigate to it

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: End-to-end manual smoke check

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend and frontend suites**

```bash
uv run pytest
cd frontend
npm run lint
npm test
npm run build
```

Expected: everything passes.

- [ ] **Step 2: Manual smoke check**

In one terminal:

```bash
uv run uvicorn makespan.main:app --reload
```

In another:

```bash
cd frontend
npm run dev
```

Open the printed URL and confirm:

- Opening an existing saved problem (or a preset) shows an enabled "Solve" button.
- Editing a field disables "Solve" (tooltip: "Save your changes first"); saving re-enables it.
- On `/problems/new` (before the first save), "Solve" is disabled (tooltip: "Save this problem before solving").
- Clicking "Solve" navigates to `/problems/:id/solves/:solveId` and shows a live "Solving…" panel with a progress bar and, once the solver reports a first incumbent, a "Best so far" line.
- Once the solve finishes, the page shows the objective/elapsed stats and a Gantt chart with one row per machine and colored blocks per operation.
- Hovering a block shows a native tooltip with job/operation/machine/start/end; hovering also dims every other job's blocks. Clicking a block pins that highlight even after the mouse leaves; clicking it again unpins it.
- Solving a problem with due dates (e.g. one edited to add a due date in the Builder) labels the objective "Weighted score" instead of "Makespan".
- "← Back to Builder" and the problem name in the header work from every state.

Skip manually triggering the `failed` state — the current Builder UI has no way to construct a genuinely infeasible problem (no downtime-window editing exists yet, per Phase 2's scope) or to otherwise force a solver error. That state is already covered by `SolvePage.test.tsx`'s `'shows the failure message with no Gantt when the solve failed'` test (Task 4); don't spend time trying to reproduce it by hand.

Stop both dev servers once confirmed.

- [ ] **Step 3: Fix any issues found, then re-run the full check suites**

If anything was fixed:

```bash
uv run pytest
cd frontend && npm run lint && npm test && npm run build
```

Expected: all green.

- [ ] **Step 4: Commit, if any fixes were made**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: address issues found in Solve view end-to-end smoke check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
