from sqlmodel import Session, SQLModel, create_engine, select

from makespan.db.models import ProblemRecord
from makespan.db.seed import (
    PRESET_CATALOG,
    PRESET_FT06_ID,
    PRESET_IDS,
    PRESET_LA01_ID,
    seed_presets,
)
from makespan.solver.solve import solve


def test_seed_presets_creates_expected_rows(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_presets(session)

    with Session(engine) as session:
        records = session.exec(select(ProblemRecord)).all()
        assert {r.id for r in records} == set(PRESET_IDS)

        ft06 = next(r for r in records if r.id == "preset-ft06")
        assert len(ft06.machines) == 6
        assert len(ft06.jobs) == 6


def test_seed_presets_is_idempotent(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_presets(session)
        seed_presets(session)

    with Session(engine) as session:
        records = session.exec(select(ProblemRecord)).all()
        assert len(records) == len(PRESET_IDS)


def test_seed_presets_repairs_a_modified_preset(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_presets(session)

    with Session(engine) as session:
        record = session.get(ProblemRecord, PRESET_FT06_ID)
        record.name = "corrupted"
        record.machines = ["X"]
        session.add(record)
        session.commit()

    with Session(engine) as session:
        seed_presets(session)

    with Session(engine) as session:
        repaired = session.get(ProblemRecord, PRESET_FT06_ID)
        assert repaired.name == "FT06 (6x6 benchmark, optimal makespan 55)"
        assert len(repaired.machines) == 6


def test_seeded_ft06_and_la01_still_match_published_optimal_makespan():
    catalog = {preset_id: spec for preset_id, _, spec in PRESET_CATALOG}

    ft06_outcome = solve(catalog[PRESET_FT06_ID], time_limit_seconds=30)
    assert ft06_outcome.status == "optimal"
    assert ft06_outcome.objective == 55

    la01_outcome = solve(catalog[PRESET_LA01_ID], time_limit_seconds=30)
    assert la01_outcome.status == "optimal"
    assert la01_outcome.objective == 666
