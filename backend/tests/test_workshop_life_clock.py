"""The two odometers must never be confused for one another.

`km_since_service` is cleared by cleaning the chain. `life_km` is cleared only
by fitting a new one. Every bug this feature can have is one of those two lines
resetting the other, so these tests drive the real service functions against a
fake session and check exactly that.
"""
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from app.models.bike_wear import BikeComponent, ComponentMeasurement
from app.services import bike_wear, workshop


class FakeSession:
    """Answers the three selects `workshop` makes, and records what was added."""

    def __init__(self, rows=None, measurements=(), rides=()):
        self.rows = rows or {}
        self.measurements = list(measurements)
        self.rides = list(rides)
        self.added = []

    async def execute(self, stmt, *a, **k):
        text = str(stmt)
        result = MagicMock()
        if "component_measurements" in text:
            result.scalars.return_value.all.return_value = list(self.measurements)
        elif "FROM activities" in text:
            result.all.return_value = list(self.rides)
        else:
            result.scalars.return_value = list(self.rows.values())
            result.scalars.return_value = iter(list(self.rows.values()))
        return result

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, ComponentMeasurement):
            self.measurements.append(obj)
        if isinstance(obj, BikeComponent):
            self.rows[obj.component_id] = obj

    async def flush(self):
        return None


def chain_row(**over):
    row = BikeComponent(user_id=1, component_id="chain")
    row.km_since_service = over.get("km_since_service", 120.0)
    row.km_total = over.get("km_total", 3_000.0)
    row.life_km = over.get("life_km", 2_400.0)
    row.longest_run_km = over.get("longest_run_km", 0.0)
    row.services = 0
    row.last_service_at = over.get("last_service_at", datetime.now(UTC) - timedelta(days=5))
    row.owned = True
    row.method = over.get("method", "oil")
    row.last_activity_id = None
    return row


def full_rows(**over):
    rows = {}
    for cid in bike_wear.COMPONENTS:
        row = BikeComponent(user_id=1, component_id=cid)
        row.km_since_service = 0.0
        row.km_total = 0.0
        row.life_km = 0.0
        row.longest_run_km = 0.0
        row.services = 0
        row.last_service_at = None
        row.owned = True
        row.method = None
        row.last_activity_id = None
        rows[cid] = row
    rows["chain"] = chain_row(**over)
    return rows


class TestAccrual:
    @pytest.mark.asyncio
    async def test_a_ride_advances_both_clocks_by_the_same_weighted_amount(self):
        rows = full_rows(km_since_service=0.0, life_km=0.0, km_total=0.0)
        db = FakeSession(rows)
        await workshop.accrue(db, 1, activity_id=7, distance_m=50_000, kj=1_000, descent_m=400)
        chain = rows["chain"]
        assert chain.km_since_service > 0
        assert chain.life_km == pytest.approx(chain.km_since_service)
        # …while the brag odometer stays in real road kilometres.
        assert chain.km_total == pytest.approx(50.0)

    @pytest.mark.asyncio
    async def test_a_replayed_ride_is_refused_by_both_clocks(self):
        rows = full_rows(km_since_service=0.0, life_km=0.0)
        db = FakeSession(rows)
        await workshop.accrue(db, 1, activity_id=7, distance_m=50_000, kj=1_000)
        once = rows["chain"].life_km
        await workshop.accrue(db, 1, activity_id=7, distance_m=50_000, kj=1_000)
        assert rows["chain"].life_km == pytest.approx(once)


class TestServiceDoesNotTouchLife:
    @pytest.mark.asyncio
    async def test_cleaning_the_chain_does_not_make_it_younger(self, monkeypatch):
        rows = full_rows(km_since_service=280.0, life_km=2_400.0)
        db = FakeSession(rows)

        async def balance(_db, _uid):
            return 0

        async def credit(*a, **k):
            return None

        monkeypatch.setattr(workshop.rewards, "balance_of", balance)
        monkeypatch.setattr(workshop.rewards, "_credit", credit)

        await workshop.service(db, 1, "chain")
        assert rows["chain"].km_since_service == 0.0
        assert rows["chain"].life_km == 2_400.0  # the expensive one survives


