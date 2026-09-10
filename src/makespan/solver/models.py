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
