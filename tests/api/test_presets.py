def test_list_presets_returns_seeded_problem_rows(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    presets = response.json()

    names = {p["name"] for p in presets}
    assert "FT06 (6x6 benchmark, optimal makespan 55)" in names
    assert "LA01 (10x5 benchmark, optimal makespan 666)" in names

    ft06 = next(p for p in presets if p["name"].startswith("FT06"))
    assert len(ft06["machines"]) == 6
    assert len(ft06["jobs"]) == 6
    assert "id" in ft06
    assert "created_at" in ft06


def test_preset_is_fetchable_as_a_regular_problem(client):
    presets = client.get("/api/presets").json()
    ft06 = next(p for p in presets if p["name"].startswith("FT06"))

    response = client.get(f"/api/problems/{ft06['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == ft06["id"]
    assert body["machines"] == ft06["machines"]
    assert body["jobs"] == ft06["jobs"]
