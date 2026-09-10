import time


def test_create_solve_runs_and_completes(client):
    problem_payload = {
        "name": "Demo",
        "machines": ["M1", "M2"],
        "jobs": [
            {"operations": [{"machine_id": "M1", "duration": 3}, {"machine_id": "M2", "duration": 2}]},
            {"operations": [{"machine_id": "M2", "duration": 4}, {"machine_id": "M1", "duration": 1}]},
        ],
    }
    problem = client.post("/api/problems", json=problem_payload).json()

    create_response = client.post(
        "/api/solves", json={"problem_id": problem["id"], "time_limit_seconds": 5}
    )
    assert create_response.status_code == 202
    solve_id = create_response.json()["id"]

    status = None
    for _ in range(50):
        status = client.get(f"/api/solves/{solve_id}").json()
        if status["status"] == "completed":
            break
        time.sleep(0.1)

    assert status["status"] == "completed"
    assert status["best_objective"] == 6
    assert status["schedule"] is not None


def test_create_solve_rejects_time_limit_above_cap(client):
    problem_payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 1}]}],
    }
    problem = client.post("/api/problems", json=problem_payload).json()

    response = client.post(
        "/api/solves", json={"problem_id": problem["id"], "time_limit_seconds": 120}
    )
    assert response.status_code == 422


def test_create_solve_for_unknown_problem_returns_404(client):
    response = client.post(
        "/api/solves", json={"problem_id": "does-not-exist", "time_limit_seconds": 5}
    )
    assert response.status_code == 404


def test_get_unknown_solve_returns_404(client):
    response = client.get("/api/solves/does-not-exist")
    assert response.status_code == 404
