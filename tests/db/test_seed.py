from sqlmodel import Session, SQLModel, create_engine, select

from makespan.db.models import ProblemRecord
from makespan.db.seed import PRESET_IDS, seed_presets


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
