"""API отдаёт только свои маршруты: страницы UI ему не принадлежат."""
from fastapi.testclient import TestClient

from app.main import app

UI_PATHS = (
    "/",
    "/company/7702070139",
    "/old-prototype/",
    "/old-prototype/js/app.js",
    "/next",
    "/next/company/7702070139",
)


def test_api_does_not_serve_the_ui(app_pool):
    del app_pool
    with TestClient(app) as client:
        for path in UI_PATHS:
            response = client.get(path)
            assert response.status_code == 404, path
            assert response.headers["content-type"].startswith("application/json")
        health = client.get("/api/health")
        assert health.status_code == 200
        body = health.json()
        assert "web_mounted" not in body
        assert "web_dir" not in body
        assert body["status"] in {"ok", "degraded"}
        docs = client.get("/docs")
        assert docs.status_code == 200
        assert "text/html" in docs.headers["content-type"]
        spec = client.get("/openapi.json")
        assert spec.status_code == 200
        assert "openapi" in spec.json()
