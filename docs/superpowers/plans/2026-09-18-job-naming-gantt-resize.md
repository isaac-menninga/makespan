# Job Naming & Gantt Responsive Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `Job.name` field (backend + Builder UI + Gantt tooltip), and decouple the Gantt chart's width from its row height via `ResizeObserver` instead of uniform `viewBox` scaling.

**Architecture:** `Job.name: str | None = None` is added to the backend's Pydantic model; since problem jobs are stored as a raw JSON column, this needs no DB migration. The frontend's generated API schema is regenerated to pick it up, then `JobDraft`, the Builder reducer/UI, and the Gantt tooltip are wired through in that order. Separately (no shared code), `GanttChart` gains a `ResizeObserver`-backed hook that measures its container's real width and uses that as the chart's plot width, while row height stays a fixed pixel constant.

**Tech Stack:** FastAPI + Pydantic + SQLModel (backend), React 19 + react-router v8 + Tailwind v4 + Vitest/Testing Library (frontend), `uv`/`pytest` for backend tests.

**Spec:** `docs/superpowers/specs/2026-09-18-job-naming-gantt-resize-design.md`

## Global Constraints

- Job name is **optional**, no Builder-side validation requires it. Anywhere a name would display, an unnamed job falls back to "Job N" (1-indexed) — never store or send that fallback string; it's display-only.
- **No uniqueness constraint** on job names.
- Job ordinal number (position) and job name are **independent** — the Builder shows both a numbered heading and a separate optional name field, never a single conflated field.
- Name display is the **Gantt tooltip only** — no legend, no custom hover panel, no palette changes. Out of scope for this plan.
- **No DB migration** — `ProblemRecord.jobs` is a raw JSON column; the new field just doesn't exist on old rows' dicts, which parses as `None`.
- Gantt resize uses **`ResizeObserver`** measuring the chart's own wrapping container, with a `MIN_PLOT_WIDTH = 300` clamp — not CSS container queries, not `window.matchMedia`/viewport breakpoints.
- `useContainerWidth` is defined **inline in `GanttChart.tsx`**, not extracted to its own file (single caller today).
- `frontend/tsconfig.app.json` already includes `"DOM"` in its `lib` array, so `ResizeObserver`/`ResizeObserverEntry` types are already available — no tsconfig change needed.
- No new maximum-width cap on the Gantt chart beyond Phase 4's existing `--content-max-width: 1600px` page container.
- Backend CI gate (must pass before this branch is done): `uv run pytest`.
- Frontend CI gate (must pass before this branch is done): `npm run lint`, `npm test`, `npm run build`, `npm run check-types-fresh`.

---

### Task 1: Backend — `Job.name` field

**Files:**
- Modify: `src/makespan/solver/models.py`
- Test: `tests/solver/test_models.py`
- Test: `tests/api/test_problems.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Job.name: str | None`, flowing automatically into `ProblemSpec`, `ProblemIn`, and `ProblemOut` (all of which already reference `Job`/`ProblemSpec` — no changes needed to `src/makespan/api/schemas.py` or `src/makespan/db/models.py`). Consumed by Task 2 (schema regeneration).

- [ ] **Step 1: Add the field**

In `src/makespan/solver/models.py`, current:

```python
class Job(BaseModel):
    operations: list[Operation] = Field(min_length=1)
```

Change to:

```python
class Job(BaseModel):
    operations: list[Operation] = Field(min_length=1)
    name: str | None = None
```

- [ ] **Step 2: Write model-level tests**

Add to `tests/solver/test_models.py` (existing imports already include `Job`, `Operation`, `ProblemSpec`):

```python
def test_job_name_defaults_to_none():
    job = Job(operations=[Operation(machine_id="M1", duration=1)])
    assert job.name is None


def test_job_name_roundtrips_through_problem_spec():
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=1)], name="Rush order")],
    )
    assert problem.jobs[0].name == "Rush order"
```

