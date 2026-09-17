import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from makespan.solver.models import ProblemSpec

FIXTURES_PATH = (
    Path(__file__).resolve().parent.parent / "fixtures" / "problem-validation-cases.json"
)
CASES = json.loads(FIXTURES_PATH.read_text())


@pytest.mark.parametrize("case", CASES, ids=[c["description"] for c in CASES])
def test_problem_spec_matches_fixture(case):
    if case["shouldBeValid"]:
        ProblemSpec(**case["problem"])
    else:
        with pytest.raises(ValidationError):
            ProblemSpec(**case["problem"])
