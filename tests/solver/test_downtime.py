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
