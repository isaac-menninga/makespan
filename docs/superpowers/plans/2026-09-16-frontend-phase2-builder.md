# Frontend Phase 2 (Builder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/problems/new` and `/problems/:id` placeholder routes with a real Builder page — a jobs/machines/operations editor (plus per-job due date/weight) with local draft state, save via `POST`/`PUT /api/problems`, client-side validation, and an unsaved-changes navigation guard.

**Architecture:** Draft state is a plain object graph with client-only ids on every machine/job/operation (never array-index addressing), edited through an Immer-powered `useReducer`. A single pure `validateDraft` function is the sole source of truth for validity, reused by the Save button, inline error display, and a reducer-level guard. `hydrate`/`serialize` are the only two functions that cross the wire-format boundary. React Router migrates from `<BrowserRouter>` to a data router so `useBlocker` can guard navigation while the draft is dirty.

**Tech Stack:** Same as Phase 1 (Vite, React 19, TypeScript, Tailwind CSS 4, React Router 8, TanStack Query 5, openapi-fetch, Vitest + React Testing Library), plus `immer` (reducer) and `@testing-library/user-event` (interaction tests), both added in this plan.

**Spec:** `docs/superpowers/specs/2026-09-16-frontend-phase2-builder-design.md`

## Global Constraints

- Package manager: **npm only** for the frontend.
- TypeScript **strict mode** — all new frontend code must satisfy the existing `tsconfig.app.json` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).
- Tailwind's `slate` scale for surfaces/text, `--color-accent` (`bg-accent`/`text-accent`) for primary actions/links — matches Phase 1, light mode only.
- No backend endpoint changes — `POST`/`GET`/`PUT /api/problems/{id}` already support everything this plan needs. The only backend change is a new test file plus a shared fixture file.
- Every task must leave `uv run pytest` (backend) and `npm run lint`, `npm test`, `npm run build` (frontend) all green before committing.
- The type-freshness check (`check-types-fresh`) is a local/manual script in this plan — not wired into CI (none exists in this repo yet).

---

## Task 1: Backend — shared problem-validation fixtures + Pydantic contract test

**Files:**
- Create: `tests/fixtures/problem-validation-cases.json`
- Create: `tests/solver/test_validation_fixtures.py`

**Interfaces:**
- Produces: `tests/fixtures/problem-validation-cases.json`, a list of `{description, problem, shouldBeValid}` objects where `problem` is a `ProblemSpec`-shaped object (`{machines, jobs, constraints?}`). Consumed by this task's backend test and by Task 4's frontend test.

- [ ] **Step 1: Create the shared fixture file**

Create `tests/fixtures/problem-validation-cases.json`:

```json
[
  {
    "description": "a minimal valid problem",
    "problem": {
      "machines": ["M1"],
      "jobs": [{ "operations": [{ "machine_id": "M1", "duration": 1 }] }]
    },
    "shouldBeValid": true
  },
  {
    "description": "a valid problem with a due date",
    "problem": {
      "machines": ["M1", "M2"],
      "jobs": [
        { "operations": [{ "machine_id": "M1", "duration": 3 }] },
        { "operations": [{ "machine_id": "M2", "duration": 2 }] }
      ],
      "constraints": { "due_dates": [{ "job_index": 0, "due": 10, "weight": 2 }] }
    },
    "shouldBeValid": true
  },
  {
    "description": "an empty jobs list",
    "problem": { "machines": ["M1"], "jobs": [] },
    "shouldBeValid": false
  },
  {
    "description": "a job with zero operations",
    "problem": { "machines": ["M1"], "jobs": [{ "operations": [] }] },
    "shouldBeValid": false
  },
  {
    "description": "an operation with zero duration",
    "problem": {
      "machines": ["M1"],
      "jobs": [{ "operations": [{ "machine_id": "M1", "duration": 0 }] }]
    },
    "shouldBeValid": false
  },
  {
    "description": "an operation referencing an unknown machine",
    "problem": {
      "machines": ["M1"],
      "jobs": [{ "operations": [{ "machine_id": "M2", "duration": 1 }] }]
    },
    "shouldBeValid": false
  },
  {
    "description": "a downtime window with end before start",
    "problem": {
      "machines": ["M1"],
      "jobs": [{ "operations": [{ "machine_id": "M1", "duration": 1 }] }],
      "constraints": { "downtime_windows": [{ "machine_id": "M1", "start": 10, "end": 5 }] }
    },
    "shouldBeValid": false
  },
  {
    "description": "setup_times referencing an unknown machine",
    "problem": {
      "machines": ["M1"],
      "jobs": [{ "operations": [{ "machine_id": "M1", "duration": 1 }] }],
      "constraints": { "setup_times": { "M2": 5 } }
    },
    "shouldBeValid": false
  },
  {
    "description": "a negative setup time",
    "problem": {
      "machines": ["M1"],
      "jobs": [{ "operations": [{ "machine_id": "M1", "duration": 1 }] }],
      "constraints": { "setup_times": { "M1": -1 } }
    },
    "shouldBeValid": false
  }
]
```

(Two related rules — a due date referencing an out-of-bounds job index, and two due dates for the same job index — are intentionally **not** in this shared file: the frontend's draft model makes both structurally unrepresentable, since `job_index` is always derived fresh from live array position at save time, never stored or user-settable. They remain backend-only concerns, already exercised by Pydantic's own validators.)

- [ ] **Step 2: Write the contract test**

Create `tests/solver/test_validation_fixtures.py`:

```python
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from makespan.solver.models import ProblemSpec

FIXTURES_PATH = (
    Path(__file__).resolve().parent.parent / "fixtures" / "problem-validation-cases.json"
)
CASES = json.loads(FIXTURES_PATH.read_text())


@pytest.mark.parametrize("case", CASES, ids=[c["description"] for c in CASES])
def test_problem_spec_matches_fixture(case):
    if case["shouldBeValid"]:
        ProblemSpec(**case["problem"])
    else:
        with pytest.raises(ValidationError):
            ProblemSpec(**case["problem"])
```

- [ ] **Step 3: Run the test**

Run: `uv run pytest tests/solver/test_validation_fixtures.py -v`
Expected: all 9 cases PASS. This test doesn't drive new backend logic — it pins existing `ProblemSpec` validator behavior against a fixture set the frontend will independently check itself against in Task 4.

- [ ] **Step 4: Run the full backend suite**

Run: `uv run pytest`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/problem-validation-cases.json tests/solver/test_validation_fixtures.py
git commit -m "$(cat <<'EOF'
test: add shared problem-validation fixtures and backend contract test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Static OpenAPI export + type-freshness check

**Files:**
- Modify: `frontend/package.json` (`generate-types` script, new `check-types-fresh` script)
- Create: `frontend/scripts/check-types-fresh.sh`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run generate-types` (no longer requires a running backend server), `npm run check-types-fresh` (fails with a nonzero exit code if `src/api/schema.ts` is stale relative to the backend's current OpenAPI schema).

- [ ] **Step 1: Change `generate-types` to export the schema statically**

In `frontend/package.json`, change:

```json
"generate-types": "openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.ts"
```

to:

```json
"generate-types": "(cd .. && uv run python -c \"import json; from makespan.main import app; print(json.dumps(app.openapi()))\") | openapi-typescript - -o src/api/schema.ts"
```

- [ ] **Step 2: Verify it produces an identical schema**

Run (from `frontend/`): `npm run generate-types`
Then: `git diff --stat src/api/schema.ts`
Expected: no output (no diff) — the backend hasn't changed, so the statically-exported schema must match what's already committed. If there's a diff, something is wrong with the export command; do not proceed until this is empty.

- [ ] **Step 3: Add the freshness-check script**

Create `frontend/scripts/check-types-fresh.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

(cd .. && uv run python -c "import json; from makespan.main import app; print(json.dumps(app.openapi()))") \
  | openapi-typescript - -o "$tmpfile"

if diff -q src/api/schema.ts "$tmpfile" > /dev/null; then
  echo "schema.ts is up to date"
else
  echo "schema.ts is OUT OF DATE — run 'npm run generate-types' and commit the result" >&2
  exit 1
fi
```

- [ ] **Step 4: Add the npm script entry**

In `frontend/package.json`'s `"scripts"`, add:

```json
"check-types-fresh": "bash scripts/check-types-fresh.sh"
```

- [ ] **Step 5: Run it**

Run (from `frontend/`): `npm run check-types-fresh`
Expected: prints `schema.ts is up to date` and exits 0.

- [ ] **Step 6: Update the README**

In `README.md`, in the `## Frontend` section, replace:

```markdown
After a backend schema change, regenerate the typed API client (requires
the backend running):

```bash
cd frontend
npm run generate-types
```
```

with:

```markdown
After a backend schema change, regenerate the typed API client:

```bash
cd frontend
npm run generate-types
```

To check whether `src/api/schema.ts` is stale (e.g. after pulling backend
changes) without regenerating it:

```bash
cd frontend
npm run check-types-fresh
```
```

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/scripts/check-types-fresh.sh README.md
git commit -m "$(cat <<'EOF'
build: generate OpenAPI types without a running backend server

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Draft types + hydrate/serialize

