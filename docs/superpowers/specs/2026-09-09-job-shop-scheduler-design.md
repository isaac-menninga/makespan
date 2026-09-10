# Job Shop Scheduler — Design

**Date**: 2026-09-09
**Status**: Approved for implementation planning

## Purpose

A job shop scheduling tool built on Google OR-Tools (CP-SAT), exposed through a
FastAPI backend and a React/TypeScript frontend. Primary goal is a portfolio
project that is genuinely useful, not just a textbook demo: a user can define
a real scheduling problem (jobs, machines, and common real-world constraints),
solve it, and see the resulting schedule as an interactive Gantt chart.

## Problem Scope

Core problem: classic Job Shop Scheduling (JSSP) — each job is a fixed
sequence of operations, each operation requires one specific machine, a
machine processes one operation at a time — extended with optional,
per-problem real-world constraints:

- **Setup times**: a required gap between consecutive operations on a
  machine (e.g. reconfiguration time between different jobs).
- **Due dates / tardiness**: a target finish time per job; lateness is
  penalized in the objective.
- **Machine downtime windows**: fixed time ranges during which a machine is
  unavailable (maintenance, etc.).

These are additive — a plain classic JSSP instance simply omits them.

Objective: minimize makespan (default), or minimize a weighted combination of
makespan and total weighted tardiness when any job carries a due date/weight.

## Architecture Overview

Single repo, single deployable container (target: one small VM). No task
queue or external cache — the problem is small enough in scope that
FastAPI's own background execution is sufficient.

```
Makespan/
├── src/makespan/
│   ├── solver/        # CP-SAT model: variables, constraints, objective, solution callback
│   ├── api/            # FastAPI routes, request/response schemas
│   ├── db/             # SQLModel/SQLAlchemy models + SQLite
│   └── main.py         # FastAPI app: mounts API routes + serves built frontend static files
├── frontend/           # React + TypeScript (Vite)
│   ├── src/
│   │   ├── builder/    # problem definition UI (jobs/machines/ops table)
│   │   ├── gantt/       # Gantt chart + stats display
│   │   └── api/         # typed fetch client (types generated from OpenAPI schema)
│   └── dist/           # built static output, served by FastAPI in prod
├── tests/
└── Dockerfile
```

Flow: browser loads the React app (served by FastAPI) → user builds or loads
a problem → `POST /api/solves` starts a background solve and returns
immediately → frontend polls `GET /api/solves/{id}` until it completes →
Gantt chart renders the result.

Solve execution runs in a background worker thread (FastAPI `BackgroundTasks`
or a `ThreadPoolExecutor`). CP-SAT releases the GIL during `Solve()`, so this
does not block other requests. No Celery/Redis — unnecessary at this scale
and would add operational overhead disproportionate to a single-VM deploy.

## Data Model

SQLite via SQLModel. Two core tables, using JSON columns for the
nested/flexible parts of each document.

**`Problem`**
- `id` (UUID, public identifier / shareable link)
- `name`, `created_at`
- `jobs` (JSON): list of jobs, each a list of operations `{machine_id, duration}` in required sequence order
- `machines` (JSON): list of machine ids/names
- `constraints` (JSON, optional/sparse): setup times, due dates/weights, downtime windows

**`Solve`**
- `id` (UUID), `problem_id` (FK)
- `status`: `pending` → `running` → `completed` / `failed`
- `time_limit_seconds`, `objective_mode` (derived automatically from the problem — see API Design)
- `best_objective`, `best_bound`
- `schedule` (JSON, populated once completed): per-operation `{job_id, machine_id, start, end}`
- `created_at`, `finished_at`

Presets (ft06, la01, etc.) are seeded `Problem` rows, not a separate
mechanism.

**Edit model**: the frontend holds the full `Problem` as local state while a
user edits it in the builder (add/remove/edit a job, machine, or operation),
and persists it as one document via `PUT /api/problems/{id}` on save. This is
why JSON columns are appropriate rather than a normalized relational schema:
nothing ever queries across jobs/operations independently of their parent
problem, and per-field API endpoints (which would justify relational rows)
are explicitly not part of this design.

## Solver Design

Implemented in `src/makespan/solver/`, with no FastAPI or DB imports — it
takes a `Problem`-shaped input and returns a schedule, so it is directly unit
testable against known-optimal benchmark instances.

- **Interval variables**: one CP-SAT interval variable (`NewIntervalVar`) per
  operation — a start, a fixed duration, and an end.
- **Precedence constraints**: within a job, each operation's interval must
  end before the next operation's interval starts.
- **No-overlap constraints**: `AddNoOverlap` per machine, over the interval
  variables of every operation assigned to it.
- **Optional constraints**, added only when present on the `Problem`:
  - Setup time: a required gap enforced between consecutive intervals on a
    machine.
  - Due dates: `tardiness = max(0, finish - due_date)` per job, folded into
    the objective.
  - Downtime windows: modeled as a fixed occupying interval included in that
    machine's no-overlap set.
- **Objective**: minimize makespan (max end time across all operations) by
  default; minimize weighted (makespan + total weighted tardiness) when due
  dates/weights are present.
- **Solution callback**: a `CpSolverSolutionCallback` subclass whose
  `on_solution_callback` fires on every improved incumbent during the search,
  recording `(best_objective, best_bound, elapsed_seconds)`.

