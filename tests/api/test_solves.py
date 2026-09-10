import time

from sqlmodel import Session, SQLModel, create_engine

from makespan.api import solves as solves_module
from makespan.db.models import SolveRecord
from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.progress_store import progress_store


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