**Files:**
- Create: `frontend/src/builder/id.ts`
- Test: `frontend/src/builder/id.test.ts`
- Create: `frontend/src/builder/types.ts`
- Create: `frontend/src/builder/transform.ts`
- Test: `frontend/src/builder/transform.test.ts`

**Interfaces:**
- Produces: `generateId()` from `id.ts`. `BuilderDraft`, `MachineDraft`, `JobDraft`, `OperationDraft`, `DowntimeWindowDraft` types from `types.ts` — consumed by every later Builder task. `hydrateSpec(spec)`, `hydrate(problem: ApiProblemOut)`, `serialize(draft: BuilderDraft): ApiProblemIn` from `transform.ts` — `hydrateSpec` consumed by Task 4's fixture test, `hydrate`/`serialize` consumed by Task 9 (`BuilderPage`).

- [ ] **Step 1: Write the failing test for `generateId`**

Create `frontend/src/builder/id.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateId } from './id'

describe('generateId', () => {
  it('generates unique ids', () => {
    expect(generateId()).not.toBe(generateId())
  })

  it('generates a UUID-shaped string', () => {
    expect(generateId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/builder/id.test.ts
```

Expected: FAIL — `frontend/src/builder/id.ts` does not exist.

- [ ] **Step 3: Implement `generateId`**

Create `frontend/src/builder/id.ts`:

```ts
export function generateId(): string {
  return crypto.randomUUID()
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/builder/id.test.ts
```

Expected: PASS.

- [ ] **Step 5: Create the draft types**

Create `frontend/src/builder/types.ts`:

```ts
import type { components } from '../api/schema'

type ApiOperation = components['schemas']['Operation']

export type OperationDraft = Omit<ApiOperation, 'machine_id'> & {
  id: string
  /** References a MachineDraft.id — never a machine name. */
  machineId: string
}

export type JobDraft = {
  id: string
  operations: OperationDraft[]
  dueDate?: number
  weight?: number
}

export type MachineDraft = {
  id: string
  name: string
}

export type DowntimeWindowDraft = {
  machineId: string
  start: number
  end: number
}

export type BuilderDraft = {
  name: string
  machines: MachineDraft[]
  jobs: JobDraft[]
  /** Keyed by machine id, not name. Not edited by this phase's UI. */
  setupTimes: Record<string, number>
  /** Not edited by this phase's UI. */
  downtimeWindows: DowntimeWindowDraft[]
}
```

No test — this file declares types only, no runtime behavior.

- [ ] **Step 6: Write the failing tests for `hydrateSpec`/`hydrate`/`serialize`**

Create `frontend/src/builder/transform.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hydrate, hydrateSpec, serialize } from './transform'
import type { BuilderDraft } from './types'

describe('hydrateSpec', () => {
  it('assigns an id to every machine, job, and operation', () => {
    const draft = hydrateSpec({
      machines: ['M1', 'M2'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 3 }] }],
    })

    expect(draft.machines).toHaveLength(2)
    expect(draft.machines[0].id).toBeTruthy()
    expect(draft.jobs[0].id).toBeTruthy()
    expect(draft.jobs[0].operations[0].id).toBeTruthy()
  })

  it('points an operation at its machine by id, not by name', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 3 }] }],
    })

    expect(draft.jobs[0].operations[0].machineId).toBe(draft.machines[0].id)
  })

  it('maps due_dates onto the job at that index', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [
        { operations: [{ machine_id: 'M1', duration: 1 }] },
        { operations: [{ machine_id: 'M1', duration: 2 }] },
      ],
      constraints: { due_dates: [{ job_index: 1, due: 10, weight: 2 }] },
    })

    expect(draft.jobs[0].dueDate).toBeUndefined()
    expect(draft.jobs[1].dueDate).toBe(10)
    expect(draft.jobs[1].weight).toBe(2)
  })

  it('converts setup_times and downtime_windows to machine-id keys', () => {
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {
        setup_times: { M1: 5 },
        downtime_windows: [{ machine_id: 'M1', start: 0, end: 10 }],
      },
    })

    const machineId = draft.machines[0].id
    expect(draft.setupTimes).toEqual({ [machineId]: 5 })
    expect(draft.downtimeWindows).toEqual([{ machineId, start: 0, end: 10 }])
  })

  it('preserves an unresolvable machine reference rather than silently dropping it', () => {
    // Backend guarantees GET-returned data always has valid references, so this
    // path is only exercised by the shared fixtures in Task 4 (which feed in
    // deliberately invalid wire-format data) — it must not eat the evidence
    // validateDraft needs to flag it.
    const draft = hydrateSpec({
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M2', duration: 1 }] }],
      constraints: { setup_times: { M2: 5 } },
    })

    expect(draft.jobs[0].operations[0].machineId).toBe('M2')
    expect(draft.setupTimes).toEqual({ M2: 5 })
  })
})

describe('hydrate', () => {
  it('carries the problem name through', () => {
    const draft = hydrate({
      id: 'abc',
      name: 'My problem',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    })

    expect(draft.name).toBe('My problem')
  })
})

describe('serialize', () => {
  function draft(overrides: Partial<BuilderDraft> = {}): BuilderDraft {
    return {
      name: 'Demo',
      machines: [{ id: 'm1', name: 'M1' }],
      jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
      setupTimes: {},
      downtimeWindows: [],
      ...overrides,
    }
  }

  it('converts machine ids back to names in operations', () => {
    const result = serialize(draft())
    expect(result.jobs[0].operations[0].machine_id).toBe('M1')
  })

  it('computes due_dates from job order and the dueDate/weight fields', () => {
    const result = serialize(
      draft({
        jobs: [
          { id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 1 }] },
          {
            id: 'j2',
            operations: [{ id: 'o2', machineId: 'm1', duration: 1 }],
            dueDate: 10,
            weight: 3,
          },
        ],
      }),
    )

    expect(result.constraints?.due_dates).toEqual([{ job_index: 1, due: 10, weight: 3 }])
  })

  it('defaults weight to 1 when a due date has no explicit weight', () => {
    const result = serialize(
      draft({
        jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 1 }], dueDate: 5 }],
      }),
    )

    expect(result.constraints?.due_dates).toEqual([{ job_index: 0, due: 5, weight: 1 }])
  })

  it('converts setupTimes and downtimeWindows back to machine-name keys', () => {
    const result = serialize(
      draft({
        setupTimes: { m1: 5 },
        downtimeWindows: [{ machineId: 'm1', start: 0, end: 10 }],
      }),
    )

    expect(result.constraints?.setup_times).toEqual({ M1: 5 })
    expect(result.constraints?.downtime_windows).toEqual([{ machine_id: 'M1', start: 0, end: 10 }])
  })
})

describe('round trip', () => {
  it('hydrate then serialize reproduces the original problem shape', () => {
    const original = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1', 'M2'],
      jobs: [
        {
          operations: [
            { machine_id: 'M1', duration: 3 },
            { machine_id: 'M2', duration: 2 },
          ],
        },
        { operations: [{ machine_id: 'M2', duration: 4 }] },
      ],
      constraints: {
        setup_times: { M1: 2 },
        due_dates: [{ job_index: 1, due: 20, weight: 1 }],
        downtime_windows: [{ machine_id: 'M2', start: 0, end: 5 }],
      },
    }

    const result = serialize(hydrate(original))

    expect(result).toEqual({
      name: original.name,
      machines: original.machines,
      jobs: original.jobs,
      constraints: original.constraints,
    })
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

```bash
npx vitest run src/builder/transform.test.ts
```

Expected: FAIL — `frontend/src/builder/transform.ts` does not exist.

- [ ] **Step 8: Implement `transform.ts`**

Create `frontend/src/builder/transform.ts`:

```ts
import { generateId } from './id'
import type { components } from '../api/schema'
import type {
  BuilderDraft,
  DowntimeWindowDraft,
  JobDraft,
  MachineDraft,
  OperationDraft,
} from './types'

type ApiProblemOut = components['schemas']['ProblemOut']
type ApiProblemIn = components['schemas']['ProblemIn']

type ProblemSpecLike = {
  machines: string[]
  jobs: { operations: { machine_id: string; duration: number }[] }[]
  constraints?: {
    setup_times?: Record<string, number>
    due_dates?: { job_index: number; due: number; weight: number }[]
    downtime_windows?: { machine_id: string; start: number; end: number }[]
  }
}

export function hydrateSpec(
  spec: ProblemSpecLike,
): Pick<BuilderDraft, 'machines' | 'jobs' | 'setupTimes' | 'downtimeWindows'> {
  const machines: MachineDraft[] = spec.machines.map((name) => ({ id: generateId(), name }))
  const machineIdByName = new Map(machines.map((machine) => [machine.name, machine.id]))

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

  for (const dueDate of spec.constraints?.due_dates ?? []) {
    const job = jobs[dueDate.job_index]
    if (job) {
      job.dueDate = dueDate.due
      job.weight = dueDate.weight
    }
  }

  const setupTimes: Record<string, number> = {}
  for (const [machineName, value] of Object.entries(spec.constraints?.setup_times ?? {})) {
    setupTimes[machineIdByName.get(machineName) ?? machineName] = value
  }

  const downtimeWindows: DowntimeWindowDraft[] = (spec.constraints?.downtime_windows ?? []).map(
    (window) => ({
      machineId: machineIdByName.get(window.machine_id) ?? window.machine_id,
      start: window.start,
      end: window.end,
    }),
  )

  return { machines, jobs, setupTimes, downtimeWindows }
}

