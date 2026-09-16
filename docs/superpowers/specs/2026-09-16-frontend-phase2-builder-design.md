# Frontend Phase 2 — Builder — Design

**Date**: 2026-09-16
**Status**: Approved for implementation planning

## Purpose

Replace the `ComingSoonPage` placeholders at `/problems/new` and `/problems/:id`
(added in Phase 1) with the real Builder: an editor for a problem's jobs,
machines, operations, and (new in this phase) per-job due dates/weights, held
as local draft state and persisted via `POST`/`PUT /api/problems`.

## Relationship to the overall frontend

Per `docs/superpowers/specs/2026-09-16-frontend-phase1-gallery-design.md`:

1. **Phase 1 (shipped)**: scaffold + typed API client + Gallery page.
2. **Phase 2 (this spec)**: Builder — the jobs/machines/operations editor.
3. **Phase 3**: Solve view — live progress + custom SVG Gantt chart at
   `/problems/:id/solves/:solveId`.

Phase 2 fills in the two placeholder routes Phase 1 created; the Gallery is
untouched. No backend changes are required — `POST`, `GET`, and
`PUT /api/problems/{id}` already support everything this phase needs (see
`src/makespan/api/problems.py`).

## Scope decisions

- **Constraints**: only per-job due date + weight get UI in this phase.
  Setup times and downtime windows are out of scope — existing values are
  preserved verbatim through load/save but not editable.
- **Problem creation timing**: `/problems/new` holds a fully local draft (no
  backend record) until the user clicks Save. `POST` happens on first save;
  nothing is persisted if the user navigates away without saving.
- **Solve action**: a disabled/placeholder "Solve" button appears on the
  Builder now, for affordance, becoming functional in Phase 3.
- **Validation strategy**: client-side structurally prevents most invalid
  states (e.g. the machine picker only offers machines that exist), backed by
  a centralized validity check (see Validation below) that disables Save.
  Backend rejection (422) remains the final safety net.
- **Unsaved changes**: navigating away (including the browser back button)
  with unsaved edits shows a confirm prompt.

## Routing

`BuilderPage` (`frontend/src/builder/BuilderPage.tsx`) replaces
`ComingSoonPage` on both `/problems/new` and `/problems/:id` in
`AppRoutes.tsx`.

`App.tsx` migrates from `<BrowserRouter>` to `createBrowserRouter` +
`<RouterProvider>` — a routing-*mode* change only (same routes, same
rendered behavior otherwise) — because the unsaved-changes guard needs
`useBlocker`, which React Router only supports in data-router mode.

On `/problems/:id`, `BuilderPage` fetches via a new `useProblem(id)` query
hook and follows the same `isPending` / `isError` / success pattern
`GalleryPage` already established in Phase 1 (skeleton / inline error with
retry / content) — no new loading-state pattern introduced. On
`/problems/new`, there is no fetch; the form mounts immediately with an
empty draft: one machine-less job containing one operation, so the user
lands on real editing UI rather than a blank "Add Job" prompt.

## Data layer

- `frontend/src/api/queries.ts` gains:
  - `useProblem(id)` — `GET /api/problems/{id}`.
  - `useCreateProblem()` — mutation, `POST /api/problems`.
  - `useUpdateProblem(id)` — mutation, `PUT /api/problems/{problem_id}`.
- `generate-types` changes from hitting a running server
  (`openapi-typescript http://localhost:8000/openapi.json`) to exporting the
  schema statically from the FastAPI app object:
  `uv run python -c "import json; from makespan.main import app; print(json.dumps(app.openapi()))"`
  piped into `openapi-typescript`. This removes the requirement to have the
  backend running to regenerate types, fixing a source of drift risk as a
  side effect of this phase.
- A new `check-types-fresh` script regenerates into a temp file and diffs it
  against the committed `frontend/src/api/schema.ts`, failing on a
  difference. This is a local/manual script in this phase, not wired into
  CI — this repo has no CI configured yet, and introducing one is a separate
  decision outside this phase's scope.

