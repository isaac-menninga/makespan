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
    objective_mode: Optional[str] = None


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

    try:
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
                [op.model_dump() for op in outcome.schedule.operations]
                if outcome.schedule
                else None
            )
            record.message = outcome.message
            record.finished_at = datetime.now(UTC)
            session.add(record)
            session.commit()
    except Exception as exc:
        # The request to *start* the solve already succeeded, so an unexpected exception
        # here (solver bug, malformed problem that slipped past validation, etc.) must
        # never crash this background task silently -- it must resolve the solve record
        # to "failed" with a message instead of leaving it stuck at "running" forever.
        with Session(engine) as session:
            record = session.get(SolveRecord, solve_id)
            record.status = "failed"
            record.message = f"{type(exc).__name__}: {exc}"
            record.finished_at = datetime.now(UTC)
            session.add(record)
            session.commit()
    finally:
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
        objective_mode=solve_record.objective_mode,
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
            objective_mode=record.objective_mode,
        )

    elapsed_seconds = None
    if record.finished_at is not None:
        elapsed_seconds = (record.finished_at - record.created_at).total_seconds()

    return SolveStatus(
        id=record.id,
        status=record.status,
        best_objective=record.best_objective,
        best_bound=record.best_bound,
        elapsed_seconds=elapsed_seconds,
        schedule=record.schedule,
        message=record.message,
        objective_mode=record.objective_mode,
    )