export function hydrate(problem: ApiProblemOut): BuilderDraft {
  return {
    name: problem.name,
    ...hydrateSpec(problem),
  }
}

export function serialize(draft: BuilderDraft): ApiProblemIn {
  const machineNameById = new Map(draft.machines.map((machine) => [machine.id, machine.name]))

  const setupTimes: Record<string, number> = {}
  for (const [machineId, value] of Object.entries(draft.setupTimes)) {
    const machineName = machineNameById.get(machineId)
    if (machineName) setupTimes[machineName] = value
  }

  const dueDates = draft.jobs.flatMap((job, jobIndex) =>
    job.dueDate != null
      ? [{ job_index: jobIndex, due: job.dueDate, weight: job.weight ?? 1 }]
      : [],
  )

  const downtimeWindows = draft.downtimeWindows.flatMap((window) => {
    const machineName = machineNameById.get(window.machineId)
    return machineName ? [{ machine_id: machineName, start: window.start, end: window.end }] : []
  })

  return {
    name: draft.name,
    machines: draft.machines.map((machine) => machine.name),
    jobs: draft.jobs.map((job) => ({
      operations: job.operations.map((operation) => ({
        machine_id: machineNameById.get(operation.machineId) ?? operation.machineId,
        duration: operation.duration,
      })),
    })),
    constraints: {
      setup_times: setupTimes,
      due_dates: dueDates,
      downtime_windows: downtimeWindows,
    },
  }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
npx vitest run src/builder/transform.test.ts
```

Expected: PASS (all cases, including the round trip).

- [ ] **Step 10: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/builder/id.ts frontend/src/builder/id.test.ts frontend/src/builder/types.ts frontend/src/builder/transform.ts frontend/src/builder/transform.test.ts
git commit -m "$(cat <<'EOF'
feat: add Builder draft types and hydrate/serialize transforms

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `validateDraft` + shared-fixture contract test

**Files:**
- Create: `frontend/src/builder/validate.ts`
- Test: `frontend/src/builder/validate.test.ts`
- Test: `frontend/src/builder/validate.fixtures.test.ts`

**Interfaces:**
- Consumes: `BuilderDraft` from `types.ts` (Task 3), `hydrateSpec` from `transform.ts` (Task 3).
- Produces: `ValidationResult` type, `validateDraft(draft): ValidationResult`, `getMachineUsage(draft): Set<string>` from `validate.ts` — consumed by Task 5 (`reducer.ts`), Task 6 (`mapValidationErrors.ts`), and Task 8 (`BuilderForm.tsx`).

- [ ] **Step 1: Write the failing unit tests**

Create `frontend/src/builder/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getMachineUsage, validateDraft } from './validate'
import type { BuilderDraft } from './types'

function validDraft(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('validateDraft', () => {
  it('accepts a minimal valid draft', () => {
    expect(validateDraft(validDraft()).isValid).toBe(true)
  })

  it('rejects an empty machine name', () => {
    const draft = validDraft()
    draft.machines[0].name = ''
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.machineErrors.m1).toBeTruthy()
  })

  it('rejects duplicate machine names', () => {
    const draft = validDraft()
    draft.machines.push({ id: 'm2', name: 'M1' })
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.machineErrors.m1).toBeTruthy()
    expect(result.machineErrors.m2).toBeTruthy()
  })

  it('rejects an empty jobs list', () => {
    const draft = validDraft()
    draft.jobs = []
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.problemErrors.length).toBeGreaterThan(0)
  })

  it('rejects a job with zero operations', () => {
    const draft = validDraft()
    draft.jobs[0].operations = []
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.jobErrors.j1?.message).toBeTruthy()
  })

  it('rejects an operation with no machine selected', () => {
    const draft = validDraft()
    draft.jobs[0].operations[0].machineId = ''
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.jobErrors.j1?.operationErrors?.o1).toBeTruthy()
  })

  it('rejects an operation with duration <= 0', () => {
    const draft = validDraft()
    draft.jobs[0].operations[0].duration = 0
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.jobErrors.j1?.operationErrors?.o1).toBeTruthy()
  })

  it('rejects a negative due date', () => {
    const draft = validDraft()
    draft.jobs[0].dueDate = -1
    expect(validateDraft(draft).isValid).toBe(false)
  })

  it('rejects a weight below 1', () => {
    const draft = validDraft()
    draft.jobs[0].dueDate = 5
    draft.jobs[0].weight = 0
    expect(validateDraft(draft).isValid).toBe(false)
  })

  it('rejects a setup time referencing an unknown machine', () => {
    const draft = validDraft()
    draft.setupTimes = { unknown: 5 }
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.problemErrors.length).toBeGreaterThan(0)
  })

  it('rejects a downtime window with end <= start', () => {
    const draft = validDraft()
    draft.downtimeWindows = [{ machineId: 'm1', start: 10, end: 5 }]
    const result = validateDraft(draft)
    expect(result.isValid).toBe(false)
    expect(result.problemErrors.length).toBeGreaterThan(0)
  })
})

