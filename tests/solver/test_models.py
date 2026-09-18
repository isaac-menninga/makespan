import pytest
from pydantic import ValidationError

from makespan.solver.models import Job, Operation, ProblemSpec


def test_valid_problem_parses():
    problem = ProblemSpec(
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
    )
    assert len(problem.jobs) == 2
    assert problem.constraints.setup_times == {}


def test_unknown_machine_reference_raises():
    with pytest.raises(ValidationError):
        ProblemSpec(
            machines=["M1"],
            jobs=[Job(operations=[Operation(machine_id="M2", duration=3)])],
        )


def test_job_name_defaults_to_none():
    job = Job(operations=[Operation(machine_id="M1", duration=1)])
    assert job.name is None


def test_job_name_roundtrips_through_problem_spec():
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=1)], name="Rush order")],
    )
    assert problem.jobs[0].name == "Rush order"
