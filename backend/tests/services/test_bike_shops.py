"""Unit tests for the OSM workshop finder — parsing and geometry only.

No network: Overpass is stubbed with a payload shaped exactly like a real
response (node + way-with-centre + a repair station + a supermarket that
happens to fix bikes), because every bug this service can have lives in the
normalisation, not in httpx.
"""
from datetime import datetime

import pytest

from app.services import bike_shops
from app.services.bike_shops import (
    build_query,
    compass,
    find_workshops,
    haversine_m,
    normalize,
    parse_opening_hours,
)

BERLIN = (52.5200, 13.4050)


def _wed_1000() -> datetime:
    return datetime(2026, 8, 19, 10, 0)  # a Wednesday


class TestGeometry:
    def test_haversine_known_distance(self):
        # Berlin Mitte → Alexanderplatz ≈ 1.0 km
        d = haversine_m(52.5200, 13.4050, 52.5219, 13.4132)
        assert 500 < d < 700

    def test_haversine_is_zero_at_origin(self):
        assert haversine_m(52.52, 13.405, 52.52, 13.405) == pytest.approx(0.0, abs=1e-6)

    def test_compass_points_east(self):
        assert compass(52.52, 13.40, 52.52, 13.50) == "E"

    def test_compass_points_north(self):
        assert compass(52.52, 13.40, 52.62, 13.40) == "N"


class TestOpeningHours:
    def test_none_value_is_unknown(self):
        assert parse_opening_hours(None, _wed_1000()) == (None, None)

    def test_24_7(self):
        assert parse_opening_hours("24/7", _wed_1000()) == (True, "24/7")

    def test_weekday_range_open(self):
        open_now, todays = parse_opening_hours("Mo-Fr 09:00-18:00", _wed_1000())
        assert open_now is True
        assert todays == "09:00-18:00"

    def test_weekday_range_before_opening(self):
        open_now, _ = parse_opening_hours("Mo-Fr 11:00-18:00", _wed_1000())
        assert open_now is False

    def test_lunch_break_closes_the_shop(self):
        wed_1330 = datetime(2026, 8, 19, 13, 30)
        open_now, todays = parse_opening_hours("Mo-Fr 09:00-13:00,14:00-18:00", wed_1330)
        assert open_now is False
        assert todays == "09:00-13:00, 14:00-18:00"

    def test_multi_rule_picks_todays_rule(self):
        sat_1100 = datetime(2026, 8, 22, 11, 0)
        open_now, todays = parse_opening_hours("Mo-Fr 09:00-18:00; Sa 10:00-13:00", sat_1100)
        assert open_now is True
        assert todays == "10:00-13:00"

    def test_day_not_covered_is_closed(self):
        sun_1100 = datetime(2026, 8, 23, 11, 0)
        assert parse_opening_hours("Mo-Fr 09:00-18:00", sun_1100) == (False, None)

    def test_explicit_off_rule(self):
        wed = _wed_1000()
        assert parse_opening_hours("Mo-Fr 09:00-18:00; We off", wed) == (False, None)

    def test_unsupported_syntax_returns_unknown_not_closed(self):
        # A confident "closed" here would send a rider to a shut door for
        # nothing; unknown lets the UI show the raw string instead.
        assert parse_opening_hours("Mar-Oct Mo-Fr 09:00-18:00", _wed_1000()) == (None, None)
        assert parse_opening_hours("sunrise-sunset", _wed_1000()) == (None, None)
        assert parse_opening_hours("Mo-Fr 09:00-18:00; PH off", _wed_1000())[0] is None


ELEMENTS = [
    {
        "type": "node",
        "id": 1,
        "lat": 52.5219,
        "lon": 13.4132,
        "tags": {
            "shop": "bicycle",
            "name": "Radhaus Mitte",
            "opening_hours": "Mo-Fr 10:00-19:00; Sa 10:00-16:00",
            "phone": "+49 30 12345",
            "website": "https://radhaus.example",
            "addr:street": "Karl-Marx-Allee",
            "addr:housenumber": "9",
            "addr:city": "Berlin",
            "service:bicycle:repair": "yes",
            "service:bicycle:second_hand": "yes",
        },
    },
    {
        # Same shop mapped a second time as a building way — must not appear twice.
        "type": "way",
        "id": 2,
        "center": {"lat": 52.52195, "lon": 13.41325},
        "tags": {"shop": "bicycle", "name": "Radhaus Mitte", "brand": "Canyon"},
    },
    {
        "type": "node",
        "id": 3,
        "lat": 52.5230,
        "lon": 13.4100,
        "tags": {
            "amenity": "bicycle_repair_station",
            "name": "Reparatursäule Alex",
            "service:bicycle:pump": "yes",
            "service:bicycle:chain_tool": "yes",
        },
    },
    {
        "type": "node",
        "id": 4,
        "lat": 52.5300,
        "lon": 13.4200,
        "tags": {"shop": "doityourself", "name": "Baumarkt", "service:bicycle:repair": "yes"},
    },
    {
        # 40 km out — beyond the requested radius, must be dropped.
        "type": "node",
        "id": 5,
        "lat": 52.9000,
        "lon": 13.4050,
        "tags": {"shop": "bicycle", "name": "Weit weg"},
    },
    {"type": "node", "id": 6, "tags": {"shop": "bicycle"}},  # no coords → dropped
]


