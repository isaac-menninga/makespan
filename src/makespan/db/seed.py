from sqlmodel import Session

from makespan.db.models import ProblemRecord
from makespan.solver.models import Job, Operation, ProblemSpec

PRESET_TWO_MACHINE_DEMO_ID = "preset-two-machine-demo"
PRESET_THREE_MACHINE_DEMO_ID = "preset-three-machine-demo"
PRESET_FT06_ID = "preset-ft06"
PRESET_LA01_ID = "preset-la01"

PRESET_IDS: list[str] = [
    PRESET_TWO_MACHINE_DEMO_ID,
    PRESET_THREE_MACHINE_DEMO_ID,
    PRESET_FT06_ID,
    PRESET_LA01_ID,
]


def _two_machine_demo() -> ProblemSpec:
    return ProblemSpec(
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


def _three_machine_demo() -> ProblemSpec:
    return ProblemSpec(
        machines=["M1", "M2", "M3"],
        jobs=[
            Job(
                operations=[
                    Operation(machine_id="M1", duration=4),
                    Operation(machine_id="M2", duration=3),
                    Operation(machine_id="M3", duration=2),
                ]
            ),
            Job(
                operations=[
                    Operation(machine_id="M2", duration=5),
                    Operation(machine_id="M1", duration=2),
                    Operation(machine_id="M3", duration=3),
                ]
            ),
            Job(
                operations=[
                    Operation(machine_id="M3", duration=3),
                    Operation(machine_id="M2", duration=4),
                    Operation(machine_id="M1", duration=1),
                ]
            ),
        ],
    )


def _ft06() -> ProblemSpec:
    # Fisher & Thompson 6x6 (OR-Library instance "ft06"). Published optimal
    # makespan is 55 -- see tests/solver/test_benchmarks.py.
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
    # Lawrence 10x5 (OR-Library instance "la01"). Published optimal makespan
    # is 666 -- see tests/solver/test_benchmarks.py.
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


PRESET_CATALOG: list[tuple[str, str, ProblemSpec]] = [
    (PRESET_TWO_MACHINE_DEMO_ID, "Two-machine demo", _two_machine_demo()),
    (PRESET_THREE_MACHINE_DEMO_ID, "Three-machine demo", _three_machine_demo()),
    (PRESET_FT06_ID, "FT06 (6x6 benchmark, optimal makespan 55)", _ft06()),
    (PRESET_LA01_ID, "LA01 (10x5 benchmark, optimal makespan 666)", _la01()),
]


def seed_presets(session: Session) -> None:
    """Insert or refresh every preset Problem row from PRESET_CATALOG.

    Presets use fixed, well-known ids (see PRESET_IDS) rather than the
    random uuid4 ids regular Problem rows get, so this can run on every app
    startup without creating duplicates. Refreshing existing rows (rather
    than skipping them) means a preset that's been modified via the API, or
    a correction made to PRESET_CATALOG itself, is restored/applied on the
    next restart.
    """
    for preset_id, name, spec in PRESET_CATALOG:
        machines = spec.machines
        jobs = [job.model_dump() for job in spec.jobs]
        constraints = spec.constraints.model_dump()

        record = session.get(ProblemRecord, preset_id)
        if record is None:
            session.add(
                ProblemRecord(
                    id=preset_id, name=name, machines=machines, jobs=jobs, constraints=constraints
                )
            )
        else:
            record.name = name
            record.machines = machines
            record.jobs = jobs
            record.constraints = constraints
            session.add(record)
    session.commit()
