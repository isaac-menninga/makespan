from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def _ft06() -> ProblemSpec:
    # Fisher & Thompson 6x6 (OR-Library instance "ft06"): 6 jobs, 6 machines.
    # Published optimal makespan is 55. Each row is one job's operations in
    # required sequence order, as (machine_index, duration) pairs.
    rows = [
        [(2, 1), (0, 3), (1, 6), (3, 7), (5, 3), (4, 6)],
        [(1, 8), (2, 5), (4, 10), (5, 10), (0, 10), (3, 4)],
        [(2, 5), (3, 4), (5, 8), (0, 9), (1, 1), (4, 7)],
        [(1, 5), (0, 5), (2, 5), (3, 3), (4, 8), (5, 9)],
        [(2, 9), (1, 3), (4, 5), (5, 4), (0, 3), (3, 1)],
        [(1, 3), (3, 3), (5, 9), (0, 10), (4, 4), (2, 1)],
    ]
    return ProblemSpec(
        machines=[f"M{i}" for i in range(6)],
        jobs=[
            Job(operations=[Operation(machine_id=f"M{m}", duration=d) for m, d in row])
            for row in rows
        ],
    )


def _la01() -> ProblemSpec:
    # Lawrence 10x5 (OR-Library instance "la01"): 10 jobs, 5 machines.
    # Published optimal makespan is 666.
    rows = [
        [(1, 21), (0, 53), (4, 95), (3, 55), (2, 34)],
        [(0, 21), (3, 52), (4, 16), (2, 26), (1, 71)],
        [(3, 39), (4, 98), (1, 42), (2, 31), (0, 12)],
        [(1, 77), (0, 55), (4, 79), (2, 66), (3, 77)],
        [(0, 83), (3, 34), (2, 64), (1, 19), (4, 37)],
        [(1, 54), (2, 43), (4, 79), (0, 92), (3, 62)],
        [(3, 69), (4, 77), (1, 87), (2, 87), (0, 93)],
        [(2, 38), (0, 60), (1, 41), (3, 24), (4, 83)],
        [(3, 17), (1, 49), (4, 25), (0, 44), (2, 98)],
        [(4, 77), (3, 79), (2, 43), (1, 75), (0, 96)],
    ]
    return ProblemSpec(
        machines=[f"M{i}" for i in range(5)],
        jobs=[
            Job(operations=[Operation(machine_id=f"M{m}", duration=d) for m, d in row])
            for row in rows
        ],
    )


def test_solve_ft06_reaches_published_optimal_makespan():
    outcome = solve(_ft06(), time_limit_seconds=30)

    assert outcome.status == "optimal"
    assert outcome.objective == 55


def test_solve_la01_reaches_published_optimal_makespan():
    outcome = solve(_la01(), time_limit_seconds=30)

    assert outcome.status == "optimal"
    assert outcome.objective == 666
