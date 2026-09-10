from makespan.solver.models import Job, Operation, ProblemSpec
from makespan.solver.solve import solve


def test_solve_reports_progress_samples():
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
    samples = []

    outcome = solve(problem, time_limit_seconds=5, on_progress=samples.append)

    assert len(samples) >= 1
    assert samples[-1].objective == outcome.objective
    assert samples[-1].best_bound <= samples[-1].objective
