from makespan.solver.models import Constraints, Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_setup_time_enforces_gap_between_operations_on_same_machine():
    # Two independent single-op jobs sharing M1, no ordering constraint between them.
    # Without setup time the minimum makespan is 2+2=4; with a mandatory 5-unit changeover
    # on M1 between any two operations, the minimum span becomes 2+5+2=9.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[
            Job(operations=[Operation(machine_id="M1", duration=2)]),
            Job(operations=[Operation(machine_id="M1", duration=2)]),
        ],
        constraints=Constraints(setup_times={"M1": 5}),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 9

    ops = sorted(outcome.schedule.operations, key=lambda o: o.start)
    assert ops[1].start - ops[0].end >= 5
