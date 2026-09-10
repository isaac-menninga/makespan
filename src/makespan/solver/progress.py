from dataclasses import dataclass
from typing import Callable, Optional

from ortools.sat.python import cp_model


@dataclass
class ProgressSample:
    objective: int
    best_bound: int
    elapsed_seconds: float


class ProgressCallback(cp_model.CpSolverSolutionCallback):
    def __init__(self, on_progress: Optional[Callable[["ProgressSample"], None]]):
        super().__init__()
        self._on_progress = on_progress
        self.samples: list[ProgressSample] = []

    def on_solution_callback(self) -> None:
        sample = ProgressSample(
            objective=int(self.ObjectiveValue()),
            best_bound=int(self.BestObjectiveBound()),
            elapsed_seconds=self.WallTime(),
        )
        self.samples.append(sample)
        if self._on_progress is not None:
            self._on_progress(sample)