- [ ] **Step 3: Run the model tests**

Run: `uv run pytest tests/solver/test_models.py -v`
Expected: PASS, including the two new tests.

- [ ] **Step 4: Write an API-level roundtrip test**

Add to `tests/api/test_problems.py` (existing tests already use the `client` fixture and this payload shape):

```python
def test_create_problem_persists_job_name(client):
    payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [
            {"operations": [{"machine_id": "M1", "duration": 3}], "name": "Rush order"},
            {"operations": [{"machine_id": "M1", "duration": 2}]},
        ],
    }
    created = client.post("/api/problems", json=payload).json()
    assert created["jobs"][0]["name"] == "Rush order"
    assert created["jobs"][1]["name"] is None

    fetched = client.get(f"/api/problems/{created['id']}").json()
    assert fetched["jobs"][0]["name"] == "Rush order"
    assert fetched["jobs"][1]["name"] is None
```

- [ ] **Step 5: Run the full backend suite**

Run: `uv run pytest`
Expected: PASS. This also confirms nothing else constructing `Job(...)` without a `name=` argument broke (e.g. `src/makespan/db/seed.py`'s preset jobs) — the field's default makes every existing call site still valid.

- [ ] **Step 6: Commit**

```bash
git add src/makespan/solver/models.py tests/solver/test_models.py tests/api/test_problems.py
git commit -m "feat: add optional Job.name field"
```

---

### Task 2: Regenerate the frontend API schema

**Files:**
- Modify: `frontend/src/api/schema.ts` (generated file — do not hand-edit, only regenerate)

**Interfaces:**
- Consumes: Task 1's `Job.name` field, via the backend's live OpenAPI schema.
- Produces: `components['schemas']['Job']` (and therefore `ProblemIn`/`ProblemOut`'s `jobs[]` items) now typed with an optional `name`. Consumed by Task 4 (`transform.ts`) and Task 6 (`SolvePage.tsx`).

- [ ] **Step 1: Regenerate**

Run, from `frontend/`: `npm run generate-types`

This shells out to `uv run python -c "..."` against the backend app (via `(cd .. && ...)` in the script), so Task 1 must already be committed in this working tree before running it.

- [ ] **Step 2: Verify the regenerated schema is fresh and correct**

Run, from `frontend/`: `npm run check-types-fresh`
Expected: PASS ("schema.ts is up to date") — this script regenerates into a temp file and diffs it against the committed one, so a pass here confirms Step 1 was done correctly and the committed file matches.

Also spot-check the diff itself for the expected shape:

Run: `git diff frontend/src/api/schema.ts | grep -A2 '"name"'`
Expected: the diff shows a new optional `name` property (nullable string) added to the `Job` schema's properties.

- [ ] **Step 3: Run the frontend suite to confirm nothing broke**

Run, from `frontend/`: `npm test`
Expected: PASS (128/128 as of the last known-good state on `main`) — a schema regeneration should be additive only and change no runtime behavior.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/schema.ts
git commit -m "chore: regenerate API schema for Job.name"
```

---

### Task 3: Frontend — `JobDraft.name` + `setJobName` reducer action

**Files:**
- Modify: `frontend/src/builder/types.ts`
- Modify: `frontend/src/builder/reducer.ts`
- Test: `frontend/src/builder/reducer.test.ts`

**Interfaces:**
- Consumes: nothing new (does not depend on Task 2's regenerated schema — `JobDraft` is a hand-written type).
- Produces: `JobDraft.name?: string` and the `setJobName` action. Consumed by Task 5 (Builder UI wiring) and Task 4 (`transform.ts`).

- [ ] **Step 1: Add `name` to `JobDraft`**

In `frontend/src/builder/types.ts`, current:

```typescript
export type JobDraft = {
  id: string
  operations: OperationDraft[]
  dueDate?: number
  weight?: number
}
```

Change to:

```typescript
export type JobDraft = {
  id: string
  operations: OperationDraft[]
  dueDate?: number
  weight?: number
  name?: string
}
```

- [ ] **Step 2: Write the failing test**

Add to `frontend/src/builder/reducer.test.ts` (existing imports already cover `builderReducer` and a `baseDraft()` helper with job id `'j1'` — follow the file's existing pattern, e.g. near the `setJobDueDate`/`setJobWeight` test at line 139):

```typescript
it('setJobName sets the name, and an empty string clears it back to undefined', () => {
  let draft = builderReducer(baseDraft(), { type: 'setJobName', jobId: 'j1', name: 'Rush order' })
  expect(draft.jobs[0].name).toBe('Rush order')

  draft = builderReducer(draft, { type: 'setJobName', jobId: 'j1', name: '' })
  expect(draft.jobs[0].name).toBeUndefined()
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/builder/reducer.test.ts`
Expected: FAIL — `'setJobName'` is not a valid action type yet (TypeScript error) / reducer doesn't handle it.

- [ ] **Step 4: Add the action type and reducer case**

In `frontend/src/builder/reducer.ts`, add to the `BuilderAction` union (after the existing `setJobWeight` entry):

```typescript
| { type: 'setJobName'; jobId: string; name: string }
```

Add a case to the `switch` (after the existing `setJobWeight` case):

```typescript
case 'setJobName': {
  const job = draft.jobs.find((j) => j.id === action.jobId)
  if (job) job.name = action.name === '' ? undefined : action.name
  break
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `npx vitest run src/builder/reducer.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/builder/types.ts frontend/src/builder/reducer.ts frontend/src/builder/reducer.test.ts
git commit -m "feat: add JobDraft.name and setJobName reducer action"
```

---

### Task 4: Frontend — `transform.ts` name roundtrip

**Files:**
- Modify: `frontend/src/builder/transform.ts`
- Test: `frontend/src/builder/transform.test.ts`

**Interfaces:**
- Consumes: Task 2's regenerated `ApiProblemIn`/`ApiProblemOut` types (so `serialize`'s return type accepts a `name` field without an excess-property error), and Task 3's `JobDraft.name`.
- Produces: nothing consumed by later tasks — this is a leaf change.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/builder/transform.test.ts`, following the file's existing style (it already has a `hydrateSpec`/`hydrate` describe block using inline spec objects, and a `serialize` describe block building a `BuilderDraft`):

```typescript
it('hydrateSpec carries a job name through', () => {
  const draft = hydrateSpec({
    machines: ['M1'],
    jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }], name: 'Rush order' }],
  })
  expect(draft.jobs[0].name).toBe('Rush order')
})