class TestNormalize:
    def rows(self, radius=15_000):
        return normalize(ELEMENTS, BERLIN, radius, _wed_1000())

    def test_drops_coordless_and_out_of_radius(self):
        names = [r["name"] for r in self.rows()]
        assert "Weit weg" not in names
        assert len(self.rows()) == 3  # shop, station, Baumarkt

    def test_sorted_by_distance(self):
        d = [r["distance_m"] for r in self.rows()]
        assert d == sorted(d)

    def test_dedupes_node_and_way_of_the_same_shop(self):
        shops = [r for r in self.rows() if r["name"] == "Radhaus Mitte"]
        assert len(shops) == 1
        # …and the surviving record absorbed the way's brand tag.
        assert shops[0]["brands"] == "Canyon"

    def test_shop_fields(self):
        shop = next(r for r in self.rows() if r["name"] == "Radhaus Mitte")
        assert shop["kind"] == "shop"
        assert shop["address"] == "Karl-Marx-Allee 9, Berlin"
        assert shop["phone"] == "+49 30 12345"
        assert shop["open_now"] is True
        assert shop["todays_hours"] == "10:00-19:00"
        assert shop["services"]["repair"] is True
        assert shop["services"]["second_hand"] is True
        assert shop["direction"] == "E"  # 69° bearing → east octant

    def test_repair_station_is_its_own_kind_and_assumed_open(self):
        st = next(r for r in self.rows() if r["kind"] == "station")
        assert st["open_now"] is True
        assert st["todays_hours"] == "24/7"
        assert st["services"]["pump"] is True
        assert st["services"]["diy"] is True

    def test_non_shop_repair_place_is_kind_service(self):
        row = next(r for r in self.rows() if r["name"] == "Baumarkt")
        assert row["kind"] == "service"
        assert row["services"]["repair"] is True
        assert row["services"]["retail"] is False


class TestQuery:
    def test_query_covers_all_three_buckets(self):
        q = build_query(52.52, 13.405, 5000)
        assert '"shop"="bicycle"' in q
        assert '"amenity"="bicycle_repair_station"' in q
        assert '"service:bicycle:repair"!="no"' in q
        assert "around:5000,52.52000,13.40500" in q
        assert "out center tags" in q


class TestFindWorkshops:
    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        bike_shops._cache.clear()
        bike_shops._locks.clear()
        yield
        bike_shops._cache.clear()
        bike_shops._locks.clear()

    @pytest.mark.asyncio
    async def test_caches_by_grid_cell(self, monkeypatch):
        calls = []

        async def fake_fetch(query, client=None):
            calls.append(query)
            return ELEMENTS

        monkeypatch.setattr(bike_shops, "_fetch", fake_fetch)
        first = await find_workshops(*BERLIN, 15_000, now=_wed_1000())
        # 300 m away → same rounded grid cell → served from cache.
        second = await find_workshops(52.5227, 13.4050, 15_000, now=_wed_1000())
        assert len(calls) == 1
        assert first and second
        # Distances are still measured from the caller's true position.
        assert first[0]["distance_m"] != second[0]["distance_m"]

    @pytest.mark.asyncio
    async def test_upstream_failure_returns_empty_not_raise(self, monkeypatch):
        async def dead_fetch(query, client=None):
            return None  # every mirror down

        monkeypatch.setattr(bike_shops, "_fetch", dead_fetch)
        assert await find_workshops(*BERLIN, 15_000, now=_wed_1000()) == []

    @pytest.mark.asyncio
    async def test_outage_serves_stale_and_is_not_cached_as_empty(self, monkeypatch):
        state = {"alive": True}

        async def flaky_fetch(query, client=None):
            return ELEMENTS if state["alive"] else None

        monkeypatch.setattr(bike_shops, "_fetch", flaky_fetch)
        warm = await find_workshops(*BERLIN, 15_000, now=_wed_1000())
        state["alive"] = False
        bike_shops._cache[list(bike_shops._cache)[0]] = (0.0, ELEMENTS)  # force expiry
        during_outage = await find_workshops(*BERLIN, 15_000, now=_wed_1000())
        assert len(during_outage) == len(warm) > 0

    @pytest.mark.asyncio
    async def test_genuinely_empty_area_is_cached(self, monkeypatch):
        calls = []

        async def empty_fetch(query, client=None):
            calls.append(query)
            return []  # a real answer: nothing mapped out here

        monkeypatch.setattr(bike_shops, "_fetch", empty_fetch)
        await find_workshops(*BERLIN, 15_000, now=_wed_1000())
        await find_workshops(*BERLIN, 15_000, now=_wed_1000())
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_radius_is_clamped(self, monkeypatch):
        seen = {}

        async def fake_fetch(query, client=None):
            seen["q"] = query
            return []

        monkeypatch.setattr(bike_shops, "_fetch", fake_fetch)
        await find_workshops(*BERLIN, 10_000_000, now=_wed_1000())
        assert f"around:{bike_shops.MAX_RADIUS_M + bike_shops._CACHE_PAD_M}" in seen["q"]
