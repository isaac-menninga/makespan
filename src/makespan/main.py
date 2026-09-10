from fastapi import FastAPI

app = FastAPI(title="Makespan")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
