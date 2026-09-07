"""A ride without a power meter is still a ride.

Until 2026-09 the stream ingest returned early for any cycling activity whose
Garmin payload carried no power sample — *after* fetching the whole detail
payload. The rider's GPS track, altitude and pulse were downloaded and thrown
away, and because streams are written at exactly one moment (the sync that
first inserts the activity), no later sync ever went back for them. Confirmed
in production: three rides from a crew member with no power meter answered 404
from /analytics/activity-debrief/{id} while a metered ride answered 200.

These tests pin the two halves of the fix:

  * such a ride is stored, with the cycling power model off and its power
    channel EMPTY rather than the 0 W array `records_to_streams` synthesises
    (a stored zero array is read as a measurement by every downstream guard);
  * `backfill_missing_streams` goes back for the rides that never got one, in
    a bounded pass that advances instead of re-asking.

The session is faked rather than mocked away: `ingest_activity_streams` reaches
the DB only through get/add/execute/flush/commit, so a session-shaped object
runs the real ingest path and lets the tests assert on what it decided to
persist.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.models.activity_stream import ActivityStream
from app.services import garmin_sync_service as gss
from app.services.garmin_client import GarminRateLimitError

START = datetime(2026, 9, 1, 7, 0, tzinfo=timezone.utc)
BASE_MS = int(START.timestamp() * 1000)


# ── payload + session doubles ───────────────────────────────────────────────


def detail_payload(n: int, **channels: float) -> dict:
    """A Garmin activity-details payload carrying exactly `channels`.

    Garmin's rows are positional against `metricDescriptors`, so the parser is
    exercised for real; each named channel holds one constant value so the
    tests are about which channels exist, not about their shape.
    """
    keys = ["directTimestamp", *channels]
    return {
        "metricDescriptors": [
            {"key": k, "metricsIndex": i} for i, k in enumerate(keys)
        ],
        "activityDetailMetrics": [
            {"metrics": [BASE_MS + i * 1000, *channels.values()]}
            for i in range(n)
        ],
    }


class FakeDB:
    def __init__(self, candidates=None, profile=None):
        self.rows: list[ActivityStream] = []
        self.statements: list = []
        self.commits = 0
        self.rollbacks = 0
        self._candidates = candidates or []
        self._profile = profile

    async def get(self, _model, pk):
        return next((r for r in self.rows if r.activity_id == pk), None)

    def add(self, obj):
        self.rows.append(obj)

    async def execute(self, stmt):
        self.statements.append(stmt)
        result = MagicMock()
        # The one predicate the fake honours: the refusal memo. The SQL itself
        # is asserted separately; this is what lets a test run two passes and
        # watch the second one skip what the first found empty.
        result.scalars.return_value.all.return_value = [
            a for a in self._candidates if a.id not in gss._STREAMS_UNAVAILABLE
        ]
        result.scalar_one_or_none.return_value = self._profile
        return result

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


class FakeClient:
    """Answers get_activity_details from a dict; an Exception value is raised."""

    def __init__(self, payloads: dict):
        self.payloads = payloads
        self.asked: list[int] = []

    async def get_activity_details(self, activity_id: int, max_chart_size: int = 10000):
        self.asked.append(activity_id)
        payload = self.payloads.get(activity_id)
        if isinstance(payload, Exception):
            raise payload
        return payload


def ride(activity_id: int = 111, external_id: str | None = "999111"):
    return SimpleNamespace(
        id=activity_id, sport="cycling", started_at=START,
        external_id=external_id, source="garmin",
    )


PROFILE = SimpleNamespace(ftp_watts=250.0, weight_kg=72.0)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    """No weather calls, no rate-limit sleeps, and a clean refusal memo."""
    async def _no_weather(*_a, **_k):
        return None

    monkeypatch.setattr(gss, "fetch_ride_weather", _no_weather)
    monkeypatch.setattr(gss, "INTER_REQUEST_DELAY", 0)
    gss._STREAMS_UNAVAILABLE.clear()
    yield
    gss._STREAMS_UNAVAILABLE.clear()


# ── what gets stored ────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestWhatARideStores:
    async def _sync(self, payload):
        db = FakeDB()
        client = FakeClient({999111: payload})
        await gss._sync_activity_streams(
            db, 1, client, ride(), {"activityId": 999111}, PROFILE,
        )
        return db

    async def test_a_metered_ride_stores_its_stream_and_its_power_model(self):
        db = await self._sync(detail_payload(
            600, directPower=210.0, directHeartRate=142.0,
            directLatitude=47.37, directLongitude=8.54, directElevation=430.0,
        ))
        assert len(db.rows) == 1
        row = db.rows[0]
        assert row.streams["power"], "a measured ride keeps its watts"
        assert row.mmp_curve is not None
        assert row.normalized_power is not None
        assert row.has_gps is True

    async def test_a_ride_without_power_still_stores_its_recording(self):
        db = await self._sync(detail_payload(
            600, directHeartRate=142.0, directLatitude=47.37,
            directLongitude=8.54, directElevation=430.0,
        ))
        assert len(db.rows) == 1, "the map, the profile and the pulse were kept"
        row = db.rows[0]
        assert row.has_gps is True
        assert row.streams["latitude"] and row.streams["longitude"]
        assert any(v is not None for v in row.streams["altitude"])
        assert any(v is not None for v in row.streams["heart_rate"])

    async def test_and_stores_no_power_model_for_it(self):
        db = await self._sync(detail_payload(
            600, directHeartRate=142.0, directLatitude=47.37,
            directLongitude=8.54, directElevation=430.0,
        ))
        row = db.rows[0]
        assert row.mmp_curve is None
        assert row.normalized_power is None
        assert row.cp_watts is None
        assert row.w_prime_j is None
        assert row.eftp_watts is None

    async def test_nor_a_power_channel_of_fabricated_zeroes(self):
        # `records_to_streams` fills a missing power sample with 0.0 — correct
        # for a metered bike that was coasting, a lie for a bike with no meter.
        # Stored, it is non-empty and therefore read as a measurement.
        db = await self._sync(detail_payload(
            600, directHeartRate=142.0, directLatitude=47.37, directLongitude=8.54,
        ))
        assert db.rows[0].streams["power"] == []

    async def test_and_never_writes_that_zero_back_onto_the_activity(self):
        # ingest_activity_streams backfills Activity.normalized_power from the
        # analysis — which for a zero array would replace "no power meter"
        # (NULL) with a measured-looking 0 W.
        db = await self._sync(detail_payload(
            600, directHeartRate=142.0, directLatitude=47.37, directLongitude=8.54,
        ))
        assert db.statements == []

    async def test_a_ride_with_no_usable_channel_stores_nothing(self):
        # An indoor session with a cadence sensor and nothing else: no watts,
        # no track, no pulse, no altitude. There is nothing to map or score.
        db = await self._sync(detail_payload(600, directBikeCadence=88.0))
        assert db.rows == []

    async def test_an_empty_payload_stores_nothing(self):
        db = await self._sync(None)
        assert db.rows == []


# ── the backfill ────────────────────────────────────────────────────────────


def _sql(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
class TestBackfill:
    async def test_it_asks_only_for_garmin_rides_with_no_stream_row(self):
        db = FakeDB(candidates=[], profile=PROFILE)
        await gss.backfill_missing_streams(db, 1, FakeClient({}))
        sql = _sql(db.statements[0]).lower()
        assert "left outer join activity_streams" in sql
        assert "activity_streams.activity_id is null" in sql
        assert "activities.sport = 'cycling'" in sql
        assert "activities.source = 'garmin'" in sql
        assert f"limit {gss.STREAM_BACKFILL_MAX_PER_SYNC}" in sql

    async def test_it_fetches_a_ride_that_has_no_stream(self):
        target = ride(activity_id=42, external_id="555")
        db = FakeDB(candidates=[target], profile=PROFILE)
        client = FakeClient({555: detail_payload(
            600, directHeartRate=140.0, directLatitude=47.4, directLongitude=8.5,
        )})
        stored = await gss.backfill_missing_streams(db, 1, client)
        assert stored == 1
        assert client.asked == [555]
        assert [r.activity_id for r in db.rows] == [42]
        assert db.commits == 1, "each healed ride is committed as it lands"

    async def test_a_ride_that_already_has_one_is_never_a_candidate(self):
        # The LEFT JOIN … IS NULL is the skip: a ride with a stream row cannot
        # be selected, so an empty candidate list costs no Garmin calls at all.
        db = FakeDB(candidates=[], profile=PROFILE)
        client = FakeClient({})
        assert await gss.backfill_missing_streams(db, 1, client) == 0
        assert client.asked == []

    async def test_a_barren_ride_is_not_asked_for_twice(self):
        # Nothing to store is a property of the recording, not of today: the
        # ride stays selectable forever, so it has to be remembered or it
        # occupies the same slot on every pass and older rides never get one.
        target = ride(activity_id=7, external_id="777")
        db = FakeDB(candidates=[target], profile=PROFILE)
        client = FakeClient({777: detail_payload(600, directBikeCadence=88.0)})

        assert await gss.backfill_missing_streams(db, 1, client) == 0
        assert 7 in gss._STREAMS_UNAVAILABLE

        await gss.backfill_missing_streams(db, 1, client)
        second_pass = [
            s for s in db.statements if "activity_streams" in _sql(s)
        ][-1]
        assert "activities.id not in (7)" in _sql(second_pass).lower()
        assert client.asked == [777], "asked once, not once per sync"

    async def test_one_pass_is_bounded(self):
        rides = [ride(activity_id=i, external_id=str(i)) for i in range(1, 6)]
        db = FakeDB(candidates=rides[:2], profile=PROFILE)
        client = FakeClient({i: detail_payload(
            60, directLatitude=47.4, directLongitude=8.5,
        ) for i in range(1, 6)})
        await gss.backfill_missing_streams(db, 1, client, limit=2)
        assert "limit 2" in _sql(db.statements[0]).lower()
        assert len(client.asked) == 2

    async def test_throttling_ends_the_pass_instead_of_pressing_on(self):
        rides = [ride(activity_id=i, external_id=str(i)) for i in (1, 2, 3)]
        db = FakeDB(candidates=rides, profile=PROFILE)
        client = FakeClient({
            1: detail_payload(60, directLatitude=47.4, directLongitude=8.5),
            2: GarminRateLimitError("slow down"),
            3: detail_payload(60, directLatitude=47.4, directLongitude=8.5),
        })
        stored = await gss.backfill_missing_streams(db, 1, client)
        assert stored == 1, "what was already stored stays stored"
        assert client.asked == [1, 2]
        assert 2 not in gss._STREAMS_UNAVAILABLE, "a throttle is not a verdict"

    async def test_a_ride_whose_external_id_is_not_a_garmin_id_is_dropped(self):
        db = FakeDB(candidates=[ride(activity_id=9, external_id="coros-abc")],
                    profile=PROFILE)
        client = FakeClient({})
        assert await gss.backfill_missing_streams(db, 1, client) == 0
        assert client.asked == []
        assert 9 in gss._STREAMS_UNAVAILABLE

    async def test_a_broken_payload_never_breaks_the_sync(self):
        db = FakeDB(candidates=[ride(activity_id=5, external_id="5")],
                    profile=PROFILE)
        client = FakeClient({5: RuntimeError("garmin returned nonsense")})
        assert await gss.backfill_missing_streams(db, 1, client) == 0
        assert db.rollbacks == 1, "a poisoned session would take the sync down"
