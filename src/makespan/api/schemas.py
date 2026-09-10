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
    objective_mode: str
    created_at: datetime
