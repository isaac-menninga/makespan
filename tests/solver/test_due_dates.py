from makespan.solver.models import Constraints, DueDate, Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_due_date_tardiness_included_in_objective():
    # Single job, single 5-unit operation, due at t=3. Starting at 0 is always optimal
    # (starting later only increases both makespan and tardiness), so finish=5, tardiness=2.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=5)])],
        constraints=Constraints(due_dates=[DueDate(job_index=0, due=3, weight=1)]),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    finish = outcome.schedule.operations[0].end
    assert finish == 5
    tardiness = max(0, finish - 3)
    assert tardiness == 2
    assert outcome.objective == finish + tardiness
