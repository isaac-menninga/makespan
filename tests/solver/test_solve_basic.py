from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def _two_job_problem() -> ProblemSpec:
    # Job A: M1(3) -> M2(2). Job B: M2(4) -> M1(1).
    # M2's total load (2+4=6) lower-bounds the makespan at 6; a schedule achieving 6 exists,
    # so 6 is the known-optimal makespan for this instance.
    return ProblemSpec(
        machines=["M1", "M2"],
        jobs=[
            Job(operations=[Operation(machine_id="M1", duration=3), Operation(machine_id="M2", duration=2)]),
            Job(operations=[Operation(machine_id="M2", duration=4), Operation(machine_id="M1", duration=1)]),
        ],
    )


def test_solve_finds_known_optimal_makespan():
    outcome = solve(_two_job_problem(), time_limit_seconds=5)

    assert outcome.status == "optimal"
    assert outcome.objective == 6

    by_machine: dict[str, list[tuple[int, int]]] = {"M1": [], "M2": []}
    for op in outcome.schedule.operations:
        by_machine[op.machine_id].append((op.start, op.end))
    for intervals in by_machine.values():
        intervals.sort()
        for (_, end_a), (start_b, _) in zip(intervals, intervals[1:]):
            assert end_a <= start_b

    by_job: dict[int, list] = {0: [], 1: []}
    for op in outcome.schedule.operations:
        by_job[op.job_index].append(op)
    for ops in by_job.values():
        ops.sort(key=lambda o: o.operation_index)
        for earlier, later in zip(ops, ops[1:]):
            assert earlier.end <= later.start