it('serialize includes a job name when set, and omits it when unset', () => {
  const draft: BuilderDraft = {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [
      { id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 1 }], name: 'Rush order' },
      { id: 'j2', operations: [{ id: 'o2', machineId: 'm1', duration: 1 }] },
    ],
    setupTimes: {},
    downtimeWindows: [],
  }
  const result = serialize(draft)
  expect(result.jobs[0].name).toBe('Rush order')
  expect(result.jobs[1].name).toBeUndefined()
})
```

The first test's literal (`name: 'Rush order'` on a job with no `id`/`machineId`, matching `hydrateSpec`'s loose `ProblemSpecLike` input shape rather than the stricter `JobDraft`) won't type-check against `ProblemSpecLike`'s current job-item type until Step 3 below adds `name` to it — but Vitest runs tests transpile-only (no type-check gate), so this only shows up later as a `tsc -b`/`npm run build` failure, not a test failure. Step 2 below still correctly observes a RED test (the assertion fails, since `hydrateSpec` doesn't read `job.name` yet) even before Step 3's type change lands. Confirm no lingering type error once Step 3 is done, as part of Step 6's full-suite run (`npm test` alone won't catch it; `npm run build` in Task 8's final gate will).

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/builder/transform.test.ts`
Expected: FAIL — `hydrateSpec`'s result and `serialize`'s output don't carry `name` yet.

