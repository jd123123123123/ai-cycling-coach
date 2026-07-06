# Race Debrief — Phase 0: Stream Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest and persist GPS (lat/lng), speed, distance, temperature, and pedal-biomechanics channels for cycling activities, plus fetch and store per-ride historical weather — so later Race Debrief phases have route, aero, environment, and biomechanics data. Nothing regresses for rides missing any channel.

**Architecture:** Extend the existing pure ingestion pipeline — `garmin_details_parser` (payload → records) → `stream_extraction` (records → aligned 1 Hz `ActivityStreams`) → `stream_ingestion` (persist to `activity_streams`). Add a pure `environment` math helper and a defensive Open-Meteo `weather_client`. All new channels are optional: absent input → absent output, never zero-filled. Weather and biomech failures are swallowed (best-effort), exactly like the current stream ingest.

**Tech Stack:** Python 3.12, FastAPI, async SQLAlchemy 2.0, PostgreSQL + TimescaleDB, Alembic, `httpx` (already a dependency), pytest.

## Global Constraints

- **Graceful degradation is mandatory:** every new channel/metric returns `None` / empty and the pipeline still succeeds when its input is absent. A stream/weather problem must never break core activity sync.
- **Never zero-fill missing samples.** Forward-fill "carry-last-seen" channels (HR/cadence/altitude/GPS/speed/temp/biomech); exclude large (> `max_gap_s`) auto-pause gaps entirely. Preserve genuinely-recorded `0` values.
- **Cycling-only** stream ingest (unchanged from today).
- **Pure services take plain inputs → plain outputs, unit-tested with TDD.** No DB/network in the pure math modules.
- **No new dependencies.** Use `httpx` for weather.
- **Weather provider:** Open-Meteo archive API (`https://archive-api.open-meteo.com/v1/archive`), no API key.
- Test style matches `backend/tests/services/test_garmin_details_parser.py` and `test_stream_extraction.py` (plain pytest, class-grouped, synthetic payloads).
- Run tests from the `backend/` directory. Commit after each task.

---

## File Structure

- `backend/app/services/garmin_details_parser.py` — **modify**: add GPS/speed/distance/temperature/biomech descriptor keys and record fields.
- `backend/app/services/stream_extraction.py` — **modify**: carry the new channels through the 1 Hz alignment.
- `backend/app/services/stream_ingestion.py` — **modify**: persist the new channels into the `streams` blob + set `has_gps`; fetch/store weather.
- `backend/app/models/activity_stream.py` — **modify**: add `weather` (JSON) and `has_gps` (Boolean) columns.
- `backend/migrations/versions/<rev>_activity_stream_weather_has_gps.py` — **create**: Alembic migration.
- `backend/app/services/environment.py` — **create**: pure `air_density()` + `relative_wind()`.
- `backend/app/services/weather_client.py` — **create**: async Open-Meteo fetch, defensive.
- `backend/app/services/garmin_sync_service.py` — **modify**: pass weather into ingest.
- `backend/scripts/backfill_stream_enrichment.py` — **create**: re-ingest historical cycling rides.
- Tests: `backend/tests/services/test_garmin_details_parser.py`, `test_stream_extraction.py` (**modify**); `test_stream_ingestion_payload.py`, `test_environment.py`, `test_weather_client.py` (**create**).

---

## Task 1: Parser — capture GPS / speed / distance / temperature / biomech

**Files:**
- Modify: `backend/app/services/garmin_details_parser.py:24-85`
- Test: `backend/tests/services/test_garmin_details_parser.py`

**Interfaces:**
- Consumes: Garmin activity-details payload (`metricDescriptors` + `activityDetailMetrics`).
- Produces: `garmin_details_to_records(detail) -> list[dict]` where each record now also carries keys `latitude`, `longitude`, `speed`, `distance`, `temperature`, `left_right_balance`, `torque_effectiveness`, `pedal_smoothness` (each `float | None`). Existing keys `timestamp`/`power`/`heart_rate`/`cadence`/`altitude` unchanged.

> **Descriptor-key note:** Garmin's exact descriptor keys vary by device/firmware. Use candidate-key tuples (the module already does this for cadence) so an alternate key still matches, and default to `None` when none match. Before marking this task done, confirm the real keys by logging one live `detail["metricDescriptors"]` for a GPS ride (or inspect a stored `raw_data`) and add any missing variant to the tuple. Best-known keys are encoded below.

