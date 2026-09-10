from makespan.solver.models import Constraints, DowntimeWindow, Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_downtime_window_blocks_machine_availability():
    # Single 4-unit operation on M1, which is down from t=0 to t=3. The operation cannot
    # overlap [0, 3) at all, so the earliest feasible start is 3, giving makespan 7.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=4)])],
        constraints=Constraints(downtime_windows=[DowntimeWindow(machine_id="M1", start=0, end=3)]),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 7
    assert outcome.schedule.operations[0].start >= 3


def test_overlapping_downtime_windows_on_same_machine_are_merged():
    # Two overlapping downtime windows on M1: [0, 3) and [2, 5). These two downtime
    # intervals must not be treated as separate fixed intervals inside the same
    # AddNoOverlap set (they'd conflict with each other and make the model spuriously
    # infeasible) -- they should be merged into their union [0, 5), leaving M1 unavailable
    # until t=5. A single 2-unit operation on M1 can then only start at t=5, giving
    # makespan 7.
    problem = ProblemSpec(
        machines=["M1"],
        jobs=[Job(operations=[Operation(machine_id="M1", duration=2)])],
        constraints=Constraints(
            downtime_windows=[
                DowntimeWindow(machine_id="M1", start=0, end=3),
                DowntimeWindow(machine_id="M1", start=2, end=5),
            ]
        ),
    )

    outcome = solve(problem, time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 7
    assert outcome.schedule.operations[0].start == 5
