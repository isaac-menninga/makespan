# Job Naming & Gantt Responsive Sizing — Design

**Date**: 2026-09-18
**Status**: Approved for implementation planning

## Purpose

Two small, related gaps left over from earlier frontend phases:

1. **No job naming.** Jobs are identified only by position (`job_index`)
   everywhere in the system — the solver, the API, the Builder, the Gantt
   chart. There is no `Job.name` field anywhere. Jobs read as "Job 1",
   "Job 2", etc. with no way to give them a meaningful label.
2. **Gantt chart isn't truly responsive.** `GanttChart`'s `<svg>` scales
   uniformly via `viewBox` + `className="w-full"` (noted as a known,
   accepted limitation in the Phase 4 — Layout Foundation spec's "Known
   partial improvement" section). Row height and bar width grow together,
   proportionally, because both come from the same internal coordinate
   system. On a wide monitor with many machines, that can make the chart
   awkwardly tall instead of just more legible.

Both were explicitly named as a deferred, tentative future phase in the
Phase 4 spec. This spec covers both together — they don't share files or
logic, but they're small enough, and were already scoped together on the
roadmap, that one combined phase is more efficient than two.

## Relationship to other frontend work

1. **Phases 1–4 (shipped)**: Gallery, Builder, Solve view, shared layout
   foundation (nav rail, widened content).
2. **This phase**: job naming (backend field + Builder UI + Gantt tooltip)
   and Gantt resize decoupling.
3. **Bookmarked, explicitly separate future effort**: a dedicated redesign
   of the Builder's own create/edit UX (unchanged from Phase 4's framing).
