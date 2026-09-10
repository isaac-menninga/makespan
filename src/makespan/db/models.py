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
