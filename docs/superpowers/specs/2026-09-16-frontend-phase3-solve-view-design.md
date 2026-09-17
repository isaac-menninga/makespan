# Frontend Phase 3 — Solve View — Design

**Date**: 2026-09-16
**Status**: Approved for implementation planning

## Purpose

Replace the Builder's disabled "Solve" placeholder with a working Solve view:
starting a solve, polling its live progress, and rendering the finished
schedule as a custom Gantt chart. This is the last of the three frontend
phases named in `docs/superpowers/specs/2026-09-09-job-shop-scheduler-design.md`
("Frontend Design" section).

## Relationship to the overall frontend

1. **Phase 1 (shipped)**: scaffold + typed API client + Gallery page.
2. **Phase 2 (shipped)**: Builder — jobs/machines/operations editor.
3. **Phase 3 (this spec)**: Solve view — live progress + Gantt chart at
   `/problems/:id/solves/:solveId`.

No backend changes are required. `POST /api/solves`, `GET /api/solves/{id}`,
and `GET /api/problems/{id}` (used for the problem name and machine list)
already support everything this phase needs (see
`src/makespan/api/solves.py`, `src/makespan/api/problems.py`).

The backend collapses the solver's internal outcome (`optimal` / `feasible`
/ `infeasible` / `failed`) into just two terminal `SolveRecord.status`
values — `completed` or `failed` — with any distinguishing detail carried
in the optional `message` field. The frontend therefore only ever handles
four `status` values: `pending`, `running`, `completed`, `failed`. It
displays `message` verbatim when present and does not assume any specific
format for it (e.g. it never asserts a solve was "proven optimal" — the
backend doesn't expose that distinction at the API level).

## Scope decisions

- **Time limit**: fixed at the backend's 30-second default. No UI to
  configure `time_limit_seconds` in this phase.
- **Gantt interactivity**: hovering or clicking an operation highlights
  that job's blocks across every machine row (click toggles a "pinned"
  highlight, so the interaction also works without hover, e.g. on touch).
  This is the specific reason the base design doc chose a custom SVG
  component over an off-the-shelf Gantt library — implementing it is in
  scope, not deferred.
- **Tooltip**: a native SVG `<title>` element per bar (job/operation/
  machine/start/end). Deliberately simple — no custom-positioned HTML
  tooltip in this phase. Trade-off: native tooltips have a hover delay and
  can't be styled; a custom tooltip is a reasonable later upgrade.
- **No solve-history list.** The backend already has
  `GET /api/problems/{id}/solves`, but no UI surfaces it yet. Past solves
  remain reachable only by direct URL. Re-solving always goes back through
  the Builder's Solve button, which starts a fresh solve with its own URL.
- **Solve is disabled while the Builder draft has unsaved changes.** Solve
  always acts on the persisted (saved) problem, never the in-editor draft,
  so allowing it while dirty would silently solve stale data. This reuses
  `BuilderForm`'s existing `isDirty` computation (see below) rather than
  duplicating it.

## Routing & Solve trigger

`SolvePage` is added to `AppRoutes.tsx`'s `routes: RouteObject[]` at
`/problems/:id/solves/:solveId`.

`BuilderHeader`'s Solve button becomes live, but its enabling logic lives
in `BuilderForm`, not `BuilderPage` — `BuilderForm` already computes
`isDirty` locally (for the unsaved-changes guard), and that's the natural
place to gate Solve too, rather than lifting dirty-state out of the
component that owns it. `BuilderForm` gains an optional
`onSolve?: () => void` prop; when present, `canSolve = !isDirty` is passed
to `BuilderHeader` along with `onSolve`, and the disabled tooltip changes
from "Coming in a later phase" to "Save your changes first" when dirty.
`NewProblemBuilder` (no persisted problem id yet) never passes `onSolve`,
so Solve stays disabled there with no special-casing needed anywhere else.

`ExistingProblemBuilder` in `BuilderPage.tsx` wires the actual click:
calls `useCreateSolve()` (`POST /api/solves` with
`{problem_id: id, time_limit_seconds: 30}`), and on success navigates to
`/problems/${id}/solves/${solve.id}`. A start failure shows a small inline
error near the Solve button (matching the "Couldn't ___" pattern used
elsewhere in the app) — no separate retry action needed, since re-clicking
Solve retries naturally.

## Data layer

