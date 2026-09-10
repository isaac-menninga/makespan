import threading
from typing import Optional

from makespan.solver.progress import ProgressSample


class ProgressStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._samples: dict[str, ProgressSample] = {}

    def set(self, solve_id: str, sample: ProgressSample) -> None:
        with self._lock:
            self._samples[solve_id] = sample

    def get(self, solve_id: str) -> Optional[ProgressSample]:
        with self._lock:
            return self._samples.get(solve_id)

    def clear(self, solve_id: str) -> None:
        with self._lock:
            self._samples.pop(solve_id, None)


progress_store = ProgressStore()
