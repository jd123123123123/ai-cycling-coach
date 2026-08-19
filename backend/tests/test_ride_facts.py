"""The five facts `activities` cannot answer on its own.

Each of these decides whether an item in the catalogue is winnable at all, so
the tests are mostly about the NEGATIVE case: every resolver must return None
rather than a plausible guess. A rider awarded a rain bonus on a dry day can
never again trust the ones they earned.
"""
from datetime import datetime, timezone

from app.models.activity import Activity
from app.models.planned_workout import PlannedWorkout
from app.services import ride_facts as rf


def _activity(**kw) -> Activity:
    base = dict(
        id=1, user_id=1, sport="cycling",
        started_at=datetime(2026, 8, 19, 7, 30, tzinfo=timezone.utc),
        duration_seconds=3600, distance_meters=30_000, tss=45.0,
    )
    base.update(kw)
    return Activity(**base)


# ── surface ─────────────────────────────────────────────────────────────────

def test_surface_comes_from_what_the_device_said():
    assert rf.surface_of(_activity(
        raw_data={"activityType": {"typeKey": "gravel_cycling"}})) == "gravel"
    assert rf.surface_of(_activity(
        raw_data={"activityType": {"typeKey": "mountain_biking"}})) == "mtb"
    assert rf.surface_of(_activity(
        raw_data={"activityType": {"typeKey": "road_biking"}})) == "road"


def test_a_generic_cycling_ride_has_no_known_surface():
    """`cycling` genuinely does not say what the surface was. Defaulting it to
    road would hand every such ride the road-only bonuses for free."""
    assert rf.surface_of(_activity(raw_data={"activityType": {"typeKey": "cycling"}})) is None
    assert rf.surface_of(_activity(raw_data={"activityType": {"typeKey": "indoor_cycling"}})) is None


def test_surface_survives_a_missing_or_odd_payload():
    """Ingestion payloads differ per provider and some carry nothing useful.
    None is the answer; an exception on the ingestion path is not."""
    assert rf.surface_of(_activity(raw_data=None)) is None
    assert rf.surface_of(_activity(raw_data={})) is None
    assert rf.surface_of(_activity(raw_data={"activityType": "gravel"})) is None
    assert rf.surface_of(_activity(raw_data=["not", "a", "dict"])) is None


def test_a_flat_provider_key_is_read_too():
    """Wahoo/COROS and our own seeds use a flat key rather than Garmin's nest."""
    assert rf.surface_of(_activity(raw_data={"sport_type": "GRAVEL_CYCLING"})) == "gravel"
    assert rf.surface_of(_activity(raw_data={"sub_sport": "mountain_biking"})) == "mtb"


# ── the easy day ────────────────────────────────────────────────────────────

def _plan(*pcts: float | None) -> PlannedWorkout:
    return PlannedWorkout(
        user_id=1, date=datetime(2026, 8, 19).date(), sport="cycling", title="x",
        interval_structure={
            "intervals": [
                {"duration_seconds": 600, "power_target_pct_ftp": p} for p in pcts
            ]
        },
    )


def test_a_plan_is_easy_when_nothing_in_it_is_hard():
    assert rf._plan_asked_easy(_plan(55, 60, 65)) is True
    assert rf._plan_asked_easy(_plan(rf.EASY_PLAN_PCT_FTP)) is True


def test_one_hard_block_makes_the_whole_day_hard():
    """A session that is gentle apart from four minutes at threshold is asking
    for work, and riding it easy is not the discipline being rewarded."""
    assert rf._plan_asked_easy(_plan(55, 60, 95)) is False


def test_a_plan_with_no_prescribed_intensity_says_nothing():
    """Guessing 'easy' here would hand out the biggest charm bonus for free."""
    assert rf._plan_asked_easy(_plan(None, None)) is None
    assert rf._plan_asked_easy(PlannedWorkout(
        user_id=1, date=datetime(2026, 8, 19).date(), sport="cycling", title="x",
        interval_structure=None)) is None
    assert rf._plan_asked_easy(PlannedWorkout(
        user_id=1, date=datetime(2026, 8, 19).date(), sport="cycling", title="x",
        interval_structure={"intervals": []})) is None


def test_the_easy_thresholds_leave_room_to_ride():
    """The actual ceiling sits above the plan's own, so a rider who drifts up a
    climb has still ridden an easy day. The item rewards discipline; it does not
    police it to the decimal."""
    assert rf.EASY_ACTUAL_IF > rf.EASY_PLAN_PCT_FTP / 100


# ── weather ─────────────────────────────────────────────────────────────────

def test_the_wet_threshold_ignores_a_trace():
    """0.1 mm across three hours is not the rain Schutzbleche are for."""
    assert rf.WET_MM > 0.1


def test_the_weather_client_now_asks_for_precipitation():
    """Without it `was_wet` can only ever be None, and the two weather-gated
    items would be unwinnable rather than rare."""
    import inspect

    from app.services import weather_client

    src = inspect.getsource(weather_client.fetch_ride_weather)
    assert "precipitation" in src


# ── crew ────────────────────────────────────────────────────────────────────

def test_the_crew_window_is_generous():
    """Two people on the same ride routinely record windows minutes apart —
    different head units, different auto-pause. A strict window would make the
    crew items fire almost never and look broken rather than conditional."""
    assert rf.CREW_OVERLAP_S >= 10 * 60
