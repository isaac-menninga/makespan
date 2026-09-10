from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from makespan.api.problems import router as problems_router
from makespan.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="Makespan", lifespan=lifespan)

app.include_router(problems_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
