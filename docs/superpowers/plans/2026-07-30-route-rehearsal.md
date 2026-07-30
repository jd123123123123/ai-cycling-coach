# Route Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simulate any route against the athlete's own CP, W′, CdA and durability, and render a projected time range, per-climb target watts, the blow-up point and the fuelling demand on one scrubbable mobile surface.

**Architecture:** A new pure-Python package `backend/app/services/rehearsal/` composes services that already exist (`crew_tour` GPX parsing, `climb_companion` gradient→watts, `cda_estimate`'s power balance solved forward, `w_balance` W′ integration, `durability` fade). The simulator is written **array-first** over NumPy so one implementation serves both the single deterministic run and the 200-draw Monte Carlo band. The frontend adds one route, `/rehearse/:id`.

**Tech Stack:** FastAPI + Pydantic + SQLAlchemy + Alembic + NumPy (already a dependency, used by `critical_power.py`), pytest on the backend. React 19 + TypeScript + Vite + vitest + `motion` on the frontend.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-30-route-rehearsal-design.md`. Read it before Task 1.
- **Mobile-only priority.** Verify at 390×844. Desktop is a sanity check, never a gate.
- **German-first copy.** Every user-facing string ships `de` and `en` via the `de`/`locale` pattern already in each file.
- **Honest absence.** Where a number is unavailable render `—`. Never fabricate, never substitute a default that reads as real data. Never display a bare predicted time — always the range.
- **No new colour literals.** Use existing CSS vars (`--color-recovery`, `--color-amber`, `--color-muted`, `--color-ink`, `--color-ink-2`, `--color-rule`, `--color-surface-2`, …).
- **Bike-only.** Do not add sport branches.
- **One producer per number.** Do not copy a formula that already exists in a service — import it, or extend that service so both callers share one implementation.
- **Test suite must be green after every task.** Baseline at plan time: frontend 659 tests / 65 files; backend 2656 tests.
- **Frontend gates, run from `frontend/`:** `npx tsc -b --noEmit`, `npx vitest run`, `npx eslint <changed files>`, `npm run build`.
- **Backend gates, run from `backend/`:** `.venv/bin/python -m pytest`.
- **Do not deploy.** Deployment is a separate, explicit decision after review.
- **Never `git add -A` or `git add .`.** The working tree carries two untracked
  scratch files (`frontend/aura.html`, `frontend/src/auraprobe.tsx`) that must
  stay untracked. Stage the exact paths your task touched, and nothing else.

**Physics constants — use these exact values everywhere (they match `cda_estimate.py`'s own defaults so the forward and inverse solves never disagree):**

| Quantity | Value |
|---|---|
| `_G` gravity | `9.80665` |
| Crr | `0.005` |
| Air density (no weather) | `1.225` |
| Drivetrain efficiency | `0.97` |
| Bike mass added to rider | `8.5` kg |
| CdA fallback (when `estimate_cda` returns None) | `0.32` m² |
| Drafting multipliers on CdA | solo `1.00` · small_group `0.75` · bunch `0.65` |
| Descent speed cap | `22.0` m/s (~80 km/h) |

---

### Task 1: Full-resolution GPX track extraction

`crew_tour.parse_gpx` downsamples its `profile` to ≤120 points — far too coarse to simulate 150 m segments over a 138 km route. The raw points exist inside the function and are thrown away. Extract them without duplicating the parser.

**Files:**
- Modify: `backend/app/services/crew_tour.py`
- Test: `backend/tests/services/test_crew_tour_track.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```python
  @dataclass(frozen=True)
  class TrackPoint:
      lat: float
      lng: float
      elevation_m: float | None

  def parse_gpx_track(raw: str | bytes) -> list[TrackPoint]
  ```
  Task 2 consumes `parse_gpx_track`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/test_crew_tour_track.py`:

```python
"""parse_gpx_track — full-resolution points for the rehearsal simulator.

parse_gpx's profile is capped at 120 points, which is fine for a card-sized
elevation chart and useless for simulating 150 m segments over a 138 km route.
"""
from __future__ import annotations

import pytest

from app.services.crew_tour import parse_gpx_track

_GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="46.50" lon="11.80"><ele>1200.0</ele></trkpt>
    <trkpt lat="46.51" lon="11.81"><ele>1250.5</ele></trkpt>
    <trkpt lat="46.52" lon="11.82"><ele>1310.0</ele></trkpt>
  </trkseg></trk>
</gpx>"""

_GPX_NO_ELE = """<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="52.50" lon="13.40"/>
    <trkpt lat="52.51" lon="13.41"/>
  </trkseg></trk>
</gpx>"""


class TestParseGpxTrack:
    def test_returns_every_point_not_a_downsample(self):
        pts = parse_gpx_track(_GPX)
        assert len(pts) == 3
        assert pts[0].lat == pytest.approx(46.50)
        assert pts[0].lng == pytest.approx(11.80)
        assert pts[0].elevation_m == pytest.approx(1200.0)
        assert pts[-1].elevation_m == pytest.approx(1310.0)

    def test_elevation_is_none_when_the_file_carries_none(self):
        pts = parse_gpx_track(_GPX_NO_ELE)
        assert len(pts) == 2
        assert all(p.elevation_m is None for p in pts)

    def test_unparseable_input_raises_value_error(self):
        with pytest.raises(ValueError):
            parse_gpx_track("not a gpx file at all")

    def test_file_without_track_points_raises_value_error(self):
        empty = '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>'
        with pytest.raises(ValueError):
            parse_gpx_track(empty)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_crew_tour_track.py -q`
Expected: FAIL — `ImportError: cannot import name 'parse_gpx_track'`.

- [ ] **Step 3: Extract the point collection**

In `backend/app/services/crew_tour.py`, add the dataclass next to `ParsedTour`, and add the function **above** `parse_gpx`:

```python
@dataclass(frozen=True)
class TrackPoint:
    """One GPX point at full resolution. Elevation is None when the file has none."""
    lat: float
    lng: float
    elevation_m: float | None


def _parse_and_collect(raw: str | bytes):
    """(gpx, points) — parse ONCE and collect usable points. Raises ValueError.

    Returns the gpx object too, because parse_gpx still needs it for
    length_2d() and get_uphill_downhill(); parsing twice would be wasteful and
    could drift if the two calls ever disagreed.
    """
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        gpx = gpxpy.parse(raw)
    except Exception as exc:  # gpxpy raises several exception types
        raise ValueError(f"could not parse GPX: {exc}") from exc

    raw_points: list = []
    for track in gpx.tracks:
        for seg in track.segments:
            raw_points.extend(seg.points)
    if not raw_points:
        for route in gpx.routes:
            raw_points.extend(route.points)
    if not raw_points:
        raw_points = list(gpx.waypoints)

    geo = [p for p in raw_points if p.latitude is not None and p.longitude is not None]
    if not geo:
        raise ValueError("GPX file contains no track points")
    return gpx, geo


def parse_gpx_track(raw: str | bytes) -> list[TrackPoint]:
    """Full-resolution track points, for the rehearsal simulator.

    parse_gpx's `profile` is downsampled to ≤120 points — right for a card-sized
    elevation chart, far too coarse to simulate 150 m segments over a long route.
    Both functions read the SAME point sequence via _collect_geo_points, so a
    rehearsal can never describe a different road than the chart above it.
    """
    return [
        TrackPoint(
            lat=float(p.latitude),
            lng=float(p.longitude),
            elevation_m=float(p.elevation) if p.elevation is not None else None,
        )
        for p in _parse_and_collect(raw)[1]
    ]
```

- [ ] **Step 4: Point `parse_gpx` at the shared collector**

Inside `parse_gpx`, replace the inline decode/parse/collect block — from
`if isinstance(raw, bytes):` down to and including the
`raise ValueError("GPX file contains no track points")` line — with exactly:

```python
    gpx, geo_points = _parse_and_collect(raw)
```

Delete the now-unused `raw_points` local. Everything below (`coords`, distance,
elevation, profile, waypoints) is unchanged and still uses `gpx` and
`geo_points` under those same names, so nothing else in the function moves. The
file must end up with exactly one `gpxpy.parse` call.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_crew_tour_track.py tests/ -k crew_tour -q`
Expected: PASS, including every pre-existing `crew_tour` test.

- [ ] **Step 6: Full backend suite and commit**

```bash
cd backend && .venv/bin/python -m pytest -q
git add backend/app/services/crew_tour.py backend/tests/services/test_crew_tour_track.py
git commit -m "feat(rehearsal): full-resolution GPX track extraction

parse_gpx downsamples its elevation profile to 120 points, which is right
for a card-sized chart and useless for simulating 150 m segments over a
138 km route. parse_gpx_track returns every point. Both read the same
point sequence through one collector, so a rehearsal can never describe a
different road than the chart above it."
```

---

### Task 2: `RehearsalRoute` and the first two route sources

**Files:**
- Create: `backend/app/services/rehearsal/__init__.py`
- Create: `backend/app/services/rehearsal/route_source.py`
- Test: `backend/tests/services/rehearsal/test_route_source.py` (create, with `__init__.py` if the tests dir needs one — check `ls backend/tests/services/`)

**Interfaces:**
- Consumes: `parse_gpx_track`, `TrackPoint` (Task 1).
- Produces:
  ```python
  @dataclass(frozen=True)
  class RoutePoint:
      distance_m: float      # cumulative from the start
      elevation_m: float
      lat: float
      lng: float

  @dataclass(frozen=True)
  class RehearsalRoute:
      points: list[RoutePoint]
      total_distance_m: float
      total_ascent_m: float
      name: str | None
      ride_date: date | None   # gates weather; None → no wind applied

  class RouteUnusable(ValueError): ...

  def route_from_gpx(raw: str | bytes, *, name: str | None = None,
                     ride_date: date | None = None) -> RehearsalRoute
  def route_from_track(points: list[TrackPoint], *, name: str | None = None,
                       ride_date: date | None = None) -> RehearsalRoute
  ```
  Tasks 3, 9 and 12 consume these.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/rehearsal/test_route_source.py`:

```python
"""Route sources → one RehearsalRoute shape.

Everything downstream sees only RehearsalRoute, so adding a fifth source
later costs exactly one adapter and no simulator change.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.crew_tour import TrackPoint
from app.services.rehearsal.route_source import (
    RouteUnusable,
    route_from_gpx,
    route_from_track,
)

# ~111 m per 0.001° of latitude, so these three points are ~111 m apart.
_TRACK = [
    TrackPoint(lat=46.500, lng=11.800, elevation_m=1200.0),
    TrackPoint(lat=46.501, lng=11.800, elevation_m=1210.0),
    TrackPoint(lat=46.502, lng=11.800, elevation_m=1205.0),
]


class TestRouteFromTrack:
    def test_accumulates_distance_along_the_track(self):
        r = route_from_track(_TRACK, name="Test climb")
        assert r.points[0].distance_m == 0.0
        assert r.points[1].distance_m == pytest.approx(111.0, abs=3.0)
        assert r.points[2].distance_m == pytest.approx(222.0, abs=6.0)
        assert r.total_distance_m == pytest.approx(r.points[-1].distance_m)

    def test_counts_only_positive_elevation_as_ascent(self):
        # +10 m then -5 m → 10 m of ascent, not 15 and not 5.
        r = route_from_track(_TRACK)
        assert r.total_ascent_m == pytest.approx(10.0, abs=0.01)

    def test_carries_name_and_ride_date(self):
        r = route_from_track(_TRACK, name="Maratona", ride_date=date(2026, 7, 5))
        assert r.name == "Maratona"
        assert r.ride_date == date(2026, 7, 5)

    def test_rejects_a_track_with_no_elevation(self):
        # Many exports carry no <ele>. We refuse rather than invent terrain:
        # a fabricated flat route would produce a confident, wrong time.
        flat = [TrackPoint(lat=52.5, lng=13.4, elevation_m=None) for _ in range(3)]
        with pytest.raises(RouteUnusable, match="elevation"):
            route_from_track(flat)

    def test_rejects_a_track_too_short_to_simulate(self):
        with pytest.raises(RouteUnusable, match="short"):
            route_from_track(_TRACK[:1])


class TestRouteFromGpx:
    def test_parses_and_adapts(self):
        gpx = """<?xml version="1.0"?>
        <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
          <trk><trkseg>
            <trkpt lat="46.500" lon="11.800"><ele>1200</ele></trkpt>
            <trkpt lat="46.501" lon="11.800"><ele>1210</ele></trkpt>
            <trkpt lat="46.502" lon="11.800"><ele>1205</ele></trkpt>
          </trkseg></trk>
        </gpx>"""
        r = route_from_gpx(gpx, name="From file")
        assert len(r.points) == 3
        assert r.name == "From file"
        assert r.total_ascent_m == pytest.approx(10.0, abs=0.01)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/ -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.rehearsal'`.

- [ ] **Step 3: Write the module**

Create `backend/app/services/rehearsal/__init__.py` (empty file), then `backend/app/services/rehearsal/route_source.py`:

```python
"""Route sources → one RehearsalRoute.

Four adapters feed the simulator: an uploaded GPX, a crew event's stored tour,
a past activity's own track, and the athlete's target-event route. Everything
downstream sees ONLY RehearsalRoute, so a fifth source later costs one adapter
and no simulator change.

Refusals live here, not in the simulator: a route with no elevation, or one too
short to say anything about, is rejected at the door. Inventing flat terrain
would produce a confident, wrong time — the exact trust wound the strategy doc
warns about.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.climb_companion import haversine_m
from app.services.crew_tour import TrackPoint, parse_gpx_track

# Below this, gradient noise dominates and there is nothing to simulate.
MIN_ROUTE_DISTANCE_M = 500.0


class RouteUnusable(ValueError):
    """The route cannot be simulated honestly. Message is user-facing."""


@dataclass(frozen=True)
class RoutePoint:
    distance_m: float
    elevation_m: float
    lat: float
    lng: float


@dataclass(frozen=True)
class RehearsalRoute:
    points: list[RoutePoint]
    total_distance_m: float
    total_ascent_m: float
    name: str | None
    #: Only a dated route can carry weather (§6 of the spec).
    ride_date: date | None


def route_from_track(
    points: list[TrackPoint],
    *,
    name: str | None = None,
    ride_date: date | None = None,
) -> RehearsalRoute:
    """Adapt full-resolution track points into a RehearsalRoute."""
    if len(points) < 2:
        raise RouteUnusable("route is too short to simulate")
    if any(p.elevation_m is None for p in points):
        raise RouteUnusable(
            "route has no elevation data — a rehearsal needs the terrain"
        )

    out: list[RoutePoint] = []
    cumulative = 0.0
    ascent = 0.0
    prev: TrackPoint | None = None
    for p in points:
        if prev is not None:
            cumulative += haversine_m(prev.lat, prev.lng, p.lat, p.lng)
            gain = float(p.elevation_m) - float(prev.elevation_m)
            if gain > 0:
                ascent += gain
        out.append(
            RoutePoint(
                distance_m=cumulative,
                elevation_m=float(p.elevation_m),
                lat=p.lat,
                lng=p.lng,
            )
        )
        prev = p

    if cumulative < MIN_ROUTE_DISTANCE_M:
        raise RouteUnusable("route is too short to simulate")

    return RehearsalRoute(
        points=out,
        total_distance_m=cumulative,
        total_ascent_m=ascent,
        name=name,
        ride_date=ride_date,
    )


def route_from_gpx(
    raw: str | bytes,
    *,
    name: str | None = None,
    ride_date: date | None = None,
) -> RehearsalRoute:
    """Uploaded GPX → RehearsalRoute. Reuses crew_tour's parser, never a second one."""
    return route_from_track(parse_gpx_track(raw), name=name, ride_date=ride_date)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/ -q`
Expected: PASS, all seven cases. If `MIN_ROUTE_DISTANCE_M` makes the 222 m fixture fail the *first* three tests, lower the constant to `200.0` and update the "too short" test to use a 2-point 111 m track — do not weaken the refusal to nothing.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rehearsal/ backend/tests/services/rehearsal/
git commit -m "feat(rehearsal): RehearsalRoute and the GPX source

One shape for every route source, so the simulator never learns where a
route came from. Refusals live at the door: no elevation, or too short to
say anything about, is rejected rather than simulated -- inventing flat
terrain would produce a confident, wrong time."
```

---

### Task 3: Segments, gradients and bearings

**Files:**
- Create: `backend/app/services/rehearsal/route_profile.py`
- Test: `backend/tests/services/rehearsal/test_route_profile.py`

**Interfaces:**
- Consumes: `RehearsalRoute`, `RoutePoint` (Task 2).
- Produces:
  ```python
  SEGMENT_LENGTH_M = 150.0

  @dataclass(frozen=True)
  class Segment:
      start_m: float
      length_m: float
      gradient_pct: float
      bearing_deg: float
      elevation_m: float      # at the segment start
      climb_id: int | None

  @dataclass(frozen=True)
  class Climb:
      climb_id: int
      start_m: float
      end_m: float
      length_m: float
      elev_gain_m: float
      avg_grade_pct: float

  def build_segments(route: RehearsalRoute, segment_length_m: float = SEGMENT_LENGTH_M) -> list[Segment]
  def detect_climbs(segments: list[Segment]) -> list[Climb]   # mutates nothing; returns climbs
  def assign_climbs(segments: list[Segment], climbs: list[Climb]) -> list[Segment]
  ```
  Tasks 5, 6, 9 and 10 consume these.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/rehearsal/test_route_profile.py`:

```python
"""Route → fixed-length segments carrying gradient and bearing.

Bearing exists so wind can be resolved per segment (Task 7); gradient drives
the target watts (Task 5). Both come from the same resampling pass so they can
never describe different stretches of road.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.route_profile import (
    build_segments,
    detect_climbs,
    assign_climbs,
)
from app.services.rehearsal.route_source import RehearsalRoute, RoutePoint


def _straight_route(gain_per_km: float, length_m: float = 3000.0) -> RehearsalRoute:
    """A due-north route climbing at a constant rate."""
    pts: list[RoutePoint] = []
    step = 100.0
    n = int(length_m / step) + 1
    for i in range(n):
        d = i * step
        pts.append(
            RoutePoint(
                distance_m=d,
                elevation_m=1000.0 + gain_per_km * (d / 1000.0),
                lat=46.0 + (d / 111_320.0),   # ~111.32 km per degree of latitude
                lng=11.0,
            )
        )
    return RehearsalRoute(
        points=pts, total_distance_m=length_m,
        total_ascent_m=max(0.0, gain_per_km * length_m / 1000.0),
        name=None, ride_date=None,
    )


class TestBuildSegments:
    def test_covers_the_route_at_the_requested_resolution(self):
        segs = build_segments(_straight_route(80.0), segment_length_m=150.0)
        assert len(segs) == pytest.approx(20, abs=1)   # 3000 m / 150 m
        assert segs[0].start_m == 0.0
        assert segs[-1].start_m + segs[-1].length_m == pytest.approx(3000.0, abs=150.0)

    def test_gradient_matches_the_terrain(self):
        # 80 m per km == 8 %.
        segs = build_segments(_straight_route(80.0))
        mid = segs[len(segs) // 2]
        assert mid.gradient_pct == pytest.approx(8.0, abs=0.5)

    def test_descent_is_negative(self):
        segs = build_segments(_straight_route(-60.0))
        assert segs[len(segs) // 2].gradient_pct == pytest.approx(-6.0, abs=0.5)

    def test_bearing_is_north_for_a_northbound_route(self):
        segs = build_segments(_straight_route(80.0))
        assert segs[0].bearing_deg == pytest.approx(0.0, abs=5.0)


class TestClimbs:
    def test_finds_a_sustained_climb(self):
        segs = build_segments(_straight_route(80.0, length_m=6000.0))
        climbs = detect_climbs(segs)
        assert len(climbs) == 1
        assert climbs[0].elev_gain_m == pytest.approx(480.0, rel=0.1)
        assert climbs[0].avg_grade_pct == pytest.approx(8.0, abs=0.5)

    def test_a_flat_route_has_no_climbs(self):
        assert detect_climbs(build_segments(_straight_route(2.0))) == []

    def test_assign_tags_segments_inside_the_climb(self):
        segs = build_segments(_straight_route(80.0, length_m=6000.0))
        climbs = detect_climbs(segs)
        tagged = assign_climbs(segs, climbs)
        assert any(s.climb_id == climbs[0].climb_id for s in tagged)
        assert len(tagged) == len(segs)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_route_profile.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `backend/app/services/rehearsal/route_profile.py`:

```python
"""Route → fixed-length segments carrying gradient and bearing, grouped into climbs.

One resampling pass produces both gradient and bearing, so the wind projection
and the power target can never describe different stretches of road.

Climb detection here is intentionally simpler than services/climbing_analysis.py:
that module detects climbs in a RIDDEN activity from time-series streams, while
this works on a route with no time dimension at all. Same thresholds, different
input — hence a separate, tiny implementation rather than a forced reuse.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from app.services.climb_companion import bearing_deg
from app.services.rehearsal.route_source import RehearsalRoute

SEGMENT_LENGTH_M = 150.0

# A climb is a run of segments averaging >= this gradient, long enough to matter.
CLIMB_MIN_GRADE_PCT = 3.0
CLIMB_MIN_LENGTH_M = 500.0
CLIMB_MIN_GAIN_M = 30.0
# A dip below the threshold shorter than this does not end the climb.
CLIMB_BRIDGE_M = 300.0


@dataclass(frozen=True)
class Segment:
    start_m: float
    length_m: float
    gradient_pct: float
    bearing_deg: float
    elevation_m: float
    climb_id: int | None = None


@dataclass(frozen=True)
class Climb:
    climb_id: int
    start_m: float
    end_m: float
    length_m: float
    elev_gain_m: float
    avg_grade_pct: float


def _interpolate(route: RehearsalRoute, target_m: float) -> tuple[float, float, float]:
    """(elevation, lat, lng) at a distance along the route, linearly interpolated."""
    pts = route.points
    lo, hi = 0, len(pts) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if pts[mid].distance_m < target_m:
            lo = mid + 1
        else:
            hi = mid
    i = max(1, lo)
    a, b = pts[i - 1], pts[i]
    span = b.distance_m - a.distance_m
    t = 0.0 if span <= 0 else (target_m - a.distance_m) / span
    t = min(1.0, max(0.0, t))
    return (
        a.elevation_m + (b.elevation_m - a.elevation_m) * t,
        a.lat + (b.lat - a.lat) * t,
        a.lng + (b.lng - a.lng) * t,
    )


def build_segments(
    route: RehearsalRoute, segment_length_m: float = SEGMENT_LENGTH_M
) -> list[Segment]:
    """Resample the route into fixed-length segments with gradient and bearing."""
    total = route.total_distance_m
    out: list[Segment] = []
    start = 0.0
    while start < total - 1e-6:
        length = min(segment_length_m, total - start)
        e0, lat0, lng0 = _interpolate(route, start)
        e1, lat1, lng1 = _interpolate(route, start + length)
        rise = e1 - e0
        out.append(
            Segment(
                start_m=start,
                length_m=length,
                gradient_pct=(rise / length) * 100.0 if length > 0 else 0.0,
                bearing_deg=bearing_deg(lat0, lng0, lat1, lng1),
                elevation_m=e0,
            )
        )
        start += length
    return out


def detect_climbs(segments: list[Segment]) -> list[Climb]:
    """Runs of climbing segments long enough and steep enough to name."""
    climbs: list[Climb] = []
    run: list[Segment] = []
    bridge_m = 0.0

    def close_run() -> None:
        nonlocal run, bridge_m
        if run:
            length = sum(s.length_m for s in run)
            gain = sum((s.gradient_pct / 100.0) * s.length_m for s in run)
            if length >= CLIMB_MIN_LENGTH_M and gain >= CLIMB_MIN_GAIN_M:
                climbs.append(
                    Climb(
                        climb_id=len(climbs) + 1,
                        start_m=run[0].start_m,
                        end_m=run[-1].start_m + run[-1].length_m,
                        length_m=length,
                        elev_gain_m=gain,
                        avg_grade_pct=(gain / length) * 100.0 if length else 0.0,
                    )
                )
        run = []
        bridge_m = 0.0

    for seg in segments:
        if seg.gradient_pct >= CLIMB_MIN_GRADE_PCT:
            run.append(seg)
            bridge_m = 0.0
        elif run:
            # A short dip is a false flat inside the climb, not the end of it.
            bridge_m += seg.length_m
            if bridge_m > CLIMB_BRIDGE_M:
                close_run()
            else:
                run.append(seg)
        # else: not climbing and no open run — nothing to do.
    close_run()
    return climbs


def assign_climbs(segments: list[Segment], climbs: list[Climb]) -> list[Segment]:
    """Return segments tagged with the climb they belong to (None outside climbs)."""
    out: list[Segment] = []
    for seg in segments:
        mid = seg.start_m + seg.length_m / 2.0
        cid = next(
            (c.climb_id for c in climbs if c.start_m <= mid < c.end_m), None
        )
        out.append(replace(seg, climb_id=cid))
    return out
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_route_profile.py -q`
Expected: PASS, all seven cases.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rehearsal/route_profile.py backend/tests/services/rehearsal/test_route_profile.py
git commit -m "feat(rehearsal): segments, gradients, bearings and climbs

One resampling pass yields both gradient and bearing, so the wind
projection and the power target can never describe different stretches of
road. Climb detection is deliberately its own small implementation:
climbing_analysis reads a RIDDEN activity's time-series streams, and a
route has no time dimension to read."
```

---

### Task 4: The rider model

**Files:**
- Create: `backend/app/services/rehearsal/rider_model.py`
- Test: `backend/tests/services/rehearsal/test_rider_model.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```python
  BIKE_MASS_KG = 8.5
  CDA_FALLBACK_M2 = 0.32
  DEFAULT_CRR = 0.005

  @dataclass(frozen=True)
  class RiderModel:
      cp_watts: float | None
      w_prime_j: float | None
      mass_kg: float | None
      cda_m2: float | None
      cda_is_default: bool
      crr: float
      durability_drop_pct: float    # 0.0 when unmeasured — no fade invented

      @property
      def can_predict_time(self) -> bool

  def build_rider_model(*, cp_watts, w_prime_j, weight_kg, cda_m2,
                        durability_drop_pct) -> RiderModel
  def available_cp(model: RiderModel, kj_done: float) -> float
  ```
  Tasks 5, 6, 8, 9 consume these.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/rehearsal/test_rider_model.py`:

```python
"""The athlete's physical inputs, and what happens when they are missing.

Nullability drives the refusals in the spec (§6) rather than being silently
defaulted: no CP or no body weight means no predicted time at all.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import (
    CDA_FALLBACK_M2,
    BIKE_MASS_KG,
    available_cp,
    build_rider_model,
)


def _full(**over):
    kwargs = dict(
        cp_watts=250.0, w_prime_j=20000.0, weight_kg=72.0,
        cda_m2=0.30, durability_drop_pct=6.0,
    )
    kwargs.update(over)
    return build_rider_model(**kwargs)


class TestBuildRiderModel:
    def test_adds_bike_mass_to_rider_mass(self):
        assert _full().mass_kg == pytest.approx(72.0 + BIKE_MASS_KG)

    def test_uses_the_measured_cda_when_there_is_one(self):
        m = _full()
        assert m.cda_m2 == pytest.approx(0.30)
        assert m.cda_is_default is False

    def test_falls_back_to_a_default_cda_and_says_so(self):
        m = _full(cda_m2=None)
        assert m.cda_m2 == pytest.approx(CDA_FALLBACK_M2)
        assert m.cda_is_default is True

    def test_cannot_predict_without_cp(self):
        assert _full(cp_watts=None).can_predict_time is False

    def test_cannot_predict_without_body_weight(self):
        assert _full(weight_kg=None).can_predict_time is False

    def test_can_predict_with_cp_and_weight(self):
        assert _full().can_predict_time is True


class TestAvailableCp:
    def test_full_cp_when_fresh(self):
        assert available_cp(_full(), 0.0) == pytest.approx(250.0)

    def test_fades_as_work_accumulates(self):
        m = _full(durability_drop_pct=6.0)
        late = available_cp(m, 2500.0)
        assert late < 250.0
        # The measured drop is the drop at the measurement threshold, not a
        # licence to fade without limit.
        assert late > 250.0 * 0.85

    def test_never_fades_when_durability_was_never_measured(self):
        m = _full(durability_drop_pct=0.0)
        assert available_cp(m, 4000.0) == pytest.approx(250.0)

    def test_fade_is_monotonic(self):
        m = _full()
        assert available_cp(m, 3000.0) < available_cp(m, 1000.0) <= available_cp(m, 0.0)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_rider_model.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `backend/app/services/rehearsal/rider_model.py`:

```python
"""The athlete's physical inputs to a rehearsal.

Every field is nullable, and nullability DRIVES the refusals (spec §6) rather
than being silently defaulted: without CP or body weight there is no honest
prediction to make, and the surface says so instead of guessing.

The one exception is CdA, which falls back to a stated default and flags
itself, because a plausible aero number with a widened band is more useful
than refusing an otherwise-complete rehearsal.
"""
from __future__ import annotations

from dataclasses import dataclass

#: Road bike with pedals and bottles. A profile field can supersede this later.
BIKE_MASS_KG = 8.5
#: Hoods position, average rider. Only used when estimate_cda() returns None.
CDA_FALLBACK_M2 = 0.32
#: Matches cda_estimate.py's own default, so forward and inverse solves agree.
DEFAULT_CRR = 0.005

#: durability_drop measures the fall in best power AFTER this much work.
DURABILITY_REFERENCE_KJ = 2000.0
#: Never fade further than this, however bad the measured drop was — beyond the
#: measured range we are extrapolating, and extrapolation should be timid.
MAX_FADE_FRACTION = 0.12


@dataclass(frozen=True)
class RiderModel:
    cp_watts: float | None
    w_prime_j: float | None
    mass_kg: float | None
    cda_m2: float | None
    cda_is_default: bool
    crr: float
    #: From services/durability.durability_drop; 0.0 when never measured.
    durability_drop_pct: float

    @property
    def can_predict_time(self) -> bool:
        """A time needs CP and mass. Everything else has an honest fallback."""
        return (
            self.cp_watts is not None
            and self.cp_watts > 0
            and self.mass_kg is not None
            and self.mass_kg > 0
        )


def build_rider_model(
    *,
    cp_watts: float | None,
    w_prime_j: float | None,
    weight_kg: float | None,
    cda_m2: float | None,
    durability_drop_pct: float,
) -> RiderModel:
    return RiderModel(
        cp_watts=cp_watts,
        w_prime_j=w_prime_j,
        mass_kg=(weight_kg + BIKE_MASS_KG) if weight_kg else None,
        cda_m2=cda_m2 if cda_m2 else CDA_FALLBACK_M2,
        cda_is_default=not cda_m2,
        crr=DEFAULT_CRR,
        durability_drop_pct=max(0.0, durability_drop_pct),
    )


def available_cp(model: RiderModel, kj_done: float) -> float:
    """CP still available after `kj_done` of work.

    This is the effect no HR-based app can model: the same climb ridden at km
    120 is slower than at km 20. The fade is anchored on the athlete's OWN
    measured durability drop, scaled linearly to the work done and capped —
    past the measured range we are extrapolating and should be timid about it.
    """
    if model.cp_watts is None:
        return 0.0
    if model.durability_drop_pct <= 0 or kj_done <= 0:
        return model.cp_watts
    fade = (model.durability_drop_pct / 100.0) * (kj_done / DURABILITY_REFERENCE_KJ)
    return model.cp_watts * (1.0 - min(MAX_FADE_FRACTION, fade))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_rider_model.py -q`
Expected: PASS, all ten cases.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rehearsal/rider_model.py backend/tests/services/rehearsal/test_rider_model.py
git commit -m "feat(rehearsal): the rider model, and the honest refusals

Nullability drives behaviour: no CP or no body weight means no predicted
time, which the surface states rather than guesses around. CdA is the one
field with a fallback, because a stated default with a wider band beats
refusing an otherwise-complete rehearsal.

available_cp() is the effect no HR-based app can model -- the same climb
at km 120 is slower than at km 20 -- anchored on the athlete's own
measured durability drop and capped, because past the measured range we
are extrapolating."
```

---

### Task 5: The forward power balance — watts to speed

The core physics. `cda_estimate.py` inverts this equation to get CdA from speed; we solve it forward to get speed from watts. Written array-first over NumPy so Task 8's Monte Carlo runs the same code.

**Files:**
- Create: `backend/app/services/rehearsal/physics.py`
- Test: `backend/tests/services/rehearsal/test_physics.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```python
  G = 9.80665
  DRIVETRAIN_EFF = 0.97
  DESCENT_SPEED_CAP_MS = 22.0

  def speed_for_power(power_w, gradient_pct, mass_kg, cda_m2, crr,
                      air_density=1.225, headwind_ms=0.0,
                      drivetrain_eff=DRIVETRAIN_EFF) -> np.ndarray
  ```
  Every argument accepts a scalar or a NumPy array; the return is always an
  array (use `float(result)` for a scalar caller). Tasks 6, 7, 8 consume it.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/rehearsal/test_physics.py`:

```python
"""Forward power balance: watts + terrain + air → speed.

cda_estimate.py inverts this same equation to get CdA out of a ridden file;
this solves it forward. The two MUST agree on their constants or a rehearsal
would contradict the ride it was calibrated from.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.rehearsal.physics import speed_for_power

_M = 80.0      # rider + bike
_CDA = 0.30
_CRR = 0.005


def _v(power, gradient, **kw) -> float:
    return float(speed_for_power(power, gradient, _M, _CDA, _CRR, **kw))


class TestSpeedForPower:
    def test_flat_is_faster_than_climbing_at_equal_watts(self):
        assert _v(250, 0.0) > _v(250, 8.0)

    def test_more_watts_is_faster(self):
        assert _v(300, 5.0) > _v(200, 5.0)

    def test_headwind_is_slower_than_tailwind(self):
        assert _v(250, 0.0, headwind_ms=5.0) < _v(250, 0.0, headwind_ms=-5.0)

    def test_a_plausible_flat_speed(self):
        # 250 W on the flat for an 80 kg system: roughly 10-12 m/s (36-43 km/h).
        assert 9.0 < _v(250, 0.0) < 13.0

    def test_a_plausible_climbing_speed(self):
        # 250 W up 8 % for 80 kg: gravity alone is ~m*g*sin(θ)*v, so ~4 m/s.
        assert 3.0 < _v(250, 8.0) < 5.5

    def test_descents_are_capped(self):
        # Freewheeling down 10 % must not return an implausible speed.
        assert _v(100, -10.0) <= 22.0

    def test_zero_power_on_the_flat_is_not_moving(self):
        # A rider producing nothing on the flat does not roll forever.
        assert _v(0, 0.0) == pytest.approx(0.0, abs=0.2)

    def test_vectorises_over_arrays(self):
        out = speed_for_power(
            np.array([200.0, 250.0, 300.0]), 5.0, _M, _CDA, _CRR
        )
        assert out.shape == (3,)
        assert out[0] < out[1] < out[2]

    def test_broadcasts_rider_arrays_against_a_scalar_segment(self):
        # Task 8 runs N Monte Carlo riders through ONE segment at a time.
        out = speed_for_power(
            250.0, 6.0, np.array([78.0, 80.0, 82.0]), _CDA, _CRR
        )
        assert out.shape == (3,)
        assert out[0] > out[2]   # lighter is faster uphill
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_physics.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `backend/app/services/rehearsal/physics.py`:

```python
"""The cycling power balance, solved FORWARD (watts → speed).

services/cda_estimate.py inverts this exact equation to recover CdA from a
ridden file. This module solves the same equation the other way so a rehearsal
and the ride it was calibrated from can never disagree about the physics — the
constants below are deliberately identical to that module's defaults.

    P·η  =  m·g·sin θ·v  +  Crr·m·g·cos θ·v  +  ½·ρ·CdA·(v + w)|v + w|·v

Aero force uses the APPARENT speed (v + headwind) squared, while the power it
costs is that force times GROUND speed — using apparent speed for both is the
classic error and would make headwinds cost too much.

The right-hand side rises monotonically with v, so a bisection solve is exact
enough and needs no solver library. Everything is written array-first: pass
scalars for one rider, arrays for Task 8's Monte Carlo draws, and NumPy
broadcasting handles the rest.
"""
from __future__ import annotations

import numpy as np

G = 9.80665
DRIVETRAIN_EFF = 0.97
#: No rehearsal should predict a descent faster than this. Real riders brake.
DESCENT_SPEED_CAP_MS = 22.0

_BISECTION_ITERS = 60


def _power_required(
    v: np.ndarray,
    sin_t: np.ndarray,
    cos_t: np.ndarray,
    mass_kg: np.ndarray,
    cda_m2: np.ndarray,
    crr: np.ndarray,
    air_density: np.ndarray,
    headwind_ms: np.ndarray,
) -> np.ndarray:
    """Watts at the wheel needed to hold ground speed `v`."""
    gravity = mass_kg * G * sin_t * v
    rolling = crr * mass_kg * G * cos_t * v
    apparent = v + headwind_ms
    aero = 0.5 * air_density * cda_m2 * apparent * np.abs(apparent) * v
    return gravity + rolling + aero


def speed_for_power(
    power_w,
    gradient_pct,
    mass_kg,
    cda_m2,
    crr,
    air_density=1.225,
    headwind_ms=0.0,
    drivetrain_eff: float = DRIVETRAIN_EFF,
) -> np.ndarray:
    """Ground speed in m/s for a sustained power on a given gradient."""
    power_w = np.asarray(power_w, dtype=float)
    theta = np.arctan(np.asarray(gradient_pct, dtype=float) / 100.0)
    sin_t = np.sin(theta)
    cos_t = np.cos(theta)
    mass_kg = np.asarray(mass_kg, dtype=float)
    cda_m2 = np.asarray(cda_m2, dtype=float)
    crr = np.asarray(crr, dtype=float)
    air_density = np.asarray(air_density, dtype=float)
    headwind_ms = np.asarray(headwind_ms, dtype=float)

    target = power_w * drivetrain_eff

    shape = np.broadcast_shapes(
        target.shape, sin_t.shape, mass_kg.shape, cda_m2.shape,
        crr.shape, air_density.shape, headwind_ms.shape,
    )
    lo = np.zeros(shape, dtype=float)
    hi = np.full(shape, DESCENT_SPEED_CAP_MS, dtype=float)

    for _ in range(_BISECTION_ITERS):
        mid = (lo + hi) / 2.0
        need = _power_required(
            mid, sin_t, cos_t, mass_kg, cda_m2, crr, air_density, headwind_ms
        )
        too_slow = need < target
        lo = np.where(too_slow, mid, lo)
        hi = np.where(too_slow, hi, mid)

    return np.minimum((lo + hi) / 2.0, DESCENT_SPEED_CAP_MS)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_physics.py -q`
Expected: PASS, all nine cases.

If `test_a_plausible_flat_speed` or `test_a_plausible_climbing_speed` fails, the
bug is in the physics, **not** the test — do not widen the bounds to make it
pass. Check the aero term uses apparent speed squared × ground speed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rehearsal/physics.py backend/tests/services/rehearsal/test_physics.py
git commit -m "feat(rehearsal): the power balance, solved forward

cda_estimate inverts this equation to recover CdA from a ridden file; this
solves it the other way, with deliberately identical constants so a
rehearsal can never disagree with the ride that calibrated it. Aero force
uses apparent speed while its power cost uses ground speed -- conflating
the two is the classic error and would overcharge headwinds.

Array-first, so the Monte Carlo band runs this same code rather than a
faster approximation of it."
```

---

### Task 6: The march — durability, W′bal and the blow-up

**Files:**
- Modify: `backend/app/services/w_balance.py` (add a single-step function; refactor `w_prime_balance` onto it)
- Create: `backend/app/services/rehearsal/simulator.py`
- Test: `backend/tests/services/rehearsal/test_simulator.py`
- Test: `backend/tests/services/test_w_balance.py` (extend if it exists — check with `ls backend/tests/services | grep w_bal`)

**Interfaces:**
- Consumes: `Segment`, `Climb` (Task 3), `RiderModel`, `available_cp` (Task 4), `speed_for_power` (Task 5).
- Produces:
  ```python
  # in app/services/w_balance.py
  def w_prime_balance_step(balance_j, power_w, cp: float, w_prime: float)

  # in app/services/rehearsal/simulator.py
  Draft = Literal["solo", "small_group", "bunch"]
  DRAFT_FACTORS: dict[str, float] = {"solo": 1.0, "small_group": 0.75, "bunch": 0.65}

  @dataclass(frozen=True)
  class Assumptions:
      draft: Draft = "solo"
      use_weather: bool = True

  @dataclass(frozen=True)
  class SegmentResult:
      start_m: float
      gradient_pct: float
      power_w: float
      speed_ms: float
      elapsed_s: float
      w_bal_j: float
      climb_id: int | None

  @dataclass(frozen=True)
  class BlowUp:
      distance_m: float
      climb_id: int | None

  @dataclass(frozen=True)
  class SimulationResult:
      segments: list[SegmentResult]
      total_time_s: float
      total_kj: float
      blow_ups: list[BlowUp]

  def simulate(segments, model, assumptions=Assumptions(),
               headwind_ms=None, air_density=None) -> SimulationResult
  ```
  `headwind_ms` and `air_density` are per-segment sequences supplied by Task 7;
  `None` means still air at 1.225. Tasks 7, 8, 9 consume `simulate`.

- [ ] **Step 1: Write the failing test for the W′ single step**

Add to `backend/tests/services/test_w_balance.py` (create it if absent, with the
imports the file needs):

```python
from app.services.w_balance import w_prime_balance, w_prime_balance_step


class TestWPrimeBalanceStep:
    """The simulator needs to carry W' forward from an arbitrary balance.

    w_prime_balance always starts from a full tank, which is right for a ridden
    file and wrong for a march that must react to depletion as it happens. One
    recurrence, two callers -- never two copies of the same physiology.
    """

    def test_above_cp_depletes_by_the_excess(self):
        assert w_prime_balance_step(20000.0, 300.0, 250.0, 20000.0) == 19950.0

    def test_below_cp_recharges_toward_full(self):
        out = w_prime_balance_step(10000.0, 200.0, 250.0, 20000.0)
        assert 10000.0 < out < 20000.0

    def test_never_exceeds_w_prime(self):
        assert w_prime_balance_step(19999.0, 100.0, 250.0, 20000.0) <= 20000.0

    def test_series_matches_the_step_applied_repeatedly(self):
        powers = [300.0, 300.0, 200.0, 400.0]
        series = w_prime_balance(powers, 250.0, 20000.0)
        bal = 20000.0
        manual = []
        for p in powers:
            bal = w_prime_balance_step(bal, p, 250.0, 20000.0)
            manual.append(bal)
        assert series == manual
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_w_balance.py -q`
Expected: FAIL — `ImportError: cannot import name 'w_prime_balance_step'`.

- [ ] **Step 3: Extract the single step**

In `backend/app/services/w_balance.py`, add above `w_prime_balance`:

```python
def w_prime_balance_step(balance_j, power_w, cp: float, w_prime: float):
    """One second of W′ balance from an arbitrary starting balance.

    Extracted so the rehearsal simulator can carry the balance forward and react
    to depletion mid-route; w_prime_balance always starts from a full tank,
    which is right for a ridden file and wrong for a march. ONE recurrence,
    two callers. Accepts scalars or NumPy arrays.
    """
    over = power_w > cp
    depleted = balance_j - (power_w - cp)
    recharged = balance_j + (w_prime - balance_j) * (cp - power_w) / w_prime
    out = np.where(over, depleted, recharged)
    return np.minimum(out, w_prime)
```

Add `import numpy as np` at the top of the file if it is not already imported.

Then rewrite `w_prime_balance`'s loop body to call it, keeping the same return type:

```python
def w_prime_balance(
    power_series: list[float], cp: float, w_prime: float
) -> list[float]:
    """Per-second W′-balance trajectory (joules remaining), starting full at W′."""
    bal = w_prime
    out: list[float] = []
    for p in power_series:
        bal = float(w_prime_balance_step(bal, p, cp, w_prime))
        out.append(bal)
    return out
```

- [ ] **Step 4: Run the W′ tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_w_balance.py tests/ -k w_bal -q`
Expected: PASS, including every pre-existing W′-balance test — the refactor must
not change a single existing number.

- [ ] **Step 5: Write the failing simulator test**

Create `backend/tests/services/rehearsal/test_simulator.py`:

```python
"""The march: gradient → watts → speed, with durability and W' feeding back.

The blow-up is the product's headline moment, so it is tested as behaviour:
a route that exhausts W' must report where, and must take longer than the same
route ridden within the rider's means.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, simulate


def _rider(**over):
    kwargs = dict(
        cp_watts=250.0, w_prime_j=20000.0, weight_kg=72.0,
        cda_m2=0.30, durability_drop_pct=0.0,
    )
    kwargs.update(over)
    return build_rider_model(**kwargs)


def _segments(n: int, gradient: float, length_m: float = 150.0) -> list[Segment]:
    return [
        Segment(start_m=i * length_m, length_m=length_m, gradient_pct=gradient,
                bearing_deg=0.0, elevation_m=1000.0, climb_id=1 if gradient > 3 else None)
        for i in range(n)
    ]


class TestSimulate:
    def test_produces_one_result_per_segment(self):
        res = simulate(_segments(10, 0.0), _rider())
        assert len(res.segments) == 10
        assert res.total_time_s > 0

    def test_elapsed_time_only_increases(self):
        res = simulate(_segments(20, 4.0), _rider())
        times = [s.elapsed_s for s in res.segments]
        assert times == sorted(times)

    def test_a_climb_takes_longer_than_the_same_distance_flat(self):
        flat = simulate(_segments(20, 0.0), _rider()).total_time_s
        up = simulate(_segments(20, 8.0), _rider()).total_time_s
        assert up > flat

    def test_accumulates_work(self):
        res = simulate(_segments(20, 4.0), _rider())
        assert res.total_kj > 0

    def test_durability_makes_a_late_climb_slower_than_the_same_climb_early(self):
        # 60 identical climbing segments. With fade on, the last must be slower
        # than the first; with fade off, they must match. This is the effect no
        # HR-based competitor can model.
        faded = simulate(_segments(60, 6.0), _rider(durability_drop_pct=8.0))
        assert faded.segments[-1].speed_ms < faded.segments[0].speed_ms

        flat_model = simulate(_segments(60, 6.0), _rider(durability_drop_pct=0.0))
        assert flat_model.segments[-1].speed_ms == pytest.approx(
            flat_model.segments[0].speed_ms, rel=1e-6
        )

    def test_blow_up_is_reported_when_w_prime_is_exhausted(self):
        # A tiny W' against a long, steep climb: the rider cannot hold the
        # target and the simulator must say where it broke.
        res = simulate(_segments(80, 11.0), _rider(w_prime_j=3000.0))
        assert res.blow_ups
        assert res.blow_ups[0].distance_m > 0

    def test_no_blow_up_on_an_easy_route(self):
        assert simulate(_segments(20, 0.0), _rider()).blow_ups == []

    def test_w_bal_never_goes_negative(self):
        res = simulate(_segments(80, 11.0), _rider(w_prime_j=3000.0))
        assert all(s.w_bal_j >= -1e-6 for s in res.segments)

    def test_drafting_in_a_bunch_is_faster_on_the_flat(self):
        solo = simulate(_segments(30, 0.0), _rider(), Assumptions(draft="solo"))
        bunch = simulate(_segments(30, 0.0), _rider(), Assumptions(draft="bunch"))
        assert bunch.total_time_s < solo.total_time_s

    def test_drafting_barely_matters_on_a_steep_climb(self):
        solo = simulate(_segments(30, 10.0), _rider(), Assumptions(draft="solo"))
        bunch = simulate(_segments(30, 10.0), _rider(), Assumptions(draft="bunch"))
        assert bunch.total_time_s == pytest.approx(solo.total_time_s, rel=0.03)

    def test_headwind_costs_time(self):
        segs = _segments(30, 0.0)
        still = simulate(segs, _rider()).total_time_s
        windy = simulate(segs, _rider(), headwind_ms=[6.0] * 30).total_time_s
        assert windy > still
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_simulator.py -q`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the simulator**

Create `backend/app/services/rehearsal/simulator.py`:

```python
"""March a route segment by segment: gradient → watts → speed, with the
athlete's durability and W′ balance feeding back into what they can hold.

Three effects make this a rehearsal rather than a calculator:

  • target watts come from the SAME pacing curve the app already uses for the
    athlete's own climbs (climb_companion.pace_factor / duration_scale);
  • available CP falls as work accumulates (rider_model.available_cp), so the
    same climb late in the route is honestly slower than early;
  • W′ depletes, and when it runs out the rider CANNOT hold the target — the
    simulator caps them at what remains and records where it broke. That
    recorded moment is the verdict sentence on the surface.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

from app.services.climb_companion import duration_scale, pace_factor
from app.services.rehearsal.physics import speed_for_power
from app.services.rehearsal.rider_model import RiderModel, available_cp
from app.services.rehearsal.route_profile import Segment
from app.services.w_balance import w_prime_balance_step

Draft = Literal["solo", "small_group", "bunch"]

#: Aero multipliers on CdA. Literature approximations, NOT measurements — the
#: surface labels them as assumptions the athlete sets (spec §6).
DRAFT_FACTORS: dict[str, float] = {"solo": 1.0, "small_group": 0.75, "bunch": 0.65}

#: Below this W′ the rider is riding on fumes; hold them at available CP.
_BLOWN_J = 1.0


@dataclass(frozen=True)
class Assumptions:
    draft: Draft = "solo"
    use_weather: bool = True


@dataclass(frozen=True)
class SegmentResult:
    start_m: float
    gradient_pct: float
    power_w: float
    speed_ms: float
    elapsed_s: float
    w_bal_j: float
    climb_id: int | None


@dataclass(frozen=True)
class BlowUp:
    distance_m: float
    climb_id: int | None


@dataclass(frozen=True)
class SimulationResult:
    segments: list[SegmentResult]
    total_time_s: float
    total_kj: float
    blow_ups: list[BlowUp]


def _target_power(gradient_pct: float, cp_now: float, route_time_s: float) -> float:
    """Sustainable target for this gradient, using the app's own pacing curve."""
    return cp_now * pace_factor(gradient_pct) * duration_scale(int(route_time_s))


def simulate(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions = Assumptions(),
    headwind_ms: Sequence[float] | None = None,
    air_density: Sequence[float] | None = None,
) -> SimulationResult:
    """Simulate the route. Caller must check `model.can_predict_time` first."""
    if not model.can_predict_time:
        raise ValueError("rider model cannot support a time prediction")

    cda = (model.cda_m2 or 0.0) * DRAFT_FACTORS[assumptions.draft]
    w_prime = model.w_prime_j or 0.0
    bal = w_prime

    out: list[SegmentResult] = []
    blow_ups: list[BlowUp] = []
    elapsed = 0.0
    kj = 0.0
    blown = False

    for i, seg in enumerate(segments):
        cp_now = available_cp(model, kj)
        target = _target_power(seg.gradient_pct, cp_now, elapsed)

        # W′ is the ceiling on going above CP. Once it is gone the rider is
        # held at what their aerobic engine still supports — this is the
        # difference between a plan and a prediction.
        if w_prime > 0 and bal <= _BLOWN_J and target > cp_now:
            target = cp_now
            if not blown:
                blow_ups.append(BlowUp(distance_m=seg.start_m, climb_id=seg.climb_id))
                blown = True
        elif bal > _BLOWN_J:
            blown = False

        wind = float(headwind_ms[i]) if headwind_ms is not None else 0.0
        rho = float(air_density[i]) if air_density is not None else 1.225

        speed = float(
            speed_for_power(
                target, seg.gradient_pct, model.mass_kg, cda, model.crr,
                air_density=rho, headwind_ms=wind,
            )
        )
        seg_time = seg.length_m / speed if speed > 0.05 else 0.0
        elapsed += seg_time
        kj += target * seg_time / 1000.0

        if w_prime > 0:
            # One second at a time, so recovery below CP is integrated the same
            # way a ridden file would be.
            for _ in range(int(seg_time)):
                bal = float(w_prime_balance_step(bal, target, cp_now, w_prime))
            bal = max(0.0, bal)

        out.append(
            SegmentResult(
                start_m=seg.start_m,
                gradient_pct=seg.gradient_pct,
                power_w=target,
                speed_ms=speed,
                elapsed_s=elapsed,
                w_bal_j=bal,
                climb_id=seg.climb_id,
            )
        )

    return SimulationResult(
        segments=out, total_time_s=elapsed, total_kj=kj, blow_ups=blow_ups
    )
```

- [ ] **Step 8: Run the simulator tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_simulator.py -q`
Expected: PASS, all eleven cases.

- [ ] **Step 9: Full backend suite and commit**

```bash
cd backend && .venv/bin/python -m pytest -q
git add backend/app/services/w_balance.py backend/app/services/rehearsal/simulator.py backend/tests/services/rehearsal/test_simulator.py backend/tests/services/test_w_balance.py
git commit -m "feat(rehearsal): the march -- durability, W' and the blow-up

Target watts come from the same pacing curve the app already uses for the
athlete's own climbs; available CP falls as work accumulates, so a late
climb is honestly slower than the same climb early; and when W' runs out
the rider CANNOT hold the target, so the simulator caps them and records
where it broke. That recorded moment is the verdict sentence.

w_prime_balance gains a single-step function and is refactored onto it --
one recurrence, two callers -- because the march has to carry the balance
forward while the existing function always starts from a full tank."
```

---

### Task 7: Weather and wind

**Files:**
- Create: `backend/app/services/rehearsal/weather.py`
- Test: `backend/tests/services/rehearsal/test_weather.py`

**Interfaces:**
- Consumes: `Segment` (Task 3), `RehearsalRoute` (Task 2).
- Produces:
  ```python
  FORECAST_HORIZON_DAYS = 10

  @dataclass(frozen=True)
  class WeatherOnRoute:
      headwind_ms: list[float]     # one per segment
      air_density: list[float]     # one per segment
      wind_speed_ms: float
      wind_from_deg: float
      temperature_c: float

  def weather_applies(route: RehearsalRoute, today: date) -> bool
  def headwind_for_segments(segments, wind_speed_ms, wind_from_deg) -> list[float]
  def air_density_for_segments(segments, temperature_c) -> list[float]
  def build_weather_on_route(segments, *, wind_speed_ms, wind_from_deg,
                             temperature_c) -> WeatherOnRoute
  ```
  Task 9 consumes these; the fetch itself lives in Task 9's API layer so this
  module stays pure and testable.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/rehearsal/test_weather.py`:

```python
"""Wind resolved onto the road, and air density from temperature.

Weather applies ONLY to a dated route inside the forecast horizon. Beyond that
it is omitted and labelled, never swapped for climate averages (spec §6).
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.route_source import RehearsalRoute, RoutePoint
from app.services.rehearsal.weather import (
    air_density_for_segments,
    headwind_for_segments,
    weather_applies,
)


def _seg(bearing: float) -> Segment:
    return Segment(start_m=0.0, length_m=150.0, gradient_pct=0.0,
                   bearing_deg=bearing, elevation_m=100.0, climb_id=None)


def _route(ride_date):
    pt = RoutePoint(distance_m=0.0, elevation_m=100.0, lat=46.0, lng=11.0)
    return RehearsalRoute(points=[pt, pt], total_distance_m=1000.0,
                          total_ascent_m=0.0, name=None, ride_date=ride_date)


class TestWeatherApplies:
    def test_not_without_a_date(self):
        assert weather_applies(_route(None), date(2026, 7, 30)) is False

    def test_yes_inside_the_horizon(self):
        today = date(2026, 7, 30)
        assert weather_applies(_route(today + timedelta(days=3)), today) is True

    def test_no_beyond_the_horizon(self):
        today = date(2026, 7, 30)
        assert weather_applies(_route(today + timedelta(days=40)), today) is False

    def test_no_for_a_past_date(self):
        today = date(2026, 7, 30)
        assert weather_applies(_route(today - timedelta(days=1)), today) is False


class TestHeadwind:
    def test_riding_into_the_wind_is_a_full_headwind(self):
        # Wind FROM the north (0°), rider heading north (0°) → straight into it.
        out = headwind_for_segments([_seg(0.0)], wind_speed_ms=5.0, wind_from_deg=0.0)
        assert out[0] == pytest.approx(5.0, abs=0.01)

    def test_riding_with_the_wind_is_a_tailwind(self):
        out = headwind_for_segments([_seg(180.0)], wind_speed_ms=5.0, wind_from_deg=0.0)
        assert out[0] == pytest.approx(-5.0, abs=0.01)

    def test_crosswind_contributes_nothing_along_the_road(self):
        out = headwind_for_segments([_seg(90.0)], wind_speed_ms=5.0, wind_from_deg=0.0)
        assert out[0] == pytest.approx(0.0, abs=0.01)

    def test_one_value_per_segment(self):
        segs = [_seg(0.0), _seg(90.0), _seg(180.0)]
        assert len(headwind_for_segments(segs, 4.0, 0.0)) == 3


class TestAirDensity:
    def test_thinner_air_high_up(self):
        low = Segment(0.0, 150.0, 0.0, 0.0, 0.0, None)
        high = Segment(0.0, 150.0, 0.0, 0.0, 2500.0, None)
        out = air_density_for_segments([low, high], temperature_c=15.0)
        assert out[1] < out[0]

    def test_sea_level_at_15c_is_near_the_standard_value(self):
        out = air_density_for_segments([Segment(0.0, 150.0, 0.0, 0.0, 0.0, None)], 15.0)
        assert out[0] == pytest.approx(1.225, abs=0.02)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_weather.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `backend/app/services/rehearsal/weather.py`:

```python
"""Forecast wind resolved onto the road, and air density from temperature.

Weather applies ONLY to a dated route inside the forecast horizon. Past that,
it is omitted and the surface says so — silently substituting climate averages
would be exactly the confident-but-wrong number the strategy doc warns about.

Meteorological convention: wind direction is the direction the wind comes FROM.
A rider heading north into a northerly has a full headwind; the same wind is a
tailwind heading south and costs nothing across.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.route_source import RehearsalRoute

FORECAST_HORIZON_DAYS = 10

_R_SPECIFIC = 287.05      # J/(kg·K), dry air
_P0 = 101325.0            # Pa at sea level
_LAPSE = 0.0065           # K/m
_T0_K = 288.15            # K


@dataclass(frozen=True)
class WeatherOnRoute:
    headwind_ms: list[float]
    air_density: list[float]
    wind_speed_ms: float
    wind_from_deg: float
    temperature_c: float


def weather_applies(route: RehearsalRoute, today: date) -> bool:
    """True only for a dated route inside the forecast horizon."""
    if route.ride_date is None:
        return False
    delta = (route.ride_date - today).days
    return 0 <= delta <= FORECAST_HORIZON_DAYS


def headwind_for_segments(
    segments: list[Segment], wind_speed_ms: float, wind_from_deg: float
) -> list[float]:
    """Headwind component along each segment. Positive = headwind."""
    out: list[float] = []
    for seg in segments:
        # Angle between the direction of travel and the direction the wind
        # blows FROM. Zero → riding straight into it.
        delta = math.radians(wind_from_deg - seg.bearing_deg)
        out.append(wind_speed_ms * math.cos(delta))
    return out


def air_density_for_segments(
    segments: list[Segment], temperature_c: float
) -> list[float]:
    """ρ per segment from the barometric formula at that segment's elevation."""
    out: list[float] = []
    for seg in segments:
        h = max(0.0, seg.elevation_m)
        t_k = _T0_K - _LAPSE * h
        pressure = _P0 * (t_k / _T0_K) ** 5.2561
        # Use the forecast temperature, lapsed to this elevation.
        local_t_k = (temperature_c + 273.15) - _LAPSE * h
        out.append(pressure / (_R_SPECIFIC * max(200.0, local_t_k)))
    return out


def build_weather_on_route(
    segments: list[Segment],
    *,
    wind_speed_ms: float,
    wind_from_deg: float,
    temperature_c: float,
) -> WeatherOnRoute:
    return WeatherOnRoute(
        headwind_ms=headwind_for_segments(segments, wind_speed_ms, wind_from_deg),
        air_density=air_density_for_segments(segments, temperature_c),
        wind_speed_ms=wind_speed_ms,
        wind_from_deg=wind_from_deg,
        temperature_c=temperature_c,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_weather.py -q`
Expected: PASS, all eleven cases.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rehearsal/weather.py backend/tests/services/rehearsal/test_weather.py
git commit -m "feat(rehearsal): wind on the road, air density with altitude

Wind is resolved onto each segment's bearing using the meteorological
FROM convention, so a northerly is a headwind going north, a tailwind
going south, and free across. Air density follows the barometric formula,
which is why a 2,500 m pass is quicker through the air than the same
watts at sea level.

Weather applies only to a dated route inside the forecast horizon; past
that it is omitted and labelled rather than swapped for climate averages."
```

---

### Task 8: The uncertainty band

**Files:**
- Create: `backend/app/services/rehearsal/uncertainty.py`
- Test: `backend/tests/services/rehearsal/test_uncertainty.py`

**Interfaces:**
- Consumes: `RiderModel` (Task 4), `Segment` (Task 3), `simulate`, `Assumptions` (Task 6).
- Produces:
  ```python
  DEFAULT_DRAWS = 200

  @dataclass(frozen=True)
  class TimeBand:
      p10_s: float
      p50_s: float
      p90_s: float
      draws: int

  def simulate_band(segments, model, assumptions=Assumptions(),
                    headwind_ms=None, air_density=None,
                    draws: int = DEFAULT_DRAWS, seed: int = 20260730) -> TimeBand
  ```
  Task 9 consumes `simulate_band`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/rehearsal/test_uncertainty.py`:

```python
"""The band IS the answer — a bare predicted time is never displayed.

Every assumption the athlete adds widens it, which is the honest lesson and
the opposite of what a single confident number teaches.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.uncertainty import simulate_band


def _rider(**over):
    kwargs = dict(cp_watts=250.0, w_prime_j=20000.0, weight_kg=72.0,
                  cda_m2=0.30, durability_drop_pct=4.0)
    kwargs.update(over)
    return build_rider_model(**kwargs)


def _segments(n=40, gradient=4.0):
    return [Segment(start_m=i * 150.0, length_m=150.0, gradient_pct=gradient,
                    bearing_deg=0.0, elevation_m=1000.0, climb_id=None)
            for i in range(n)]


class TestSimulateBand:
    def test_percentiles_are_ordered(self):
        b = simulate_band(_segments(), _rider(), draws=40)
        assert b.p10_s < b.p50_s < b.p90_s

    def test_is_deterministic_for_a_given_seed(self):
        a = simulate_band(_segments(), _rider(), draws=40, seed=7)
        b = simulate_band(_segments(), _rider(), draws=40, seed=7)
        assert a.p50_s == pytest.approx(b.p50_s)
        assert a.p10_s == pytest.approx(b.p10_s)

    def test_a_guessed_cda_widens_the_band(self):
        known = simulate_band(_segments(60, 0.0), _rider(cda_m2=0.30), draws=60, seed=3)
        guessed = simulate_band(_segments(60, 0.0), _rider(cda_m2=None), draws=60, seed=3)
        assert (guessed.p90_s - guessed.p10_s) > (known.p90_s - known.p10_s)

    def test_the_median_is_close_to_the_deterministic_run(self):
        from app.services.rehearsal.simulator import simulate

        segs = _segments()
        point = simulate(segs, _rider()).total_time_s
        band = simulate_band(segs, _rider(), draws=80, seed=11)
        assert band.p50_s == pytest.approx(point, rel=0.12)

    def test_reports_how_many_draws_it_used(self):
        assert simulate_band(_segments(), _rider(), draws=25).draws == 25
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_uncertainty.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `backend/app/services/rehearsal/uncertainty.py`:

```python
"""Monte Carlo band over every uncertain input.

The full model — weather, wind and drafting — was chosen deliberately, and each
added assumption compounds error. This module is where that honesty is paid
for: the range shown to the athlete widens visibly when an assumption is less
certain (a guessed CdA widens it more than a measured one), so the interface
teaches that assumptions cost certainty.

Draws are seeded, so the same rehearsal always reports the same band.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, replace
from typing import Sequence

from app.services.rehearsal.rider_model import RiderModel
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.simulator import Assumptions, simulate

DEFAULT_DRAWS = 200

#: Relative 1-sigma spreads for each uncertain input.
_CP_SIGMA = 0.04           # continuously-estimated CP, not a lab test
_CDA_SIGMA_MEASURED = 0.08
_CDA_SIGMA_DEFAULT = 0.18  # a position-based guess is far shakier
_CRR_LOW, _CRR_HIGH = 0.004, 0.007   # surface unknown


@dataclass(frozen=True)
class TimeBand:
    p10_s: float
    p50_s: float
    p90_s: float
    draws: int


def _percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    idx = min(len(sorted_values) - 1, max(0, int(round(q * (len(sorted_values) - 1)))))
    return sorted_values[idx]


def simulate_band(
    segments: list[Segment],
    model: RiderModel,
    assumptions: Assumptions = Assumptions(),
    headwind_ms: Sequence[float] | None = None,
    air_density: Sequence[float] | None = None,
    draws: int = DEFAULT_DRAWS,
    seed: int = 20260730,
) -> TimeBand:
    """p10/p50/p90 finishing times over the uncertain inputs."""
    rng = random.Random(seed)
    cda_sigma = _CDA_SIGMA_DEFAULT if model.cda_is_default else _CDA_SIGMA_MEASURED

    times: list[float] = []
    for _ in range(draws):
        drawn = replace(
            model,
            cp_watts=(model.cp_watts or 0) * (1.0 + rng.gauss(0.0, _CP_SIGMA)),
            cda_m2=(model.cda_m2 or 0) * (1.0 + rng.gauss(0.0, cda_sigma)),
            crr=rng.uniform(_CRR_LOW, _CRR_HIGH),
        )
        # Wind forecasts are themselves uncertain; scale the whole field.
        wind = (
            [w * (1.0 + rng.gauss(0.0, 0.30)) for w in headwind_ms]
            if headwind_ms is not None
            else None
        )
        times.append(
            simulate(segments, drawn, assumptions, wind, air_density).total_time_s
        )

    times.sort()
    return TimeBand(
        p10_s=_percentile(times, 0.10),
        p50_s=_percentile(times, 0.50),
        p90_s=_percentile(times, 0.90),
        draws=draws,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_uncertainty.py -q`
Expected: PASS, all five cases.

- [ ] **Step 5: Check the runtime is acceptable**

Run:

```bash
cd backend && .venv/bin/python -c "
import time
from app.services.rehearsal.rider_model import build_rider_model
from app.services.rehearsal.route_profile import Segment
from app.services.rehearsal.uncertainty import simulate_band
segs = [Segment(i*150.0, 150.0, 4.0, 0.0, 1000.0, None) for i in range(900)]
m = build_rider_model(cp_watts=250, w_prime_j=20000, weight_kg=72, cda_m2=0.3, durability_drop_pct=5)
t = time.time(); simulate_band(segs, m, draws=200); print(f'{time.time()-t:.1f}s for 900 segments x 200 draws')
"
```

A 138 km route is ~900 segments. If this exceeds **8 seconds**, reduce
`DEFAULT_DRAWS` to 100 and re-run; if it still exceeds 8 s, coarsen the band
run by simulating every other segment (document why in the module docstring).
Record the measured number in the commit message — do not guess it.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/rehearsal/uncertainty.py backend/tests/services/rehearsal/test_uncertainty.py
git commit -m "feat(rehearsal): the uncertainty band

The full model was chosen deliberately and every assumption compounds
error, so this is where that is paid for honestly: seeded Monte Carlo over
CP, CdA, Crr and the wind field, reported as p10/p50/p90. A guessed CdA
widens the band measurably more than a measured one, so the interface
teaches that assumptions cost certainty.

Runtime on a 900-segment route: <MEASURED>s."
```

---

### Task 9: Persistence and the API

**Files:**
- Create: `backend/app/models/route_rehearsal.py`
- Create: `backend/migrations/versions/<rev>_route_rehearsals.py` (generate — do not hand-number)
- Create: `backend/app/schemas/rehearsal.py`
- Create: `backend/app/api/rehearsals.py`
- Create: `backend/app/services/rehearsal/orchestrator.py`
- Modify: `backend/app/main.py` (register the router — follow how the existing routers are included)
- Test: `backend/tests/api/test_rehearsals.py`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: REST endpoints and the Pydantic shapes Task 10 mirrors in TypeScript.
  ```python
  # POST /rehearsals            body: RehearsalCreate  → RehearsalOut
  # GET  /rehearsals/{id}                              → RehearsalOut
  # GET  /rehearsals                                   → RehearsalListOut
  # PATCH /rehearsals/{id}      body: AssumptionsIn    → RehearsalOut
  ```

- [ ] **Step 1: Write the model**

Create `backend/app/models/route_rehearsal.py`, following the column and RLS
conventions in `backend/app/models/crew_event.py`:

```python
"""A stored rehearsal: the route as parsed, the assumptions, and the result.

Stored rather than recomputed so a rehearsal is revisitable and comparable —
"what did I think the Maratona would take in March?" is the interesting
question, and it needs the March answer to still exist.
"""
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RouteRehearsal(Base):
    __tablename__ = "route_rehearsals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: 'gpx' | 'crew_event' | 'activity' | 'target_event'
    source_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    #: The crew event / activity id the route came from; null for an upload.
    source_ref: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    ascent_m: Mapped[float] = mapped_column(Float, nullable=False)
    #: RehearsalRoute points, so a re-run needs no re-parse.
    route: Mapped[dict] = mapped_column(JSONB, nullable=False)
    assumptions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    #: Full SimulationResult + band + fuelling, as returned to the client.
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd backend
.venv/bin/python -m alembic revision --autogenerate -m "route_rehearsals"
```

Open the generated file and confirm it creates only `route_rehearsals` — if it
contains unrelated drops, delete those lines (autogenerate sometimes proposes
diffs from unrelated model drift). Then add the RLS policy the other user-owned
tables use — copy the pattern from the most recent migration that creates a
user-scoped table (find it with `grep -rl "ROW LEVEL SECURITY" migrations/versions | tail -1`).

```bash
.venv/bin/python -m alembic upgrade head
```

- [ ] **Step 3: Write the orchestrator**

Create `backend/app/services/rehearsal/orchestrator.py`. This is the only module
that knows about the database and the athlete; the rest of the package stays pure.

```python
"""Assemble a rehearsal: route + rider + weather → result.

The one place that reaches into the athlete's stored data. Everything it calls
is pure, so the whole pipeline is testable without a database.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import date

from app.services.rehearsal.rider_model import RiderModel, build_rider_model
from app.services.rehearsal.route_profile import (
    assign_climbs, build_segments, detect_climbs,
)
from app.services.rehearsal.route_source import RehearsalRoute
from app.services.rehearsal.simulator import Assumptions, simulate
from app.services.rehearsal.uncertainty import simulate_band
from app.services.rehearsal.weather import build_weather_on_route, weather_applies

#: Carbohydrate demand rises with intensity; this is the mid-range consensus
#: figure for long endurance efforts and matches fueling_analysis's framing.
_CARB_G_PER_HOUR_PER_KJ_H = 0.09


def run_rehearsal(
    route: RehearsalRoute,
    model: RiderModel,
    assumptions: Assumptions,
    *,
    today: date,
    forecast: dict | None = None,
) -> dict:
    """Full pipeline → the payload the API returns. Weather is passed in, not fetched."""
    segments = build_segments(route)
    climbs = detect_climbs(segments)
    segments = assign_climbs(segments, climbs)

    headwind = None
    air_density = None
    weather_used = False
    if assumptions.use_weather and forecast and weather_applies(route, today):
        w = build_weather_on_route(
            segments,
            wind_speed_ms=forecast["wind_speed_ms"],
            wind_from_deg=forecast["wind_from_deg"],
            temperature_c=forecast["temperature_c"],
        )
        headwind, air_density = w.headwind_ms, w.air_density
        weather_used = True

    if not model.can_predict_time:
        # Honest partial result: the terrain, and what is missing (spec §6).
        return {
            "can_predict": False,
            "missing": [
                k for k, v in (("cp", model.cp_watts), ("weight", model.mass_kg))
                if not v
            ],
            "climbs": [asdict(c) for c in climbs],
            "segments": [],
            "weather_used": False,
        }

    sim = simulate(segments, model, assumptions, headwind, air_density)
    band = simulate_band(segments, model, assumptions, headwind, air_density)
    hours = max(1e-6, sim.total_time_s / 3600.0)

    return {
        "can_predict": True,
        "missing": [],
        "climbs": [asdict(c) for c in climbs],
        "segments": [asdict(s) for s in sim.segments],
        "total_time_s": sim.total_time_s,
        "band": asdict(band),
        "total_kj": sim.total_kj,
        "carbs_g_per_hour": (sim.total_kj / hours) * _CARB_G_PER_HOUR_PER_KJ_H,
        "blow_ups": [asdict(b) for b in sim.blow_ups],
        "cda_is_default": model.cda_is_default,
        "weather_used": weather_used,
    }
```

- [ ] **Step 4: Write the failing API test**

Create `backend/tests/api/test_rehearsals.py`, following the dependency-override
style of `backend/tests/api/test_weeks.py` (read it first — reuse `_make_user`,
the `client` fixture pattern and `app.dependency_overrides`):

```python
"""POST /rehearsals — upload a GPX, get a rehearsal back."""
from __future__ import annotations

_GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
""" + "\n".join(
    f'    <trkpt lat="{46.0 + i * 0.001:.4f}" lon="11.0"><ele>{1000 + i * 8}</ele></trkpt>'
    for i in range(60)
) + """
  </trkseg></trk>
</gpx>"""


class TestCreateRehearsal:
    def test_unauthenticated_is_rejected(self, client):
        resp = client.post("/rehearsals", json={"source_kind": "gpx", "gpx": _GPX})
        assert resp.status_code == 401

    def test_returns_a_band_and_climbs(self, client_with_athlete):
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX, "name": "Test"}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["can_predict"] is True
        assert body["band"]["p10_s"] < body["band"]["p90_s"]
        assert body["climbs"]
        assert body["segments"]

    def test_a_route_without_elevation_is_refused_with_a_reason(self, client_with_athlete):
        flat = _GPX.replace("<ele>", "<!--").replace("</ele>", "-->")
        resp = client_with_athlete.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": flat}
        )
        assert resp.status_code == 422
        assert "elevation" in resp.json()["detail"].lower()

    def test_an_athlete_without_ftp_gets_terrain_but_no_time(self, client_no_ftp):
        resp = client_no_ftp.post(
            "/rehearsals", json={"source_kind": "gpx", "gpx": _GPX}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["can_predict"] is False
        assert "cp" in body["missing"]
        assert body["climbs"]          # the terrain still renders
```

Build the three fixtures (`client`, `client_with_athlete`, `client_no_ftp`) in
this file using the same `app.dependency_overrides` mechanism `test_weeks.py`
uses, with an athlete profile carrying `ftp_watts=250, weight_kg=72` for the
happy path and `ftp_watts=None` for the last case.

- [ ] **Step 5: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_rehearsals.py -q`
Expected: FAIL — 404 on `/rehearsals`, the router does not exist.

- [ ] **Step 6: Write the schemas and the router**

Create `backend/app/schemas/rehearsal.py` with `RehearsalCreate` (`source_kind`,
optional `gpx`, `source_ref`, `name`, `ride_date`, `draft`, `use_weather`),
`AssumptionsIn` (`draft`, `use_weather`), and `RehearsalOut` mirroring the
orchestrator's payload exactly, plus `id`, `name`, `distance_m`, `ascent_m`.

Create `backend/app/api/rehearsals.py` with prefix `/rehearsals`. It must:
- resolve the athlete's CP/W′ via `stream_ingestion.latest_critical_power`,
  falling back to the profile FTP for CP with `w_prime_j=None` when no fit exists;
- read `weight_kg` from the athlete profile;
- resolve CdA via the stored estimate if one exists, else `None` (the model
  applies the labelled fallback);
- resolve `durability_drop_pct` from the most recent measurement, else `0.0`;
- build the route from `source_kind` (`gpx` in this task; `crew_event`,
  `activity` and `target_event` land in Task 12);
- translate `RouteUnusable` into `HTTPException(422, detail=str(exc))`;
- persist the row and return `RehearsalOut` with status 201.

Register the router in `backend/app/main.py` alongside the existing ones.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_rehearsals.py -q`
Expected: PASS, all four cases.

- [ ] **Step 8: Full backend suite and commit**

```bash
cd backend && .venv/bin/python -m pytest -q
git add backend/app/models/route_rehearsal.py backend/migrations/versions/ backend/app/schemas/rehearsal.py backend/app/api/rehearsals.py backend/app/services/rehearsal/orchestrator.py backend/app/main.py backend/tests/api/test_rehearsals.py
git commit -m "feat(rehearsal): persistence and the API

Rehearsals are stored rather than recomputed, because 'what did I think
the Maratona would take back in March' needs the March answer to still
exist. The orchestrator is the only module in the package that touches the
database or the athlete; everything below it stays pure and testable
without one.

An athlete with no FTP still gets the terrain and the climbs, with the
missing inputs named -- a partial honest answer rather than a refusal."
```

---

### Task 10: The frontend client and the scrubbable profile

**Files:**
- Create: `frontend/src/api/rehearsal.ts`
- Create: `frontend/src/components/rehearsal/RehearsalProfile.tsx`
- Create: `frontend/src/components/rehearsal/__tests__/RehearsalProfile.test.tsx`

**Interfaces:**
- Consumes: the Task 9 API payload.
- Produces:
  ```ts
  export interface RehearsalSegment {
    start_m: number; gradient_pct: number; power_w: number
    speed_ms: number; elapsed_s: number; w_bal_j: number; climb_id: number | null
  }
  export interface RehearsalClimb {
    climb_id: number; start_m: number; end_m: number
    length_m: number; elev_gain_m: number; avg_grade_pct: number
  }
  export interface Rehearsal {
    id: number; name: string | null; distance_m: number; ascent_m: number
    can_predict: boolean; missing: string[]
    climbs: RehearsalClimb[]; segments: RehearsalSegment[]
    total_time_s?: number
    band?: { p10_s: number; p50_s: number; p90_s: number; draws: number }
    total_kj?: number; carbs_g_per_hour?: number
    blow_ups: { distance_m: number; climb_id: number | null }[]
    cda_is_default: boolean; weather_used: boolean
  }
  export default function RehearsalProfile(props: {
    segments: RehearsalSegment[]
    elevations: number[]
    width: number
    height: number
    onScrub: (index: number | null) => void
  }): JSX.Element | null
  ```
  Task 11 consumes both.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/rehearsal/__tests__/RehearsalProfile.test.tsx`.
Note this repo has **no** `jest-dom` and **no** `user-event` — use plain
assertions, `fireEvent`, and explicit `cleanup`, matching
`src/components/dashboard/__tests__/ThisWeekCard.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import RehearsalProfile from '../RehearsalProfile'
import type { RehearsalSegment } from '../../../api/rehearsal'

const seg = (i: number, gradient: number): RehearsalSegment => ({
  start_m: i * 150, gradient_pct: gradient, power_w: 240, speed_ms: 6,
  elapsed_s: i * 25, w_bal_j: 20000 - i * 100, climb_id: gradient > 3 ? 1 : null,
})

const segments = [seg(0, 0), seg(1, 6), seg(2, 9), seg(3, -4)]
const elevations = [1000, 1010, 1030, 1020]

describe('RehearsalProfile', () => {
  afterEach(cleanup)

  it('renders nothing without segments', () => {
    const { container } = render(
      <RehearsalProfile segments={[]} elevations={[]} width={358} height={140} onScrub={() => {}} />,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws the elevation silhouette', () => {
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={() => {}} />,
    )
    expect(container.querySelector('polygon')).not.toBeNull()
  })

  it('fits the silhouette inside the box', () => {
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={() => {}} />,
    )
    const pts = container.querySelector('polygon')!.getAttribute('points')!
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(140)
  })

  it('reports the scrubbed segment index on pointer move', () => {
    const onScrub = vi.fn()
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={onScrub} />,
    )
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 358, height: 140, right: 358, bottom: 140, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    fireEvent.pointerMove(svg, { clientX: 179 })
    expect(onScrub).toHaveBeenCalled()
    const idx = onScrub.mock.calls.at(-1)![0]
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(segments.length)
  })

  it('clears the scrub on pointer leave', () => {
    const onScrub = vi.fn()
    const { container } = render(
      <RehearsalProfile segments={segments} elevations={elevations} width={358} height={140} onScrub={onScrub} />,
    )
    fireEvent.pointerLeave(container.querySelector('svg')!)
    expect(onScrub).toHaveBeenLastCalledWith(null)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/rehearsal/__tests__/RehearsalProfile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the API client**

Create `frontend/src/api/rehearsal.ts` with the interfaces from the Interfaces
block above, plus:

```ts
import { apiClient } from './client'

export async function createRehearsal(body: {
  source_kind: 'gpx' | 'crew_event' | 'activity' | 'target_event'
  gpx?: string
  source_ref?: number
  name?: string
  ride_date?: string
  draft?: 'solo' | 'small_group' | 'bunch'
  use_weather?: boolean
}): Promise<Rehearsal> {
  return (await apiClient.post<Rehearsal>('/rehearsals', body)).data
}

export async function getRehearsal(id: number): Promise<Rehearsal> {
  return (await apiClient.get<Rehearsal>(`/rehearsals/${id}`)).data
}

export async function updateAssumptions(
  id: number,
  body: { draft?: 'solo' | 'small_group' | 'bunch'; use_weather?: boolean },
): Promise<Rehearsal> {
  return (await apiClient.patch<Rehearsal>(`/rehearsals/${id}`, body)).data
}
```

- [ ] **Step 4: Write the profile component**

Create `frontend/src/components/rehearsal/RehearsalProfile.tsx`. Requirements:

- Draw the elevation silhouette as a `<polygon>` normalised into the box, plus a
  `<polyline>` outline. Follow the projection style of
  `src/components/ui/RouteSketch.tsx` — read it first.
- Tint each segment by gradient using the app's existing zone colours. The
  backend's `zone_for_gradient` bands are: `<3 %` z1, `3–6` z2, `6–9` z3,
  `9–12` z4, `>12` z5. Map those to `var(--color-zone-1..5)`; introduce no new
  colour literals.
- Pointer handling (`onPointerMove`, `onPointerLeave`) computes the segment index
  from the x offset and calls `onScrub`. Touch works because pointer events
  cover it — the same reason `HoverBars` uses them.
- Return `null` when `segments` is empty.
- The SVG is decorative here (the readout carries the meaning), so mark it
  `aria-hidden` and expose the numbers in Task 11's readout instead.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/rehearsal/__tests__/RehearsalProfile.test.tsx`
Expected: PASS, all five cases.

- [ ] **Step 6: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/rehearsal src/api/rehearsal.ts
git add frontend/src/api/rehearsal.ts frontend/src/components/rehearsal/
git commit -m "feat(rehearsal): API client and the scrubbable elevation profile

The profile is the hero and the scrub target: the silhouette tinted by the
same gradient bands the backend paces against, with pointer events so the
drag works on touch without a second code path."
```

---

### Task 11: The rehearsal surface

**Files:**
- Create: `frontend/src/pages/RouteRehearsalView.tsx`
- Create: `frontend/src/components/rehearsal/VerdictBlock.tsx`
- Create: `frontend/src/components/rehearsal/ClimbCards.tsx`
- Create: `frontend/src/components/rehearsal/AssumptionsRow.tsx`
- Create: `frontend/src/components/rehearsal/__tests__/VerdictBlock.test.tsx`
- Modify: `frontend/src/App.tsx` (add the `/rehearse/:id` route — follow the existing route registrations)

**Interfaces:**
- Consumes: `Rehearsal`, `RehearsalProfile` (Task 10).
- Produces: the route `/rehearse/:id`. Task 12 links to it.

- [ ] **Step 1: Write the failing test for the verdict**

Create `frontend/src/components/rehearsal/__tests__/VerdictBlock.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import VerdictBlock from '../VerdictBlock'

const base = {
  band: { p10_s: 17520, p50_s: 18600, p90_s: 19680, draws: 200 },
  blowUpKm: null as number | null,
  blowUpClimb: null as string | null,
  cdaIsDefault: false,
  weatherUsed: false,
  de: true,
}

describe('VerdictBlock', () => {
  afterEach(cleanup)

  it('shows a range, never a single time', () => {
    render(<VerdictBlock {...base} />)
    // 17520 s = 4:52, 19680 s = 5:28
    expect(screen.getByText(/4:52/)).toBeTruthy()
    expect(screen.getByText(/5:28/)).toBeTruthy()
  })

  it('names the blow-up when there is one', () => {
    render(<VerdictBlock {...base} blowUpKm={84} blowUpClimb="Giau" />)
    expect(screen.getByText(/Giau/)).toBeTruthy()
    expect(screen.getByText(/84/)).toBeTruthy()
  })

  it('says the aero number is a default when it is', () => {
    render(<VerdictBlock {...base} cdaIsDefault />)
    expect(screen.getByText(/Standardwert|gesch/i)).toBeTruthy()
  })

  it('renders nothing but the reason when there is no band', () => {
    render(<VerdictBlock {...base} band={undefined} missing={['cp']} />)
    expect(screen.queryByText(/4:52/)).toBeNull()
    expect(screen.getByText(/FTP/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/rehearsal/__tests__/VerdictBlock.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `VerdictBlock`**

Create `frontend/src/components/rehearsal/VerdictBlock.tsx`. Props exactly as the
test uses them, plus `missing?: string[]`. Requirements:

- Render `h:mm – h:mm` from `p10_s`/`p90_s`. **Never** render `p50_s` alone as
  the headline — the range is the answer.
- When `blowUpKm` is set, render the sentence: DE `„Bei km {km} am {climb} geht das Licht aus — halte den Anstieg davor unter {watts} W."`,
  EN `"You blow up at km {km} on the {climb} unless you hold the climb before it under {watts} W."`
  When `blowUpClimb` is null, drop the climb name from both.
- When `cdaIsDefault`, add a muted line: DE `„Aerodynamik geschätzt (Standardwert) — die Spanne ist entsprechend breiter."`, EN `"Aero is a default estimate — the range is wider to match."`
- When `weatherUsed`, add: DE `„Wind und Temperatur aus der Vorhersage."`, EN `"Wind and temperature from the forecast."`
- When `band` is undefined, render only the honest explanation naming what is
  missing: `cp` → DE `„Ohne FTP oder CP können wir keine Zeit schätzen — nur das Profil."` / EN equivalent; `weight` → the body-weight equivalent.

- [ ] **Step 4: Write the remaining pieces**

`ClimbCards.tsx` — one glass card per climb: name/number, length in km, average
gradient, target watts (mean `power_w` of that climb's segments), predicted time
(difference of `elapsed_s` across the climb), and W′ cost (drop in `w_bal_j`).
Render `—` for any figure that is absent.

`AssumptionsRow.tsx` — a `SegmentedTabs` for solo / small group / bunch (reuse
`src/components/ui/SegmentedTabs.tsx`) and a toggle for weather. Both call back
to the page, which PATCHes and re-renders. Label it: DE `„Annahmen"`, EN
`"Assumptions"`.

`RouteRehearsalView.tsx` — loads the rehearsal by id with React Query, and lays
out: verdict → profile → scrub readout → climb cards → fuelling → assumptions.
The scrub readout shows km, gradient, target watts, speed in km/h, elapsed, and
W′ remaining as a percentage of W′. Register `/rehearse/:id` in `App.tsx`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/rehearsal`
Expected: PASS, all nine cases across both files.

- [ ] **Step 6: Gates and commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/rehearsal src/pages/RouteRehearsalView.tsx && npm run build
git add frontend/src/components/rehearsal frontend/src/pages/RouteRehearsalView.tsx frontend/src/App.tsx
git commit -m "feat(rehearsal): the rehearsal surface

Verdict, profile, scrub readout, climbs, fuelling, assumptions. The
headline is always a range -- the p50 is never shown alone, because a
single confident number is the specific trust wound this feature could
cause. The assumptions row is where the athlete sees the band widen as
they add uncertainty."
```

---

### Task 12: The remaining three route sources

**Files:**
- Modify: `backend/app/services/rehearsal/route_source.py` (three adapters)
- Modify: `backend/app/api/rehearsals.py` (handle the three `source_kind` values)
- Modify: `backend/app/models/athlete_profile.py` (target-event route column)
- Create: `backend/migrations/versions/<rev>_target_event_route.py` (generate)
- Modify: `frontend/src/components/social/…` crew event detail (a "Rehearse this" link)
- Modify: `frontend/src/components/dashboard/tabs/HistoryTab.tsx` (a "Ride it again" link)
- Test: `backend/tests/services/rehearsal/test_route_source.py` (extend)

**Interfaces:**
- Consumes: `route_from_track` (Task 2), the API from Task 9.
- Produces:
  ```python
  def route_from_crew_event(gpx_path: str, *, name, ride_date) -> RehearsalRoute
  def route_from_activity(latitudes, longitudes, altitudes, *, name) -> RehearsalRoute
  ```

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/rehearsal/test_route_source.py`:

```python
class TestRouteFromActivity:
    def test_builds_a_route_from_stream_channels(self):
        from app.services.rehearsal.route_source import route_from_activity

        lat = [46.0 + i * 0.0005 for i in range(40)]
        lng = [11.0] * 40
        alt = [1000.0 + i * 4 for i in range(40)]
        r = route_from_activity(lat, lng, alt, name="Last Sunday")
        assert r.name == "Last Sunday"
        assert r.total_distance_m > 0
        assert r.total_ascent_m == pytest.approx(156.0, rel=0.05)

    def test_skips_samples_with_no_fix(self):
        from app.services.rehearsal.route_source import route_from_activity

        lat = [46.0, None, 46.001, 46.002]
        lng = [11.0, 11.0, None, 11.0]
        alt = [1000.0, 1001.0, 1002.0, 1003.0]
        r = route_from_activity(lat, lng, alt)
        # The two samples missing a coordinate are dropped whole, never paired
        # with the next sample's other half.
        assert len(r.points) == 2

    def test_refuses_an_indoor_ride(self):
        from app.services.rehearsal.route_source import route_from_activity
        from app.services.rehearsal.route_source import RouteUnusable

        with pytest.raises(RouteUnusable):
            route_from_activity([None] * 20, [None] * 20, [None] * 20)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/test_route_source.py -q`
Expected: FAIL — `cannot import name 'route_from_activity'`.

- [ ] **Step 3: Add the adapters**

In `route_source.py`:

```python
def route_from_activity(
    latitudes: list[float | None],
    longitudes: list[float | None],
    altitudes: list[float | None],
    *,
    name: str | None = None,
) -> RehearsalRoute:
    """A ridden activity's own track → a route to rehearse again.

    Rehearsing a route you have already ridden is the accuracy check: the
    prediction lands next to what actually happened, which earns trust when
    they agree and exposes the model when they do not.
    """
    points = [
        TrackPoint(lat=float(la), lng=float(ln), elevation_m=float(al))
        for la, ln, al in zip(latitudes, longitudes, altitudes)
        if la is not None and ln is not None and al is not None
    ]
    return route_from_track(points, name=name)


def route_from_crew_event(
    gpx_path: str, *, name: str | None = None, ride_date: date | None = None
) -> RehearsalRoute:
    """A crew event's uploaded tour, re-read at FULL resolution.

    The event row stores a ≤120-point profile for its card; simulating needs
    every point, so this re-reads the original file from disk rather than
    upsampling a chart.
    """
    with open(gpx_path, "rb") as fh:
        return route_from_gpx(fh.read(), name=name, ride_date=ride_date)
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `cd backend && .venv/bin/python -m pytest tests/services/rehearsal/ -q`
Expected: PASS.

- [ ] **Step 5: Add the target-event route column and wire all three into the API**

Add to `backend/app/models/athlete_profile.py`:

```python
    # Official GPX of the target event, so the countdown can show a projected
    # time on the ACTUAL course. Stored as text; parsed on demand.
    target_event_gpx: Mapped[str | None] = mapped_column(Text, nullable=True)
```

Generate and apply the migration exactly as in Task 9 Step 2. Then extend
`api/rehearsals.py` so `source_kind` dispatches to the right adapter:
`crew_event` → look up the event, use `CREW_TOURS_ROOT / tour_filename`, take
`ride_date` from the event date; `activity` → load the stream and pass
`latitude`/`longitude`/`altitude`; `target_event` → parse `target_event_gpx` with
`ride_date=profile.target_event_date`. Each returns 404 when the referenced row
does not exist and 422 with the `RouteUnusable` message when the route cannot be
simulated.

- [ ] **Step 6: Add the two frontend entry points**

Crew event detail: a link reading DE `„Diese Runde proben"` / EN `"Rehearse this
ride"` which POSTs `{source_kind:'crew_event', source_ref:<eventId>}` and
navigates to `/rehearse/:id`.

`HistoryTab.tsx` activity rows: a link reading DE `„Nochmal fahren"` / EN `"Ride
it again"` which POSTs `{source_kind:'activity', source_ref:<activityId>}` and
navigates. Show it only for activities with a `route_polyline`.

- [ ] **Step 7: Gates and commit**

```bash
cd backend && .venv/bin/python -m pytest -q
cd ../frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/dashboard/tabs/HistoryTab.tsx && npm run build
git add backend/app backend/migrations backend/tests frontend/src
git commit -m "feat(rehearsal): crew tours, past rides and the target event

Three more adapters onto the same RehearsalRoute, so the simulator still
has no idea where a route came from. Crew tours are re-read from the
original file at full resolution rather than upsampled from the 120-point
card profile -- a chart's worth of points cannot be simulated.

Rehearsing a route you have already ridden is also the accuracy check: the
prediction sits next to what actually happened."
```

---

### Task 13: Visual verification at 390×844

**Files:** none — this task changes nothing. It exists because this project has
shipped a surface that passed every static gate and was still wrong.

- [ ] **Step 1: Full gates one more time**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build
cd ../backend && .venv/bin/python -m pytest -q
```

- [ ] **Step 2: Run the app and look at every surface**

Start the DB (`docker start backend-db-1`), the backend on `:8042`
(`.venv/bin/python -m alembic upgrade head` first) and the frontend on `:5180`
(CORS allowlists 5173/5180 only). At **390×844**, check and screenshot:

1. **Upload a real GPX of a mountain route.** The verdict shows a range, never a
   single time. The profile silhouette matches the route's real shape.
2. **Scrub the profile.** km, gradient, watts, speed, elapsed and W′ all update
   and stay plausible; W′ falls on climbs and recovers on descents.
3. **Climb cards** name every major climb, and their target watts are sane
   against the athlete's FTP (not a 200 W-derived number).
4. **Assumptions.** Switch solo → bunch: the time drops and the band moves.
   Switch weather off and on for a dated route: the range visibly changes.
5. **An athlete with no FTP** sees the terrain and climbs plus a plain statement
   of what is missing — not an error page and not a fabricated time.
6. **A GPX with no elevation** is refused with a readable reason.
7. **"Ride it again"** on a past outdoor ride produces a rehearsal whose
   prediction is in the same ballpark as the actual recorded time. If it is
   wildly off, that is a model finding — report it rather than adjusting the
   test to hide it.
8. **A no-GPS/indoor ride** offers no rehearsal link at all.

- [ ] **Step 3: Report**

Report what you saw per surface, with the screenshots, including the predicted-
vs-actual number from check 7. If any surface is wrong, fix it and re-verify
before declaring the plan done. Do **not** deploy.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: §3 experience → T10/T11;
§4.1 route_source → T2 + T12; §4.2 route_profile → T3; §4.3 rider_model → T4;
§4.3a Assumptions → T6; §4.4 simulator → T5 + T6; §4.5 uncertainty → T8;
§4.6 API → T9; §4.7 frontend → T10/T11; §5 data flow → T9's orchestrator;
§6 refusals → T2 (route), T4 (rider), T9 (API translation), T11 (copy), T13
(visual); §7 migration → T9 + T12; §8 testing → every task; §9 constraints →
Global Constraints; §10 build order → task order.

**Two things the spec did not anticipate, both found by reading the code:**
`parse_gpx` downsamples its profile to 120 points, so Task 1 extracts a
full-resolution reader before anything else can be built; and `w_prime_balance`
always starts from a full tank, so Task 6 extracts a single-step function and
refactors the existing one onto it rather than copying the recurrence.

**Placeholder scan.** No TBDs. Four steps deliberately instruct the implementer
to read existing code first (the `test_weeks.py` fixture style, `RouteSketch`'s
projection, `SegmentedTabs`, the RLS pattern in the newest migration) rather than
guessing a signature this plan cannot verify — each names exactly what to look
for. Task 8 Step 5 requires a *measured* runtime in the commit message rather
than an assumed one.

**Type consistency.** `Segment` and `Climb` are defined in T3 and used unchanged
in T5–T9. `RiderModel` is defined in T4; `available_cp` is its only fade
accessor. `speed_for_power`'s signature in T5 matches every call in T6 and T8.
`Assumptions` and `DRAFT_FACTORS` are defined once in T6 and reused in T8/T9.
The Python `SimulationResult`/`TimeBand`/`Climb` field names match the
TypeScript `RehearsalSegment`/`Rehearsal`/`RehearsalClimb` fields in T10
one-for-one, because the API returns `asdict()` of those exact dataclasses.

**Ordering constraints.** T1 → T2 → T3. T4 and T5 are independent of each other
and of T3. T6 requires T3, T4, T5. T7 requires T3. T8 requires T6. T9 requires
T2–T8. T10 requires T9. T11 requires T10. T12 requires T9 and T11. T13 last.
