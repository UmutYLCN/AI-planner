"""Tests for the FastAPI app.

These never call OpenAI or YouTube: the roadmap pipeline is exercised only far enough to
prove the existing /api/plan contract still holds.
"""
import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402
from main import app, parse_frontend_origins  # noqa: E402

client = TestClient(app)


# ── /health ──────────────────────────────────────────────────────────────────

def test_health_still_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ── CORS configuration ───────────────────────────────────────────────────────

def test_origins_default_to_localhost_when_unset():
    assert parse_frontend_origins(None) == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert parse_frontend_origins("") == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert parse_frontend_origins("   ") == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_origins_parse_a_comma_separated_list():
    assert parse_frontend_origins(
        "https://ai-planner.vercel.app,https://preview.vercel.app"
    ) == ["https://ai-planner.vercel.app", "https://preview.vercel.app"]


def test_origins_tolerate_whitespace_and_trailing_slashes():
    assert parse_frontend_origins(
        " https://a.vercel.app/ , https://b.vercel.app "
    ) == ["https://a.vercel.app", "https://b.vercel.app"]


def test_origins_deduplicate_while_keeping_order():
    assert parse_frontend_origins(
        "https://a.app,https://b.app,https://a.app"
    ) == ["https://a.app", "https://b.app"]


def test_wildcard_origin_is_never_allowed():
    # Credentials are enabled, so "*" must never reach the middleware.
    assert "*" not in parse_frontend_origins("*")
    assert "*" not in parse_frontend_origins("https://a.app,*")
    assert parse_frontend_origins("https://a.app,*") == ["https://a.app"]


def test_wildcard_only_falls_back_to_dev_origins():
    assert parse_frontend_origins("*") == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_configured_origin_is_reflected_in_cors_headers(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGINS", "https://ai-planner.vercel.app")
    reloaded = importlib.reload(main)
    try:
        response = TestClient(reloaded.app).get(
            "/health", headers={"Origin": "https://ai-planner.vercel.app"}
        )
        assert response.headers["access-control-allow-origin"] == "https://ai-planner.vercel.app"

        blocked = TestClient(reloaded.app).get("/health", headers={"Origin": "https://evil.example"})
        assert "access-control-allow-origin" not in blocked.headers
    finally:
        monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
        importlib.reload(main)


# ── /api/plan ────────────────────────────────────────────────────────────────

def test_plan_rejects_a_request_with_no_materials():
    response = client.post("/api/plan", data={"youtube_urls": "[]"})
    assert response.status_code == 400
    assert response.json()["detail"] == "No valid materials provided."


def test_plan_still_accepts_the_existing_form_fields(monkeypatch):
    """The wizard posts files + youtube_urls + target_date + strict_mode + granularity."""
    captured = {}

    def fake_generate_roadmap(self, materials_summary, target_date=None, strict_mode=True, granularity="macro"):
        captured.update(
            target_date=target_date, strict_mode=strict_mode, granularity=granularity
        )
        return {"title": "Test Roadmap", "total_estimated_hours": 3, "resources": []}

    def fake_process_url(self, url):
        return [{"id": "abc12345678", "title": "Intro", "duration_minutes": 12}]

    monkeypatch.setattr(main.PlannerService, "generate_roadmap", fake_generate_roadmap)
    monkeypatch.setattr(main.YouTubeService, "process_url", fake_process_url)
    monkeypatch.setattr(main.TranscriptService, "get_transcript", staticmethod(lambda video_id, max_chars=5000: None))

    response = client.post(
        "/api/plan",
        data={
            "youtube_urls": '["https://youtube.com/watch?v=abc12345678"]',
            "target_date": "2026-09-30",
            "strict_mode": "false",
            "granularity": "micro",
        },
    )

    assert response.status_code == 200
    body = response.json()
    # The response shape the frontend depends on must not change.
    assert set(body) == {"roadmap", "materials_count", "semantic_groups", "target_date"}
    assert body["roadmap"]["title"] == "Test Roadmap"
    assert body["materials_count"] == 1
    assert body["target_date"] == "2026-09-30"
    assert captured == {"target_date": "2026-09-30", "strict_mode": False, "granularity": "micro"}


def test_plan_defaults_strict_mode_and_granularity(monkeypatch):
    captured = {}

    def fake_generate_roadmap(self, materials_summary, target_date=None, strict_mode=True, granularity="macro"):
        captured.update(strict_mode=strict_mode, granularity=granularity)
        return {"title": "T", "total_estimated_hours": 1, "resources": []}

    monkeypatch.setattr(main.PlannerService, "generate_roadmap", fake_generate_roadmap)
    monkeypatch.setattr(
        main.YouTubeService, "process_url",
        lambda self, url: [{"id": "abc12345678", "title": "Intro", "duration_minutes": 5}],
    )
    monkeypatch.setattr(main.TranscriptService, "get_transcript", staticmethod(lambda video_id, max_chars=5000: None))

    response = client.post("/api/plan", data={"youtube_urls": '["https://youtu.be/abc12345678"]'})

    assert response.status_code == 200
    assert captured == {"strict_mode": True, "granularity": "macro"}


def test_plan_surfaces_a_generation_failure_as_500(monkeypatch):
    def boom(self, *args, **kwargs):
        raise ValueError("OpenAI API Key is missing or invalid.")

    monkeypatch.setattr(main.PlannerService, "generate_roadmap", boom)
    monkeypatch.setattr(
        main.YouTubeService, "process_url",
        lambda self, url: [{"id": "abc12345678", "title": "Intro", "duration_minutes": 5}],
    )
    monkeypatch.setattr(main.TranscriptService, "get_transcript", staticmethod(lambda video_id, max_chars=5000: None))

    response = client.post("/api/plan", data={"youtube_urls": '["https://youtu.be/abc12345678"]'})
    assert response.status_code == 500
    assert "AI generation failed" in response.json()["detail"]


def test_backend_exposes_no_task_endpoints():
    """Tasks live in Firestore only — the backend must not grow a competing task store."""
    paths = {route.path for route in app.routes}
    assert paths == {
        "/health",
        "/api/plan",
        "/openapi.json",
        "/docs",
        "/docs/oauth2-redirect",
        "/redoc",
    }


@pytest.mark.parametrize("path", ["/api/tasks", "/tasks"])
def test_task_paths_are_not_served(path):
    assert client.get(path).status_code == 404