## Draft state & types

Draft types are the generated OpenAPI types plus a client-only `id` layered
on top, e.g.:

```ts
type OperationDraft = components['schemas']['Operation'] & { id: string }
type MachineDraft = { id: string; name: string }
type JobDraft = {
  id: string
  operations: OperationDraft[]
  dueDate?: number
  weight?: number
}
type BuilderDraft = {
  name: string
  machines: MachineDraft[]
  jobs: JobDraft[]
  setupTimes: Record<string, number>       // keyed by machine id internally
  downtimeWindows: { machineId: string; start: number; end: number }[]
}
```

Because draft types extend the generated API types, a future backend field
addition (e.g. Phase-3-and-beyond constraints UI) flows through automatically
and TypeScript flags any place that needs to handle it, rather than a
hand-maintained duplicate type silently drifting.

Ids are `crypto.randomUUID()`, assigned fresh whenever a problem is hydrated
from the API or a new entity is created in the UI — never derived from array
position. Operations reference machines by `machineId` (the client id), not
by name, so renaming a machine is a single-field update with no cascading
into jobs. `setupTimes`/`downtimeWindows` — untouched by this phase's UI, but
present in the wire format keyed by machine *name* — are converted to
id-keyed form at hydrate time and back to name-keyed form at serialize time,
so renaming stays consistent everywhere a machine is referenced, not only in
operations.

`hydrate(apiProblem: ProblemOut): BuilderDraft` and
`serialize(draft: BuilderDraft): ProblemIn` are the two pure boundary
functions, each independently unit-tested. `serialize` computes `due_dates`
fresh from the current job array's order (`job_index` = position at
serialize time) — order is never stored as persistent state, only derived
when needed, so there is nothing to go stale between edits.

## Reducer

`builderReducer(draft, action)`, implemented with Immer (`useImmerReducer` or
plain `produce()` inside `useReducer`) to eliminate accidental in-place
mutation of nested arrays. All actions address entities by id, never by array
index:

`setName`, `addMachine`, `renameMachine`, `removeMachine`, `addJob`,
`removeJob`, `addOperation`, `removeOperation`,
`reorderOperation({ jobId, operationId, direction })`,
`updateOperationField`, `setJobDueDate`.

The reducer allows most transiently-invalid states (e.g. a duration field
mid-edit as `0` or empty) — validity judgment is centralized in
`validateDraft` (below), not scattered across reducer cases. The one real
structural guard: `removeMachine` is a no-op, surfacing an inline "this
machine is in use" message, if the machine is referenced anywhere —
operations, `setupTimes`, or `downtimeWindows` — checked via a
`getMachineUsage(draft)` helper shared with `validateDraft`, so "in use" has
exactly one definition used by both the guard and any UI that needs to know.

**Known Phase 2 limitation**: if a machine is referenced only by a
setup-time or downtime-window entry (which this phase has no UI to edit),
removal is blocked with no in-UI way to resolve it. This is an accepted
rough edge, not a bug — later constraints-editing phases close it. Blocking
was chosen over silently discarding the constraint data, since it never
destroys data the user can't see.

## Validation

`validateDraft(draft): ValidationResult` is the single source of truth for
whether a draft is save-ready, returning entity-keyed errors:

```ts
type ValidationResult = {
  isValid: boolean
  machineErrors: Record<string, string>   // machineId -> message
  jobErrors: Record<string, {
    message?: string                       // e.g. "must have at least one operation"
    operationErrors?: Record<string, string> // operationId -> message
  }>
}
```

Rules mirror the backend's Pydantic validators (`src/makespan/solver/models.py`)
one-to-one: at least one job, at least one operation per job, duration > 0,
every operation's machine reference exists, due-date job-index bounds,
weight ≥ 1. `validateDraft` is called from: the Save button's disabled
state, inline field-level error display, and the `removeMachine` guard.