4. **Bookmarked, explicitly separate future effort (new)**: richer,
   non-color-reliant job identity in the Gantt chart — a custom hover
   panel (replacing the native SVG `<title>` tooltip, which has hover
   delay and can't be styled), and a refined categorical color palette
   (possibly fewer than 8 colors). Discussed and deliberately deferred
   during this phase's brainstorming: building a legend now would likely
   need rework once the palette changes, and a good custom hover panel
   (positioning, content layout, keyboard/touch access) deserves its own
   design pass rather than being folded in here.

No backend schema migration. No changes to `frontend/src/AppShell.tsx` or
any Phase 4 layout work.

## Scope decisions

- **Job name is optional**, not required. No Builder-side validation
  forces a name. Anywhere a name would display, an unnamed job falls back
  to "Job N" (1-indexed), matching the wording the Gantt tooltip already
  uses today.
- **No uniqueness constraint** on job names within a problem. A name is
  just a label, the same way machine names already have no cross-machine
  uniqueness check.
- **Job ordinal number and job name are two independent things.** The
  ordinal ("Job 1", "Job 2", ...) is positional, always present, and is
  what due dates and the Gantt already key off via `job_index`. The name
  is a separate, optional, purely cosmetic field. The Builder shows both:
  a numbered heading plus an adjacent optional name input — never a
  single field that conflates the two.
- **Display surface for the name is the Gantt tooltip only.** No legend,
  no custom hover panel — see "Bookmarked" item 4 above. The existing
  native `<title>` tooltip text gains the job's name (when set) in place
  of "Job N"; that's the only rendering change tied to naming.
- **Gantt resize uses `ResizeObserver` on a wrapping container**, not CSS
  container queries or viewport breakpoints — see "Technical design"
  below for why the alternatives were rejected.
- **No new maximum width cap for the Gantt chart.** It already renders
  inside Phase 4's `--content-max-width: 1600px` container, which is
  ceiling enough.

## Technical design

### Backend: `Job.name`

`src/makespan/solver/models.py`:

```python
class Job(BaseModel):
    operations: list[Operation] = Field(min_length=1)
    name: str | None = None
```

`ProblemRecord.jobs` (`src/makespan/db/models.py`) is stored as a raw JSON
column (`list[dict]`) — adding a field to the `Job` Pydantic model needs
**no SQL migration**. Existing saved problems' job dicts simply have no
`name` key, which parses as `None` under the new optional field. The API
layer (`ProblemIn`/`ProblemOut` in `src/makespan/api/schemas.py`) inherits
`ProblemSpec`, which contains `jobs: list[Job]` — no separate schema
change needed there; the field flows through automatically once `Job`
has it, and `frontend/src/api/schema.ts` picks it up via the existing
`generate-types` regeneration step.

No validator is added for uniqueness (see Scope decisions).

### Builder UI

`frontend/src/builder/types.ts` — `JobDraft` gains an optional `name`:

```typescript
export type JobDraft = {
  id: string
  operations: OperationDraft[]
  dueDate?: number
  weight?: number
  name?: string
}
```

`frontend/src/builder/reducer.ts` — new action, mirroring the existing
`setJobDueDate`/`setJobWeight` shape:

```typescript
| { type: 'setJobName'; jobId: string; name: string }
```

Reducer case:

```typescript
case 'setJobName': {
  const job = draft.jobs.find((j) => j.id === action.jobId)
  if (job) job.name = action.name === '' ? undefined : action.name
}
```

(Empty string normalizes to `undefined` — an emptied name field is the
same as never having set one, not an explicit empty-string name.)

`frontend/src/builder/BuilderForm.tsx` — the `.map()` over `draft.jobs`
(around line 94) currently discards the index; it needs the index to
pass a 1-based job number down:

```tsx
{draft.jobs.map((job, index) => (
  <JobCard
    key={job.id}
    job={job}
    jobNumber={index + 1}
    machines={draft.machines}
    // ...existing props...
    onSetName={(name) => dispatch({ type: 'setJobName', jobId: job.id, name })}
  />
))}
```

`frontend/src/builder/JobCard.tsx` — replace the static `<h3>Job</h3>`
with the numbered heading, and add a name input beside it:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <h3 className="font-medium text-slate-900">Job {jobNumber}</h3>
    <input
      type="text"
      value={job.name ?? ''}
      onChange={(e) => onSetName(e.target.value)}
      placeholder="Name (optional)"
      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
    />
  </div>
  <button /* existing Remove Job button, unchanged */>
```

`JobCardProps` gains `jobNumber: number` and `onSetName: (name: string) => void`.

`frontend/src/builder/transform.ts`:

- `hydrateSpec`: `jobs` mapping gains `name: job.name` (carried straight
  through from the API job object; `undefined`/absent is fine).
- `serialize`: `draft.jobs.map(...)` output gains `name: job.name`.
  `JSON.stringify` drops `undefined`-valued keys automatically, so an
  unnamed job simply omits `name` from the request body — the backend's
  `name: str | None = None` default handles a missing key the same as an
  explicit `null`.

### Gantt tooltip

`frontend/src/solve/SolvePage.tsx` already has `problem.data` (the full
`ProblemOut`, including `jobs`) in scope. It derives an array of job
names and passes it down:

```tsx
<GanttChart
  schedule={(solve.data.schedule ?? []) as ScheduledOperationApi[]}
  machines={problem.data.machines}
  jobNames={problem.data.jobs.map((job) => job.name ?? undefined)}
/>
```

`GanttChart` (`frontend/src/solve/GanttChart.tsx`) accepts `jobNames?:
(string | undefined)[]` and passes the resolved name for each bar's job
down to `GanttBar`. `GanttBar` (`frontend/src/solve/GanttBar.tsx`) already
builds its own `<title>` text; it changes from:

```tsx
{`Job ${bar.jobIndex + 1}, operation ${bar.operationIndex + 1} on ${bar.machineId}: ${bar.start}–${bar.end}`}
```

to using the resolved name in place of `Job ${bar.jobIndex + 1}` when
present, falling back to today's wording otherwise:

```tsx
{`${jobLabel}, operation ${bar.operationIndex + 1} on ${bar.machineId}: ${bar.start}–${bar.end}`}
```

where `jobLabel` is computed once in `GanttChart` per bar (`jobNames?.[bar.jobIndex] ?? \`Job ${bar.jobIndex + 1}\``) and passed to `GanttBar` as a new prop, keeping `GanttBar` free of any fallback-formatting logic of its own.

### Gantt resize decoupling

Today, `GanttChart.tsx` has:

```tsx
const PLOT_WIDTH = 860
// ...
const width = LEFT_MARGIN + PLOT_WIDTH + RIGHT_MARGIN
const height = TOP_MARGIN + plotHeight + BOTTOM_MARGIN
return (
  <svg viewBox={`0 0 ${width} ${height}`} className="w-full" ...>
```

Because `viewBox`'s width is a hardcoded constant while the SVG's
*rendered* width is `100%` of a variable-width container, the browser's
default `preserveAspectRatio` behavior ("xMidYMid meet") scales the whole
coordinate system — including `ROW_HEIGHT` — to make the two match. That
uniform scaling is the coupling to remove.

**Fix:** stop hardcoding `PLOT_WIDTH`. Measure the container's actual
rendered width via `ResizeObserver`, and use that measurement directly as
`PLOT_WIDTH` (so `viewBox`'s width always equals the SVG's true rendered
width — at that point the scale factor is 1, and there's nothing left to
distort). Give the `<svg>` an explicit pixel `height` via inline style
(computed the same way as today, from `ROW_HEIGHT × machines.length`)
instead of letting the browser derive height from the aspect ratio — this
is what keeps height independent of width once the coordinate system
isn't being rescaled.

