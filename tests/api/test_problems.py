def test_create_and_get_problem(client):
    payload = {
        "name": "Demo",
        "machines": ["M1", "M2"],
        "jobs": [
            {
                "operations": [
                    {"machine_id": "M1", "duration": 3},
                    {"machine_id": "M2", "duration": 2},
                ]
            },
        ],
    }
    create_response = client.post("/api/problems", json=payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Demo"
    assert "id" in created

    get_response = client.get(f"/api/problems/{created['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["machines"] == ["M1", "M2"]


def test_create_problem_rejects_unknown_machine_reference(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M2", "duration": 3}]}],
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_update_problem(client):
    payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 3}]}],
    }
    created = client.post("/api/problems", json=payload).json()

    updated_payload = {**payload, "name": "Renamed"}
    response = client.put(f"/api/problems/{created['id']}", json=updated_payload)
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


def test_get_unknown_problem_returns_404(client):
    response = client.get("/api/problems/does-not-exist")
    assert response.status_code == 404


def test_create_problem_rejects_empty_operations_list(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [{"operations": []}],
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_create_problem_rejects_empty_job_list(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [],
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_create_problem_rejects_negative_setup_time(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 3}]}],
        "constraints": {"setup_times": {"M1": -1}},
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_create_problem_rejects_downtime_window_end_before_start(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 3}]}],
        "constraints": {"downtime_windows": [{"machine_id": "M1", "start": 5, "end": 2}]},
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_create_problem_rejects_duplicate_due_date_job_index(client):
    payload = {
        "name": "Bad",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 3}]}],
        "constraints": {
            "due_dates": [
                {"job_index": 0, "due": 5, "weight": 1},
                {"job_index": 0, "due": 7, "weight": 2},
            ]
        },
    }
    response = client.post("/api/problems", json=payload)
    assert response.status_code == 422


def test_list_solves_for_problem(client):
    problem_payload = {
        "name": "Demo",
        "machines": ["M1"],
        "jobs": [{"operations": [{"machine_id": "M1", "duration": 1}]}],
    }
    problem = client.post("/api/problems", json=problem_payload).json()

    create_response = client.post(
        "/api/solves", json={"problem_id": problem["id"], "time_limit_seconds": 5}
    )
    assert create_response.status_code == 202
    solve_id = create_response.json()["id"]

    response = client.get(f"/api/problems/{problem['id']}/solves")
    assert response.status_code == 200
    solves = response.json()
    assert len(solves) == 1
    entry = solves[0]
    assert entry["id"] == solve_id
    assert entry["status"] in ("pending", "running", "completed", "failed")
    assert "best_objective" in entry
    assert "objective_mode" in entry
    assert "created_at" in entry


def test_list_solves_for_unknown_problem_returns_404(client):
    response = client.get("/api/problems/does-not-exist/solves")
    assert response.status_code == 404


def test_list_problems(client):
    client.post(
        "/api/problems",
        json={
            "name": "A",
            "machines": ["M1"],
            "jobs": [{"operations": [{"machine_id": "M1", "duration": 1}]}],
        },
    )
    response = client.get("/api/problems")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "A" in names