describe('getMachineUsage', () => {
  it('reports machines referenced by an operation', () => {
    expect(getMachineUsage(validDraft()).has('m1')).toBe(true)
  })

  it('reports machines referenced by setup times or downtime windows', () => {
    const draft = validDraft()
    draft.jobs[0].operations[0].machineId = ''
    draft.setupTimes = { m1: 5 }
    expect(getMachineUsage(draft).has('m1')).toBe(true)
  })

  it('does not report an unused machine', () => {
    const draft = validDraft()
    draft.machines.push({ id: 'm2', name: 'M2' })
    expect(getMachineUsage(draft).has('m2')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/builder/validate.test.ts
```

Expected: FAIL — `frontend/src/builder/validate.ts` does not exist.

- [ ] **Step 3: Implement `validate.ts`**

Create `frontend/src/builder/validate.ts`:

```ts
import type { BuilderDraft } from './types'

export type ValidationResult = {
  isValid: boolean
  problemErrors: string[]
  machineErrors: Record<string, string>
  jobErrors: Record<string, { message?: string; operationErrors?: Record<string, string> }>
}

export function getMachineUsage(draft: BuilderDraft): Set<string> {
  const used = new Set<string>()
  for (const job of draft.jobs) {
    for (const operation of job.operations) {
      if (operation.machineId) used.add(operation.machineId)
    }
  }
  for (const machineId of Object.keys(draft.setupTimes)) {
    used.add(machineId)
  }
  for (const window of draft.downtimeWindows) {
    used.add(window.machineId)
  }
  return used
}

export function validateDraft(draft: BuilderDraft): ValidationResult {
  const problemErrors: string[] = []
  const machineErrors: Record<string, string> = {}
  const jobErrors: ValidationResult['jobErrors'] = {}

  const idsByName = new Map<string, string[]>()
  for (const machine of draft.machines) {
    if (!machine.name.trim()) {
      machineErrors[machine.id] = 'Machine name is required.'
      continue
    }
    idsByName.set(machine.name, [...(idsByName.get(machine.name) ?? []), machine.id])
  }
  for (const ids of idsByName.values()) {
    if (ids.length > 1) {
      for (const id of ids) machineErrors[id] = 'Machine names must be unique.'
    }
  }

  const machineIds = new Set(draft.machines.map((machine) => machine.id))

  if (draft.jobs.length === 0) {
    problemErrors.push('At least one job is required.')
  }

  for (const [machineId, value] of Object.entries(draft.setupTimes)) {
    if (!machineIds.has(machineId)) {
      problemErrors.push('A setup time references a machine that no longer exists.')
    } else if (value < 0) {
      problemErrors.push('A setup time must be 0 or greater.')
    }
  }

  for (const window of draft.downtimeWindows) {
    if (!machineIds.has(window.machineId)) {
      problemErrors.push('A downtime window references a machine that no longer exists.')
    } else if (window.end <= window.start) {
      problemErrors.push("A downtime window's end must be after its start.")
    }
  }

  for (const job of draft.jobs) {
    if (job.operations.length === 0) {
      jobErrors[job.id] = { message: 'A job must have at least one operation.' }
      continue
    }

    const operationErrors: Record<string, string> = {}
    for (const operation of job.operations) {
      if (!operation.machineId || !machineIds.has(operation.machineId)) {
        operationErrors[operation.id] = 'Select a machine.'
      } else if (!Number.isFinite(operation.duration) || operation.duration <= 0) {
        operationErrors[operation.id] = 'Duration must be greater than 0.'
      }
    }

    let message: string | undefined
    if (job.dueDate != null && job.dueDate < 0) {
      message = 'Due date must be 0 or greater.'
    } else if (job.weight != null && job.weight < 1) {
      message = 'Weight must be at least 1.'
    }

    if (message || Object.keys(operationErrors).length > 0) {
      jobErrors[job.id] = {
        ...(message ? { message } : {}),
        ...(Object.keys(operationErrors).length > 0 ? { operationErrors } : {}),
      }
    }
  }

  const isValid =
    problemErrors.length === 0 &&
    Object.keys(machineErrors).length === 0 &&
    Object.keys(jobErrors).length === 0

  return { isValid, problemErrors, machineErrors, jobErrors }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/builder/validate.test.ts
```

Expected: PASS (all cases).

- [ ] **Step 5: Write the shared-fixture contract test**

Create `frontend/src/builder/validate.fixtures.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hydrateSpec } from './transform'
import { validateDraft } from './validate'

type FixtureCase = { description: string; problem: unknown; shouldBeValid: boolean }

const fixturesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tests/fixtures/problem-validation-cases.json',
)
const cases: FixtureCase[] = JSON.parse(readFileSync(fixturesPath, 'utf-8'))

describe('validateDraft matches the shared backend fixtures', () => {
  for (const testCase of cases) {
    it(testCase.description, () => {
      const draft = {
        name: 'Fixture',
        ...hydrateSpec(testCase.problem as Parameters<typeof hydrateSpec>[0]),
      }
      expect(validateDraft(draft).isValid).toBe(testCase.shouldBeValid)
    })
  }
})
```

- [ ] **Step 6: Run it to verify it passes**

```bash
npx vitest run src/builder/validate.fixtures.test.ts
```

Expected: PASS (all 9 cases). If any fail, re-check the corresponding `hydrateSpec`/`validateDraft` logic — this test exists specifically to catch exactly this kind of frontend/backend rule mismatch.

- [ ] **Step 7: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/builder/validate.ts frontend/src/builder/validate.test.ts frontend/src/builder/validate.fixtures.test.ts
git commit -m "$(cat <<'EOF'
feat: add centralized Builder draft validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `builderReducer`

**Files:**
- Modify: `frontend/package.json` (add `immer` dependency)
- Create: `frontend/src/builder/reducer.ts`
- Test: `frontend/src/builder/reducer.test.ts`

**Interfaces:**
- Consumes: `BuilderDraft`, `JobDraft`, `OperationDraft` from `types.ts` (Task 3), `generateId` from `id.ts` (Task 3), `getMachineUsage` from `validate.ts` (Task 4).
- Produces: `BuilderAction` type, `builderReducer(draft, action): BuilderDraft`, `newJob(machineId)` (which internally calls `newOperation(machineId)`) from `reducer.ts` — `newJob` consumed by Task 8 (`BuilderForm.tsx`'s `createEmptyDraft`, to avoid duplicating job/operation shape construction).

- [ ] **Step 1: Install immer**

```bash
cd frontend
npm install immer
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/builder/reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { builderReducer } from './reducer'
import type { BuilderDraft } from './types'

function baseDraft(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('builderReducer', () => {
  it('setName updates the name', () => {
    const result = builderReducer(baseDraft(), { type: 'setName', name: 'Renamed' })
    expect(result.name).toBe('Renamed')
  })

  it('addMachine appends a new, empty-named machine', () => {
    const result = builderReducer(baseDraft(), { type: 'addMachine' })
    expect(result.machines).toHaveLength(2)
    expect(result.machines[1].name).toBe('')
  })

  it('renameMachine updates only the targeted machine, leaving operation references untouched', () => {
    const result = builderReducer(baseDraft(), {
      type: 'renameMachine',
      machineId: 'm1',
      name: 'Renamed',
    })
    expect(result.machines[0].name).toBe('Renamed')
    expect(result.jobs[0].operations[0].machineId).toBe('m1')
  })

  it('removeMachine removes a machine that is not in use', () => {
    const draft = baseDraft()
    draft.machines.push({ id: 'm2', name: 'M2' })
    const result = builderReducer(draft, { type: 'removeMachine', machineId: 'm2' })
    expect(result.machines).toHaveLength(1)
  })

  it('removeMachine is a no-op for a machine referenced by an operation', () => {
    const draft = baseDraft()
    const result = builderReducer(draft, { type: 'removeMachine', machineId: 'm1' })
    expect(result.machines).toHaveLength(1)
  })

  it('addJob appends a job seeded with one operation on the first machine', () => {
    const result = builderReducer(baseDraft(), { type: 'addJob' })
    expect(result.jobs).toHaveLength(2)
    expect(result.jobs[1].operations).toHaveLength(1)
    expect(result.jobs[1].operations[0].machineId).toBe('m1')
  })

  it('removeJob removes a job when more than one exists', () => {
    const draft = builderReducer(baseDraft(), { type: 'addJob' })
    const result = builderReducer(draft, { type: 'removeJob', jobId: draft.jobs[0].id })
    expect(result.jobs).toHaveLength(1)
  })

  it('removeJob is a no-op when it is the last job', () => {
    const result = builderReducer(baseDraft(), { type: 'removeJob', jobId: 'j1' })
    expect(result.jobs).toHaveLength(1)
  })

  it('addOperation appends an operation to the targeted job', () => {
    const result = builderReducer(baseDraft(), { type: 'addOperation', jobId: 'j1' })
    expect(result.jobs[0].operations).toHaveLength(2)
  })

  it('removeOperation removes an operation when more than one exists', () => {
    const draft = builderReducer(baseDraft(), { type: 'addOperation', jobId: 'j1' })
    const result = builderReducer(draft, {
      type: 'removeOperation',
      jobId: 'j1',
      operationId: 'o1',
    })
    expect(result.jobs[0].operations).toHaveLength(1)
    expect(result.jobs[0].operations[0].id).not.toBe('o1')
  })

  it('removeOperation is a no-op when it is the last operation in the job', () => {
    const result = builderReducer(baseDraft(), {
      type: 'removeOperation',
      jobId: 'j1',
      operationId: 'o1',
    })
    expect(result.jobs[0].operations).toHaveLength(1)
  })

  it('reorderOperation swaps an operation with its neighbor', () => {
    let draft = builderReducer(baseDraft(), { type: 'addOperation', jobId: 'j1' })
    const secondId = draft.jobs[0].operations[1].id
    draft = builderReducer(draft, {
      type: 'reorderOperation',
      jobId: 'j1',
      operationId: secondId,
      direction: 'up',
    })
    expect(draft.jobs[0].operations[0].id).toBe(secondId)
  })

  it('reorderOperation is a no-op at the boundary', () => {
    const result = builderReducer(baseDraft(), {
      type: 'reorderOperation',
      jobId: 'j1',
      operationId: 'o1',
      direction: 'up',
    })
    expect(result.jobs[0].operations[0].id).toBe('o1')
  })

  it('updateOperation updates the machine reference', () => {
    const draft = baseDraft()
    draft.machines.push({ id: 'm2', name: 'M2' })
    const result = builderReducer(draft, {
      type: 'updateOperation',
      jobId: 'j1',
      operationId: 'o1',
      field: 'machineId',
      value: 'm2',
    })
    expect(result.jobs[0].operations[0].machineId).toBe('m2')
  })

  it('updateOperation updates the duration', () => {
    const result = builderReducer(baseDraft(), {
      type: 'updateOperation',
      jobId: 'j1',
      operationId: 'o1',
      field: 'duration',
      value: 7,
    })
    expect(result.jobs[0].operations[0].duration).toBe(7)
  })

  it('setJobDueDate and setJobWeight update the targeted job', () => {
    let draft = builderReducer(baseDraft(), { type: 'setJobDueDate', jobId: 'j1', dueDate: 10 })
    draft = builderReducer(draft, { type: 'setJobWeight', jobId: 'j1', weight: 2 })
    expect(draft.jobs[0].dueDate).toBe(10)
    expect(draft.jobs[0].weight).toBe(2)
  })

  it('never mutates the input draft', () => {
    const draft = baseDraft()
    const result = builderReducer(draft, { type: 'setName', name: 'Renamed' })
    expect(draft.name).toBe('Demo')
    expect(result).not.toBe(draft)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/builder/reducer.test.ts
```

Expected: FAIL — `frontend/src/builder/reducer.ts` does not exist.

- [ ] **Step 4: Implement `reducer.ts`**

Create `frontend/src/builder/reducer.ts`:

```ts
import { produce } from 'immer'
import { generateId } from './id'
import { getMachineUsage } from './validate'
import type { BuilderDraft, JobDraft, OperationDraft } from './types'

export type BuilderAction =
  | { type: 'setName'; name: string }
  | { type: 'addMachine' }
  | { type: 'renameMachine'; machineId: string; name: string }
  | { type: 'removeMachine'; machineId: string }
  | { type: 'addJob' }
  | { type: 'removeJob'; jobId: string }
  | { type: 'addOperation'; jobId: string }
  | { type: 'removeOperation'; jobId: string; operationId: string }
  | { type: 'reorderOperation'; jobId: string; operationId: string; direction: 'up' | 'down' }
  | {
      type: 'updateOperation'
      jobId: string
      operationId: string
      field: 'machineId' | 'duration'
      value: string | number
    }
  | { type: 'setJobDueDate'; jobId: string; dueDate: number | undefined }
  | { type: 'setJobWeight'; jobId: string; weight: number | undefined }

export function newOperation(machineId: string): OperationDraft {
  return { id: generateId(), machineId, duration: 1 }
}

export function newJob(machineId: string): JobDraft {
  return { id: generateId(), operations: [newOperation(machineId)] }
}

export const builderReducer = produce((draft: BuilderDraft, action: BuilderAction) => {
  switch (action.type) {
    case 'setName': {
      draft.name = action.name
      break
    }
    case 'addMachine': {
      draft.machines.push({ id: generateId(), name: '' })
      break
    }
    case 'renameMachine': {
      const machine = draft.machines.find((m) => m.id === action.machineId)
      if (machine) machine.name = action.name
      break
    }
    case 'removeMachine': {
      const usage = getMachineUsage(draft)
      if (!usage.has(action.machineId)) {
        draft.machines = draft.machines.filter((m) => m.id !== action.machineId)
      }
      break
    }
    case 'addJob': {
      draft.jobs.push(newJob(draft.machines[0]?.id ?? ''))
      break
    }
    case 'removeJob': {
      if (draft.jobs.length > 1) {
        draft.jobs = draft.jobs.filter((j) => j.id !== action.jobId)
      }
      break
    }
    case 'addOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) job.operations.push(newOperation(draft.machines[0]?.id ?? ''))
      break
    }
    case 'removeOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job && job.operations.length > 1) {
        job.operations = job.operations.filter((op) => op.id !== action.operationId)
      }
      break
    }
    case 'reorderOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (!job) break
      const index = job.operations.findIndex((op) => op.id === action.operationId)
      const targetIndex = action.direction === 'up' ? index - 1 : index + 1
      if (index === -1 || targetIndex < 0 || targetIndex >= job.operations.length) break
      const [operation] = job.operations.splice(index, 1)
      job.operations.splice(targetIndex, 0, operation)
      break
    }
    case 'updateOperation': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      const operation = job?.operations.find((op) => op.id === action.operationId)
      if (!operation) break
      if (action.field === 'machineId') {
        operation.machineId = String(action.value)
      } else {
        operation.duration = Number(action.value)
      }
      break
    }
    case 'setJobDueDate': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) job.dueDate = action.dueDate
      break
    }
    case 'setJobWeight': {
      const job = draft.jobs.find((j) => j.id === action.jobId)
      if (job) job.weight = action.weight
      break
    }
    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
})
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx vitest run src/builder/reducer.test.ts
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
git add frontend/package.json frontend/package-lock.json frontend/src/builder/reducer.ts frontend/src/builder/reducer.test.ts
git commit -m "$(cat <<'EOF'
feat: add id-addressed Builder draft reducer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 422 → `ValidationResult` mapper

**Files:**
- Create: `frontend/src/builder/mapValidationErrors.ts`
- Test: `frontend/src/builder/mapValidationErrors.test.ts`

**Interfaces:**
- Consumes: `BuilderDraft` from `types.ts` (Task 3), `ValidationResult` from `validate.ts` (Task 4).
- Produces: `mapValidationErrors(detail, draft): ValidationResult` — consumed by Task 9 (`BuilderPage.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/builder/mapValidationErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapValidationErrors } from './mapValidationErrors'
import type { BuilderDraft } from './types'

function draft(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [{ id: 'm1', name: 'M1' }],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('mapValidationErrors', () => {
  it('maps a machines[N] error to that machine by position', () => {
    const result = mapValidationErrors(
      [{ loc: ['body', 'machines', 0], msg: 'bad machine' }],
      draft(),
    )
    expect(result.machineErrors.m1).toBe('bad machine')
  })

  it('maps a jobs[N].operations[M].duration error to that operation by position', () => {
    const result = mapValidationErrors(
      [{ loc: ['body', 'jobs', 0, 'operations', 0, 'duration'], msg: 'bad duration' }],
      draft(),
    )
    expect(result.jobErrors.j1?.operationErrors?.o1).toBe('bad duration')
  })

  it('maps a jobs[N] error with no sub-path to that job as a message', () => {
    const result = mapValidationErrors([{ loc: ['body', 'jobs', 0], msg: 'bad job' }], draft())
    expect(result.jobErrors.j1?.message).toBe('bad job')
  })

  it('falls back to a problem-level error for an unrecognized or whole-model location', () => {
    const result = mapValidationErrors([{ loc: ['body'], msg: 'cross-field problem' }], draft())
    expect(result.problemErrors).toEqual(['cross-field problem'])
  })

  it('always reports isValid as false', () => {
    const result = mapValidationErrors([{ loc: ['body'], msg: 'x' }], draft())
    expect(result.isValid).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/builder/mapValidationErrors.test.ts
```

Expected: FAIL — `frontend/src/builder/mapValidationErrors.ts` does not exist.

- [ ] **Step 3: Implement `mapValidationErrors.ts`**

Create `frontend/src/builder/mapValidationErrors.ts`:

```ts
import type { BuilderDraft } from './types'
import type { ValidationResult } from './validate'

export type FastAPIValidationError = { loc: (string | number)[]; msg: string }

export function mapValidationErrors(
  detail: FastAPIValidationError[],
  draft: BuilderDraft,
): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    problemErrors: [],
    machineErrors: {},
    jobErrors: {},
  }

  for (const error of detail) {
    const [, section, index, sub, subIndex, field] = error.loc

    if (section === 'machines' && typeof index === 'number') {
      const machine = draft.machines[index]
      if (machine) {
        result.machineErrors[machine.id] = error.msg
        continue
      }
    }

    if (section === 'jobs' && typeof index === 'number') {
      const job = draft.jobs[index]
      if (job) {
        if (sub === 'operations' && typeof subIndex === 'number' && field) {
          const operation = job.operations[subIndex]
          if (operation) {
            const existing = result.jobErrors[job.id] ?? {}
            result.jobErrors[job.id] = {
              ...existing,
              operationErrors: { ...existing.operationErrors, [operation.id]: error.msg },
            }
            continue
          }
        }
        result.jobErrors[job.id] = { ...result.jobErrors[job.id], message: error.msg }
        continue
      }
    }

    result.problemErrors.push(error.msg)
  }

  return result
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/builder/mapValidationErrors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/builder/mapValidationErrors.ts frontend/src/builder/mapValidationErrors.test.ts
git commit -m "$(cat <<'EOF'
feat: map backend 422 responses onto Builder validation errors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: API hooks — `useProblem`, `useCreateProblem`, `useUpdateProblem`

**Files:**
- Modify: `frontend/src/api/queries.ts`
- Modify: `frontend/src/api/queries.test.tsx`

**Interfaces:**
- Produces: `useProblem(id)`, `useCreateProblem()`, `useUpdateProblem(id)` from `queries.ts` — consumed by Task 9 (`BuilderPage.tsx`).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/api/queries.test.tsx`, add these imports to the existing import block:

```ts
import { renderHook, waitFor } from '@testing-library/react'
```

(already imported — no change needed there) and add `useCreateProblem, useProblem, useUpdateProblem` to the existing `import { usePresets, useSavedProblems } from './queries'` line, making it:

```ts
import { useCreateProblem, useProblem, useSavedProblems, usePresets, useUpdateProblem } from './queries'
```

Then append these test blocks to the end of the file:

```ts
describe('useProblem', () => {
  it('fetches a single problem by id', async () => {
    const problem = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(problem)))

    const { result } = renderHook(() => useProblem('abc'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(problem)
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).url).toContain('/api/problems/abc')
  })
})

describe('useCreateProblem', () => {
  it('POSTs the problem and returns the created record', async () => {
    const created = {
      id: 'new-id',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(created)))

    const { result } = renderHook(() => useCreateProblem(), { wrapper })
    result.current.mutate({
      name: 'Demo',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(created)
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).method).toBe('POST')
  })
})

describe('useUpdateProblem', () => {
  it('PUTs the problem to the given id', async () => {
    const updated = {
      id: 'abc',
      name: 'Renamed',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(updated)))

    const { result } = renderHook(() => useUpdateProblem('abc'), { wrapper })
    result.current.mutate({
      name: 'Renamed',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(updated)
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).method).toBe('PUT')
    expect((request as Request).url).toContain('/api/problems/abc')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/api/queries.test.tsx
```

Expected: FAIL — `useProblem`, `useCreateProblem`, `useUpdateProblem` are not exported from `queries.ts`.

- [ ] **Step 3: Implement the new hooks**

In `frontend/src/api/queries.ts`, change the top import line from:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
```

to:

```ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
import type { components } from './schema'

type ProblemIn = components['schemas']['ProblemIn']
```

Then append to the end of the file:

```ts
export function useProblem(id: string) {
  return useQuery({
    queryKey: ['problem', id],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/problems/{problem_id}', {
        params: { path: { problem_id: id } },
      })
      if (error || !data) throw error || new Error('Failed to load problem')
      return data
    },
  })
}

export function useCreateProblem() {
  return useMutation({
    mutationFn: async (problem: ProblemIn) => {
      const { data, error } = await apiClient.POST('/api/problems', { body: problem })
      if (error || !data) throw error || new Error('Failed to create problem')
      return data
    },
  })
}

export function useUpdateProblem(id: string) {
  return useMutation({
    mutationFn: async (problem: ProblemIn) => {
      const { data, error } = await apiClient.PUT('/api/problems/{problem_id}', {
        params: { path: { problem_id: id } },
        body: problem,
      })
      if (error || !data) throw error || new Error('Failed to update problem')
      return data
    },
  })
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/api/queries.test.tsx
```

Expected: PASS (all cases, including the pre-existing `usePresets`/`useSavedProblems` tests).

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
feat: add useProblem/useCreateProblem/useUpdateProblem query hooks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Builder components — `BuilderForm` and its children

**Files:**
- Modify: `frontend/package.json` (add `@testing-library/user-event` dev dependency)
- Create: `frontend/src/builder/MachineRow.tsx`
- Create: `frontend/src/builder/MachineList.tsx`
- Create: `frontend/src/builder/OperationRow.tsx`
- Create: `frontend/src/builder/JobCard.tsx`
- Create: `frontend/src/builder/BuilderHeader.tsx`
- Create: `frontend/src/builder/BuilderForm.tsx`
- Test: `frontend/src/builder/BuilderForm.test.tsx`

**Interfaces:**
- Consumes: `builderReducer`, `newOperation` from `reducer.ts` (Task 5); `validateDraft`, `getMachineUsage`, `ValidationResult` from `validate.ts` (Task 4); `generateId` from `id.ts` (Task 3); `BuilderDraft`, `MachineDraft`, `JobDraft`, `OperationDraft` from `types.ts` (Task 3).
- Produces: `createEmptyDraft(): BuilderDraft` and `BuilderForm` (props: `initialDraft`, `savedDraft`, `onBack`, `onSave`, `isSaving`, `justSaved?`, `saveErrors?`) from `BuilderForm.tsx` — consumed by Task 9 (`BuilderPage.tsx`) and modified again in Task 10 (adds the `useBlocker` guard).

- [ ] **Step 1: Install the interaction-testing dependency**

```bash
cd frontend
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 2: Implement `MachineRow.tsx`**

Create `frontend/src/builder/MachineRow.tsx`:

```tsx
import type { MachineDraft } from './types'

type MachineRowProps = {
  machine: MachineDraft
  error?: string
  inUse: boolean
  onRename: (name: string) => void
  onRemove: () => void
}

export function MachineRow({ machine, error, inUse, onRename, onRemove }: MachineRowProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={machine.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Machine name"
        aria-label="Machine name"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={inUse}
        title={inUse ? 'This machine is in use' : undefined}
        className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        Remove
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
```

- [ ] **Step 3: Implement `MachineList.tsx`**

Create `frontend/src/builder/MachineList.tsx`:

```tsx
import { MachineRow } from './MachineRow'
import type { MachineDraft } from './types'

type MachineListProps = {
  machines: MachineDraft[]
  errors: Record<string, string>
  usage: Set<string>
  onAdd: () => void
  onRename: (machineId: string, name: string) => void
  onRemove: (machineId: string) => void
}

export function MachineList({ machines, errors, usage, onAdd, onRename, onRemove }: MachineListProps) {
  return (
    <section>
      <h2 className="text-lg font-medium text-slate-800">Machines</h2>
      <div className="mt-2 space-y-2">
        {machines.map((machine) => (
          <MachineRow
            key={machine.id}
            machine={machine}
            error={errors[machine.id]}
            inUse={usage.has(machine.id)}
            onRename={(name) => onRename(machine.id, name)}
            onRemove={() => onRemove(machine.id)}
          />
        ))}
      </div>
      <button type="button" onClick={onAdd} className="mt-2 text-sm font-medium text-accent hover:underline">
        + Add Machine
      </button>
    </section>
  )
}
```

- [ ] **Step 4: Implement `OperationRow.tsx`**

Create `frontend/src/builder/OperationRow.tsx`:

```tsx
import type { MachineDraft, OperationDraft } from './types'

type OperationRowProps = {
  operation: OperationDraft
  machines: MachineDraft[]
  error?: string
  canMoveUp: boolean
  canMoveDown: boolean
  canRemove: boolean
  onChangeMachine: (machineId: string) => void
  onChangeDuration: (duration: number) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function OperationRow({
  operation,
  machines,
  error,
  canMoveUp,
  canMoveDown,
  canRemove,
  onChangeMachine,
  onChangeDuration,
  onMoveUp,
  onMoveDown,
  onRemove,
}: OperationRowProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={operation.machineId}
        onChange={(e) => onChangeMachine(e.target.value)}
        aria-label="Machine"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">Select a machine</option>
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.name || '(unnamed machine)'}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={operation.duration}
        onChange={(e) => onChangeDuration(Number(e.target.value))}
        aria-label="Duration"
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move operation up">
        ↑
      </button>
      <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move operation down">
        ↓
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="text-sm text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        Remove
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
```

- [ ] **Step 5: Implement `JobCard.tsx`**

Create `frontend/src/builder/JobCard.tsx`:

```tsx
import { OperationRow } from './OperationRow'
import type { MachineDraft, JobDraft } from './types'

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

      <div className="mt-2 space-y-2">
        {job.operations.map((operation, index) => (
          <OperationRow
            key={operation.id}
            operation={operation}
            machines={machines}
            error={error?.operationErrors?.[operation.id]}
            canMoveUp={index > 0}
            canMoveDown={index < job.operations.length - 1}
            canRemove={job.operations.length > 1}
            onChangeMachine={(machineId) => onChangeOperationMachine(operation.id, machineId)}
            onChangeDuration={(duration) => onChangeOperationDuration(operation.id, duration)}
            onMoveUp={() => onReorderOperation(operation.id, 'up')}
            onMoveDown={() => onReorderOperation(operation.id, 'down')}
            onRemove={() => onRemoveOperation(operation.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAddOperation}
        className="mt-2 text-sm font-medium text-accent hover:underline"
      >
        + Add Operation
      </button>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          Due date
          <input
            type="number"
            value={job.dueDate ?? ''}
            onChange={(e) => onSetDueDate(e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-20 rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-1">
          Weight
          <input
            type="number"
            value={job.weight ?? ''}
            onChange={(e) => onSetWeight(e.target.value === '' ? undefined : Number(e.target.value))}
            disabled={job.dueDate == null}
            className="w-16 rounded-md border border-slate-300 px-2 py-1 disabled:bg-slate-100"
          />
        </label>
      </div>

      {error?.message ? <p className="mt-2 text-xs text-red-600">{error.message}</p> : null}
    </div>
  )
}
```

- [ ] **Step 6: Implement `BuilderHeader.tsx`**

Create `frontend/src/builder/BuilderHeader.tsx`:

```tsx
type BuilderHeaderProps = {
  name: string
  onChangeName: (name: string) => void
  onBack: () => void
  onSave: () => void
  canSave: boolean
  isSaving: boolean
  justSaved?: boolean
}

export function BuilderHeader({
  name,
  onChangeName,
  onBack,
  onSave,
  canSave,
  isSaving,
  justSaved,
}: BuilderHeaderProps) {
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
        disabled
        title="Coming in a later phase"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-400"
      >
        Solve
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

- [ ] **Step 7: Write the failing tests for `BuilderForm`**

Create `frontend/src/builder/BuilderForm.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { BuilderForm, createEmptyDraft } from './BuilderForm'
import type { BuilderDraft } from './types'

function renderBuilderForm(overrides: Partial<Parameters<typeof BuilderForm>[0]> = {}) {
  const initialDraft = overrides.initialDraft ?? createEmptyDraft()
  const onSave = vi.fn()
  render(
    <MemoryRouter>
      <BuilderForm
        initialDraft={initialDraft}
        savedDraft={initialDraft}
        onBack={vi.fn()}
        onSave={onSave}
        isSaving={false}
        {...overrides}
      />
    </MemoryRouter>,
  )
  return { onSave }
}

function draftWithTwoMachines(): BuilderDraft {
  return {
    name: 'Demo',
    machines: [
      { id: 'm1', name: 'M1' },
      { id: 'm2', name: 'M2' },
    ],
    jobs: [{ id: 'j1', operations: [{ id: 'o1', machineId: 'm1', duration: 3 }] }],
    setupTimes: {},
    downtimeWindows: [],
  }
}

describe('BuilderForm', () => {
  it('renders the seeded empty draft with one machine and one job', () => {
    renderBuilderForm()
    expect(screen.getAllByLabelText('Machine name')).toHaveLength(1)
    expect(screen.getAllByLabelText('Duration')).toHaveLength(1)
  })

  it('adds a machine', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    await user.click(screen.getByText('+ Add Machine'))
    expect(screen.getAllByLabelText('Machine name')).toHaveLength(2)
  })

  it('disables removing a machine that is in use', () => {
    renderBuilderForm({ initialDraft: draftWithTwoMachines(), savedDraft: draftWithTwoMachines() })
    const removeButtons = screen.getAllByText('Remove').filter((el) => el.tagName === 'BUTTON')
    expect(removeButtons[0]).toBeDisabled() // M1, referenced by the only operation
  })

  it('disables removing the last operation in a job', () => {
    renderBuilderForm()
    const removeOperationButton = screen.getByLabelText('Duration').closest('div')!
    expect(within(removeOperationButton).getByText('Remove')).toBeDisabled()
  })

  it('disables removing the last job', () => {
    renderBuilderForm()
    expect(screen.getByText('Remove Job')).toBeDisabled()
  })

  it('adds and removes a job', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    await user.click(screen.getByText('+ Add Job'))
    expect(screen.getAllByText('Remove Job')).toHaveLength(2)
    await user.click(screen.getAllByText('Remove Job')[1])
    expect(screen.getAllByText('Remove Job')).toHaveLength(1)
  })

  it('disables Save when the draft is invalid, enables it once fixed', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    expect(screen.getByText('Save')).toBeDisabled() // machine name is empty by default

    await user.type(screen.getByLabelText('Machine name'), 'M1')
    expect(screen.getByText('Save')).not.toBeDisabled()
  })

  it('calls onSave with the current draft when Save is clicked', async () => {
    const user = userEvent.setup()
    const { onSave } = renderBuilderForm({
      initialDraft: draftWithTwoMachines(),
      savedDraft: draftWithTwoMachines(),
    })
    await user.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Demo' }))
  })

  it('enables the weight input only once a due date is set', async () => {
    const user = userEvent.setup()
    renderBuilderForm()
    expect(screen.getByLabelText('Weight')).toBeDisabled()
    await user.type(screen.getByLabelText('Due date'), '5')
    expect(screen.getByLabelText('Weight')).not.toBeDisabled()
  })

  it('renders problem-level errors passed in via saveErrors', () => {
    renderBuilderForm({
      saveErrors: {
        isValid: false,
        problemErrors: ['Something went wrong on the server.'],
        machineErrors: {},
        jobErrors: {},
      },
    })
    expect(screen.getByText('Something went wrong on the server.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/builder/BuilderForm.test.tsx
```

Expected: FAIL — `frontend/src/builder/BuilderForm.tsx` does not exist.

- [ ] **Step 9: Implement `BuilderForm.tsx`**

Create `frontend/src/builder/BuilderForm.tsx`:

```tsx
import { useMemo, useReducer } from 'react'
import { generateId } from './id'
import { builderReducer, newJob } from './reducer'
import { getMachineUsage, validateDraft, type ValidationResult } from './validate'
import { BuilderHeader } from './BuilderHeader'
import { MachineList } from './MachineList'
import { JobCard } from './JobCard'
import type { BuilderDraft } from './types'

export function createEmptyDraft(): BuilderDraft {
  const machineId = generateId()
  return {
    name: '',
    machines: [{ id: machineId, name: '' }],
    jobs: [newJob(machineId)],
    setupTimes: {},
    downtimeWindows: [],
  }
}

type BuilderFormProps = {
  initialDraft: BuilderDraft
  savedDraft: BuilderDraft
  onBack: () => void
  onSave: (draft: BuilderDraft) => void
  isSaving: boolean
  justSaved?: boolean
  saveErrors?: ValidationResult
}

export function BuilderForm({
  initialDraft,
  onBack,
  onSave,
  isSaving,
  justSaved,
  saveErrors,
}: BuilderFormProps) {
  const [draft, dispatch] = useReducer(builderReducer, initialDraft)
  const validation = useMemo(() => validateDraft(draft), [draft])
  const usage = useMemo(() => getMachineUsage(draft), [draft])
  const errors = saveErrors ?? validation

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <BuilderHeader
        name={draft.name}
        onChangeName={(name) => dispatch({ type: 'setName', name })}
        onBack={onBack}
        onSave={() => onSave(draft)}
        canSave={validation.isValid}
        isSaving={isSaving}
        justSaved={justSaved}
      />

      {errors.problemErrors.length > 0 ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errors.problemErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <MachineList
        machines={draft.machines}
        errors={errors.machineErrors}
        usage={usage}
        onAdd={() => dispatch({ type: 'addMachine' })}
        onRename={(machineId, name) => dispatch({ type: 'renameMachine', machineId, name })}
        onRemove={(machineId) => dispatch({ type: 'removeMachine', machineId })}
      />

      <section>
        <h2 className="text-lg font-medium text-slate-800">Jobs</h2>
        <div className="mt-2 space-y-4">
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
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'addJob' })}
          className="mt-2 text-sm font-medium text-accent hover:underline"
        >
          + Add Job
        </button>
      </section>
    </main>
  )
}
```

- [ ] **Step 10: Run it to verify it passes**

```bash
npx vitest run src/builder/BuilderForm.test.tsx
```

Expected: PASS (all cases).

- [ ] **Step 11: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 12: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/builder/MachineRow.tsx frontend/src/builder/MachineList.tsx frontend/src/builder/OperationRow.tsx frontend/src/builder/JobCard.tsx frontend/src/builder/BuilderHeader.tsx frontend/src/builder/BuilderForm.tsx frontend/src/builder/BuilderForm.test.tsx
git commit -m "$(cat <<'EOF'
feat: add BuilderForm and its machine/job/operation components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `BuilderPage` — data loading, save wiring, new-vs-edit routing

**Files:**
- Create: `frontend/src/builder/BuilderPage.tsx`
- Test: `frontend/src/builder/BuilderPage.test.tsx`

**Interfaces:**
- Consumes: `useProblem`, `useCreateProblem`, `useUpdateProblem` from `../api/queries.ts` (Task 7); `hydrate`, `serialize` from `transform.ts` (Task 3); `mapValidationErrors` from `mapValidationErrors.ts` (Task 6); `BuilderForm`, `createEmptyDraft` from `BuilderForm.tsx` (Task 8).
- Produces: `BuilderPage` (named export, no props) from `BuilderPage.tsx` — consumed by Task 10 (`AppRoutes.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/builder/BuilderPage.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuilderPage } from './BuilderPage'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/problems/new" element={<BuilderPage />} />
        <Route path="/problems/:id" element={<BuilderPage />} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BuilderPage', () => {
  it('starts with an empty draft on /problems/new', () => {
    renderAt('/problems/new')
    expect(screen.getByLabelText('Problem name')).toHaveValue('')
  })

  it('shows a loading state, then the hydrated draft, on /problems/:id', async () => {
    const problem = {
      id: 'abc',
      name: 'Loaded Problem',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(problem)))

    renderAt('/problems/abc')

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(await screen.findByLabelText('Problem name')).toHaveValue('Loaded Problem')
  })

  it('shows an error with retry when loading an existing problem fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'boom' }, 500)))

    renderAt('/problems/abc')

    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('POSTs a new problem and navigates to /problems/:id on save', async () => {
    const user = userEvent.setup()
    const created = {
      id: 'new-id',
      name: 'M1',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: '', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(created, 201)))

    renderAt('/problems/new')
    await user.type(screen.getByLabelText('Machine name'), 'M1')
    await user.selectOptions(screen.getByLabelText('Machine'), 'M1')
    await user.click(screen.getByText('Save'))

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0))
    const [request] = vi.mocked(fetch).mock.calls[0]
    expect((request as Request).method).toBe('POST')
  })

  it('PUTs an update in place on save for an existing problem', async () => {
    const user = userEvent.setup()
    const problem = {
      id: 'abc',
      name: 'Demo',
      created_at: '2026-01-01T00:00:00Z',
      machines: ['M1'],
      jobs: [{ operations: [{ machine_id: 'M1', duration: 1 }] }],
      constraints: {},
    }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(problem))))

    renderAt('/problems/abc')
    await screen.findByLabelText('Problem name')
    await user.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([req]) => (req as Request).method === 'PUT'),
      ).toBe(true),
    )
    expect(await screen.findByLabelText('Problem name')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
npx vitest run src/builder/BuilderPage.test.tsx
```

Expected: FAIL — `frontend/src/builder/BuilderPage.tsx` does not exist.

- [ ] **Step 3: Implement `BuilderPage.tsx`**

Create `frontend/src/builder/BuilderPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useCreateProblem, useProblem, useUpdateProblem } from '../api/queries'
import { BuilderForm, createEmptyDraft } from './BuilderForm'
import { hydrate, serialize } from './transform'
import { mapValidationErrors, type FastAPIValidationError } from './mapValidationErrors'
import type { ValidationResult } from './validate'
import type { BuilderDraft } from './types'