- [ ] **Step 1: Add the failing tests**

Add to `backend/tests/services/test_garmin_details_parser.py`:

```python
class TestGarminDetailsExtraChannels:
    def test_captures_gps_speed_distance_temperature(self):
        detail = {
            "metricDescriptors": [
                {"key": "directTimestamp", "metricsIndex": 0},
                {"key": "directLatitude", "metricsIndex": 1},
                {"key": "directLongitude", "metricsIndex": 2},
                {"key": "directSpeed", "metricsIndex": 3},
                {"key": "sumDistance", "metricsIndex": 4},
                {"key": "directAirTemperature", "metricsIndex": 5},
            ],
            "activityDetailMetrics": [
                {"metrics": [1_782_024_082_000.0, 47.1, 8.5, 9.7, 1234.0, 21.0]},
            ],
        }
        rec = garmin_details_to_records(detail)[0]
        assert rec["latitude"] == 47.1
        assert rec["longitude"] == 8.5
        assert rec["speed"] == 9.7
        assert rec["distance"] == 1234.0
        assert rec["temperature"] == 21.0

    def test_captures_biomechanics_when_present(self):
        detail = {
            "metricDescriptors": [
                {"key": "directTimestamp", "metricsIndex": 0},
                {"key": "directLeftRightBalance", "metricsIndex": 1},
                {"key": "directLeftTorqueEffectiveness", "metricsIndex": 2},
                {"key": "directLeftPedalSmoothness", "metricsIndex": 3},
            ],
            "activityDetailMetrics": [{"metrics": [1_782_024_082_000.0, 48.0, 78.0, 24.0]}],
        }
        rec = garmin_details_to_records(detail)[0]
        assert rec["left_right_balance"] == 48.0
        assert rec["torque_effectiveness"] == 78.0
        assert rec["pedal_smoothness"] == 24.0

    def test_absent_extra_channels_are_none(self):
        # The existing minimal payload (cadence/elev/hr/ts/power) → new keys None.
        rows = [[90.0, 100.0, 130.0, 1_782_024_082_000.0, 200.0]]
        rec = garmin_details_to_records(_detail(rows))[0]
        for k in ("latitude", "longitude", "speed", "distance", "temperature",
                  "left_right_balance", "torque_effectiveness", "pedal_smoothness"):
            assert rec[k] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_garmin_details_parser.py::TestGarminDetailsExtraChannels -v`
Expected: FAIL with `KeyError`/missing keys.

- [ ] **Step 3: Extend `_FIELD_KEYS` and the record dict**

In `backend/app/services/garmin_details_parser.py`, replace the `_FIELD_KEYS` dict (lines 24-29) with:

```python
# Garmin descriptor key → our record field. Tuples list candidate keys in
# priority order; the first present wins (device/firmware vary).
_FIELD_KEYS = {
    "power": ("directPower",),
    "heart_rate": ("directHeartRate",),
    "cadence": ("directBikeCadence", "directRunCadence", "directDoubleCadence"),
    "altitude": ("directElevation",),
    "latitude": ("directLatitude",),
    "longitude": ("directLongitude",),
    "speed": ("directSpeed", "directEnhancedSpeed"),
    "distance": ("sumDistance",),
    "temperature": ("directAirTemperature", "directOutsideTemperature"),
    "left_right_balance": ("directLeftRightBalance",),
    "torque_effectiveness": (
        "directLeftTorqueEffectiveness", "directRightTorqueEffectiveness",
    ),
    "pedal_smoothness": (
        "directLeftPedalSmoothness", "directRightPedalSmoothness",
    ),
}
```

Then replace the record-append block (lines 76-84) with one that emits every field generically:

```python
        record = {"timestamp": datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)}
        for fld in _FIELD_KEYS:
            record[fld] = _val(metrics, field_idx[fld])
        records.append(record)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_garmin_details_parser.py -v`
