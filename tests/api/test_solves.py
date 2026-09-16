import time

from sqlmodel import Session, SQLModel, create_engine

from makespan.api import solves as solves_module
from makespan.db.models import SolveRecord
from makespan.solver.models import Job, Operation, ProblemSpec, SolveOutcome
from makespan.solver.progress import ProgressSample
from makespan.solver.progress_store import progress_store


def test_create_solve_runs_and_completes(client):
    problem_payload = {
        "name": "Demo",
        "machines": ["M1", "M2"],
        "jobs": [
            {
                "operations": [
                    {"machine_id": "M1", "duration": 3},
                    {"machine_id": "M2", "duration": 2},
                ]
            },
            {
                "operations": [
                    {"machine_id": "M2", "duration": 4},
                    {"machine_id": "M1", "duration": 1},
                ]
            },
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


def test_run_solve_marks_failed_on_unexpected_exception(tmp_path, monkeypatch):
    # If the solver raises (e.g. a bug like an empty-operations KeyError), the background
    # task must never crash silently and leave the solve stuck at "running" forever -- it
    # must persist status="failed" with the exception message, and always clear progress.
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        record = SolveRecord(problem_id="does-not-matter", time_limit_seconds=5)
        session.add(record)
        session.commit()
        session.refresh(record)
        solve_id = record.id

    progress_store.set(solve_id, object())

    def _boom(*args, **kwargs):
        raise KeyError((0, -1))

    monkeypatch.setattr(solves_module, "solve", _boom)

    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=1)])],
    )
    solves_module._run_solve(solve_id, problem, 5, engine)

    with Session(engine) as session:
        record = session.get(SolveRecord, solve_id)
        assert record.status == "failed"
        assert record.message is not None
        assert "KeyError" in record.message or "(0, -1)" in record.message

    assert progress_store.get(solve_id) is None


def test_get_solve_returns_live_progress_while_running(tmp_path):
    # TestClient runs BackgroundTasks synchronously, so every poll made through the `client`
    # fixture already observes status="completed" by the time the request returns -- the
    # branch in get_solve that surfaces a live ProgressStore sample for a still-"running"
    # solve (the entire point of ProgressStore) never gets exercised by those tests. Drive
    # get_solve directly against a manually-inserted "running" SolveRecord plus a pre-seeded
    # ProgressSample instead, mirroring the direct-call style already used above for
    # _run_solve.
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        record = SolveRecord(problem_id="does-not-matter", time_limit_seconds=5, status="running")
        session.add(record)
        session.commit()
        session.refresh(record)
        solve_id = record.id

    progress_store.set(solve_id, ProgressSample(objective=42, best_bound=10, elapsed_seconds=1.5))
    try:
        with Session(engine) as session:
            status = solves_module.get_solve(solve_id, session=session)
    finally:
        progress_store.clear(solve_id)

    assert status.status == "running"
    assert status.best_objective == 42
    assert status.best_bound == 10
    assert status.elapsed_seconds == 1.5
    assert status.schedule is None


def test_create_solve_with_all_constraint_families_together(client):
    # Every other API test posts a constraint-free problem, so nothing catches a future
    # regression where setup_times / due_dates / downtime_windows gets silently dropped
    # between the DB's JSON document and the solver call in _record_to_problem_spec. This
    # instance is deliberately chosen so that dropping *any one* of the three constraint
    # families changes the optimal objective away from 13 (verified against the solver
    # directly): two single-op jobs on M1 (duration 2 each), a 5-unit setup time on M1
    # forces a gap between them, a downtime window [0, 2) delays the first one, and a due
    # date of 3 (weight 2) on job 0 adds tardiness whichever job runs second.
    problem_payload = {
        "name": "All constraints",
        "machines": ["M1"],
        "jobs": [
            {"operations": [{"machine_id": "M1", "duration": 2}]},
            {"operations": [{"machine_id": "M1", "duration": 2}]},
        ],
        "constraints": {
            "setup_times": {"M1": 5},
            "downtime_windows": [{"machine_id": "M1", "start": 0, "end": 2}],
            "due_dates": [{"job_index": 0, "due": 3, "weight": 2}],
        },
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
        if status["status"] in ("completed", "failed"):
            break
        time.sleep(0.1)

    assert status["status"] == "completed"
    assert status["objective_mode"] == "weighted"
    assert status["best_objective"] == 13


def test_get_solve_returns_message_for_infeasible_outcome(client, monkeypatch):
    # The solver's SolveOutcome.message must survive the round trip through the DB and
    # back out through GET /api/solves/{id}, not just be computed and discarded.
    problem_payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 1}]}],
    }
    problem = client.post("/api/problems", json=problem_payload).json()

    def _fake_solve(*args, **kwargs):
        return SolveOutcome(
            status="infeasible", message="No feasible schedule exists for this problem."
        )

    monkeypatch.setattr(solves_module, "solve", _fake_solve)

    create_response = client.post(
        "/api/solves", json={"problem_id": problem["id"], "time_limit_seconds": 5}
    )
    solve_id = create_response.json()["id"]

    status = None
    for _ in range(50):
        status = client.get(f"/api/solves/{solve_id}").json()
        if status["status"] == "failed":
            break
        time.sleep(0.1)

    assert status["status"] == "failed"
    assert status["message"] == "No feasible schedule exists for this problem."