function isHTTPValidationError(error: unknown): error is { detail: FastAPIValidationError[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'detail' in error &&
    Array.isArray((error as { detail: unknown }).detail)
  )
}

function NewProblemBuilder() {
  const navigate = useNavigate()
  const createProblem = useCreateProblem()
  const [saveErrors, setSaveErrors] = useState<ValidationResult>()
  const [initialDraft] = useState(createEmptyDraft)

  return (
    <BuilderForm
      initialDraft={initialDraft}
      savedDraft={initialDraft}
      onBack={() => navigate('/')}
      isSaving={createProblem.isPending}
      saveErrors={saveErrors}
      onSave={(draft: BuilderDraft) => {
        setSaveErrors(undefined)
        createProblem.mutate(serialize(draft), {
          onSuccess: (created) => navigate(`/problems/${created.id}`, { replace: true }),
          onError: (error) => {
            setSaveErrors(
              isHTTPValidationError(error) ? mapValidationErrors(error.detail, draft) : undefined,
            )
          },
        })
      }}
    />
  )
}

function ExistingProblemBuilder({ id }: { id: string }) {
  const navigate = useNavigate()
  const problem = useProblem(id)
  const updateProblem = useUpdateProblem(id)
  const [saveErrors, setSaveErrors] = useState<ValidationResult>()
  const [savedDraft, setSavedDraft] = useState<BuilderDraft>()

  if (problem.isPending) {
    return <main className="mx-auto max-w-3xl p-8 text-slate-500">Loading…</main>
  }

  if (problem.isError) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-sm text-red-600">
        Couldn't load this problem.{' '}
        <button className="underline" onClick={() => problem.refetch()}>
          Retry
        </button>
      </main>
    )
  }

  const currentSavedDraft = savedDraft ?? hydrate(problem.data)

  return (
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
  )
}

