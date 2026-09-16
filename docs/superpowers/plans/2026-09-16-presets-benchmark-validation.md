# Presets & Benchmark Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the CP-SAT solver against two published-optimal JSSP benchmark instances (ft06, la01), and turn `GET /api/presets` from a static in-memory dict into real seeded `Problem` database rows — the shape the design spec actually calls for.

**Context:** The original backend plan (`docs/superpowers/plans/2026-09-09-job-shop-scheduler-backend.md`) shipped `GET /api/presets` as a hardcoded `dict[str, ProblemSpec]` of two small toy instances, and no solver test validates against a benchmark instance with an independently published optimum — every existing solver test asserts a makespan computed by hand in a code comment. A final whole-branch review flagged this as a plan/spec divergence (the spec's Data Model section says presets must be "seeded `Problem` rows, not a separate mechanism," and its Testing section calls for "known benchmark instances (e.g. ft06, la01, which have published optimal makespans)"), and it was deliberately deferred rather than fixed at the time. This plan closes that gap before the frontend milestone needs real preset IDs to link to.

**Architecture:** Add two solver-level tests that solve the ft06 and la01 OR-Library instances and assert the solver reaches their published-optimal makespans (55 and 666 respectively — confirmed by running the solver against both instances during planning: it reaches them in ~20ms each). Add a `src/makespan/db/seed.py` module holding a small catalog of preset `ProblemSpec`s (the two existing toy demos plus ft06 and la01) and an idempotent `seed_presets(session)` function. Wire that into the app's startup lifespan and rewrite `GET /api/presets` to query the seeded rows from the database, returning them in the same shape as `GET /api/problems/{id}` — so a preset is a completely ordinary `Problem` row with a stable, well-known `id`.

**Tech Stack:** Python >=3.14, pytest, SQLModel (SQLite), FastAPI (unchanged from the existing stack).

**Spec:** `docs/superpowers/specs/2026-09-09-job-shop-scheduler-design.md`

## Global Constraints

- The solver module (`src/makespan/solver/`) must have zero FastAPI or DB imports — unaffected by this plan (no changes to `solver/`), but the new `tests/solver/test_benchmarks.py` must only import from `makespan.solver.*`.
- Presets (ft06, la01, etc.) are seeded `Problem` rows, not a separate mechanism (spec, Data Model section).
- `GET /api/presets` returns seeded benchmark instances "same shape as `Problem`" (spec, API Design section) — i.e. the same JSON shape `GET /api/problems/{id}` returns (`id`, `name`, `created_at`, `machines`, `jobs`, `constraints`), not the old `dict[str, ProblemSpec]` keyed by slug.
- No `DELETE` endpoints, no auth — unaffected by this plan.

---

## File Structure

```
src/makespan/
├── main.py                     # MODIFY: seed presets in the startup lifespan
├── db/
│   └── seed.py                 # NEW: preset catalog (ProblemSpecs) + idempotent seed_presets(session)
└── api/
    ├── problems.py             # MODIFY: rename _to_out -> record_to_problem_out (made public, reused by presets.py)
    └── presets.py              # REWRITE: query seeded Problem rows from the DB instead of a static dict
tests/
├── solver/
│   └── test_benchmarks.py      # NEW: ft06 + la01 solved to their published-optimal makespan
├── db/
│   └── test_seed.py            # NEW: seed_presets creates the expected rows and is idempotent
├── api/
│   └── test_presets.py         # REWRITE: presets are real, fetchable Problem rows
└── conftest.py                 # MODIFY: client fixture seeds presets into the test engine
```

---

### Task 1: Benchmark solver tests (ft06, la01)

**Files:**
- Create: `tests/solver/test_benchmarks.py`

**Interfaces:**
- Consumes: `makespan.solver.models.{Job, Operation, ProblemSpec}`, `makespan.solver.solve.solve` (all exist today, unchanged).

No production code changes in this task — it only adds tests against the existing `solve()` function.

- [ ] **Step 1: Write the two benchmark tests**

Create `tests/solver/test_benchmarks.py`:

```python
from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def _ft06() -> ProblemSpec:
    # Fisher & Thompson 6x6 (OR-Library instance "ft06"): 6 jobs, 6 machines.
    # Published optimal makespan is 55. Each row is one job's operations in
    # required sequence order, as (machine_index, duration) pairs.
    rows = [
        [(2, 1), (0, 3), (1, 6), (3, 7), (5, 3), (4, 6)],
        [(1, 8), (2, 5), (4, 10), (5, 10), (0, 10), (3, 4)],
        [(2, 5), (3, 4), (5, 8), (0, 9), (1, 1), (4, 7)],
        [(1, 5), (0, 5), (2, 5), (3, 3), (4, 8), (5, 9)],
        [(2, 9), (1, 3), (4, 5), (5, 4), (0, 3), (3, 1)],
        [(1, 3), (3, 3), (5, 9), (0, 10), (4, 4), (2, 1)],
    ]
    return ProblemSpec(
        machines=[f"M{i}" for i in range(6)],
        jobs=[
            Job(operations=[Operation(machine_id=f"M{m}", duration=d) for m, d in row])
            for row in rows
        ],
    )


def _la01() -> ProblemSpec:
    # Lawrence 10x5 (OR-Library instance "la01"): 10 jobs, 5 machines.
    # Published optimal makespan is 666.
    rows = [
        [(1, 21), (0, 53), (4, 95), (3, 55), (2, 34)],
        [(0, 21), (3, 52), (4, 16), (2, 26), (1, 71)],
        [(3, 39), (4, 98), (1, 42), (2, 31), (0, 12)],
        [(1, 77), (0, 55), (4, 79), (2, 66), (3, 77)],
        [(0, 83), (3, 34), (2, 64), (1, 19), (4, 37)],
        [(1, 54), (2, 43), (4, 79), (0, 92), (3, 62)],
        [(3, 69), (4, 77), (1, 87), (2, 87), (0, 93)],
        [(2, 38), (0, 60), (1, 41), (3, 24), (4, 83)],
        [(3, 17), (1, 49), (4, 25), (0, 44), (2, 98)],
        [(4, 77), (3, 79), (2, 43), (1, 75), (0, 96)],
    ]
    return ProblemSpec(
        machines=[f"M{i}" for i in range(5)],
        jobs=[
            Job(operations=[Operation(machine_id=f"M{m}", duration=d) for m, d in row])
            for row in rows
        ],
    )


def test_solve_ft06_reaches_published_optimal_makespan():
    outcome = solve(_ft06(), time_limit_seconds=30)

    assert outcome.status == "optimal"
    assert outcome.objective == 55


def test_solve_la01_reaches_published_optimal_makespan():
    outcome = solve(_la01(), time_limit_seconds=30)

    assert outcome.status == "optimal"
    assert outcome.objective == 666
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `uv run pytest tests/solver/test_benchmarks.py -v`
Expected: both tests PASS. (Verified during planning: the current solver reaches
`objective=55` for ft06 and `objective=666` for la01 in about 20ms each, well
inside the 30s time limit — these are not expected to be flaky or slow.)

- [ ] **Step 3: Commit**

```bash
git add tests/solver/test_benchmarks.py
git commit -m "test: validate solver against ft06 and la01 published-optimal makespans"
```

---

### Task 2: Preset seeding module

**Files:**
- Create: `src/makespan/db/seed.py`
- Test: `tests/db/test_seed.py`

**Interfaces:**
- Consumes: `makespan.db.models.ProblemRecord`, `makespan.solver.models.{Job, Operation, ProblemSpec}` (all exist today).
- Produces: `makespan.db.seed.PRESET_IDS` (`list[str]`, the four stable preset row IDs) and `makespan.db.seed.seed_presets(session: Session) -> None` — both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `tests/db/test_seed.py`:

```python
from sqlmodel import Session, SQLModel, create_engine, select

from makespan.db.models import ProblemRecord
from makespan.db.seed import PRESET_IDS, seed_presets


def test_seed_presets_creates_expected_rows(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_presets(session)

    with Session(engine) as session:
        records = session.exec(select(ProblemRecord)).all()
        assert {r.id for r in records} == set(PRESET_IDS)

    ft06 = next(r for r in records if r.id == "preset-ft06")
    assert len(ft06.machines) == 6
    assert len(ft06.jobs) == 6


def test_seed_presets_is_idempotent(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_presets(session)
        seed_presets(session)

    with Session(engine) as session:
        records = session.exec(select(ProblemRecord)).all()
        assert len(records) == len(PRESET_IDS)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/db/test_seed.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.db.seed'`

- [ ] **Step 3: Implement the seed module**

Create `src/makespan/db/seed.py`:

```python
from sqlmodel import Session

from makespan.db.models import ProblemRecord
from makespan.solver.models import Job, Operation, ProblemSpec

PRESET_TWO_MACHINE_DEMO_ID = "preset-two-machine-demo"
PRESET_THREE_MACHINE_DEMO_ID = "preset-three-machine-demo"
PRESET_FT06_ID = "preset-ft06"
PRESET_LA01_ID = "preset-la01"

PRESET_IDS: list[str] = [
    PRESET_TWO_MACHINE_DEMO_ID,
    PRESET_THREE_MACHINE_DEMO_ID,
    PRESET_FT06_ID,
    PRESET_LA01_ID,
]


def _two_machine_demo() -> ProblemSpec:
    return ProblemSpec(
        machines=["M1", "M2"],
        jobs=[
            Job(
                operations=[
                    Operation(machine_id="M1", duration=3),
                    Operation(machine_id="M2", duration=2),
                ]
            ),
            Job(
                operations=[
                    Operation(machine_id="M2", duration=4),
                    Operation(machine_id="M1", duration=1),
                ]
            ),
        ],
    )


def _three_machine_demo() -> ProblemSpec:
    return ProblemSpec(
        machines=["M1", "M2", "M3"],
        jobs=[
            Job(
                operations=[
                    Operation(machine_id="M1", duration=4),
                    Operation(machine_id="M2", duration=3),
                    Operation(machine_id="M3", duration=2),
                ]
            ),
            Job(
                operations=[
                    Operation(machine_id="M2", duration=5),
                    Operation(machine_id="M1", duration=2),
                    Operation(machine_id="M3", duration=3),
                ]
            ),
            Job(
                operations=[
                    Operation(machine_id="M3", duration=3),
                    Operation(machine_id="M2", duration=4),
                    Operation(machine_id="M1", duration=1),
                ]
            ),
        ],
    )


def _ft06() -> ProblemSpec:
    # Fisher & Thompson 6x6 (OR-Library instance "ft06"). Published optimal
    # makespan is 55 -- see tests/solver/test_benchmarks.py.
    rows = [
        [(2, 1), (0, 3), (1, 6), (3, 7), (5, 3), (4, 6)],
        [(1, 8), (2, 5), (4, 10), (5, 10), (0, 10), (3, 4)],
        [(2, 5), (3, 4), (5, 8), (0, 9), (1, 1), (4, 7)],
        [(1, 5), (0, 5), (2, 5), (3, 3), (4, 8), (5, 9)],
        [(2, 9), (1, 3), (4, 5), (5, 4), (0, 3), (3, 1)],
        [(1, 3), (3, 3), (5, 9), (0, 10), (4, 4), (2, 1)],
    ]
    return ProblemSpec(
        machines=[f"M{i}" for i in range(6)],
        jobs=[
            Job(operations=[Operation(machine_id=f"M{m}", duration=d) for m, d in row])
            for row in rows
        ],
    )


def _la01() -> ProblemSpec:
    # Lawrence 10x5 (OR-Library instance "la01"). Published optimal makespan
    # is 666 -- see tests/solver/test_benchmarks.py.
    rows = [
        [(1, 21), (0, 53), (4, 95), (3, 55), (2, 34)],
        [(0, 21), (3, 52), (4, 16), (2, 26), (1, 71)],
        [(3, 39), (4, 98), (1, 42), (2, 31), (0, 12)],
        [(1, 77), (0, 55), (4, 79), (2, 66), (3, 77)],
        [(0, 83), (3, 34), (2, 64), (1, 19), (4, 37)],
        [(1, 54), (2, 43), (4, 79), (0, 92), (3, 62)],
        [(3, 69), (4, 77), (1, 87), (2, 87), (0, 93)],
        [(2, 38), (0, 60), (1, 41), (3, 24), (4, 83)],
        [(3, 17), (1, 49), (4, 25), (0, 44), (2, 98)],
        [(4, 77), (3, 79), (2, 43), (1, 75), (0, 96)],
    ]
    return ProblemSpec(
        machines=[f"M{i}" for i in range(5)],
        jobs=[
            Job(operations=[Operation(machine_id=f"M{m}", duration=d) for m, d in row])
            for row in rows
        ],
    )


PRESET_CATALOG: list[tuple[str, str, ProblemSpec]] = [
    (PRESET_TWO_MACHINE_DEMO_ID, "Two-machine demo", _two_machine_demo()),
    (PRESET_THREE_MACHINE_DEMO_ID, "Three-machine demo", _three_machine_demo()),
    (PRESET_FT06_ID, "FT06 (6x6 benchmark, optimal makespan 55)", _ft06()),
    (PRESET_LA01_ID, "LA01 (10x5 benchmark, optimal makespan 666)", _la01()),
]


def seed_presets(session: Session) -> None:
    """Insert any preset Problem rows that don't already exist.

    Presets use fixed, well-known ids (see PRESET_IDS) rather than the
    random uuid4 ids regular Problem rows get, so this can run on every app
    startup without creating duplicates.
    """
    for preset_id, name, spec in PRESET_CATALOG:
        if session.get(ProblemRecord, preset_id) is not None:
            continue
        session.add(
            ProblemRecord(
                id=preset_id,
                name=name,
                machines=spec.machines,
                jobs=[job.model_dump() for job in spec.jobs],
                constraints=spec.constraints.model_dump(),
            )
        )
    session.commit()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/db/test_seed.py -v`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/makespan/db/seed.py tests/db/test_seed.py
git commit -m "feat: add idempotent preset-seeding module"
```

---

### Task 3: Wire presets to the database

**Files:**
- Modify: `src/makespan/api/problems.py` (rename `_to_out` to `record_to_problem_out`, made public)
- Modify: `src/makespan/api/presets.py` (rewrite)
- Modify: `src/makespan/main.py`
- Modify: `tests/conftest.py`
- Modify: `tests/api/test_presets.py` (rewrite)

**Interfaces:**
- Consumes: `makespan.db.seed.{PRESET_IDS, seed_presets}` (Task 2), `makespan.db.session.{engine, get_session}` (existing).
- Produces: `makespan.api.problems.record_to_problem_out(record: ProblemRecord) -> ProblemOut` — a public rename of the existing `_to_out`, now importable by `presets.py`.

**Why this task bundles several files:** `GET /api/presets` cannot be correctly rewritten without also seeding the database it queries, and the test suite's `client` fixture builds its own isolated SQLite engine per test (see `tests/conftest.py`) that the app's `lifespan` startup hook does **not** write to (the hook seeds the module-level production `engine`; the fixture overrides the `get_session` *dependency*, which doesn't affect code that imports the engine directly, like `lifespan` does). So the fixture must call `seed_presets` itself against its own test engine — mirroring how it already calls `SQLModel.metadata.create_all(test_engine)` directly instead of relying on `init_db()`. Splitting this into smaller tasks would leave the test suite broken partway through.

- [ ] **Step 1: Rename `_to_out` to `record_to_problem_out` in `problems.py`**

In `src/makespan/api/problems.py`, rename the function and its three call sites:

```python
def record_to_problem_out(record: ProblemRecord) -> ProblemOut:
    return ProblemOut(
        id=record.id,
        name=record.name,
        created_at=record.created_at,
        machines=record.machines,
        jobs=record.jobs,
        constraints=record.constraints,
    )
```

Update `create_problem`, `get_problem`, and `update_problem` to call `record_to_problem_out(record)` instead of `_to_out(record)` (same call sites, just the new name).

- [ ] **Step 2: Run the existing problems tests to verify the rename didn't break anything**

Run: `uv run pytest tests/api/test_problems.py -v`
Expected: all PASS (pure rename, no behavior change).

- [ ] **Step 3: Seed presets in the app's startup lifespan**

In `src/makespan/main.py`, add the seeding call:

```python
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from sqlmodel import Session

from makespan.api.presets import router as presets_router
from makespan.api.problems import router as problems_router
from makespan.api.solves import router as solves_router
from makespan.db.seed import seed_presets
from makespan.db.session import engine, init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    with Session(engine) as session:
        seed_presets(session)
    yield


app = FastAPI(title="Makespan", lifespan=lifespan)

app.include_router(presets_router)
app.include_router(problems_router)
app.include_router(solves_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Seed the test engine in the `client` fixture**

In `tests/conftest.py`, seed presets right after creating the test schema:

```python
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from makespan.db.seed import seed_presets
from makespan.db.session import get_session
from makespan.main import app


@pytest.fixture()
def client(tmp_path):
    test_engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        seed_presets(session)

    def override_get_session():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

- [ ] **Step 5: Write the new presets tests (will fail against the old dict-based endpoint)**

Replace the contents of `tests/api/test_presets.py`:

```python
def test_list_presets_returns_seeded_problem_rows(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    presets = response.json()

    names = {p["name"] for p in presets}
    assert "FT06 (6x6 benchmark, optimal makespan 55)" in names
    assert "LA01 (10x5 benchmark, optimal makespan 666)" in names

    ft06 = next(p for p in presets if p["name"].startswith("FT06"))
    assert len(ft06["machines"]) == 6
    assert len(ft06["jobs"]) == 6
    assert "id" in ft06
    assert "created_at" in ft06


def test_preset_is_fetchable_as_a_regular_problem(client):
    presets = client.get("/api/presets").json()
    ft06 = next(p for p in presets if p["name"].startswith("FT06"))

    response = client.get(f"/api/problems/{ft06['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == ft06["id"]
    assert body["machines"] == ft06["machines"]
    assert body["jobs"] == ft06["jobs"]
```

- [ ] **Step 6: Run the presets tests to verify they fail**

Run: `uv run pytest tests/api/test_presets.py -v`
Expected: FAIL — `GET /api/presets` still returns the old `dict[str, ProblemSpec]` shape (a dict, not a list), so `presets = response.json()` won't support the list comprehension/`next()` calls the new tests use.

- [ ] **Step 7: Rewrite the presets endpoint**

Replace the contents of `src/makespan/api/presets.py`:

```python
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from makespan.api.problems import record_to_problem_out
from makespan.api.schemas import ProblemOut
from makespan.db.models import ProblemRecord
from makespan.db.seed import PRESET_IDS
from makespan.db.session import get_session

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("", response_model=list[ProblemOut])
def list_presets(session: Session = Depends(get_session)) -> list[ProblemOut]:
    records = session.exec(select(ProblemRecord).where(ProblemRecord.id.in_(PRESET_IDS))).all()
    return [record_to_problem_out(record) for record in records]
```

- [ ] **Step 8: Run the full test suite to verify everything passes**

Run: `uv run pytest -q`
Expected: all tests PASS, including the two new/rewritten presets tests, the
two new benchmark tests from Task 1, and the two new seed tests from Task 2
(`33 + 2 + 2 = 37` tests, up from the current 33 — exact count isn't load-bearing,
just confirm nothing regressed).

- [ ] **Step 9: Run lint and format checks**

Run: `uv run ruff check .`
Expected: `All checks passed!`

Run: `uv run ruff format --check .`
Expected: no files need reformatting (run `uv run ruff format .` first if it reports any).

- [ ] **Step 10: Commit**

```bash
git add src/makespan/api/problems.py src/makespan/api/presets.py src/makespan/main.py \
        tests/conftest.py tests/api/test_presets.py
git commit -m "feat: serve presets as real seeded Problem rows instead of a static dict"
```

---

## Verification Checklist (for whoever reviews this plan's execution)

- `GET /api/presets` returns a JSON **list** (not a dict keyed by slug), and each entry has `id`, `name`, `created_at`, `machines`, `jobs`, `constraints` — the same shape `GET /api/problems/{id}` returns.
- Each preset's `id` also resolves via `GET /api/problems/{id}` (proving it's an ordinary `Problem` row, not a separate mechanism).
- `tests/solver/test_benchmarks.py` asserts `objective == 55` for ft06 and `objective == 666` for la01, both with `status == "optimal"`.
- Restarting the app (or re-running the test suite, which re-triggers the lifespan on every `client` fixture use) never raises a primary-key conflict from re-seeding — `seed_presets` must stay idempotent.
- `src/makespan/solver/` still has zero FastAPI/DB imports (unchanged by this plan).
