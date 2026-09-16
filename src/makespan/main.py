from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from sqlmodel import Session

from makespan.api.presets import router as presets_router
from makespan.api.problems import router as problems_router
from makespan.api.solves import router as solves_router
from makespan.db.seed import seed_presets
from makespan.db.session import engine, init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    with Session(engine) as session:
        seed_presets(session)
    yield


app = FastAPI(title="Makespan", lifespan=lifespan)

app.include_router(presets_router)
app.include_router(problems_router)
app.include_router(solves_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