export function BuilderPage() {
  const { id } = useParams()
  return id ? <ExistingProblemBuilder id={id} /> : <NewProblemBuilder />
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/builder/BuilderPage.test.tsx
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
git add frontend/src/builder/BuilderPage.tsx frontend/src/builder/BuilderPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: add BuilderPage with new/edit data loading and save wiring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Data router migration + unsaved-changes guard

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/AppRoutes.tsx`
- Modify: `frontend/src/AppRoutes.test.tsx`
- Delete: `frontend/src/routes/ComingSoonPage.tsx`
- Modify: `frontend/src/builder/BuilderForm.tsx`
- Modify: `frontend/src/builder/BuilderForm.test.tsx`

**Interfaces:**
- Produces: `routes: RouteObject[]` (named export, replacing the `AppRoutes` component) from `AppRoutes.tsx` — consumed by `App.tsx` and by `AppRoutes.test.tsx`.

- [ ] **Step 1: Change `AppRoutes.tsx` to a route-object list wired to `BuilderPage`**

Replace `frontend/src/AppRoutes.tsx` with:

```tsx
import type { RouteObject } from 'react-router'
import { GalleryPage } from './gallery/GalleryPage'
import { BuilderPage } from './builder/BuilderPage'

export const routes: RouteObject[] = [
  { path: '/', element: <GalleryPage /> },
  { path: '/problems/new', element: <BuilderPage /> },
  { path: '/problems/:id', element: <BuilderPage /> },
]
```

- [ ] **Step 2: Migrate `App.tsx` to a data router**

Replace `frontend/src/App.tsx` with:

```tsx
import { RouterProvider, createBrowserRouter } from 'react-router'
import { routes } from './AppRoutes'

const router = createBrowserRouter(routes)

function App() {
  return <RouterProvider router={router} />
}

export default App
```

- [ ] **Step 3: Delete the now-unused `ComingSoonPage`**

```bash
git rm frontend/src/routes/ComingSoonPage.tsx
```

- [ ] **Step 4: Update `AppRoutes.test.tsx` to render through a data router**

Replace `frontend/src/AppRoutes.test.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from './AppRoutes'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />, { wrapper })
}