class TestMeasure:
    @pytest.mark.asyncio
    async def test_a_reading_is_stored_with_the_odometer_it_was_taken_at(self):
        rows = full_rows(life_km=1_300.0)
        db = FakeSession(rows)
        result = await workshop.measure(db, 1, "chain", 0.35)
        stored = [m for m in db.added if isinstance(m, ComponentMeasurement)]
        assert len(stored) == 1
        assert (stored[0].measured_pct, stored[0].life_km_at) == (0.35, 1_300.0)
        assert result.life.calibrated is True

    @pytest.mark.asyncio
    async def test_a_fast_wearing_reading_says_it_moved_the_estimate(self):
        db = FakeSession(full_rows(life_km=1_300.0))
        result = await workshop.measure(db, 1, "chain", 0.35)
        assert result.moved_estimate is True
        assert result.life.limit_km < bike_wear.CHAIN_LIFE_KM["oil"]

    @pytest.mark.asyncio
    async def test_an_impossible_reading_is_refused_before_it_is_stored(self):
        db = FakeSession(full_rows())
        with pytest.raises(ValueError):
            await workshop.measure(db, 1, "chain", 50.0)
        assert not [m for m in db.added if isinstance(m, ComponentMeasurement)]

    @pytest.mark.asyncio
    async def test_an_unknown_component_is_refused(self):
        db = FakeSession(full_rows())
        with pytest.raises(workshop.UnknownComponentError):
            await workshop.measure(db, 1, "warp_core", 0.5)


class TestReplace:
    @pytest.mark.asyncio
    async def test_fitting_a_new_chain_clears_every_clock(self):
        rows = full_rows(km_since_service=280.0, life_km=2_900.0, km_total=3_400.0)
        db = FakeSession(rows)
        result = await workshop.replace(db, 1, "chain")
        chain = rows["chain"]
        assert (chain.life_km, chain.km_since_service, chain.km_total) == (0.0, 0.0, 0.0)
        assert result.retired_life_km == 2_900.0
        assert result.retired_km_total == 3_400.0

    @pytest.mark.asyncio
    async def test_the_retired_run_is_kept_as_the_record(self):
        rows = full_rows(km_since_service=310.0, longest_run_km=200.0)
        db = FakeSession(rows)
        await workshop.replace(db, 1, "chain")
        assert rows["chain"].longest_run_km == 310.0

    @pytest.mark.asyncio
    async def test_dating_the_fitting_in_the_past_replays_the_rides_since(self):
        rows = full_rows(life_km=2_900.0)
        # (distance_m, elevation_gain_m, total_kj) — the replay's row shape.
        db = FakeSession(rows, rides=[(40_000, 300, 800), (60_000, 500, 1_200)])
        result = await workshop.replace(
            db, 1, "chain", fitted_at=datetime.now(UTC) - timedelta(days=21),
        )
        assert result.rides_replayed == 2
        assert rows["chain"].life_km > 0
        assert rows["chain"].life_km == pytest.approx(rows["chain"].km_since_service)

    @pytest.mark.asyncio
    async def test_a_future_fitting_date_is_pulled_back_to_now(self):
        rows = full_rows()
        db = FakeSession(rows)
        await workshop.replace(db, 1, "chain", fitted_at=datetime.now(UTC) + timedelta(days=40))
        assert rows["chain"].last_service_at <= datetime.now(UTC)

    @pytest.mark.asyncio
    async def test_readings_are_not_deleted_they_describe_the_rider(self):
        rows = full_rows(life_km=2_900.0)
        reading = ComponentMeasurement(
            user_id=1, component_id="chain", measured_pct=0.35, life_km_at=1_300.0,
        )
        db = FakeSession(rows, measurements=[reading])
        result = await workshop.replace(db, 1, "chain")
        assert db.measurements == [reading]
        # The new chain starts at zero but keeps the rider's calibrated limit.
        assert result.life.calibrated is True
        assert result.life.status == "fresh"