Two new hooks in `frontend/src/api/queries.ts`, following the exact
pattern `useProblem`/`useCreateProblem` already established in Phase 2:

- `useCreateSolve()` — mutation, `POST /api/solves`.
- `useSolve(id)` — query, `GET /api/solves/{id}`, with:
  ```ts
  refetchInterval: (query) => {
    const status = query.state.data?.status
    return status === 'pending' || status === 'running' ? 1000 : false
  }
  ```
  Polls once per second while the solve is in flight, stops once terminal.

`SolvePage` also calls the existing `useProblem(id)` (Phase 2) for the
problem's name (header) and its `machines` list — the authoritative row
order for the Gantt chart, including any machine with zero scheduled
operations, which the `schedule` array alone wouldn't reveal.

## SolvePage states

Driven by `solve.isPending`/`solve.isError` (the query's own fetch
lifecycle) and then `solve.data.status`:

- **Loading** (first fetch) — matches the Builder's "Loading…" pattern.
- **Fetch error** — "Couldn't load this solve." + Retry, matching the
  established pattern (`GalleryPage`, `BuilderPage`).
- **`pending` / `running`** — a live panel: best objective/bound so far
  (may be absent early in the run), elapsed time vs. the 30s time limit as
  a simple progress bar, a "Solving…" indicator. No Gantt yet — the
  backend doesn't populate `schedule` until a terminal status.
- **`completed`** — a stats line (objective, labeled "Makespan" or
  "Weighted score" depending on `objective_mode`; elapsed time) plus the
  Gantt chart.
- **`failed`** — the `message` field shown plainly, no Gantt, a
  "← Back to Builder" link (`/problems/:id`) to adjust and re-solve.

A small header (name from `useProblem`, once loaded — the page isn't
blocked on it) with a "← Back to Builder" link appears in every state.

## Gantt chart (`frontend/src/solve/`)

Split into a pure layout function and a thin rendering component, the same
separation Phase 2 used for its reducer/validation logic — geometry is
unit-testable without touching SVG or React:

- **`layout.ts`** — `computeGanttLayout(schedule, machines)`, returning one
  entry per scheduled operation:
  ```ts
  type GanttBarLayout = {
    machineId: string
    jobIndex: number
    operationIndex: number
    x: number        // fraction of plot width, 0..1
    width: number     // fraction of plot width, 0..1
    rowIndex: number  // index into `machines`
  }
  ```
  `x`/`width` are computed against the makespan (`max(operation.end)` across
  the schedule, with a defensive floor of `1` against a literal empty
  schedule — cheap, since this is data crossing the network boundary, not
  an internal invariant). `rowIndex` comes from the operation's
  `machine_id`'s position in the `machines` array (the Problem's ordered
  machine list, not just whichever machines happen to appear in the
  schedule), so an idle machine still gets its own empty row.

- **`GanttChart.tsx`** — consumes the layout, renders one `<svg>` with a
  `viewBox` (responsive, scales to its container), one row per machine
  (label + a handful of time-axis gridlines), one `<rect>` per operation
  colored by `jobIndex` (categorical palette — the `dataviz` skill is
  loaded when this component is actually built, per its own trigger
  conditions, rather than hardcoding colors in this spec). Hover/click
  state (`hoveredJobIndex: number | null`) lives in `GanttChart` itself;
  each bar receives a computed `isHighlighted`/`isDimmed` pair of booleans
  rather than reading shared state itself, keeping the one genuinely
  stateful piece of this feature in a single place.

## Testing

- Unit: `computeGanttLayout` — row assignment (including an idle machine),
  x/width scaling, the empty-schedule floor.
- Component: `SolvePage` for all four states, driven through mocked
  `fetch` + Vitest's fake timers advancing a `pending` → `running` →
  `completed` polling sequence; a failed-solve case separately.
- Component: `GanttChart` — bar count/positions for a small fixed
  schedule, and the hover/click highlight interaction.
- `BuilderForm`/`BuilderHeader`: Solve button disabled while dirty,
  enabled once clean, absent/disabled with no persisted id.

## Out of scope for Phase 3

- Time-limit configuration UI.
- A solve-history list (backend endpoint exists, unused by the UI).
- A custom (non-native) positioned tooltip.
- Re-solving directly from the Solve view (always via the Builder).
- Dark mode (standing constraint from Phase 1, unchanged).
