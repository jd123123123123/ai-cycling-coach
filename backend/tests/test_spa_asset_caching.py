"""The SPA's hashed assets must be cacheable forever.

`main` serves the built frontend itself, and `spa()` already carries the right
answer: `assets/*` gets `immutable`, everything else revalidates. This pins that
the answer is actually REACHED. A `StaticFiles` mount on the same prefix is
matched before the catch-all route, and a shadowed branch is a header nobody
ever sends — the browser then revalidates all ~30 chunks on every single load.

Runs in a SUBPROCESS because `FRONTEND_DIST` is read at import time and the
route table cannot be rebuilt in place (`importlib.reload` re-registers a 204
route and FastAPI refuses it).
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import textwrap

#: The app's own interpreter. `app.main` imports a FastAPI whose version the
#: system pytest environment does not have, so the probe runs where the app
#: actually runs rather than where the test does.
VENV_PY = pathlib.Path(__file__).resolve().parents[1] / ".venv" / "bin" / "python"

PROBE = textwrap.dedent(
    """
    import json, pathlib, sys
    from fastapi.testclient import TestClient
    sys.path.insert(0, ".")
    import app.main as main

    c = TestClient(main.app)
    asset = c.get("/assets/index-abc12345.js")
    index = c.get("/e/w3-today")
    print("RESULT" + json.dumps({
        "asset_status": asset.status_code,
        "asset_cache": asset.headers.get("cache-control", ""),
        "index_status": index.status_code,
        "index_cache": index.headers.get("cache-control", ""),
    }))
    """
)


def _serve(tmp_path) -> dict:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Ridr</title>")
    (tmp_path / "assets" / "index-abc12345.js").write_text("export const x=1\n")

    out = subprocess.run(
        [str(VENV_PY), "-c", PROBE],
        capture_output=True, text=True, timeout=180,
        env={"PATH": "/usr/bin:/bin", "PYTHONPATH": str(pathlib.Path(__file__).resolve().parents[1]), "HOME": "/tmp", "DEBUG": "true",
             "FRONTEND_DIST": str(tmp_path)},
    )
    line = next((l for l in out.stdout.splitlines() if l.startswith("RESULT")), None)
    assert line, f"probe did not report\nstdout:\n{out.stdout[-2000:]}\nstderr:\n{out.stderr[-2000:]}"
    return json.loads(line[len("RESULT"):])


import pytest

pytestmark = pytest.mark.skipif(
    not VENV_PY.is_file(), reason="backend venv not present; the probe needs the app's interpreter"
)


def test_hashed_assets_are_immutable(tmp_path):
    r = _serve(tmp_path)
    assert r["asset_status"] == 200
    assert "immutable" in r["asset_cache"], (
        f"hashed asset served without an immutable cache header: {r['asset_cache']!r} — "
        "the browser revalidates every chunk on every load"
    )
    assert "max-age=31536000" in r["asset_cache"]


def test_index_still_revalidates(tmp_path):
    r = _serve(tmp_path)
    assert r["index_status"] == 200
    assert "no-cache" in r["index_cache"]
