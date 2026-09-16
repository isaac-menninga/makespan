from typing import Callable, Optional

from ortools.sat.python import cp_model

from makespan.solver.models import ProblemSpec, Schedule, ScheduledOperation, SolveOutcome
from makespan.solver.progress import ProgressCallback, ProgressSample


def _merge_windows(windows: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Merge overlapping or adjacent (start, end) windows into their union.

    Two downtime windows on the same machine that overlap or touch would otherwise be
    posted as separate fixed intervals inside that machine's AddNoOverlap set, and those
    two *downtime* intervals would then conflict with each other, making the whole model
    spuriously infeasible. Coalescing them into disjoint windows first avoids that.
    """
    if not windows:
        return []
    ordered = sorted(windows)
    merged = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


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
    for downtime in problem.constraints.downtime_windows:
        horizon = max(horizon, downtime.end + total_duration + total_setup)
    horizon += 1

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

            # Setup time is modeled by padding every operation's occupancy of its machine
            # with an extra `setup` units of changeover time charged *after* the operation
            # -- this reserves that gap unconditionally, after every operation on that
            # machine (including the very last one), and between two consecutive
            # operations of the *same* job on the same machine too, not only between
            # operations belonging to different jobs. `NewIntervalVar` already posts the
            # constraint `padded_end == start + size`, so no separate `model.Add` is needed.
            setup = problem.constraints.setup_times.get(operation.machine_id, 0)
            padded_end = model.NewIntVar(0, horizon, f"padded_end_{job_index}_{op_index}")
            padded_interval = model.NewIntervalVar(
                start, operation.duration + setup, padded_end, f"padded_{job_index}_{op_index}"
            )
            machine_intervals[operation.machine_id].append(padded_interval)

            if op_index > 0:
                model.Add(start >= ends[(job_index, op_index - 1)])

    downtime_by_machine: dict[str, list[tuple[int, int]]] = {}
    for downtime in problem.constraints.downtime_windows:
        downtime_by_machine.setdefault(downtime.machine_id, []).append(
            (downtime.start, downtime.end)
        )

    for machine_id, windows in downtime_by_machine.items():
        for window_index, (window_start, window_end) in enumerate(_merge_windows(windows)):
            downtime_interval = model.NewIntervalVar(
                window_start,
                window_end - window_start,
                window_end,
                f"downtime_{machine_id}_{window_index}",
            )
            machine_intervals[machine_id].append(downtime_interval)

    for intervals in machine_intervals.values():
        model.AddNoOverlap(intervals)

    job_completion = [
        ends[(job_index, len(job.operations) - 1)] for job_index, job in enumerate(problem.jobs)
    ]
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, job_completion)

    objective_terms = [makespan]
    for due_date in problem.constraints.due_dates:
        tardiness = model.NewIntVar(0, horizon, f"tardiness_{due_date.job_index}")
        model.Add(tardiness >= job_completion[due_date.job_index] - due_date.due)
        objective_terms.append(due_date.weight * tardiness)
    model.Minimize(sum(objective_terms))

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
            elapsed_seconds=solver.WallTime(),
        )

    if status == cp_model.INFEASIBLE:
        return SolveOutcome(
            status="infeasible",
            message="No feasible schedule exists for this problem.",
            elapsed_seconds=solver.WallTime(),
        )

    return SolveOutcome(
        status="failed",
        message=f"Solver returned status {solver.StatusName(status)}.",
        elapsed_seconds=solver.WallTime(),
    )
