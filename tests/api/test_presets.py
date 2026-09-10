def test_list_presets_returns_known_presets(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    presets = response.json()
    assert "two-machine-demo" in presets
    assert presets["two-machine-demo"]["machines"] == ["M1", "M2"]