**Cross-language drift check**: `tests/fixtures/problem-validation-cases.json`
holds `{description, problem, shouldBeValid}` cases, loaded by both a new
backend test (asserting `ProblemSpec` agrees) and a new frontend test
(asserting `validateDraft` agrees on an equivalent draft). This is a new
fixture pattern for this repo (no prior `tests/fixtures/` convention
exists) and catches drift for any rule that has a fixture — it does not
guarantee a brand-new backend validator is caught unless a fixture is added
for it.

**Fallback for whatever the fixtures don't catch**: a generic mapper
translates FastAPI's structured 422 `detail: [{loc, msg}]` response shape
into the same entity-keyed shape `ValidationResult` uses, so even a backend
rule the frontend doesn't independently know about surfaces as a proper
inline, entity-located error rather than a flat "something went wrong"
banner.

## Components (`frontend/src/builder/`)

- `BuilderPage` — data loading (via `useProblem` when editing) and routing
  glue; owns the `builderReducer` instance.
- `BuilderHeader` — problem name input, Back-to-Gallery link, Save button,
  disabled/placeholder Solve button.
- `MachineList` / `MachineRow` — add, rename, remove machines.
- `JobList` / `JobCard` — add/remove jobs; per-job optional due date +
  weight fields.
- `OperationRow` — machine picker (populated from current `machines`),
  duration input, reorder (move up/down), remove.

Each component receives one entity plus dispatch-bound callbacks as props,
so each is independently understandable and testable without the others.

## Save flow

Save is disabled while `!validateDraft(draft).isValid` or while a save
mutation is in flight (prevents a double-click firing two requests).

- **`/problems/new`**: `useCreateProblem()` → `POST`; on success,
  `navigate('/problems/' + newId, { replace: true })` so the browser back
  button doesn't return to a stale `/problems/new`.
- **`/problems/:id`**: `useUpdateProblem(id)` → `PUT`; stays on the page,
  shows a brief "Saved" confirmation.
- **On error** (422 or otherwise): the draft is never cleared. The error
  surfaces via the 422 mapper above; the user's edits remain exactly as
  typed.

## Unsaved-changes guard

`useBlocker` (available once `App.tsx` uses a data router) blocks navigation
— including the browser back/forward button — whenever the current draft
differs from the last-loaded (or last-saved) snapshot, showing a confirm
prompt before allowing the navigation to proceed.

## Testing

**Backend**: one new test file consuming `tests/fixtures/problem-validation-cases.json`
against `ProblemSpec`. No endpoint changes, so no new endpoint tests are
required.

**Frontend** (Vitest + RTL):
- Unit: `hydrate`, `serialize`, `builderReducer` (each action, plus that
  outputs are new object/array references per Immer's guarantees),
  `validateDraft` (including the shared fixture cases).
- Component: `BuilderPage` for loading/error states (editing), the new-draft
  default state, add/remove/reorder for machines and operations, last-job
  and last-operation removal blocked, machine-removal-while-in-use blocked,
  Save disabled while invalid, `POST`-then-navigate vs. `PUT`-in-place, and
  the navigate-away confirm prompt.

**Manual smoke check**: build a new problem end-to-end (add machines, jobs,
operations, a due date) and save it; open an existing saved problem and a
preset, edit and save each; confirm navigating away with unsaved edits
prompts a confirmation.

## Out of scope for Phase 2

- Setup times and downtime windows editing UI (values are preserved
  through load/save but not editable) — including the machine-removal
  limitation noted above.
- The Solve view and Gantt chart (Phase 3) — the Solve button is a
  disabled placeholder.
- Undo/redo — the reducer/Immer design keeps this pluggable later (state
  transitions are pure, snapshot-friendly), but no history stack is built
  in this phase.
- Wiring the type-freshness check into CI — this repo has no CI yet;
  introducing one is a separate decision.
- Full codegen-based (JSON-Schema-derived) validation parity between
  frontend and backend — considered and rejected: the highest-risk
  validation rules here are cross-field (e.g. operation → machine
  references), which JSON Schema cannot express, so codegen would only
  cover the low-risk field-level constraints while the rules that actually
  matter would still need hand-written parity on both sides regardless.