describe('routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the Builder on the new-problem route', () => {
    renderAt('/problems/new')
    expect(screen.getByLabelText('Problem name')).toBeInTheDocument()
  })

  it('renders a loading state on an existing-problem route', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/problems/abc-123')
    expect(await screen.findByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the Gallery on the root route', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Makespan' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run it to verify it passes**

```bash
cd frontend
npx vitest run src/AppRoutes.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Add the unsaved-changes guard to `BuilderForm`**

In `frontend/src/builder/BuilderForm.tsx`, change the import line:

```tsx
import { useMemo, useReducer } from 'react'
```

to:

```tsx
import { useMemo, useReducer } from 'react'
import { useBlocker } from 'react-router'
```

Change the `BuilderFormProps` type's `savedDraft` field to actually be used (it was accepted but unused before this step), and inside the `BuilderForm` function body, right after `const [draft, dispatch] = useReducer(builderReducer, initialDraft)`, add:

```tsx
const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)
const blocker = useBlocker(isDirty)
```

(this requires adding `savedDraft` back to the destructured props — change the function signature from:

```tsx
export function BuilderForm({
  initialDraft,
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
}: BuilderFormProps) {
```

)

Then, right before the closing `</main>` tag, add the confirm prompt:

```tsx
      {blocker.state === 'blocked' ? (
        <div
          role="alertdialog"
          aria-label="Unsaved changes"
          className="fixed inset-0 flex items-center justify-center bg-black/30"
        >
          <div className="rounded-md bg-white p-4 shadow-lg">
            <p className="text-sm text-slate-700">You have unsaved changes. Leave anyway?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => blocker.reset()} className="text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => blocker.proceed()} className="text-sm text-red-600">
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
```

- [ ] **Step 7: Update `BuilderForm.test.tsx` to render through a data router, and add the blocker test**

In `frontend/src/builder/BuilderForm.test.tsx`, change the imports from:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
```

to:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
```

Replace the `renderBuilderForm` helper with:

```tsx
function renderBuilderForm(overrides: Partial<Parameters<typeof BuilderForm>[0]> = {}) {
  const initialDraft = overrides.initialDraft ?? createEmptyDraft()
  const onSave = vi.fn()
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <BuilderForm
          initialDraft={initialDraft}
          savedDraft={initialDraft}
          onBack={vi.fn()}
          onSave={onSave}
          isSaving={false}
          {...overrides}
        />
      ),
    },
    { path: '/other', element: <p>Elsewhere</p> },
  ])
  render(<RouterProvider router={router} />)
  return { onSave, router }
}
```

Then add this test to the `describe('BuilderForm', ...)` block:

```tsx
  it('blocks navigation with a confirm prompt when there are unsaved changes', async () => {
    const user = userEvent.setup()
    const { router } = renderBuilderForm()

    await user.type(screen.getByLabelText('Machine name'), 'M1')
    router.navigate('/other')

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByText('Leave'))
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument()
  })

  it('does not block navigation when there are no unsaved changes', async () => {
    const { router } = renderBuilderForm()
    router.navigate('/other')
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument()
  })
