from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from makespan.api.schemas import ProblemIn, ProblemOut, ProblemSummary, SolveSummary
from makespan.db.models import ProblemRecord, SolveRecord
from makespan.db.session import get_session

router = APIRouter(prefix="/api/problems", tags=["problems"])


def record_to_problem_out(record: ProblemRecord) -> ProblemOut:
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
    return record_to_problem_out(record)


@router.get("/{problem_id}", response_model=ProblemOut)
def get_problem(problem_id: str, session: Session = Depends(get_session)) -> ProblemOut:
    record = session.get(ProblemRecord, problem_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Problem not found")
    return record_to_problem_out(record)


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
    return record_to_problem_out(record)


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
        SolveSummary(
            id=r.id,
            status=r.status,
            best_objective=r.best_objective,
            objective_mode=r.objective_mode,
            created_at=r.created_at,
        )
        for r in records
    ]
