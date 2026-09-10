from fastapi import APIRouter

from makespan.solver.models import Job, Operation, ProblemSpec

router = APIRouter(prefix="/api/presets", tags=["presets"])

PRESETS: dict[str, ProblemSpec] = {
    "two-machine-demo": ProblemSpec(
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
    ),
    "three-machine-demo": ProblemSpec(
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
    ),
}


@router.get("", response_model=dict[str, ProblemSpec])
def list_presets() -> dict[str, ProblemSpec]:
    return PRESETS
