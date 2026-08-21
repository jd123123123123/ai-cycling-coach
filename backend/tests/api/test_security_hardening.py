"""Security-hardening tests: response headers, auth rate limiting, secrets guard.

These cover the middleware/limiter/config changes from the backend security
audit. They use TestClient against the real app (headers) and monkeypatch the
auth DB dependency (rate limiting) so no live database is required.
"""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


# ─── Security headers ───────────────────────────────────────────────────────


def test_security_headers_present_on_health(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    h = resp.headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["X-Frame-Options"] == "DENY"
    assert h["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=()" in h["Permissions-Policy"]
    assert "camera=()" in h["Permissions-Policy"]
    assert "microphone=()" in h["Permissions-Policy"]


def test_csp_allows_spa_assets(client):
    csp = client.get("/healthz").headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "img-src 'self' data:" in csp
    assert "'unsafe-inline'" in csp  # inline styles the React runtime injects
    assert "connect-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    # No inline/eval scripts in the bundle → script-src must stay strict.
    assert "unsafe-eval" not in csp


def test_csp_allows_the_basemap(client):
    """The map is the ride screen, and a policy that blocks its tiles fails
    silently: the route line still draws from our own API, so the page looks
    like a map with no tiles rather than a browser refusing to fetch them.
    Pinned per host, and pinned as a SET so a wildcard cannot creep in."""
    csp = client.get("/healthz").headers["Content-Security-Policy"]
    connect = next(d for d in csp.split("; ") if d.startswith("connect-src"))
    for host in (
        "https://styles.maptoolkit.org",   # the style document
        "https://tiles.maptoolkit.org",    # TileJSON + vector tiles
        "https://fonts.maptoolkit.org",    # glyphs — labels are blank without them
        "https://icons.maptoolkit.org",    # the sprite sheet
        "https://tiles.mapterhorn.com",    # terrain-RGB, fetched to read its pixels
    ):
        assert host in connect, f"the basemap cannot reach {host}"
    # MapLibre builds its tile worker from a blob it created itself.
    assert "worker-src 'self' blob:" in csp
    # Opening the policy is not the same as removing it.
    assert "*" not in connect


def test_hsts_only_on_https(client):
    # Plain http request (TestClient default) → no HSTS.
    assert "Strict-Transport-Security" not in client.get("/healthz").headers
    # Forwarded https (Railway proxy) → HSTS present.
    resp = client.get("/healthz", headers={"X-Forwarded-Proto": "https"})
    hsts = resp.headers["Strict-Transport-Security"]
    assert "max-age=63072000" in hsts
    assert "includeSubDomains" in hsts


# ─── Auth rate limiting ─────────────────────────────────────────────────────


def test_login_rate_limited_after_limit(client, monkeypatch):
    """After 10 login attempts/min/IP the 11th returns 429 (not 401)."""
    import app.api.auth as auth_mod
    from app.database import get_db

    # Fresh limiter state so other tests don't interfere.
    auth_mod._auth_request_log.clear()

    async def _fake_authenticate_user(db, username, password):
        return None  # always bad creds → 401 until the limiter trips

    monkeypatch.setattr(auth_mod, "authenticate_user", _fake_authenticate_user)

    async def _fake_db():
        yield None

    app.dependency_overrides[get_db] = _fake_db
    try:
        codes = [
            client.post(
                "/auth/login",
                data={"username": "a@b.com", "password": "x"},
            ).status_code
            for _ in range(11)
        ]
    finally:
        app.dependency_overrides.clear()
        auth_mod._auth_request_log.clear()

    assert codes[:10] == [401] * 10  # first 10 allowed through to auth (bad creds)
    assert codes[10] == 429  # 11th blocked by the limiter


def test_refresh_limit_higher_than_login(client, monkeypatch):
    """Refresh bucket (30/min) is independent from login and larger."""
    import app.api.auth as auth_mod

    auth_mod._auth_request_log.clear()
    try:
        # No cookie → 401 each time until the 30/min refresh limit trips.
        codes = [client.post("/auth/refresh").status_code for _ in range(31)]
    finally:
        auth_mod._auth_request_log.clear()

    assert codes[:30] == [401] * 30
    assert codes[30] == 429


# ─── Production secrets guard ───────────────────────────────────────────────


def test_config_guard_raises_on_default_secrets_in_prod(monkeypatch):
    """DEBUG=False + default JWT secrets → Settings() refuses to construct."""
    import app.config as config_mod

    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("JWT_SECRET_KEY", "change-me-in-production")
    monkeypatch.setenv("JWT_REFRESH_SECRET_KEY", "change-me-refresh-secret")
    # Don't read the on-disk .env (which carries real secrets).
    monkeypatch.setattr(config_mod.Settings, "model_config", {"case_sensitive": True})

    with pytest.raises(Exception) as excinfo:
        config_mod.Settings()
    assert "default secret" in str(excinfo.value).lower()


def test_config_guard_allows_defaults_in_debug(monkeypatch):
    """DEBUG=True keeps working on the shipped defaults (local/dev)."""
    import app.config as config_mod

    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("JWT_SECRET_KEY", "change-me-in-production")
    monkeypatch.setenv("JWT_REFRESH_SECRET_KEY", "change-me-refresh-secret")
    monkeypatch.setattr(config_mod.Settings, "model_config", {"case_sensitive": True})

    s = config_mod.Settings()
    assert s.DEBUG is True


def test_config_guard_allows_strong_secrets_in_prod(monkeypatch):
    import app.config as config_mod

    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("JWT_SECRET_KEY", "a-real-strong-secret-value-0123456789")
    monkeypatch.setenv("JWT_REFRESH_SECRET_KEY", "another-strong-secret-value-98765")
    monkeypatch.setattr(config_mod.Settings, "model_config", {"case_sensitive": True})

    s = config_mod.Settings()
    assert s.DEBUG is False
