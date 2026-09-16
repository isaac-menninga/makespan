# Makespan

A job shop scheduling backend built on OR-Tools CP-SAT and FastAPI. It is
usable end-to-end via `curl`/`pytest` with no frontend: define machines,
jobs, and optional constraints (setup times, due dates, machine downtime
windows) as a problem, kick off a solve, and poll it until a schedule comes
back.

## Install

```
uv sync
```

## Run tests

```
uv run pytest
```

## Run the dev server

```
uv run uvicorn makespan.main:app --reload
```

or, via the console script wired up in `pyproject.toml`:

```
uv run makespan
```

By default the API stores data in a local SQLite file (`./makespan.db`).
Point it elsewhere (or at an in-memory/test database) with the
`MAKESPAN_DATABASE_URL` environment variable, e.g.:

```
MAKESPAN_DATABASE_URL=sqlite:///./custom.db uv run uvicorn makespan.main:app --reload
```

Once the server is running, FastAPI's auto-generated interactive docs are
available at `http://localhost:8000/docs` (Swagger UI) and
`http://localhost:8000/redoc`.

## API overview

| Method & path                       | Description                                             |
| ------------------------------------ | -------------------------------------------------------- |
| `GET /api/health`                    | Liveness check.                                          |
| `GET /api/presets`                   | List seeded demo problems.                               |
| `POST /api/problems`                 | Create a problem (machines, jobs, constraints).          |
| `GET /api/problems`                  | List problems.                                           |
| `GET /api/problems/{id}`             | Fetch a single problem.                                  |
| `PUT /api/problems/{id}`             | Replace a problem.                                       |
| `GET /api/problems/{id}/solves`      | List solves run against a problem.                       |
| `POST /api/solves`                   | Start a solve for a problem (returns immediately, `202`).|
| `GET /api/solves/{id}`               | Poll a solve's status, live progress, and final schedule. |

## Example: create a problem, solve it, and poll the result

Create a two-machine, two-job problem:

```bash
curl -s -X POST http://localhost:8000/api/problems \
  -H "Content-Type: application/json" \
  -d '{
        "name": "Demo",
        "machines": ["M1", "M2"],
        "jobs": [
          {"operations": [{"machine_id": "M1", "duration": 3}, {"machine_id": "M2", "duration": 2}]},
          {"operations": [{"machine_id": "M2", "duration": 4}, {"machine_id": "M1", "duration": 1}]}
        ]
      }'
```

This returns a JSON object with an `id`. Kick off a solve for it:

```bash
curl -s -X POST http://localhost:8000/api/solves \
  -H "Content-Type: application/json" \
  -d '{"problem_id": "<problem-id-from-above>", "time_limit_seconds": 10}'
```

This also returns an `id` (for the solve), with `status: "pending"`. Poll it
until it completes:

```bash
curl -s http://localhost:8000/api/solves/<solve-id-from-above>
```

While the solve is still running, this reports live progress (`status`,
`best_objective`, `best_bound`, `elapsed_seconds`) from the CP-SAT solver's
solution callback. Once finished, it returns the final `status`
(`completed`/`failed`), `best_objective`, and the full `schedule` (each
operation's assigned `start`/`end` time on its machine).