```tsx
const MIN_PLOT_WIDTH = 300

function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    if (!ref.current) return
    setWidth(ref.current.getBoundingClientRect().width)

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export function GanttChart({ schedule, machines, jobNames }: GanttChartProps) {
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const plotWidth = Math.max(MIN_PLOT_WIDTH, containerWidth - LEFT_MARGIN - RIGHT_MARGIN)
  // ...layout computed from plotWidth instead of the old PLOT_WIDTH constant...
  const width = LEFT_MARGIN + plotWidth + RIGHT_MARGIN
  const height = TOP_MARGIN + plotHeight + BOTTOM_MARGIN

  return (
    <div ref={containerRef}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} className="w-full" ...>
        {/* ...existing content, using plotWidth wherever PLOT_WIDTH was used... */}
      </svg>
    </div>
  )
}
```

`useContainerWidth` is defined inline in `GanttChart.tsx`, not extracted
to its own file — it has exactly one caller, and a single-use hook doesn't
need a file of its own yet (YAGNI; extract later if a second caller shows
up).

The initial synchronous `getBoundingClientRect()` read inside
`useLayoutEffect` (before the observer's first callback) avoids a
one-frame flash of an unmeasured chart on first mount.

**Rejected approaches:**

- **CSS container queries** (`@container` + `cqw` units): the chart's bar
  positions, axis tick positions, and label offsets are all computed in
  JS from pixel margins (`LEFT_MARGIN`, etc.) baked into SVG attribute
  values — container queries only affect CSS-styled properties, not those
  JS-computed coordinates. Adopting this would mean rewriting the chart's
  entire positioning model, not just its width source — far larger than
  this phase's scope.
- **Viewport breakpoints** (`window.matchMedia`): simpler to implement
  and test, but measures the *viewport*, not the actual container — which
  is already narrower than the viewport by the Phase 4 nav rail's width
  (192px) plus padding, and would silently go wrong again if the
  surrounding layout ever changes (e.g. a future collapsible nav). A
  container-measuring approach is correct regardless of what wraps it.

### Test infrastructure: `ResizeObserver` polyfill

jsdom (this project's Vitest test environment) does not implement
`ResizeObserver` — calling `new ResizeObserver(...)` in a test would throw
`ReferenceError: ResizeObserver is not defined`. `frontend/vitest.setup.ts`
gets a minimal global stub:

```typescript
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
```

This stub's `observe()` never fires a callback — under jsdom, `GanttChart`
falls back to its initial `getBoundingClientRect()` read (which jsdom
returns as all-zero by default), so `plotWidth` clamps to
`MIN_PLOT_WIDTH` in every test. No existing `GanttChart.test.tsx` test
asserts on exact pixel positions (only `data-testid` presence, text
content, and `opacity` attributes), so this fallback needs no per-test
mocking and every existing test keeps passing unmodified.

## Testing

- **Backend** (`tests/solver/test_models.py`): a job's `name` is optional
  and defaults to `None`; a `Job` with a `name` roundtrips through
  `ProblemSpec` validation unchanged.
- **Backend** (`tests/api/test_problems.py`): creating a problem with a
  named job persists and returns the name; creating one with an unnamed
  job returns `null`/absent for that job's name (no crash, no default
  substitution at the API layer — "Job N" fallback is a *display*
  convention, not stored data).
- **Frontend** (`frontend/src/builder/reducer.test.ts`): `setJobName` sets
  the name; setting it to an empty string clears it back to `undefined`.
- **Frontend** (`frontend/src/builder/transform.test.ts`): a job's `name`
  roundtrips through `hydrateSpec`/`serialize` in both directions,
  including the unnamed case.
- **Frontend** (`frontend/src/builder/BuilderForm.test.tsx`): the job
  heading shows "Job 1", "Job 2", ... in position order; typing into a
  job's name input and saving carries the name through.
- **Frontend** (`frontend/src/solve/GanttChart.test.tsx`): a bar's tooltip
  text uses the job's name when `jobNames` provides one, and falls back
  to "Job N" when it doesn't (extends the existing tooltip test rather
  than replacing it — the existing test's schedule has no `jobNames`
  passed at all, so it should keep asserting the fallback wording
  unchanged). One new test locks in the `MIN_PLOT_WIDTH` clamping
  behavior under jsdom's zero-width `getBoundingClientRect()` fallback,
  asserting the rendered `<svg>`'s `viewBox` reflects the clamped width.
- No new migration/backfill test — there is no migration.

## Out of scope for this phase

- Required/validated job names, or any uniqueness constraint.
- A Gantt legend mapping colors to job names.
- A custom (non-native) hover panel for Gantt bars.
- Refining or shrinking the categorical color palette.
- Any change to `AppShell.tsx` or other Phase 4 layout-foundation work.
- A maximum-width cap on the Gantt chart beyond Phase 4's existing
  `--content-max-width: 1600px` page-level cap.
- Extracting `useContainerWidth` into a shared/reusable hook file (single
  caller today; revisit if a second one appears).