```

- [ ] **Step 8: Run the Builder tests to verify they pass**

```bash
npx vitest run src/builder/BuilderForm.test.tsx src/builder/BuilderPage.test.tsx src/AppRoutes.test.tsx
```

Expected: PASS (all cases). `BuilderPage.test.tsx` renders `BuilderPage` through a plain `<Routes>`/`MemoryRouter>` (declarative mode) in its own test helper — since `useBlocker` now lives inside `BuilderForm`, which `BuilderPage` renders, update `BuilderPage.test.tsx`'s `renderAt` helper the same way, from `<MemoryRouter><Routes>...</Routes></MemoryRouter>` to a `createMemoryRouter`/`RouterProvider` pair:

```tsx
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/problems/new', element: <BuilderPage /> },
      { path: '/problems/:id', element: <BuilderPage /> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />, { wrapper })
}
```

replacing the `MemoryRouter`/`Routes`/`Route` import with `createMemoryRouter, RouterProvider` from `react-router`, and rerun:

```bash
npx vitest run src/builder/BuilderPage.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Run the full frontend check suite**

```bash
npm run lint
npm test
npm run build
```

Expected: all succeed.

- [ ] **Step 10: Manually verify the dev proxy still works with the data router**

In one terminal: `uv run uvicorn makespan.main:app --reload`
In another: `cd frontend && npm run dev`
Open the printed URL, navigate to a problem, confirm the page renders (data-router migration didn't break routing), then stop both servers.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.tsx frontend/src/AppRoutes.tsx frontend/src/AppRoutes.test.tsx frontend/src/builder/BuilderForm.tsx frontend/src/builder/BuilderForm.test.tsx frontend/src/builder/BuilderPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: migrate to a data router and add the unsaved-changes guard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: End-to-end manual smoke check

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend and frontend suites**

```bash
uv run pytest
cd frontend
npm run lint
npm test
npm run build
npm run check-types-fresh
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

Open the printed URL (typically `http://localhost:5173`) and confirm:

- From the Gallery, clicking "New Problem" opens the Builder with one empty machine and one job/operation.
- Typing a machine name, adding a second machine, adding a second job, adding a second operation to a job, and reordering operations all work.
- Save is disabled until the draft is valid (e.g. while a machine name is empty), then enabled.
- Saving a new problem creates it and navigates to `/problems/<id>`.
- From the Gallery, opening an existing saved problem loads its data into the Builder, and Save persists changes in place (no navigation), showing "Saved".
- From the Gallery, opening a preset loads and saves the same way.
- Trying to remove a machine referenced by an operation is blocked (button disabled).
- Editing a field, then clicking "Back to Gallery" (or the browser back button), shows the unsaved-changes confirm prompt; "Cancel" stays on the page, "Leave" navigates away.
- With no edits made, navigating away does not show the prompt.

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
fix: address issues found in Builder end-to-end smoke check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
