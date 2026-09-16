from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class Operation(BaseModel):
    machine_id: str
    duration: int = Field(gt=0)


class Job(BaseModel):
    operations: list[Operation] = Field(min_length=1)


class DueDate(BaseModel):
    job_index: int = Field(ge=0)
    due: int = Field(ge=0)
    weight: int = Field(default=1, ge=1)


class DowntimeWindow(BaseModel):
    machine_id: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)

    @model_validator(mode="after")
    def check_end_after_start(self) -> "DowntimeWindow":
        if self.end <= self.start:
            raise ValueError("downtime window 'end' must be greater than 'start'")
        return self


class Constraints(BaseModel):
    setup_times: dict[str, int] = Field(default_factory=dict)
    due_dates: list[DueDate] = Field(default_factory=list)
    downtime_windows: list[DowntimeWindow] = Field(default_factory=list)

    @field_validator("setup_times")
    @classmethod
    def check_setup_times_non_negative(cls, value: dict[str, int]) -> dict[str, int]:
        for machine_id, setup_time in value.items():
            if setup_time < 0:
                raise ValueError(f"setup_times['{machine_id}'] must be >= 0, got {setup_time}")
        return value

    @field_validator("due_dates")
    @classmethod
    def check_due_dates_unique_job_index(cls, value: list[DueDate]) -> list[DueDate]:
        seen: set[int] = set()
        for due_date in value:
            if due_date.job_index in seen:
                raise ValueError(
                    f"due_dates contains more than one entry for job_index {due_date.job_index}"
                )
            seen.add(due_date.job_index)
        return value


class ProblemSpec(BaseModel):
    machines: list[str]
    jobs: list[Job] = Field(min_length=1)
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
                raise ValueError(
                    f"downtime window references unknown machine '{downtime.machine_id}'"
                )
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
    elapsed_seconds: Optional[float] = None