- [ ] **Step 3: Update `hydrateSpec`**

In `frontend/src/builder/transform.ts`, the local `ProblemSpecLike` type's `jobs` item currently is:

```typescript
jobs: { operations: { machine_id: string; duration: number }[] }[]
```

Change to:

```typescript
jobs: { operations: { machine_id: string; duration: number }[]; name?: string | null }[]
```

And the `jobs` mapping inside `hydrateSpec` currently is:

```typescript
const jobs: JobDraft[] = spec.jobs.map((job) => ({
  id: generateId(),
  operations: job.operations.map(
    (operation): OperationDraft => ({
      id: generateId(),
      machineId: machineIdByName.get(operation.machine_id) ?? operation.machine_id,
      duration: operation.duration,
    }),
  ),
}))
```

Change to:

```typescript
const jobs: JobDraft[] = spec.jobs.map((job) => ({
  id: generateId(),
  operations: job.operations.map(
    (operation): OperationDraft => ({
      id: generateId(),
      machineId: machineIdByName.get(operation.machine_id) ?? operation.machine_id,
      duration: operation.duration,
    }),
  ),
  name: job.name ?? undefined,
}))
```

- [ ] **Step 4: Update `serialize`**

The `jobs` mapping inside `serialize` currently is:

```typescript
jobs: draft.jobs.map((job) => ({
  operations: job.operations.map((operation) => ({
    machine_id: machineNameById.get(operation.machineId) ?? operation.machineId,
    duration: operation.duration,
  })),
})),
```

Change to:

```typescript
jobs: draft.jobs.map((job) => ({
  operations: job.operations.map((operation) => ({
    machine_id: machineNameById.get(operation.machineId) ?? operation.machineId,
    duration: operation.duration,
  })),
  name: job.name,
})),
```

