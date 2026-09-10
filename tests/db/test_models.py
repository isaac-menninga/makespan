from sqlmodel import Session, SQLModel, create_engine

from makespan.db.models import ProblemRecord, SolveRecord


def test_problem_record_round_trip(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        record = ProblemRecord(
            name="Demo",
            machines=["M1", "M2"],
            jobs=[{"operations": [{"machine_id": "M1", "duration": 3}]}],
            constraints={},
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        problem_id = record.id

    with Session(engine) as session:
        fetched = session.get(ProblemRecord, problem_id)

    assert fetched is not None
    assert fetched.machines == ["M1", "M2"]
    assert fetched.jobs[0]["operations"][0]["duration"] == 3


def test_solve_record_round_trip(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        problem = ProblemRecord(name="Demo", machines=["M1"], jobs=[], constraints={})
        session.add(problem)
        session.commit()
        session.refresh(problem)

        solve_record = SolveRecord(
            problem_id=problem.id, time_limit_seconds=30, objective_mode="makespan"
        )
        session.add(solve_record)
        session.commit()
        session.refresh(solve_record)
        solve_id = solve_record.id
        problem_id = problem.id

    with Session(engine) as session:
        fetched = session.get(SolveRecord, solve_id)

    assert fetched is not None
    assert fetched.status == "pending"
    assert fetched.problem_id == problem_id
