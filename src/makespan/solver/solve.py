from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome


def solve(problem: ProblemSpec, time_limit_seconds: int = 30) -> SolveOutcome:
    model = cp_model.CpModel()

    horizon = sum(op.duration for job in problem.jobs for op in job.operations)

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            interval = model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end
            machine_intervals[operation.machine_id].append(interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)
    model.Minimize(makespan)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    status = solver.Solve(model)

    return _outcome_from_solve(status, solver, starts, ends, problem)


def _outcome_from_solve(status, solver, starts, ends, problem: ProblemSpec) -> SolveOutcome:
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = Schedule(
            operations=[
                ScheduledOperation(
                    job_index=job_index,
                    operation_index=op_index,
                    machine_id=operation.machine_id,
                    start=solver.Value(starts[(job_index, op_index)]),
                    end=solver.Value(ends[(job_index, op_index)]),
                )
                for job_index, job in enumerate(problem.jobs)
                for op_index, operation in enumerate(job.operations)
            ]
        )
        return SolveOutcome(
            status="optimal" if status == cp_model.OPTIMAL else "feasible",
            objective=int(solver.ObjectiveValue()),
            best_bound=int(solver.BestObjectiveBound()),
            schedule=schedule,
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(status="infeasible", message="No feasible schedule exists for this problem.")

    return SolveOutcome(status="failed", message=f"Solver returned status {solver.StatusName(status)}.")
