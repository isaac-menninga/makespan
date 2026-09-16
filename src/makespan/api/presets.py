from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from makespan.api.problems import record_to_problem_out
from makespan.api.schemas import ProblemOut
from makespan.db.models import ProblemRecord
from makespan.db.seed import PRESET_IDS
from makespan.db.session import get_session

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("", response_model=list[ProblemOut])
def list_presets(session: Session = Depends(get_session)) -> list[ProblemOut]:
    records = session.exec(select(ProblemRecord).where(ProblemRecord.id.in_(PRESET_IDS))).all()
    records_by_id = {record.id: record for record in records}
    ordered = [records_by_id[preset_id] for preset_id in PRESET_IDS if preset_id in records_by_id]
    return [record_to_problem_out(record) for record in ordered]