Expected: PASS (new class + all pre-existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/garmin_details_parser.py backend/tests/services/test_garmin_details_parser.py
git commit -m "feat(streams): parse GPS/speed/distance/temp/biomech from Garmin details"
```

---

## Task 2: Stream extraction — carry the new channels through 1 Hz alignment

**Files:**
- Modify: `backend/app/services/stream_extraction.py`
- Test: `backend/tests/services/test_stream_extraction.py`

**Interfaces:**
- Consumes: records from Task 1.
- Produces: `records_to_streams(records, max_gap_s=10) -> ActivityStreams` where `ActivityStreams` gains fields `latitude`, `longitude`, `speed`, `distance`, `temperature`, `left_right_balance`, `torque_effectiveness`, `pedal_smoothness` — each `list[float | None]`, same length as `power`, forward-filled ("carry last seen", `None` until first reading), with short gaps bridged and large gaps excluded exactly like `heart_rate`/`altitude`.

- [ ] **Step 1: Add the failing tests**

Add to `backend/tests/services/test_stream_extraction.py`. First extend the `_rec` helper to accept the new kwargs:

```python
def _rec2(offset_s, **kw):
    rec = {"timestamp": T0 + timedelta(seconds=offset_s)}
    for k in ("power", "heart_rate", "cadence", "altitude", "latitude",
              "longitude", "speed", "distance", "temperature",
              "left_right_balance", "torque_effectiveness", "pedal_smoothness"):
        rec[k] = kw.get(k)
    return rec


class TestExtraChannels:
    def test_gps_speed_align_and_forward_fill(self):
        recs = [
            _rec2(0, power=200, latitude=47.0, longitude=8.0, speed=10.0),
            _rec2(2, power=210, latitude=47.1, longitude=8.1, speed=11.0),  # gap bridged
        ]
        s = records_to_streams(recs)
        assert s.latitude == [47.0, 47.0, 47.1]
        assert s.longitude == [8.0, 8.0, 8.1]
        assert s.speed == [10.0, 10.0, 11.0]

    def test_extra_channels_none_until_first_reading(self):
        recs = [_rec2(0, power=200), _rec2(1, power=205, temperature=20.0)]
        s = records_to_streams(recs)
        assert s.temperature == [None, 20.0]

    def test_large_gap_excluded_for_extra_channels_too(self):
        recs = [_rec2(0, power=200, speed=10.0), _rec2(100, power=210, speed=12.0)]
        s = records_to_streams(recs, max_gap_s=10)
        assert s.speed == [10.0, 12.0]
        assert len(s.speed) == len(s.power) == 2
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_stream_extraction.py::TestExtraChannels -v`
Expected: FAIL with `AttributeError: 'ActivityStreams' object has no attribute 'latitude'`.

- [ ] **Step 3: Rewrite the module to handle carry-fill channels generically**

Replace the whole body of `backend/app/services/stream_extraction.py` from the `ActivityStreams` dataclass onward (lines 32-102) with:

```python
# Channels that forward-fill ("carry last seen"): decay slowly or are positional,
# None until the first reading. Power is handled separately (never None).
_CARRY_CHANNELS = (
    "heart_rate", "cadence", "altitude", "latitude", "longitude",
    "speed", "distance", "temperature",
    "left_right_balance", "torque_effectiveness", "pedal_smoothness",
)


@dataclass(frozen=True)
class ActivityStreams:
    power: list[float] = field(default_factory=list)
    heart_rate: list[float | None] = field(default_factory=list)
    cadence: list[float | None] = field(default_factory=list)
    altitude: list[float | None] = field(default_factory=list)
    latitude: list[float | None] = field(default_factory=list)
    longitude: list[float | None] = field(default_factory=list)
    speed: list[float | None] = field(default_factory=list)
    distance: list[float | None] = field(default_factory=list)
    temperature: list[float | None] = field(default_factory=list)
    left_right_balance: list[float | None] = field(default_factory=list)
    torque_effectiveness: list[float | None] = field(default_factory=list)
    pedal_smoothness: list[float | None] = field(default_factory=list)

    @property
    def duration_s(self) -> int:
        return len(self.power)


def _ts(record: dict) -> datetime:
    return record["timestamp"]


def records_to_streams(
    records: list[dict], max_gap_s: int = DEFAULT_MAX_GAP_S
) -> ActivityStreams:
    """Reconstruct a moving-time 1 Hz stream from records (see module docstring)."""
    if not records:
        return ActivityStreams()

    ordered = sorted(records, key=_ts)
    power: list[float] = []
    carry: dict[str, list[float | None]] = {c: [] for c in _CARRY_CHANNELS}
    last: dict[str, float | None] = {c: None for c in _CARRY_CHANNELS}

    prev_ts: datetime | None = None
    prev_power = 0.0
    prev_carry: dict[str, float | None] = {c: None for c in _CARRY_CHANNELS}

    for r in ordered:
        p = r.get("power")
        power_v = float(p) if p is not None else 0.0
        for c in _CARRY_CHANNELS:
            v = r.get(c)
            if v is not None:
                last[c] = float(v)

        ts = _ts(r)
        if prev_ts is not None:
            gap = int(round((ts - prev_ts).total_seconds()))
            if 1 < gap <= max_gap_s:
                for _ in range(gap - 1):
                    power.append(prev_power)
                    for c in _CARRY_CHANNELS:
                        carry[c].append(prev_carry[c])
            # gap > max_gap_s → stop: emit nothing. gap <= 1 → nothing to bridge.

        power.append(power_v)
        for c in _CARRY_CHANNELS:
            carry[c].append(last[c])
        prev_ts = ts
        prev_power = power_v
        prev_carry = dict(last)

    return ActivityStreams(power=power, **carry)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_stream_extraction.py -v`
Expected: PASS (new `TestExtraChannels` + all pre-existing tests green — power/HR semantics unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/stream_extraction.py backend/tests/services/test_stream_extraction.py
git commit -m "feat(streams): carry GPS/speed/temp/biomech through 1 Hz alignment"
```

---

## Task 3: Persist the new channels + `has_gps` flag

**Files:**
- Modify: `backend/app/services/stream_ingestion.py:34-90`
- Test: `backend/tests/services/test_stream_ingestion_payload.py` (create)

**Interfaces:**
- Consumes: `ActivityStreams` (Task 2).
- Produces: a module-level pure helper `build_streams_blob(streams: ActivityStreams) -> dict` returning the full `{channel: list}` blob (only including carry-channels that have at least one non-None value, to keep blobs small) plus a helper `has_gps(streams) -> bool`. `ingest_activity_streams` uses both; its signature gains `weather: dict | None = None` (persisted verbatim to `ActivityStream.weather`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/test_stream_ingestion_payload.py`:

```python
"""Tests for the pure stream-blob builder used by stream_ingestion."""
from __future__ import annotations

from app.services.stream_extraction import ActivityStreams
from app.services.stream_ingestion import build_streams_blob, has_gps


class TestBuildStreamsBlob:
    def test_includes_core_channels_always(self):
        s = ActivityStreams(power=[100.0, 110.0], heart_rate=[130.0, 131.0])
        blob = build_streams_blob(s)
        assert blob["power"] == [100.0, 110.0]
        assert blob["heart_rate"] == [130.0, 131.0]

    def test_omits_all_none_optional_channels(self):
        s = ActivityStreams(power=[100.0], temperature=[None])
        blob = build_streams_blob(s)
        assert "temperature" not in blob  # nothing recorded → don't store

    def test_includes_gps_when_present(self):
        s = ActivityStreams(power=[100.0], latitude=[47.0], longitude=[8.0])
        blob = build_streams_blob(s)
        assert blob["latitude"] == [47.0]
        assert has_gps(s) is True

    def test_has_gps_false_without_coordinates(self):
        s = ActivityStreams(power=[100.0], latitude=[None])
        assert has_gps(s) is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/services/test_stream_ingestion_payload.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_streams_blob'`.

- [ ] **Step 3: Add the helpers and use them in ingest**

In `backend/app/services/stream_ingestion.py`, add near the top (after imports):

```python
# Always-persisted core channels; optional channels are stored only when they
# carry at least one real reading (keeps blobs small for rides without them).
_CORE_CHANNELS = ("power", "heart_rate", "cadence", "altitude")
_OPTIONAL_CHANNELS = (
    "latitude", "longitude", "speed", "distance", "temperature",
    "left_right_balance", "torque_effectiveness", "pedal_smoothness",
)


def build_streams_blob(streams: ActivityStreams) -> dict:
    """Serialize an ActivityStreams to the stored JSON blob (drop empty channels)."""
    blob: dict = {c: getattr(streams, c) for c in _CORE_CHANNELS}
    for c in _OPTIONAL_CHANNELS:
        series = getattr(streams, c)
        if any(v is not None for v in series):
            blob[c] = series
    return blob


def has_gps(streams: ActivityStreams) -> bool:
    return any(v is not None for v in streams.latitude) and any(
        v is not None for v in streams.longitude
    )
```

Change the `ingest_activity_streams` signature to add `weather: dict | None = None`, then in the `payload` dict replace the inline `"streams": {...}` with `"streams": build_streams_blob(streams),` and add two keys:

```python
        "weather": weather,
        "has_gps": has_gps(streams),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_stream_ingestion_payload.py tests/services/test_stream_extraction.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/stream_ingestion.py backend/tests/services/test_stream_ingestion_payload.py
git commit -m "feat(streams): persist optional channels + has_gps via pure blob builder"
```

---

## Task 4: Migration — `weather` + `has_gps` columns on `activity_streams`

**Files:**
- Modify: `backend/app/models/activity_stream.py:30-39`
- Create: `backend/migrations/versions/<rev>_activity_stream_weather_has_gps.py`

**Interfaces:**
- Produces: `ActivityStream.weather: Mapped[dict | None]` (JSON, nullable) and `ActivityStream.has_gps: Mapped[bool | None]` (Boolean, nullable).

- [ ] **Step 1: Add the columns to the model**

In `backend/app/models/activity_stream.py`, after the `mmp_curve` column (line 31) add:

```python
    weather: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    has_gps: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
```

Add `Boolean` to the `sqlalchemy` import on line 3.

- [ ] **Step 2: Generate the migration**

Run: `cd backend && alembic revision -m "activity_stream weather has_gps"`
Then edit the generated file so `upgrade()`/`downgrade()` are:

```python
def upgrade() -> None:
    op.add_column("activity_streams", sa.Column("weather", sa.JSON(), nullable=True))
    op.add_column("activity_streams", sa.Column("has_gps", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("activity_streams", "has_gps")
    op.drop_column("activity_streams", "weather")
```

Set `down_revision` to the current head (`f7a8b9c0d1e2` unless a newer head exists — confirm with `alembic heads`).

- [ ] **Step 3: Apply and verify**

Run: `cd backend && alembic upgrade head && alembic current`
Expected: the new revision is current; no errors. (If a test DB is used, run against it.)

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/activity_stream.py backend/migrations/versions/*_activity_stream_weather_has_gps.py
git commit -m "feat(streams): add weather + has_gps columns to activity_streams"
```

---

## Task 5: Pure environment helpers — air density + relative wind

**Files:**
- Create: `backend/app/services/environment.py`
- Test: `backend/tests/services/test_environment.py` (create)

**Interfaces:**
- Produces:
  - `air_density(altitude_m: float, temp_c: float | None = None) -> float` — kg/m³ via the barometric formula (ISA); uses 15 °C sea-level default when `temp_c` is None.
  - `relative_wind(heading_deg: float, wind_from_deg: float, wind_speed_ms: float) -> float` — signed headwind component in m/s (positive = headwind, negative = tailwind) along the travel heading.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/services/test_environment.py`:

```python
"""Tests for pure environment math (air density, relative wind)."""
from __future__ import annotations

import math

from app.services.environment import air_density, relative_wind


class TestAirDensity:
    def test_sea_level_default_temp(self):
        assert air_density(0.0) == round_close(1.225)

    def test_altitude_reduces_density(self):
        assert air_density(2000.0) < air_density(0.0)

    def test_warmer_air_is_less_dense(self):
        assert air_density(0.0, temp_c=35.0) < air_density(0.0, temp_c=5.0)


class TestRelativeWind:
    def test_direct_headwind(self):
        # Travelling due north (0°), wind coming FROM the north (0°) at 5 m/s.
        assert relative_wind(0.0, 0.0, 5.0) == round_close(5.0)

    def test_direct_tailwind(self):
        # Travelling north, wind FROM the south (180°) → tailwind (negative).
        assert relative_wind(0.0, 180.0, 5.0) == round_close(-5.0)

    def test_pure_crosswind_is_zero(self):
        assert abs(relative_wind(0.0, 90.0, 5.0)) < 1e-9


def round_close(x):
    class _Close:
        def __eq__(self, other):
            return math.isclose(other, x, rel_tol=1e-2, abs_tol=1e-2)
    return _Close()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_environment.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.environment`.

- [ ] **Step 3: Implement the module**

Create `backend/app/services/environment.py`:

```python
"""Pure environmental physics for ride analysis: air density and relative wind.

No DB, no network. `weather_client` fetches raw weather; these functions turn it
(and altitude/heading) into the quantities the aero/pacing analyzers consume.
"""
from __future__ import annotations

import math

# International Standard Atmosphere constants.
_P0 = 101325.0      # sea-level standard pressure, Pa
_T0 = 288.15        # sea-level standard temperature, K
_L = 0.0065         # temperature lapse rate, K/m
_G = 9.80665        # gravity, m/s²
_M = 0.0289644      # molar mass of dry air, kg/mol
_R = 8.31447        # universal gas constant, J/(mol·K)
_R_SPECIFIC = 287.058  # specific gas constant for dry air, J/(kg·K)


def air_density(altitude_m: float, temp_c: float | None = None) -> float:
    """Air density (kg/m³) at an altitude, using measured temp when available."""
    pressure = _P0 * (1.0 - _L * altitude_m / _T0) ** (_G * _M / (_R * _L))
    if temp_c is None:
        temp_k = _T0 - _L * altitude_m
    else:
        temp_k = temp_c + 273.15
    return pressure / (_R_SPECIFIC * temp_k)


def relative_wind(
    heading_deg: float, wind_from_deg: float, wind_speed_ms: float
) -> float:
    """Signed headwind component (m/s) along travel heading. +head / −tail.

    `wind_from_deg` is the meteorological direction the wind blows FROM.
    """
    # Angle between travel direction and the direction the wind blows TOWARD.
    wind_to_deg = (wind_from_deg + 180.0) % 360.0
    delta = math.radians(wind_to_deg - heading_deg)
    # Component of the wind vector opposing travel = −cos(delta)·speed.
    return -math.cos(delta) * wind_speed_ms
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_environment.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/environment.py backend/tests/services/test_environment.py
git commit -m "feat(environment): pure air-density + relative-wind helpers"
```

---

## Task 6: Open-Meteo weather client (defensive)

**Files:**
- Create: `backend/app/services/weather_client.py`
- Test: `backend/tests/services/test_weather_client.py` (create)

**Interfaces:**
- Produces: `async fetch_ride_weather(lat: float, lng: float, start: datetime, end: datetime, *, client: httpx.AsyncClient | None = None) -> dict | None`. Returns `{"hourly": {"time": [...], "wind_speed_10m": [...], "wind_direction_10m": [...], "temperature_2m": [...]}}` (Open-Meteo shape, units m/s + degrees + °C) or `None` on any error / empty response. Never raises.

- [ ] **Step 1: Write the failing tests (mocked transport, no network)**

Create `backend/tests/services/test_weather_client.py`:

```python
"""Tests for the Open-Meteo weather client (mocked HTTP, no network)."""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from app.services.weather_client import fetch_ride_weather

_START = datetime(2026, 6, 21, 10, 0, tzinfo=timezone.utc)
_END = datetime(2026, 6, 21, 13, 0, tzinfo=timezone.utc)

_OK_BODY = {
    "hourly": {
        "time": ["2026-06-21T10:00", "2026-06-21T11:00"],
        "wind_speed_10m": [3.2, 4.1],
        "wind_direction_10m": [220, 240],
        "temperature_2m": [19.0, 21.0],
    }
}


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_returns_hourly_weather_on_success():
    async with _client(lambda req: httpx.Response(200, json=_OK_BODY)) as c:
        out = await fetch_ride_weather(47.0, 8.0, _START, _END, client=c)
    assert out["hourly"]["wind_speed_10m"] == [3.2, 4.1]
    assert out["hourly"]["temperature_2m"] == [19.0, 21.0]


@pytest.mark.asyncio
async def test_returns_none_on_http_error():
    async with _client(lambda req: httpx.Response(500)) as c:
        out = await fetch_ride_weather(47.0, 8.0, _START, _END, client=c)
    assert out is None


@pytest.mark.asyncio
async def test_returns_none_on_transport_exception():
    def boom(req):
        raise httpx.ConnectError("no network")
    async with _client(boom) as c:
        out = await fetch_ride_weather(47.0, 8.0, _START, _END, client=c)
    assert out is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_weather_client.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.weather_client`.

- [ ] **Step 3: Implement the client**

Create `backend/app/services/weather_client.py`:

```python
"""Fetch historical hourly weather for a ride from Open-Meteo (free, no key).

Defensive by contract: any failure (network, non-200, malformed body) returns
None so weather is simply absent — the debrief's environment cards then hide.
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
_TIMEOUT = 15.0


async def fetch_ride_weather(
    lat: float,
    lng: float,
    start: datetime,
    end: datetime,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict | None:
    """Return Open-Meteo hourly wind/temperature for the ride window, or None."""
    params = {
        "latitude": round(lat, 3),
        "longitude": round(lng, 3),
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
        "hourly": "wind_speed_10m,wind_direction_10m,temperature_2m",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }
    owns_client = client is None
    try:
        client = client or httpx.AsyncClient(timeout=_TIMEOUT)
        try:
            resp = await client.get(_ARCHIVE_URL, params=params)
            resp.raise_for_status()
            body = resp.json()
        finally:
            if owns_client:
                await client.aclose()
    except Exception as exc:  # network, HTTP, JSON — all non-fatal
        logger.info("weather fetch failed (non-fatal): %s", exc)
        return None
    if not isinstance(body, dict) or "hourly" not in body:
        return None
    return body
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_weather_client.py -v`
Expected: PASS.

> If `pytest.mark.asyncio` is unrecognized, confirm `pytest-asyncio` is configured (existing async tests under `tests/api/` prove it is); match their `asyncio_mode` setting.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/weather_client.py backend/tests/services/test_weather_client.py
git commit -m "feat(environment): defensive Open-Meteo weather client"
```

---

## Task 7: Wire weather into the sync ingest

**Files:**
- Modify: `backend/app/services/garmin_sync_service.py:241-255`

**Interfaces:**
- Consumes: `records_to_streams` output (has `latitude`/`longitude`), `fetch_ride_weather`, `ingest_activity_streams(..., weather=...)`.
- Produces: after each cycling stream ingest, when the ride has GPS, weather is fetched and stored on the `ActivityStream` row. Best-effort: weather failure never breaks ingest.

- [ ] **Step 1: Add imports**

In `backend/app/services/garmin_sync_service.py`, near the other stream imports (lines 46-48), add:

```python
from app.services.stream_ingestion import has_gps
from app.services.weather_client import fetch_ride_weather
```

- [ ] **Step 2: Fetch weather before ingest**

Between `streams = records_to_streams(records)` (line 246) and the `ftp = ...` line, insert:

```python
        weather = None
        if has_gps(streams) and activity.started_at is not None:
            first_lat = next((v for v in streams.latitude if v is not None), None)
            first_lng = next((v for v in streams.longitude if v is not None), None)
            if first_lat is not None and first_lng is not None:
                from datetime import timedelta
                end = activity.started_at + timedelta(seconds=streams.duration_s)
                weather = await fetch_ride_weather(
                    first_lat, first_lng, activity.started_at, end
                )
```

Then pass `weather=weather` to the `ingest_activity_streams(...)` call.

- [ ] **Step 3: Verify nothing broke in the sync path**

Run: `cd backend && python -m pytest tests/ -k "sync or stream or garmin" -v`
Expected: PASS (no regression; the new branch is inert when there's no GPS).

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/garmin_sync_service.py
git commit -m "feat(streams): fetch + store ride weather during Garmin sync"
```

---

## Task 8: Backfill script for historical rides

**Files:**
- Create: `backend/scripts/backfill_stream_enrichment.py`

**Interfaces:**
- Produces: a runnable script that, for each stored cycling activity with a Garmin `external_id`, re-fetches details, re-runs `records_to_streams` + `ingest_activity_streams` (now capturing GPS/speed/temp/biomech), and fetches weather — so historical rides gain the new channels. Idempotent (re-ingest overwrites the same row).

- [ ] **Step 1: Write the script**

Create `backend/scripts/backfill_stream_enrichment.py`:

```python
"""Backfill GPS/speed/temp/biomech + weather onto historical cycling streams.

Re-fetches Garmin activity details for each stored cycling ride and re-ingests
the streams (now capturing the enriched channels added in Race Debrief Phase 0).
Idempotent: re-ingest upserts the existing activity_streams row.

Usage:
    cd backend && python -m scripts.backfill_stream_enrichment [--user-id N] [--limit N]
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from app.database import async_session_for_user  # RLS-scoped session factory
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.services.garmin_client import build_client_for_user  # existing helper
from app.services.garmin_details_parser import garmin_details_to_records
from app.services.stream_extraction import records_to_streams
from app.services.stream_ingestion import has_gps, ingest_activity_streams
from app.services.weather_client import fetch_ride_weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_stream_enrichment")


async def backfill_user(user_id: int, limit: int | None) -> None:
    async with async_session_for_user(user_id) as db:
        q = select(Activity).where(
            Activity.sport == "cycling", Activity.external_id.isnot(None)
        ).order_by(Activity.started_at.desc())
        if limit:
            q = q.limit(limit)
        activities = (await db.execute(q)).scalars().all()
        profile = (
            await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user_id))
        ).scalar_one_or_none()
        ftp = float(profile.ftp_watts) if profile and profile.ftp_watts else None

        client = await build_client_for_user(db, user_id)
        for act in activities:
            try:
                detail = await client.get_activity_details(int(act.external_id))
                records = garmin_details_to_records(detail)
                if not records or not any(r.get("power") is not None for r in records):
                    continue
                streams = records_to_streams(records)
                weather = None
                if has_gps(streams) and act.started_at is not None:
                    lat = next((v for v in streams.latitude if v is not None), None)
                    lng = next((v for v in streams.longitude if v is not None), None)
                    if lat is not None and lng is not None:
                        end = act.started_at + timedelta(seconds=streams.duration_s)
                        weather = await fetch_ride_weather(lat, lng, act.started_at, end)
                await ingest_activity_streams(
                    db, user_id=user_id, activity_id=act.id,
                    streams=streams, ftp=ftp, weather=weather, commit=True,
                )
                logger.info("backfilled activity %s (gps=%s)", act.id, has_gps(streams))
            except Exception as exc:
                logger.warning("skip activity %s: %s", act.id, exc)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", type=int, required=True)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    await backfill_user(args.user_id, args.limit)


if __name__ == "__main__":
    asyncio.run(main())
```

> **Verify before running:** the import names `async_session_for_user` and `build_client_for_user` are the expected RLS-session and per-user-client helpers — confirm the actual names in `app/database.py` and `app/services/garmin_client.py` and adjust. The script is operational tooling, not imported by the app, so it has no unit test; validate by dry-running against one user with `--limit 1` and confirming the row's `has_gps`/`weather` populate.

- [ ] **Step 2: Smoke-run against one ride**

Run: `cd backend && python -m scripts.backfill_stream_enrichment --user-id <you> --limit 1`
Expected: logs `backfilled activity <id> (gps=True/False)`; the `activity_streams` row now has GPS channels in `streams` and `has_gps`/`weather` set (spot-check via psql or a quick select).

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/backfill_stream_enrichment.py
git commit -m "feat(streams): backfill script for GPS/speed/temp/biomech + weather"
```

---

## Self-Review

**Spec coverage (Phase 0 rows of the design doc):**
- GPS/lat-lng + speed + distance + temperature + biomech channels in parser → **Task 1**; through 1 Hz alignment → **Task 2**; persisted → **Task 3**.
- `ActivityStream.streams` blob gains the keys → **Task 3**; `has_gps` convenience + `weather` column → **Tasks 3–4**.
- Open-Meteo weather fetch, air density, relative wind → **Tasks 5–6**; wired into sync → **Task 7**.
- Backfill historical rides → **Task 8**.
- Graceful degradation (absent channel → absent output, never zero-filled; weather failure swallowed) → enforced in Tasks 1–3, 6–7 and asserted by their tests.

Deferred to later phases (correctly out of scope here): CdA/GAP analyzers (`environment.py` only ships the primitives), the `RaceDebrief` orchestrator/schema/endpoint (Phase 2), UI (Phase 3).

**Placeholder scan:** none — every code step carries full code; the two "verify the real key/helper name" notes are explicit verification steps, not deferred implementation.

**Type consistency:** `ActivityStreams` field names (`latitude`, `longitude`, `speed`, `distance`, `temperature`, `left_right_balance`, `torque_effectiveness`, `pedal_smoothness`) are identical across Tasks 1–3 and 7–8; `build_streams_blob`/`has_gps`/`fetch_ride_weather`/`ingest_activity_streams(..., weather=)` signatures match every call site.