(`JSON.stringify` drops `undefined`-valued keys, so an unnamed job's request body simply omits `name` — no special-casing needed.)

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run src/builder/transform.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Run the full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/builder/transform.ts frontend/src/builder/transform.test.ts
git commit -m "feat: carry job name through transform.ts hydrate/serialize"
```

---

### Task 5: Frontend — Builder UI (numbered heading + name input)

**Files:**
- Modify: `frontend/src/builder/JobCard.tsx`
- Modify: `frontend/src/builder/BuilderForm.tsx`
- Test: `frontend/src/builder/BuilderForm.test.tsx`

**Interfaces:**
- Consumes: Task 3's `setJobName` action and `JobDraft.name`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/builder/BuilderForm.test.tsx`, following the file's existing `renderBuilderForm()` helper pattern (e.g. near the "adds and removes a job" test):

```typescript
it('shows a numbered job heading and an editable name field', async () => {
  const user = userEvent.setup()
  renderBuilderForm()
  expect(screen.getByText('Job 1')).toBeInTheDocument()

  await user.click(screen.getByText('+ Add Job'))
  expect(screen.getByText('Job 1')).toBeInTheDocument()
  expect(screen.getByText('Job 2')).toBeInTheDocument()

  const nameInputs = screen.getAllByLabelText('Name')
  await user.type(nameInputs[0], 'Rush order')
  expect(nameInputs[0]).toHaveValue('Rush order')
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/builder/BuilderForm.test.tsx`
Expected: FAIL — no "Job 1"/"Job 2" numbered heading text exists yet (current heading is the static text "Job" with no number), and no element is reachable via `getByLabelText('Name')`.

- [ ] **Step 3: Update `JobCard.tsx`**

Current header block (near the top of the returned JSX):

```tsx
type JobCardProps = {
  job: JobDraft
  machines: MachineDraft[]
  error?: { message?: string; operationErrors?: Record<string, string> }
  canRemove: boolean
  onAddOperation: () => void
  onRemoveOperation: (operationId: string) => void
  onReorderOperation: (operationId: string, direction: 'up' | 'down') => void
  onChangeOperationMachine: (operationId: string, machineId: string) => void
  onChangeOperationDuration: (operationId: string, duration: number) => void
  onSetDueDate: (dueDate: number | undefined) => void
  onSetWeight: (weight: number | undefined) => void
  onRemoveJob: () => void
}

export function JobCard({
  job,
  machines,
  error,
  canRemove,
  onAddOperation,
  onRemoveOperation,
  onReorderOperation,
  onChangeOperationMachine,
  onChangeOperationDuration,
  onSetDueDate,
  onSetWeight,
  onRemoveJob,
}: JobCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Job</h3>
        <button
          type="button"
          onClick={onRemoveJob}
          disabled={!canRemove}
          className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Remove Job
        </button>
      </div>
```

Change to (adds `jobNumber` and `onSetName` props, and a labeled name input next to the numbered heading, matching the existing `Due date`/`Weight` labeled-input pattern later in the same file):

```tsx
type JobCardProps = {
  job: JobDraft
  jobNumber: number
  machines: MachineDraft[]
  error?: { message?: string; operationErrors?: Record<string, string> }
  canRemove: boolean
  onAddOperation: () => void
  onRemoveOperation: (operationId: string) => void
  onReorderOperation: (operationId: string, direction: 'up' | 'down') => void
  onChangeOperationMachine: (operationId: string, machineId: string) => void
  onChangeOperationDuration: (operationId: string, duration: number) => void
  onSetDueDate: (dueDate: number | undefined) => void
  onSetWeight: (weight: number | undefined) => void
  onSetName: (name: string) => void
  onRemoveJob: () => void
}

export function JobCard({
  job,
  jobNumber,
  machines,
  error,
  canRemove,
  onAddOperation,
  onRemoveOperation,
  onReorderOperation,
  onChangeOperationMachine,
  onChangeOperationDuration,
  onSetDueDate,
  onSetWeight,
  onSetName,
  onRemoveJob,
}: JobCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-slate-900">Job {jobNumber}</h3>
          <label className="flex items-center gap-1 text-sm">
            Name
            <input
              type="text"
              value={job.name ?? ''}
              onChange={(e) => onSetName(e.target.value)}
              placeholder="Optional"
              className="w-40 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onRemoveJob}
          disabled={!canRemove}
          className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Remove Job
        </button>
      </div>
```

- [ ] **Step 4: Update `BuilderForm.tsx`**

The `.map()` over `draft.jobs` currently is:

```tsx
{draft.jobs.map((job) => (
  <JobCard
    key={job.id}
    job={job}
    machines={draft.machines}
    error={errors.jobErrors[job.id]}
    canRemove={draft.jobs.length > 1}
    onAddOperation={() => dispatch({ type: 'addOperation', jobId: job.id })}
    onRemoveOperation={(operationId) =>
      dispatch({ type: 'removeOperation', jobId: job.id, operationId })
    }
    onReorderOperation={(operationId, direction) =>
      dispatch({ type: 'reorderOperation', jobId: job.id, operationId, direction })
    }
    onChangeOperationMachine={(operationId, machineId) =>
      dispatch({
        type: 'updateOperation',
        jobId: job.id,
        operationId,
        field: 'machineId',
        value: machineId,
      })
    }
    onChangeOperationDuration={(operationId, duration) =>
      dispatch({
        type: 'updateOperation',
        jobId: job.id,
        operationId,
        field: 'duration',
        value: duration,
      })
    }
    onSetDueDate={(dueDate) => dispatch({ type: 'setJobDueDate', jobId: job.id, dueDate })}
    onSetWeight={(weight) => dispatch({ type: 'setJobWeight', jobId: job.id, weight })}
    onRemoveJob={() => dispatch({ type: 'removeJob', jobId: job.id })}
  />
))}
```

Change to (adds `index` to the `.map()` callback, passes `jobNumber={index + 1}`, and adds `onSetName`):

```tsx
{draft.jobs.map((job, index) => (
  <JobCard
    key={job.id}
    job={job}
    jobNumber={index + 1}
    machines={draft.machines}
    error={errors.jobErrors[job.id]}
    canRemove={draft.jobs.length > 1}
    onAddOperation={() => dispatch({ type: 'addOperation', jobId: job.id })}
    onRemoveOperation={(operationId) =>
      dispatch({ type: 'removeOperation', jobId: job.id, operationId })
    }
    onReorderOperation={(operationId, direction) =>
      dispatch({ type: 'reorderOperation', jobId: job.id, operationId, direction })
    }
    onChangeOperationMachine={(operationId, machineId) =>
      dispatch({
        type: 'updateOperation',
        jobId: job.id,
        operationId,
        field: 'machineId',
        value: machineId,
      })
    }
    onChangeOperationDuration={(operationId, duration) =>
      dispatch({
        type: 'updateOperation',
        jobId: job.id,
        operationId,
        field: 'duration',
        value: duration,
      })
    }
    onSetDueDate={(dueDate) => dispatch({ type: 'setJobDueDate', jobId: job.id, dueDate })}
    onSetWeight={(weight) => dispatch({ type: 'setJobWeight', jobId: job.id, weight })}
    onSetName={(name) => dispatch({ type: 'setJobName', jobId: job.id, name })}
    onRemoveJob={() => dispatch({ type: 'removeJob', jobId: job.id })}
  />
))}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run src/builder/BuilderForm.test.tsx`
Expected: PASS (all tests in the file — check in particular that the existing "renders the seeded empty draft" and job-count tests still pass with the new heading text present).

- [ ] **Step 6: Run the full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/builder/JobCard.tsx frontend/src/builder/BuilderForm.tsx frontend/src/builder/BuilderForm.test.tsx
git commit -m "feat: add numbered job heading and name input to Builder"
```

---

### Task 6: Frontend — Gantt tooltip uses job name

**Files:**
- Modify: `frontend/src/solve/GanttBar.tsx`
- Modify: `frontend/src/solve/GanttChart.tsx`
- Modify: `frontend/src/solve/SolvePage.tsx`
- Test: `frontend/src/solve/GanttChart.test.tsx`

**Interfaces:**
- Consumes: Task 2's regenerated `ApiProblemOut` type (so `problem.data.jobs[].name` type-checks in `SolvePage.tsx`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/solve/GanttChart.test.tsx` (extends the existing tooltip test rather than replacing it — the existing test passes no `jobNames` prop at all, so it should keep asserting the "Job N" fallback wording unchanged; add a new test alongside it):

```typescript
it('uses a provided job name in the tooltip instead of "Job N"', () => {
  render(
    <GanttChart
      schedule={schedule}
      machines={['M1', 'M2']}
      jobNames={['Rush order', undefined]}
    />,
  )

  expect(screen.getByTestId('gantt-bar-0-1')).toHaveTextContent(
    'Rush order, operation 2 on M2: 5–8',
  )
  expect(screen.getByTestId('gantt-bar-1-0')).toHaveTextContent(
    'Job 2, operation 1 on M2: 0–3',
  )
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/solve/GanttChart.test.tsx`
Expected: FAIL — `GanttChart` doesn't accept a `jobNames` prop yet (TypeScript error) / tooltip text is unchanged.

- [ ] **Step 3: Update `GanttBar.tsx`**

Current props and tooltip text:

```tsx
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

Change to (adds a `jobLabel` prop, replacing the inline `Job ${bar.jobIndex + 1}` fallback formatting — that fallback now lives in `GanttChart.tsx`, computed once per bar):

```tsx
type GanttBarProps = {
  bar: GanttBarLayout
  x: number
  y: number
  width: number
  height: number
  color: string
  isDimmed: boolean
  jobLabel: string
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
  jobLabel,
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
        {`${jobLabel}, operation ${bar.operationIndex + 1} on ${bar.machineId}: ${bar.start}–${bar.end}`}
      </title>
    </rect>
  )
}
```

- [ ] **Step 4: Update `GanttChart.tsx`**

Add `jobNames` to the props type:

```tsx
type GanttChartProps = {
  schedule: ScheduledOperationApi[]
  machines: string[]
  jobNames?: (string | undefined)[]
}
```

Update the function signature to destructure it:

```tsx
export function GanttChart({ schedule, machines, jobNames }: GanttChartProps) {
```

In the `layout.map((bar) => (...))` block, add a `jobLabel` computation and pass it to `GanttBar`. Current:

```tsx
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
    onToggle={(jobIndex) => {
```

Change the opening of the `<GanttBar>` element to add `jobLabel`:

```tsx
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
    jobLabel={jobNames?.[bar.jobIndex] ?? `Job ${bar.jobIndex + 1}`}
    onHover={setHoveredJob}
    onToggle={(jobIndex) => {
```

(`PLOT_WIDTH` here still refers to the module-level constant at this point in the plan — Task 7 changes it to a computed value. This task does not touch `PLOT_WIDTH`'s definition.)

- [ ] **Step 5: Update `SolvePage.tsx`**

Current `<GanttChart>` usage:

```tsx
<GanttChart
  schedule={(solve.data.schedule ?? []) as ScheduledOperationApi[]}
  machines={problem.data.machines}
/>
```

Change to:

```tsx
<GanttChart
  schedule={(solve.data.schedule ?? []) as ScheduledOperationApi[]}
  machines={problem.data.machines}
  jobNames={problem.data.jobs.map((job) => job.name ?? undefined)}
/>
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx vitest run src/solve/GanttChart.test.tsx`
Expected: PASS (all tests in the file, including both the existing fallback-wording test and the new named-job test).

- [ ] **Step 7: Run the full frontend suite**

Run: `npm test`
Expected: PASS. Check specifically that `src/solve/SolvePage.test.tsx` still passes — it doesn't pass `jobNames` explicitly today, so confirm its fixture `problem` data includes a `jobs` array shape compatible with `.map((job) => job.name ?? undefined)` (an empty/missing `name` field is fine — falls through to `undefined`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/solve/GanttBar.tsx frontend/src/solve/GanttChart.tsx frontend/src/solve/SolvePage.tsx frontend/src/solve/GanttChart.test.tsx
git commit -m "feat: use job name in Gantt tooltip"
```

---

### Task 7: Frontend — Gantt resize decoupling

**Files:**
- Modify: `frontend/vitest.setup.ts`
- Modify: `frontend/src/solve/GanttChart.tsx`
- Test: `frontend/src/solve/GanttChart.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan (independent of job naming).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the `ResizeObserver` test polyfill**

Add to `frontend/vitest.setup.ts` (after the existing `Request` polyfill block):

```typescript
// jsdom (this project's test environment) doesn't implement ResizeObserver.
// This stub's observe() never fires a callback, so GanttChart falls back to
// its initial getBoundingClientRect() read (all-zero under jsdom), clamping
// to MIN_PLOT_WIDTH in every test — no per-test mocking needed since no
// existing test asserts on exact pixel positions.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
```

- [ ] **Step 2: Write the failing test**

Add to `frontend/src/solve/GanttChart.test.tsx`:

```typescript
it('clamps the plot width to MIN_PLOT_WIDTH when the container reports zero width (jsdom default)', () => {
  render(<GanttChart schedule={schedule} machines={['M1', 'M2']} />)

  const svg = screen.getByRole('img', { name: 'Solve schedule Gantt chart' })
  const viewBox = svg.getAttribute('viewBox')
  // width = LEFT_MARGIN (120) + MIN_PLOT_WIDTH (300) + RIGHT_MARGIN (20) = 440
  expect(viewBox).toMatch(/^0 0 440 /)
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/solve/GanttChart.test.tsx`
Expected: FAIL — today's `viewBox` width is always `LEFT_MARGIN + 860 + RIGHT_MARGIN = 1000`, not `440`.

- [ ] **Step 4: Update `GanttChart.tsx`**

Add the necessary imports (the file currently imports only `useState` from `react`; this codebase never uses a namespace `import React from 'react'` — it relies on the `react-jsx` transform — so `RefObject` needs its own named type import rather than being referenced as `React.RefObject`):

```tsx
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
```

Remove the module-level `PLOT_WIDTH` constant (`const PLOT_WIDTH = 860`) and add, near the other module-level constants:

```tsx
const MIN_PLOT_WIDTH = 300

function useContainerWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
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
```

Inside `GanttChart`, current:

```tsx
export function GanttChart({ schedule, machines, jobNames }: GanttChartProps) {
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
```

Change to:

```tsx
export function GanttChart({ schedule, machines, jobNames }: GanttChartProps) {
  const [hoveredJob, setHoveredJob] = useState<number | null>(null)
  const [pinnedJob, setPinnedJob] = useState<number | null>(null)
  const highlightedJob = pinnedJob ?? hoveredJob
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()

  const layout = computeGanttLayout(schedule, machines)
  const makespan = Math.max(1, ...schedule.map((operation) => operation.end))
  const plotHeight = machines.length * ROW_HEIGHT
  const height = TOP_MARGIN + plotHeight + BOTTOM_MARGIN
  const PLOT_WIDTH = Math.max(MIN_PLOT_WIDTH, containerWidth - LEFT_MARGIN - RIGHT_MARGIN)
  const width = LEFT_MARGIN + PLOT_WIDTH + RIGHT_MARGIN

  return (
    <div ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Solve schedule Gantt chart"
        style={{ height }}
        className="w-full"
      >
```

(Keeping the local name `PLOT_WIDTH` for the computed value, rather than renaming every usage inside the JSX below, minimizes the diff — every existing reference to `PLOT_WIDTH` inside the component body and JSX continues to work unchanged, now reading the computed value instead of the removed module-level constant.)

At the end of the component's returned JSX, the closing `</svg>` needs a matching closing `</div>` added right after it:

```tsx
      </svg>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run src/solve/GanttChart.test.tsx`
Expected: PASS (all tests in the file — this confirms the jsdom zero-width fallback clamps correctly, and that no existing test broke from the added wrapping `<div>` or the `PLOT_WIDTH` computation change).

- [ ] **Step 6: Run the full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Manual check**

Run: `npm run dev` (with a backend also running per the project README) and open a completed solve's page. Resize the browser window and confirm: the chart's bar width visibly tracks the window width, while row height stays visually constant (doesn't grow/shrink with the window) — this is the one thing no automated test in this plan directly observes (jsdom never reports a non-zero container width, so no test exercises the "wide container" branch of the clamp).

- [ ] **Step 8: Commit**

```bash
git add frontend/vitest.setup.ts frontend/src/solve/GanttChart.tsx frontend/src/solve/GanttChart.test.tsx
git commit -m "feat: decouple Gantt chart width from row height via ResizeObserver"
```

---

### Task 8: Final CI gate check

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full backend CI gate**

Run, from the repo root: `uv run pytest`
Expected: PASS.

- [ ] **Step 2: Run the full frontend CI gate locally**

Run, in order, from `frontend/`:

```bash
npm run lint
npm test
npm run build
npm run check-types-fresh
```

Expected: all four succeed — these are exactly the checks `.github/workflows/ci.yml` runs.

- [ ] **Step 3: If anything fails, fix and re-run**

Fix the specific failure and re-run the full sequence (backend then frontend) until everything passes. Do not skip a check to "fix later."

No commit for this task — it's a verification gate over the commits already made in Tasks 1–7. If Step 3 required fixes, land those as a normal follow-up commit (not `--amend`) rather than leaving the gate red.
