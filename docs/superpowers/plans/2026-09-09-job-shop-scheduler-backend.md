# Job Shop Scheduler Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, fully-tested FastAPI backend that models job shop scheduling problems, solves them with OR-Tools CP-SAT (including setup times, due-date tardiness, and machine downtime), and persists problems/solves to SQLite — usable end-to-end via `curl`/`pytest` with no frontend.

**Architecture:** A pure solver module (`solver/`) with no framework dependencies, wrapping OR-Tools CP-SAT; a persistence layer (`db/`) using SQLModel over SQLite with JSON columns for the nested problem/schedule documents; a FastAPI layer (`api/`) exposing REST endpoints that read/write the DB and run solves as background tasks, with progress reported through an in-memory store that the solver's solution callback writes into.

**Tech Stack:** Python >=3.14, OR-Tools CP-SAT, FastAPI, SQLModel (SQLite), pytest, httpx (for `TestClient`).

**Spec:** `docs/superpowers/specs/2026-09-09-job-shop-scheduler-design.md`

## Global Constraints

- `time_limit_seconds` on a solve request: validated `1 <= value <= 60`, default `30`.
- Objective mode (`makespan` vs weighted makespan+tardiness) is derived automatically from whether the problem has due dates — never a client-chosen parameter.
- No auth in this plan; all problems/solves are publicly readable/writable by ID.
- No `DELETE` endpoints in this plan.
- Persistence: SQLite via SQLModel; `Problem.jobs`/`Problem.constraints` and `Solve.schedule` are JSON columns (see spec's Data Model section) — whole-document read/write, no per-field endpoints.
- The solver module (`src/makespan/solver/`) must have zero FastAPI or DB imports, so it stays independently unit-testable.

---

## File Structure

```
src/makespan/
├── main.py                    # FastAPI app: health check, startup DB init, router registration
├── solver/
│   ├── models.py               # ProblemSpec, Job, Operation, Constraints, DueDate, DowntimeWindow,
│   │                            # ScheduledOperation, Schedule, SolveOutcome (pure Pydantic)
│   ├── progress.py             # ProgressSample, ProgressCallback (CpSolverSolutionCallback)
│   ├── progress_store.py       # thread-safe in-memory store keyed by solve_id
│   └── solve.py                # solve(problem, time_limit_seconds, on_progress=None) -> SolveOutcome
├── db/
│   ├── models.py                # ProblemRecord, SolveRecord (SQLModel table models)
│   └── session.py                # engine, get_session(), init_db()
└── api/
    ├── schemas.py                # ProblemIn/Out/Summary, SolveCreate/Status/Summary
    ├── problems.py               # /api/problems routes + /api/problems/{id}/solves
    ├── presets.py                 # seeded demo problems + /api/presets route
    └── solves.py                  # /api/solves routes + background solve execution
tests/
├── conftest.py                   # `client` fixture: isolated SQLite file + dependency override
├── solver/
│   ├── test_models.py
│   ├── test_solve_basic.py
│   ├── test_progress.py
│   ├── test_setup_time.py
│   ├── test_due_dates.py
│   └── test_downtime.py
├── db/
│   └── test_models.py
└── api/
    ├── test_health.py
    ├── test_problems.py
    ├── test_presets.py
    └── test_solves.py
```

---

### Task 1: Bootstrap FastAPI app with a health check

**Files:**
- Modify: `pyproject.toml`
- Create: `src/makespan/main.py`
- Test: `tests/api/test_health.py`

**Interfaces:**
- Produces: `makespan.main.app` (a `fastapi.FastAPI` instance) — every later task registers routers on this.

- [ ] **Step 1: Add FastAPI/uvicorn/pytest/httpx dependencies**

Edit `pyproject.toml` so `dependencies` reads:

```toml
dependencies = [
    "ortools>=9.15.6755",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
]
```

and `[dependency-groups]` reads:

```toml
[dependency-groups]
dev = [
    "ruff>=0.16.6",
    "pytest>=8.3.0",
    "httpx>=0.27.0",
]
```

- [ ] **Step 2: Install dependencies**

Run: `uv sync`

- [ ] **Step 3: Write the failing test**

```python
# tests/api/test_health.py
from fastapi.testclient import TestClient

from makespan.main import app


def test_health_check_returns_ok():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `uv run pytest tests/api/test_health.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.main'`

- [ ] **Step 5: Implement the app**

```python
# src/makespan/main.py
from fastapi import FastAPI

app = FastAPI(title="Makespan")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/api/test_health.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock src/makespan/main.py tests/api/test_health.py
git commit -m "feat: bootstrap FastAPI app with health check"
```

---

### Task 2: Solver domain models

**Files:**
- Create: `src/makespan/solver/__init__.py` (empty)
- Create: `src/makespan/solver/models.py`
- Test: `tests/solver/test_models.py`

**Interfaces:**
- Produces: `Operation(machine_id: str, duration: int)`, `Job(operations: list[Operation])`,
  `DueDate(job_index: int, due: int, weight: int = 1)`,
  `DowntimeWindow(machine_id: str, start: int, end: int)`,
  `Constraints(setup_times: dict[str, int], due_dates: list[DueDate], downtime_windows: list[DowntimeWindow])`,
  `ProblemSpec(machines: list[str], jobs: list[Job], constraints: Constraints)` — raises
  `pydantic.ValidationError` if any operation/constraint references an unknown machine or job index.
  `ScheduledOperation(job_index, operation_index, machine_id, start, end)`, `Schedule(operations: list[ScheduledOperation])`,
  `SolveOutcome(status, objective, best_bound, schedule, message)` with
  `status: Literal["optimal", "feasible", "infeasible", "failed"]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/solver/test_models.py
import pytest
from pydantic import ValidationError

from makespan.solver.models import Job, Operation, ProblemSpec


def test_valid_problem_parses():
    problem = ProblemSpec(
        machines=["M1", "M2"],
        jobs=[
            Job(operations=[Operation(machine_id="M1", duration=3), Operation(machine_id="M2", duration=2)]),
            Job(operations=[Operation(machine_id="M2", duration=4), Operation(machine_id="M1", duration=1)]),
        ],
    )
    assert len(problem.jobs) == 2
    assert problem.constraints.setup_times == {}


def test_unknown_machine_reference_raises():
    with pytest.raises(ValidationError):
        ProblemSpec(
            machines=["M1"],
            jobs=[Job(operations=[Operation(machine_id="M2", duration=3)])],
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/solver/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.solver'`

- [ ] **Step 3: Implement the models**

```python
# src/makespan/solver/models.py
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class Operation(BaseModel):
    machine_id: str
    duration: int = Field(gt=0)


class Job(BaseModel):
    operations: list[Operation]


class DueDate(BaseModel):
    job_index: int = Field(ge=0)
    due: int = Field(ge=0)
    weight: int = Field(default=1, ge=1)


class DowntimeWindow(BaseModel):
    machine_id: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class Constraints(BaseModel):
    setup_times: dict[str, int] = Field(default_factory=dict)
    due_dates: list[DueDate] = Field(default_factory=list)
    downtime_windows: list[DowntimeWindow] = Field(default_factory=list)


class ProblemSpec(BaseModel):
    machines: list[str]
    jobs: list[Job]
    constraints: Constraints = Field(default_factory=Constraints)

    @model_validator(mode="after")
    def check_references(self) -> "ProblemSpec":
        machine_set = set(self.machines)
        for job_index, job in enumerate(self.jobs):
            for operation in job.operations:
                if operation.machine_id not in machine_set:
                    raise ValueError(
                        f"job {job_index} references unknown machine '{operation.machine_id}'"
                    )
        for machine_id in self.constraints.setup_times:
            if machine_id not in machine_set:
                raise ValueError(f"setup_times references unknown machine '{machine_id}'")
        for downtime in self.constraints.downtime_windows:
            if downtime.machine_id not in machine_set:
                raise ValueError(f"downtime window references unknown machine '{downtime.machine_id}'")
        for due_date in self.constraints.due_dates:
            if due_date.job_index >= len(self.jobs):
                raise ValueError(f"due date references unknown job index {due_date.job_index}")
        return self


class ScheduledOperation(BaseModel):
    job_index: int
    operation_index: int
    machine_id: str
    start: int
    end: int


class Schedule(BaseModel):
    operations: list[ScheduledOperation]


class SolveOutcome(BaseModel):
    status: Literal["optimal", "feasible", "infeasible", "failed"]
    objective: Optional[int] = None
    best_bound: Optional[int] = None
    schedule: Optional[Schedule] = None
    message: Optional[str] = None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/solver/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/makespan/solver/__init__.py src/makespan/solver/models.py tests/solver/test_models.py
git commit -m "feat: add solver domain models with machine-reference validation"
```

---

### Task 3: Core CP-SAT solve for classic JSSP

**Files:**
- Create: `src/makespan/solver/solve.py`
- Test: `tests/solver/test_solve_basic.py`

**Interfaces:**
- Consumes: `ProblemSpec`, `Schedule`, `ScheduledOperation`, `SolveOutcome` from `makespan.solver.models`.
- Produces: `solve(problem: ProblemSpec, time_limit_seconds: int = 30) -> SolveOutcome`.

- [ ] **Step 1: Write the failing test**

```python
# tests/solver/test_solve_basic.py
from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def _two_job_problem() -> ProblemSpec:
    # Job A: M1(3) -> M2(2). Job B: M2(4) -> M1(1).
    # M2's total load (2+4=6) lower-bounds the makespan at 6; a schedule achieving 6 exists,
    # so 6 is the known-optimal makespan for this instance.
    return ProblemSpec(
        machines=["M1", "M2"],
        jobs=[
            Job(operations=[Operation(machine_id="M1", duration=3), Operation(machine_id="M2", duration=2)]),
            Job(operations=[Operation(machine_id="M2", duration=4), Operation(machine_id="M1", duration=1)]),
        ],
    )


def test_solve_finds_known_optimal_makespan():
    outcome = solve(_two_job_problem(), time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 6

    by_machine: dict[str, list[tuple[int, int]]] = {"M1": [], "M2": []}
    for op in outcome.schedule.operations:
        by_machine[op.machine_id].append((op.start, op.end))
    for intervals in by_machine.values():
        intervals.sort()
        for (_, end_a), (start_b, _) in zip(intervals, intervals[1:]):
            assert end_a <= start_b

    by_job: dict[int, list] = {0: [], 1: []}
    for op in outcome.schedule.operations:
        by_job[op.job_index].append(op)
    for ops in by_job.values():
        ops.sort(key=lambda o: o.operation_index)
        for earlier, later in zip(ops, ops[1:]):
            assert earlier.end <= later.start
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/solver/test_solve_basic.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.solver.solve'`

- [ ] **Step 3: Implement the solver**

```python
# src/makespan/solver/solve.py
from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome


def solve(problem: ProblemSpec, time_limit_seconds: int = 30) -> SolveOutcome:
    model = cp_model.CpModel()

    horizon = sum(op.duration for job in problem.jobs for op in job.operations)

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            interval = model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end
            machine_intervals[operation.machine_id].append(interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)
    model.Minimize(makespan)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    status = solver.Solve(model)

    return _outcome_from_solve(status, solver, starts, ends, problem)


def _outcome_from_solve(status, solver, starts, ends, problem: ProblemSpec) -> SolveOutcome:
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = Schedule(
            operations=[
                ScheduledOperation(
                    job_index=job_index,
                    operation_index=op_index,
                    machine_id=operation.machine_id,
                    start=solver.Value(starts[(job_index, op_index)]),
                    end=solver.Value(ends[(job_index, op_index)]),
                )
                for job_index, job in enumerate(problem.jobs)
                for op_index, operation in enumerate(job.operations)
            ]
        )
        return SolveOutcome(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            objective=int(solver.ObjectiveValue()),
            best_bound=int(solver.BestObjectiveBound()),
            schedule=schedule,
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible", message="No feasible schedule exists for this problem.")

    return SolveOutcome(status="failed", message=f"Solver returned status {solver.StatusName(status)}.")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/solver/test_solve_basic.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/makespan/solver/solve.py tests/solver/test_solve_basic.py
git commit -m "feat: solve classic JSSP instances with CP-SAT"
```

---

### Task 4: Progress callback for live solve status

**Files:**
- Create: `src/makespan/solver/progress.py`
- Modify: `src/makespan/solver/solve.py`
- Test: `tests/solver/test_progress.py`

**Interfaces:**
- Produces: `ProgressSample(objective: int, best_bound: int, elapsed_seconds: float)` (a `dataclass`),
  `ProgressCallback(on_progress: Callable[[ProgressSample], None] | None)` (a `cp_model.CpSolverSolutionCallback`
  subclass with a `.samples: list[ProgressSample]` attribute).
- Modifies: `solve()` now accepts `on_progress: Callable[[ProgressSample], None] | None = None`.

- [ ] **Step 1: Write the failing test**

```python
# tests/solver/test_progress.py
from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_solve_reports_progress_samples():
    problem = ProblemSpec(
        machines=["M1", "M2"],
        jobs=[
            Job(operations=[Operation(machine_id="M1", duration=3), Operation(machine_id="M2", duration=2)]),
            Job(operations=[Operation(machine_id="M2", duration=4), Operation(machine_id="M1", duration=1)]),
        ],
    )
    samples = []

    outcome = solve(problem, time_limit_seconds=5, on_progress=samples.append)

    assert len(samples) >= 1
    assert samples[-1].objective == outcome.objective
    assert samples[-1].best_bound <= samples[-1].objective
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/solver/test_progress.py -v`
Expected: FAIL with `TypeError: solve() got an unexpected keyword argument 'on_progress'`

- [ ] **Step 3: Implement the callback and wire it in**

```python
# src/makespan/solver/progress.py
from dataclasses import dataclass
from typing import Callable, Optional

from ortools.sat.python import cp_model


@dataclass
class ProgressSample:
    objective: int
    best_bound: int
    elapsed_seconds: float


class ProgressCallback(cp_model.CpSolverSolutionCallback):
    def __init__(self, on_progress: Optional[Callable[["ProgressSample"], None]]):
        super().__init__()
        self._on_progress = on_progress
        self.samples: list[ProgressSample] = []

    def on_solution_callback(self) -> None:
        sample = ProgressSample(
            objective=int(self.ObjectiveValue()),
            best_bound=int(self.BestObjectiveBound()),
            elapsed_seconds=self.WallTime(),
        )
        self.samples.append(sample)
        if self._on_progress is not None:
            self._on_progress(sample)
```

Replace `src/makespan/solver/solve.py` in full with:

```python
# src/makespan/solver/solve.py
from typing import Callable, Optional

from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome
from makespan.solver.progress import ProgressCallback, ProgressSample


def solve(
    problem: ProblemSpec,
    time_limit_seconds: int = 30,
    on_progress: Optional[Callable[[ProgressSample], None]] = None,
) -> SolveOutcome:
    model = cp_model.CpModel()

    horizon = sum(op.duration for job in problem.jobs for op in job.operations)

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            interval = model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end
            machine_intervals[operation.machine_id].append(interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)
    model.Minimize(makespan)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    callback = ProgressCallback(on_progress)
    status = solver.Solve(model, callback)

    return _outcome_from_solve(status, solver, starts, ends, problem)


def _outcome_from_solve(status, solver, starts, ends, problem: ProblemSpec) -> SolveOutcome:
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = Schedule(
            operations=[
                ScheduledOperation(
                    job_index=job_index,
                    operation_index=op_index,
                    machine_id=operation.machine_id,
                    start=solver.Value(starts[(job_index, op_index)]),
                    end=solver.Value(ends[(job_index, op_index)]),
                )
                for job_index, job in enumerate(problem.jobs)
                for op_index, operation in enumerate(job.operations)
            ]
        )
        return SolveOutcome(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            objective=int(solver.ObjectiveValue()),
            best_bound=int(solver.BestObjectiveBound()),
            schedule=schedule,
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible", message="No feasible schedule exists for this problem.")

    return SolveOutcome(status="failed", message=f"Solver returned status {solver.StatusName(status)}.")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/solver/ -v`
Expected: PASS (all solver tests so far)

- [ ] **Step 5: Commit**

```bash
git add src/makespan/solver/progress.py src/makespan/solver/solve.py tests/solver/test_progress.py
git commit -m "feat: report live solve progress via CP-SAT solution callback"
```

---

### Task 5: Setup-time constraint

**Files:**
- Modify: `src/makespan/solver/solve.py`
- Test: `tests/solver/test_setup_time.py`

**Interfaces:**
- No signature changes; `solve()` now honors `problem.constraints.setup_times`.

- [ ] **Step 1: Write the failing test**

```python
# tests/solver/test_setup_time.py
from makespan.solver.models import Constraints, Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_setup_time_enforces_gap_between_operations_on_same_machine():
    # Two independent single-op jobs sharing M1, no ordering constraint between them.
    # Without setup time the minimum makespan is 2+2=4; with a mandatory 5-unit changeover
    # on M1 between any two operations, the minimum span becomes 2+5+2=9.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[
            Job(operations=[Operation(machine_id="M1", duration=2)]),
            Job(operations=[Operation(machine_id="M1", duration=2)]),
        ],
        constraints=Constraints(setup_times={"M1": 5}),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 9

    ops = sorted(outcome.schedule.operations, key=lambda o: o.start)
    assert ops[1].start - ops[0].end >= 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/solver/test_setup_time.py -v`
Expected: FAIL — `outcome.objective == 4`, not `9` (setup time not yet enforced)

- [ ] **Step 3: Implement setup-time padding**

Replace `src/makespan/solver/solve.py` in full with:

```python
# src/makespan/solver/solve.py
from typing import Callable, Optional

from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome
from makespan.solver.progress import ProgressCallback, ProgressSample


def solve(
    problem: ProblemSpec,
    time_limit_seconds: int = 30,
    on_progress: Optional[Callable[[ProgressSample], None]] = None,
) -> SolveOutcome:
    model = cp_model.CpModel()

    total_duration = sum(op.duration for job in problem.jobs for op in job.operations)
    total_op_count = sum(len(job.operations) for job in problem.jobs)
    total_setup = sum(problem.constraints.setup_times.values()) * total_op_count
    horizon = total_duration + total_setup

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end

            setup = problem.constraints.setup_times.get(operation.machine_id, 0)
            padded_end = model.NewIntVar(0, horizon, f"padded_end_{job_index}_{op_index}")
            model.Add(padded_end == start + operation.duration + setup)
            padded_interval = model.NewIntervalVar(
                start, operation.duration + setup, padded_end, f"padded_{job_index}_{op_index}"
            )
            machine_intervals[operation.machine_id].append(padded_interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)
    model.Minimize(makespan)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    callback = ProgressCallback(on_progress)
    status = solver.Solve(model, callback)

    return _outcome_from_solve(status, solver, starts, ends, problem)


def _outcome_from_solve(status, solver, starts, ends, problem: ProblemSpec) -> SolveOutcome:
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = Schedule(
            operations=[
                ScheduledOperation(
                    job_index=job_index,
                    operation_index=op_index,
                    machine_id=operation.machine_id,
                    start=solver.Value(starts[(job_index, op_index)]),
                    end=solver.Value(ends[(job_index, op_index)]),
                )
                for job_index, job in enumerate(problem.jobs)
                for op_index, operation in enumerate(job.operations)
            ]
        )
        return SolveOutcome(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            objective=int(solver.ObjectiveValue()),
            best_bound=int(solver.BestObjectiveBound()),
            schedule=schedule,
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible", message="No feasible schedule exists for this problem.")

    return SolveOutcome(status="failed", message=f"Solver returned status {solver.StatusName(status)}.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/solver/ -v`
Expected: PASS (all solver tests, including the new setup-time test)

- [ ] **Step 5: Commit**

```bash
git add src/makespan/solver/solve.py tests/solver/test_setup_time.py
git commit -m "feat: enforce per-machine setup times between operations"
```

---

### Task 6: Due-date / tardiness constraint

**Files:**
- Modify: `src/makespan/solver/solve.py`
- Test: `tests/solver/test_due_dates.py`

**Interfaces:**
- No signature changes; `solve()` now honors `problem.constraints.due_dates`, minimizing
  `makespan + sum(weight * tardiness)` when any due date is present.

- [ ] **Step 1: Write the failing test**

```python
# tests/solver/test_due_dates.py
from makespan.solver.models import Constraints, DueDate, Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_due_date_tardiness_included_in_objective():
    # Single job, single 5-unit operation, due at t=3. Starting at 0 is always optimal
    # (starting later only increases both makespan and tardiness), so finish=5, tardiness=2.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=5)])],
        constraints=Constraints(due_dates=[DueDate(job_index=0, due=3, weight=1)]),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    finish = outcome.schedule.operations[0].end
    assert finish == 5
    tardiness = max(0, finish - 3)
    assert tardiness == 2
    assert outcome.objective == finish + tardiness
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/solver/test_due_dates.py -v`
Expected: FAIL — `outcome.objective == 5`, not `7` (tardiness not yet in the objective)

- [ ] **Step 3: Implement the tardiness objective**

Replace `src/makespan/solver/solve.py` in full with:

```python
# src/makespan/solver/solve.py
from typing import Callable, Optional

from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome
from makespan.solver.progress import ProgressCallback, ProgressSample


def solve(
    problem: ProblemSpec,
    time_limit_seconds: int = 30,
    on_progress: Optional[Callable[[ProgressSample], None]] = None,
) -> SolveOutcome:
    model = cp_model.CpModel()

    total_duration = sum(op.duration for job in problem.jobs for op in job.operations)
    total_op_count = sum(len(job.operations) for job in problem.jobs)
    total_setup = sum(problem.constraints.setup_times.values()) * total_op_count
    horizon = total_duration + total_setup

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end

            setup = problem.constraints.setup_times.get(operation.machine_id, 0)
            padded_end = model.NewIntVar(0, horizon, f"padded_end_{job_index}_{op_index}")
            model.Add(padded_end == start + operation.duration + setup)
            padded_interval = model.NewIntervalVar(
                start, operation.duration + setup, padded_end, f"padded_{job_index}_{op_index}"
            )
            machine_intervals[operation.machine_id].append(padded_interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)

    objective_terms = [makespan]
    for due_date in problem.constraints.due_dates:
        tardiness = model.NewIntVar(0, horizon, f"tardiness_{due_date.job_index}")
        model.Add(tardiness >= job_completion[due_date.job_index] - due_date.due)
        objective_terms.append(due_date.weight * tardiness)
    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    callback = ProgressCallback(on_progress)
    status = solver.Solve(model, callback)

    return _outcome_from_solve(status, solver, starts, ends, problem)


def _outcome_from_solve(status, solver, starts, ends, problem: ProblemSpec) -> SolveOutcome:
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = Schedule(
            operations=[
                ScheduledOperation(
                    job_index=job_index,
                    operation_index=op_index,
                    machine_id=operation.machine_id,
                    start=solver.Value(starts[(job_index, op_index)]),
                    end=solver.Value(ends[(job_index, op_index)]),
                )
                for job_index, job in enumerate(problem.jobs)
                for op_index, operation in enumerate(job.operations)
            ]
        )
        return SolveOutcome(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            objective=int(solver.ObjectiveValue()),
            best_bound=int(solver.BestObjectiveBound()),
            schedule=schedule,
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible", message="No feasible schedule exists for this problem.")

    return SolveOutcome(status="failed", message=f"Solver returned status {solver.StatusName(status)}.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/solver/ -v`
Expected: PASS (all solver tests, including the new due-date test)

- [ ] **Step 5: Commit**

```bash
git add src/makespan/solver/solve.py tests/solver/test_due_dates.py
git commit -m "feat: minimize weighted tardiness alongside makespan when due dates are present"
```

---

### Task 7: Machine downtime windows

**Files:**
- Modify: `src/makespan/solver/solve.py`
- Test: `tests/solver/test_downtime.py`

**Interfaces:**
- No signature changes; `solve()` now honors `problem.constraints.downtime_windows`.

- [ ] **Step 1: Write the failing test**

```python
# tests/solver/test_downtime.py
from makespan.solver.models import Constraints, DowntimeWindow, Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_downtime_window_blocks_machine_availability():
    # Single 4-unit operation on M1, which is down from t=0 to t=3. The operation cannot
    # overlap [0, 3) at all, so the earliest feasible start is 3, giving makespan 7.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=4)])],
        constraints=Constraints(downtime_windows=[DowntimeWindow(machine_id="M1", start=0, end=3)]),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 7
    assert outcome.schedule.operations[0].start >= 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/solver/test_downtime.py -v`
Expected: FAIL — `outcome.objective == 4`, not `7` (downtime not yet enforced)

- [ ] **Step 3: Implement downtime windows**

Replace `src/makespan/solver/solve.py` in full with:

```python
# src/makespan/solver/solve.py
from typing import Callable, Optional

from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome
from makespan.solver.progress import ProgressCallback, ProgressSample


def solve(
    problem: ProblemSpec,
    time_limit_seconds: int = 30,
    on_progress: Optional[Callable[[ProgressSample], None]] = None,
) -> SolveOutcome:
    model = cp_model.CpModel()

    total_duration = sum(op.duration for job in problem.jobs for op in job.operations)
    total_op_count = sum(len(job.operations) for job in problem.jobs)
    total_setup = sum(problem.constraints.setup_times.values()) * total_op_count
    horizon = total_duration + total_setup
    for downtime in problem.constraints.downtime_windows:
        horizon = max(horizon, downtime.end)
    horizon += 1

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end

            setup = problem.constraints.setup_times.get(operation.machine_id, 0)
            padded_end = model.NewIntVar(0, horizon, f"padded_end_{job_index}_{op_index}")
            model.Add(padded_end == start + operation.duration + setup)
            padded_interval = model.NewIntervalVar(
                start, operation.duration + setup, padded_end, f"padded_{job_index}_{op_index}"
            )
            machine_intervals[operation.machine_id].append(padded_interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    for downtime_index, downtime in enumerate(problem.constraints.downtime_windows):
        downtime_interval = model.NewIntervalVar(
            downtime.start, downtime.end - downtime.start, downtime.end, f"downtime_{downtime_index}"
        )
        machine_intervals[downtime.machine_id].append(downtime_interval)

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)

    objective_terms = [makespan]
    for due_date in problem.constraints.due_dates:
        tardiness = model.NewIntVar(0, horizon, f"tardiness_{due_date.job_index}")
        model.Add(tardiness >= job_completion[due_date.job_index] - due_date.due)
        objective_terms.append(due_date.weight * tardiness)
    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    callback = ProgressCallback(on_progress)
    status = solver.Solve(model, callback)

    return _outcome_from_solve(status, solver, starts, ends, problem)


def _outcome_from_solve(status, solver, starts, ends, problem: ProblemSpec) -> SolveOutcome:
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = Schedule(
            operations=[
                ScheduledOperation(
                    job_index=job_index,
                    operation_index=op_index,
                    machine_id=operation.machine_id,
                    start=solver.Value(starts[(job_index, op_index)]),
                    end=solver.Value(ends[(job_index, op_index)]),
                )
                for job_index, job in enumerate(problem.jobs)
                for op_index, operation in enumerate(job.operations)
            ]
        )
        return SolveOutcome(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            objective=int(solver.ObjectiveValue()),
            best_bound=int(solver.BestObjectiveBound()),
            schedule=schedule,
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible", message="No feasible schedule exists for this problem.")

    return SolveOutcome(status="failed", message=f"Solver returned status {solver.StatusName(status)}.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/solver/ -v`
Expected: PASS (all solver tests)

- [ ] **Step 5: Commit**

```bash
git add src/makespan/solver/solve.py tests/solver/test_downtime.py
git commit -m "feat: respect machine downtime windows in the schedule"
```

---

### Task 8: Database layer + test client fixture

**Files:**
- Modify: `pyproject.toml`
- Modify: `.gitignore`
- Create: `src/makespan/db/__init__.py` (empty)
- Create: `src/makespan/db/models.py`
- Create: `src/makespan/db/session.py`
- Modify: `src/makespan/main.py`
- Create: `tests/conftest.py`
- Test: `tests/db/test_models.py`

**Interfaces:**
- Produces: `ProblemRecord(id, name, created_at, machines, jobs, constraints)`,
  `SolveRecord(id, problem_id, status, time_limit_seconds, objective_mode, best_objective,
  best_bound, schedule, created_at, finished_at)` — both `SQLModel` table models.
  `engine` (SQLAlchemy `Engine`), `get_session()` (FastAPI dependency yielding a `Session`),
  `init_db()` (creates tables on `engine`).
  `tests/conftest.py`'s `client` fixture — a `TestClient` bound to an isolated temp-file
  SQLite database via `app.dependency_overrides[get_session]`. All later API tests use this fixture.

- [ ] **Step 1: Add SQLModel dependency**

Edit `pyproject.toml` so `dependencies` includes `"sqlmodel>=0.0.22"`:

```toml
dependencies = [
    "ortools>=9.15.6755",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "sqlmodel>=0.0.22",
]
```

Run: `uv sync`

- [ ] **Step 2: Ignore local SQLite files**

Append to `.gitignore`:

```
*.db
```

- [ ] **Step 3: Write the failing test**

```python
# tests/db/test_models.py
from sqlmodel import Session, SQLModel, create_engine

from makespan.db.models import ProblemRecord, SolveRecord


def test_problem_record_round_trip(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        record = ProblemRecord(
            name="Demo",
            machines=["M1", "M2"],
            jobs=[{"operations": [{"machine_id": "M1", "duration": 3}]}],
            constraints={},
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        problem_id = record.id

    with Session(engine) as session:
        fetched = session.get(ProblemRecord, problem_id)

    assert fetched is not None
    assert fetched.machines == ["M1", "M2"]
    assert fetched.jobs[0]["operations"][0]["duration"] == 3


def test_solve_record_round_trip(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        problem = ProblemRecord(name="Demo", machines=["M1"], jobs=[], constraints={})
        session.add(problem)
        session.commit()
        session.refresh(problem)

        solve_record = SolveRecord(problem_id=problem.id, time_limit_seconds=30, objective_mode="makespan")
        session.add(solve_record)
        session.commit()
        session.refresh(solve_record)
        solve_id = solve_record.id
        problem_id = problem.id

    with Session(engine) as session:
        fetched = session.get(SolveRecord, solve_id)

    assert fetched is not None
    assert fetched.status == "pending"
    assert fetched.problem_id == problem_id
```

- [ ] **Step 4: Run test to verify it fails**

Run: `uv run pytest tests/db/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.db'`

- [ ] **Step 5: Implement the DB models and session**

```python
# src/makespan/db/models.py
from datetime import UTC, datetime
from typing import Optional
from uuid import uuid4

from sqlmodel import JSON, Column, Field, SQLModel


class ProblemRecord(SQLModel, table=True):
    __tablename__ = "problems"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    machines: list[str] = Field(sa_column=Column(JSON))
    jobs: list[dict] = Field(sa_column=Column(JSON))
    constraints: dict = Field(default_factory=dict, sa_column=Column(JSON))


class SolveRecord(SQLModel, table=True):
    __tablename__ = "solves"

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    problem_id: str = Field(foreign_key="problems.id")
    status: str = "pending"
    time_limit_seconds: int = 30
    objective_mode: str = "makespan"
    best_objective: Optional[int] = None
    best_bound: Optional[int] = None
    schedule: Optional[list[dict]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    finished_at: Optional[datetime] = None
```

```python
# src/makespan/db/session.py
import os
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.environ.get("MAKESPAN_DATABASE_URL", "sqlite:///./makespan.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
```

- [ ] **Step 6: Wire DB init into app startup**

Replace `src/makespan/main.py` in full with:

```python
# src/makespan/main.py
from fastapi import FastAPI

from makespan.db.session import init_db

app = FastAPI(title="Makespan")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Add the shared test client fixture**

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from makespan.db.session import get_session
from makespan.main import app


@pytest.fixture()
def client(tmp_path):
    test_engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(test_engine)

    def override_get_session():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `uv run pytest tests/db/ tests/api/ -v`
Expected: PASS (DB round-trip tests, and the Task 1 health check test still passes with the `client` fixture available)

- [ ] **Step 9: Commit**

```bash
git add pyproject.toml uv.lock .gitignore src/makespan/db/ src/makespan/main.py tests/conftest.py tests/db/test_models.py
git commit -m "feat: add SQLite persistence layer and shared test client fixture"
```

---

### Task 9: Problem CRUD API

**Files:**
- Create: `src/makespan/api/__init__.py` (empty)
- Create: `src/makespan/api/schemas.py`
- Create: `src/makespan/api/problems.py`
- Modify: `src/makespan/main.py`
- Test: `tests/api/test_problems.py`

**Interfaces:**
- Consumes: `ProblemRecord` from `makespan.db.models`; `get_session` from `makespan.db.session`;
  `ProblemSpec`, `Job`, `Constraints` from `makespan.solver.models`; `client` fixture from `tests/conftest.py`.
- Produces: `ProblemIn(ProblemSpec)` with an added `name: str` field; `ProblemOut(ProblemIn)` with
  added `id: str`, `created_at: datetime`; `ProblemSummary(id, name, created_at)`.
  Routes: `POST /api/problems`, `GET /api/problems/{id}`, `PUT /api/problems/{id}`, `GET /api/problems`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_problems.py
def test_create_and_get_problem(client):
    payload = {
        "name": "Demo",
        "machines": ["M1", "M2"],
        "jobs": [
            {"operations": [{"machine_id": "M1", "duration": 3}, {"machine_id": "M2", "duration": 2}]},
        ],
    }
    create_response = client.post("/api/problems", json=payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Demo"
    assert "id" in created

    get_response = client.get(f"/api/problems/{created['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["machines"] == ["M1", "M2"]


def test_create_problem_rejects_unknown_machine_reference(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M2", "duration": 3}]}],
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_update_problem(client):
    payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 3}]}],
    }
    created = client.post("/api/problems", json=payload).json()

    updated_payload = {**payload, "name": "Renamed"}
    response = client.put(f"/api/problems/{created['id']}", json=updated_payload)
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


def test_get_unknown_problem_returns_404(client):
    response = client.get("/api/problems/does-not-exist")
    assert response.status_code == 404


def test_list_problems(client):
    client.post(
        "/api/problems",
        json={
            "name": "A",
            "machines": ["M1"],
            "jobs": [{"operations": [{"machine_id": "M1", "duration": 1}]}],
        },
    )
    response = client.get("/api/problems")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "A" in names
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_problems.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.api'`

- [ ] **Step 3: Implement the schemas and routes**

```python
# src/makespan/api/schemas.py
from datetime import datetime

from pydantic import BaseModel

from makespan.solver.models import ProblemSpec


class ProblemIn(ProblemSpec):
    name: str


class ProblemOut(ProblemIn):
    id: str
    created_at: datetime


class ProblemSummary(BaseModel):
    id: str
    name: str
    created_at: datetime


class SolveSummary(BaseModel):
    id: str
    status: str
    best_objective: int | None
    created_at: datetime
```

```python
# src/makespan/api/problems.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from makespan.api.schemas import ProblemIn, ProblemOut, ProblemSummary, SolveSummary
from makespan.db.models import ProblemRecord, SolveRecord
from makespan.db.session import get_session

router = APIRouter(prefix="/api/problems", tags=["problems"])


def _to_out(record: ProblemRecord) -> ProblemOut:
    return ProblemOut(
        id=record.id,
        name=record.name,
        created_at=record.created_at,
        machines=record.machines,
        jobs=record.jobs,
        constraints=record.constraints,
    )


@router.post("", response_model=ProblemOut, status_code=201)
def create_problem(problem: ProblemIn, session: Session = Depends(get_session)) -> ProblemOut:
    record = ProblemRecord(
        name=problem.name,
        machines=problem.machines,
        jobs=[job.model_dump() for job in problem.jobs],
        constraints=problem.constraints.model_dump(),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _to_out(record)


@router.get("/{problem_id}", response_model=ProblemOut)
def get_problem(problem_id: str, session: Session = Depends(get_session)) -> ProblemOut:
    record = session.get(ProblemRecord, problem_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return _to_out(record)


@router.put("/{problem_id}", response_model=ProblemOut)
def update_problem(
    problem_id: str, problem: ProblemIn, session: Session = Depends(get_session)
) -> ProblemOut:
    record = session.get(ProblemRecord, problem_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    record.name = problem.name
    record.machines = problem.machines
    record.jobs = [job.model_dump() for job in problem.jobs]
    record.constraints = problem.constraints.model_dump()
    session.add(record)
    session.commit()
    session.refresh(record)
    return _to_out(record)


@router.get("", response_model=list[ProblemSummary])
def list_problems(session: Session = Depends(get_session)) -> list[ProblemSummary]:
    records = session.exec(select(ProblemRecord)).all()
    return [ProblemSummary(id=r.id, name=r.name, created_at=r.created_at) for r in records]


@router.get("/{problem_id}/solves", response_model=list[SolveSummary])
def list_solves_for_problem(
    problem_id: str, session: Session = Depends(get_session)
) -> list[SolveSummary]:
    problem_record = session.get(ProblemRecord, problem_id)
    if problem_record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    records = session.exec(select(SolveRecord).where(SolveRecord.problem_id == problem_id)).all()
    return [
        SolveSummary(id=r.id, status=r.status, best_objective=r.best_objective, created_at=r.created_at)
        for r in records
    ]
```

- [ ] **Step 4: Register the router**

In `src/makespan/main.py`, add the import and registration (after the `init_db` import, before the `/api/health` route):

```python
from makespan.api.problems import router as problems_router
```

```python
app.include_router(problems_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_problems.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/makespan/api/__init__.py src/makespan/api/schemas.py src/makespan/api/problems.py src/makespan/main.py tests/api/test_problems.py
git commit -m "feat: add problem CRUD API"
```

---

### Task 10: Preset problems

**Files:**
- Create: `src/makespan/api/presets.py`
- Modify: `src/makespan/main.py`
- Test: `tests/api/test_presets.py`

**Interfaces:**
- Consumes: `ProblemSpec`, `Job`, `Operation` from `makespan.solver.models`.
- Produces: `PRESETS: dict[str, ProblemSpec]`; route `GET /api/presets`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_presets.py
def test_list_presets_returns_known_presets(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    presets = response.json()
    assert "two-machine-demo" in presets
    assert presets["two-machine-demo"]["machines"] == ["M1", "M2"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/api/test_presets.py -v`
Expected: FAIL with 404 (route does not exist yet)

- [ ] **Step 3: Implement the presets**

```python
# src/makespan/api/presets.py
from fastapi import APIRouter

from makespan.solver.models import Job, Operation, ProblemSpec

router = APIRouter(prefix="/api/presets", tags=["presets"])

PRESETS: dict[str, ProblemSpec] = {
    "two-machine-demo": ProblemSpec(
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
    ),
    "three-machine-demo": ProblemSpec(
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
    ),
}


@router.get("", response_model=dict[str, ProblemSpec])
def list_presets() -> dict[str, ProblemSpec]:
    return PRESETS
```

- [ ] **Step 4: Register the router**

In `src/makespan/main.py`, add the import and registration:

```python
from makespan.api.presets import router as presets_router
```

```python
app.include_router(presets_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/api/test_presets.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/makespan/api/presets.py src/makespan/main.py tests/api/test_presets.py
git commit -m "feat: add seeded demo presets"
```

---

### Task 11: Solve execution API (background solve + polling)

**Files:**
- Create: `src/makespan/solver/progress_store.py`
- Create: `src/makespan/api/solves.py`
- Modify: `src/makespan/main.py`
- Test: `tests/api/test_solves.py`

**Interfaces:**
- Consumes: `solve()`, `ProgressSample` from `makespan.solver`; `ProblemRecord`, `SolveRecord` from
  `makespan.db.models`; `get_session` from `makespan.db.session`.
- Produces: `progress_store: ProgressStore` (module-level singleton) with `.set(solve_id, sample)`,
  `.get(solve_id) -> ProgressSample | None`, `.clear(solve_id)`.
  `SolveCreate(problem_id: str, time_limit_seconds: int = 30)` (validated `1 <= time_limit_seconds <= 60`),
  `SolveStatus(id, status, best_objective, best_bound, elapsed_seconds, schedule, message)`.
  Routes: `POST /api/solves` (202), `GET /api/solves/{id}`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_solves.py
import time


def test_create_solve_runs_and_completes(client):
    problem_payload = {
        "name": "Demo",
        "machines": ["M1", "M2"],
        "jobs": [
            {"operations": [{"machine_id": "M1", "duration": 3}, {"machine_id": "M2", "duration": 2}]},
            {"operations": [{"machine_id": "M2", "duration": 4}, {"machine_id": "M1", "duration": 1}]},
        ],
    }
    problem = client.post("/api/problems", json=problem_payload).json()

    create_response = client.post(
        "/api/solves", json={"problem_id": problem["id"], "time_limit_seconds": 5}
    )
    assert create_response.status_code == 202
    solve_id = create_response.json()["id"]

    status = None
    for _ in range(50):
        status = client.get(f"/api/solves/{solve_id}").json()
        if status["status"] == "completed":
            break
        time.sleep(0.1)

    assert status["status"] == "completed"
    assert status["best_objective"] == 6
    assert status["schedule"] is not None


def test_create_solve_rejects_time_limit_above_cap(client):
    problem_payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 1}]}],
    }
    problem = client.post("/api/problems", json=problem_payload).json()

    response = client.post(
        "/api/solves", json={"problem_id": problem["id"], "time_limit_seconds": 120}
    )
    assert response.status_code == 422


def test_create_solve_for_unknown_problem_returns_404(client):
    response = client.post(
        "/api/solves", json={"problem_id": "does-not-exist", "time_limit_seconds": 5}
    )
    assert response.status_code == 404


def test_get_unknown_solve_returns_404(client):
    response = client.get("/api/solves/does-not-exist")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_solves.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'makespan.api.solves'`

- [ ] **Step 3: Implement the progress store and solve routes**

```python
# src/makespan/solver/progress_store.py
import threading
from typing import Optional

from makespan.solver.progress import ProgressSample


class ProgressStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._samples: dict[str, ProgressSample] = {}

    def set(self, solve_id: str, sample: ProgressSample) -> None:
        with self._lock:
            self._samples[solve_id] = sample

    def get(self, solve_id: str) -> Optional[ProgressSample]:
        with self._lock:
            return self._samples.get(solve_id)

    def clear(self, solve_id: str) -> None:
        with self._lock:
            self._samples.pop(solve_id, None)


progress_store = ProgressStore()
```

```python
# src/makespan/api/solves.py
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from makespan.db.models import ProblemRecord, SolveRecord
from makespan.db.session import get_session
from makespan.solver.models import Constraints, Job, ProblemSpec, SolveOutcome
from makespan.solver.progress_store import progress_store
from makespan.solver.solve import solve

router = APIRouter(prefix="/api/solves", tags=["solves"])


class SolveCreate(BaseModel):
    problem_id: str
    time_limit_seconds: int = Field(default=30, ge=1, le=60)


class SolveStatus(BaseModel):
    id: str
    status: str
    best_objective: Optional[int]
    best_bound: Optional[int]
    elapsed_seconds: Optional[float]
    schedule: Optional[list[dict]]
    message: Optional[str] = None


def _record_to_problem_spec(record: ProblemRecord) -> ProblemSpec:
    return ProblemSpec(
        machines=record.machines,
        jobs=[Job.model_validate(job) for job in record.jobs],
        constraints=Constraints.model_validate(record.constraints),
    )


def _run_solve(solve_id: str, problem: ProblemSpec, time_limit_seconds: int, engine) -> None:
    with Session(engine) as session:
        record = session.get(SolveRecord, solve_id)
        record.status = "running"
        session.add(record)
        session.commit()

    outcome: SolveOutcome = solve(
        problem,
        time_limit_seconds=time_limit_seconds,
        on_progress=lambda sample: progress_store.set(solve_id, sample),
    )

    with Session(engine) as session:
        record = session.get(SolveRecord, solve_id)
        record.status = "failed" if outcome.status in ("infeasible", "failed") else "completed"
        record.best_objective = outcome.objective
        record.best_bound = outcome.best_bound
        record.schedule = (
            [op.model_dump() for op in outcome.schedule.operations] if outcome.schedule else None
        )
        record.finished_at = datetime.now(UTC)
        session.add(record)
        session.commit()

    progress_store.clear(solve_id)


@router.post("", response_model=SolveStatus, status_code=202)
def create_solve(
    payload: SolveCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> SolveStatus:
    problem_record = session.get(ProblemRecord, payload.problem_id)
    if problem_record is None:
        raise HTTPException(status_code=404, detail="Problem not found")

    solve_record = SolveRecord(
        problem_id=payload.problem_id,
        time_limit_seconds=payload.time_limit_seconds,
        objective_mode="weighted" if problem_record.constraints.get("due_dates") else "makespan",
    )
    session.add(solve_record)
    session.commit()
    session.refresh(solve_record)

    problem_spec = _record_to_problem_spec(problem_record)
    background_tasks.add_task(
        _run_solve, solve_record.id, problem_spec, payload.time_limit_seconds, session.get_bind()
    )

    return SolveStatus(
        id=solve_record.id,
        status=solve_record.status,
        best_objective=None,
        best_bound=None,
        elapsed_seconds=None,
        schedule=None,
    )


@router.get("/{solve_id}", response_model=SolveStatus)
def get_solve(solve_id: str, session: Session = Depends(get_session)) -> SolveStatus:
    record = session.get(SolveRecord, solve_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Solve not found")

    sample = progress_store.get(solve_id)
    if sample is not None and record.status == "running":
        return SolveStatus(
            id=record.id,
            status=record.status,
            best_objective=sample.objective,
            best_bound=sample.best_bound,
            elapsed_seconds=sample.elapsed_seconds,
            schedule=None,
        )

    return SolveStatus(
        id=record.id,
        status=record.status,
        best_objective=record.best_objective,
        best_bound=record.best_bound,
        elapsed_seconds=None,
        schedule=record.schedule,
    )
```

Note: `_run_solve` receives the engine via `session.get_bind()` from the request's own (possibly
dependency-overridden) session, rather than importing a module-level `engine` directly — this is
what makes it use the test's isolated database during tests instead of the real one.

- [ ] **Step 4: Register the router**

In `src/makespan/main.py`, add the import and registration:

```python
from makespan.api.solves import router as solves_router
```

```python
app.include_router(solves_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_solves.py -v`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `uv run pytest -v`
Expected: PASS (every test in the project)

- [ ] **Step 7: Commit**

```bash
git add src/makespan/solver/progress_store.py src/makespan/api/solves.py src/makespan/main.py tests/api/test_solves.py
git commit -m "feat: add background solve execution with progress polling"
```

---

## Self-Review Notes

- **Spec coverage:** classic JSSP + setup times + due dates + downtime → Tasks 3, 5, 6, 7. Persistence
  with JSON columns and whole-document editing → Task 8. All `/api/problems*` and `/api/solves*`
  endpoints, validation, and the `time_limit_seconds` cap → Tasks 9, 11. Presets → Task 10. Solve
  history → folded into Task 9's `problems.py` (`GET /api/problems/{id}/solves`). Live progress via
  solution callback → Task 4, surfaced through the `ProgressStore` in Task 11. Frontend, auth, and
  concurrent-solve limiting are explicitly out of scope per the spec's Future Considerations — not
  covered here by design.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and a concrete expected result.
- **Type consistency:** `solve()`'s signature (`ProblemSpec, time_limit_seconds, on_progress`) is
  identical from Task 4 onward; `SolveOutcome`/`Schedule`/`ScheduledOperation` fields are used
  consistently between `solver/solve.py`, `api/solves.py`, and `db/models.py`. Verified.