**Progress reporting mechanics**: the callback runs on the same background
worker thread executing `Solve()`. On each firing it writes the latest
progress into the `Solve` row (or an in-memory dict keyed by solve ID) —
this is the *write* side. `GET /api/solves/{id}` is the *read* side; it
simply returns whatever was last written, which is how the frontend's
polling shows live progress without any push mechanism. Because this write
happens from a background thread rather than the main async event loop, it
must use a thread-safe path to shared state (a lock-guarded dict, or its own
DB session/connection rather than one created elsewhere) — an implementation
detail to be handled in the plan, not a design change.

## API Design

**Problems**
- `POST /api/problems` — create a new problem. Body = full document. Returns it with a generated `id`.
- `GET /api/problems/{id}` — fetch a problem.
- `PUT /api/problems/{id}` — whole-document save.
- `GET /api/problems` — list saved problems (id, name, created_at).
- `GET /api/presets` — seeded benchmark instances, same shape as `Problem`.

**Solves**
- `POST /api/solves` — body: `{problem_id, time_limit_seconds}`. Starts the background solve, returns `{solve_id, status: "pending"}` immediately.
  - `time_limit_seconds`: validated `1 <= value <= 60`, default `30` (Pydantic `Field(default=30, ge=1, le=60)`). See Future Considerations for raising this later.
  - Objective mode is not client-chosen — it is derived automatically from the problem: makespan-only if no job carries a due date/weight, otherwise weighted (makespan + total weighted tardiness), per the Solver Design section.
- `GET /api/solves/{id}` — current status `{status, best_objective, best_bound, elapsed_seconds}` while running; adds `schedule` once `status == "completed"`.
- `GET /api/problems/{id}/solves` — solve history for a problem.

No `DELETE` endpoints and no auth middleware for v1 (see Future
Considerations for auth).

**Error handling**:
- Invalid problem definitions (operation referencing a nonexistent machine
  ID, empty job list, `time_limit_seconds` out of bounds) are rejected at
  `POST`/`PUT /problems` or `POST /solves` time with a 422 and field-level
  detail via Pydantic validation.
- A solve that cannot complete (e.g. an infeasible downtime configuration, or
  an unexpected solver exception) resolves to `status: "failed"` with a
  message — never a 500 — since the request to *start* the solve succeeded.

## Frontend Design

**Stack**: Vite + React + TypeScript + Tailwind CSS. TanStack Query for data
fetching, including polling `GET /api/solves/{id}` via `refetchInterval`.
TypeScript types for `Problem`/`Solve` generated from FastAPI's OpenAPI
schema via `openapi-typescript`, so backend and frontend never drift.

**Pages** (React Router):
- **Gallery** (`/`) — presets and saved problems as cards.
- **Builder** (`/problems/:id`, `/problems/new`) — editable jobs/machines/operations table, held as local state, saved via `PUT`.
- **Solve view** (`/problems/:id/solves/:solveId`) — live progress while running (from polling), then the Gantt chart + stats once completed.

**Gantt chart**: built custom as an SVG component, not a library. Off-the-shelf
Gantt libraries are shaped for project-timeline Gantt charts (rows = tasks);
this needs **rows = machines**, with colored blocks per scheduled operation
(one `<rect>` per operation, positioned by `start`/`end`, colored by job,
with a hover tooltip). A custom component gives full control over this
domain-specific layout and over interactivity (e.g. highlighting a job's
operations across all machine rows).

Visual identity (color palette, typography, polish) is deferred to a
dedicated design pass; Tailwind is adopted from the start for structural
styling of custom components (the builder table, the Gantt chart) so it does
not need retrofitting later.

## Testing & Error Handling

**Backend**:
- Solver unit tests against known benchmark instances (e.g. ft06, la01,
  which have published optimal makespans), plus targeted tests per optional
  constraint (tardiness computed correctly, no operation overlaps a downtime
  window).
- API tests via FastAPI's `TestClient`: problem create/save, validation
  rejection (bad machine reference, out-of-bounds `time_limit_seconds`),
  solve lifecycle from creation through polling to completion, preset
  loading.

**Frontend**:
- Component tests (Vitest + React Testing Library) for the builder
  (add/remove job, validation messages) and the Gantt chart (fixed schedule
  input renders expected block positions).
- Manual/E2E smoke check of the full flow (build or load a problem → solve →
  view Gantt) before considering a milestone done. A full Playwright E2E
  suite is a reasonable stretch goal, not required for v1.

## Future Considerations (explicitly out of scope for v1)

- **Auth**: anonymous users remain read-only — they can view presets and
  their pre-computed solve results (a preset's solve is computed once, e.g.
  via a seed script using the same `POST /api/solves` pipeline, and stored
  as an ordinary `Solve` row — no separate caching layer needed).
  Authenticated users gain the ability to create/edit their own problems and
  submit solves. This closes the anonymous resource-abuse surface described
  below without requiring the mechanism to be built now. Specific auth
  method (API keys, OAuth, etc.) is undecided.
- **Concurrent-solve limiting**: nothing currently caps how many solves can
  run at once on the single shared worker; a semaphore-limited thread pool
  (with new requests queuing or receiving a 429) is the natural lever if
  this becomes a problem in practice. Expected to matter much less once
  solving requires authentication.
- **Raising the `time_limit_seconds` cap** (currently 60s) once real usage
  data justifies it.
- User accounts and per-user problem history, which naturally follow once
  auth exists.
