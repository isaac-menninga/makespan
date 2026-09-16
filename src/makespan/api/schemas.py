from datetime import UTC, datetime

from pydantic import BaseModel, field_serializer

from makespan.solver.models import ProblemSpec


def _as_utc(value: datetime) -> datetime:
    """Normalize a timestamp to a UTC-aware datetime before it is serialized.

    SQLite drops the tzinfo offset on round trip even when the column is declared
    timezone-aware, so values read back from the DB are naive datetimes that were always
    written as UTC. Treat naive values as UTC and normalize any aware value to UTC too, so
    every timestamp the API returns ends in an explicit UTC offset instead of looking like
    an unspecified local time.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class ProblemIn(ProblemSpec):
    name: str


class ProblemOut(ProblemIn):
    id: str
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> datetime:
        return _as_utc(value)


class ProblemSummary(BaseModel):
    id: str
    name: str
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> datetime:
        return _as_utc(value)


class SolveSummary(BaseModel):
    id: str
    status: str
    best_objective: int | None
    objective_mode: str
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> datetime:
        return _as_utc(value)
