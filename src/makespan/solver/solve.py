from typing import Callable, Optional

from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome
from makespan.solver.progress import ProgressCallback, ProgressSample


def solve(
    problem: ProblemSpec,
    time_limit_seconds: int = 30,
    on_progress: Optional[Callable[[ProgressSample], None]] = None,
) -> SolveOutcome:
    model = cp_model.CpModel()

    total_duration = sum(op.duration for job in problem.jobs for op in job.operations)
    total_op_count = sum(len(job.operations) for job in problem.jobs)
    total_setup = sum(problem.constraints.setup_times.values()) * total_op_count
    horizon = total_duration + total_setup

    starts: dict[tuple[int, int], cp_model.IntVar] = {}
    ends: dict[tuple[int, int], cp_model.IntVar] = {}
    machine_intervals: dict[str, list[cp_model.IntervalVar]] = {m: [] for m in problem.machines}

    for job_index, job in enumerate(problem.jobs):
        for op_index, operation in enumerate(job.operations):
            start = model.NewIntVar(0, horizon, f"start_{job_index}_{op_index}")
            end = model.NewIntVar(0, horizon, f"end_{job_index}_{op_index}")
            model.NewIntervalVar(start, operation.duration, end, f"interval_{job_index}_{op_index}")
            starts[(job_index, op_index)] = start
            ends[(job_index, op_index)] = end

            setup = problem.constraints.setup_times.get(operation.machine_id, 0)
            padded_end = model.NewIntVar(0, horizon, f"padded_end_{job_index}_{op_index}")
            model.Add(padded_end == start + operation.duration + setup)
            padded_interval = model.NewIntervalVar(
                start, operation.duration + setup, padded_end, f"padded_{job_index}_{op_index}"
            )
            machine_intervals[operation.machine_id].append(padded_interval)

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
    callback = ProgressCallback(on_progress)
    status = solver.Solve(model, callback)

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
