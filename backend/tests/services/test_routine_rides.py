"""The routine-ride detector, against the real commuter's real rides.

The fixture below is not invented: it is the shape of the last 40 rides pulled
from production for the crew-mate whose commute floods the feed — two legs,
~13.1 km around 03:00 UTC and ~17.7 km around 14:00 UTC, weekdays, over and
over — with the rides that must SURVIVE (a ROUVY interval session, a 12.1 km
mountain effort, a 118 km Saturday) around them.

The measurement that ruled out the obvious fix is reproduced as a test too:
a 15 km threshold removes the mountain effort and still misses one commute leg.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from app.services import eddington
from app.services.routine_rides import (
    DEFAULT_PARAMS,
    RideFacts,
    RoutineParams,
    RoutineVerdict,
    apply_override,
    commute_marker,
    detect_routine,
)

BERLIN = ZoneInfo("Europe/Berlin")
#: A Friday, three days after the last ride in the fixture — every ride below
#: is inside the 60-day window from here.
NOW = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)


def _utc(y, m, d, hh, mm) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=timezone.utc)


# ──────────────────────────────────────────────────────────────────────
# The production fixture
# ──────────────────────────────────────────────────────────────────────

#: (started_at UTC, distance km, minutes, title) — the ten commute rides
#: exactly as they came out of production.
COMMUTE_ROWS = [
    (_utc(2026, 8, 25, 2, 58), 13.1, 31, "Nachtradfahrt MdRzA"),
    (_utc(2026, 8, 25, 14, 11), 17.7, 41, "Diepholz Radfahren"),
    (_utc(2026, 8, 26, 2, 57), 13.2, 32, "Steinfeld (Oldenburg) Radfahren"),
    (_utc(2026, 8, 26, 14, 7), 17.7, 41, "Diepholz Radfahren"),
    (_utc(2026, 8, 27, 2, 56), 13.2, 32, "Steinfeld (Oldenburg) Radfahren"),
    (_utc(2026, 8, 27, 14, 15), 17.7, 41, "Diepholz Radfahren"),
    (_utc(2026, 9, 1, 2, 50), 13.1, 31, "Steinfeld (Oldenburg) Radfahren"),
    (_utc(2026, 9, 1, 13, 11), 17.7, 50, "Diepholz Radfahren"),
    (_utc(2026, 9, 3, 2, 57), 13.1, 31, "Steinfeld (Oldenburg) Radfahren"),
    (_utc(2026, 9, 3, 14, 31), 17.7, 50, "Diepholz Radfahren"),
]

#: The rides that must survive. Each is real training the feed should keep:
#: trainer sessions, a short steep effort, weekend distance.
OTHER_ROWS = [
    (_utc(2026, 8, 22, 8, 30), 118.4, 254, "Samstagsrunde Wiehengebirge"),
    (_utc(2026, 8, 23, 9, 5), 12.1, 47, "Bergwertung Steinegge"),
    (_utc(2026, 8, 24, 17, 40), 42.3, 68, "ROUVY — Alpe du Zwift Intervalle"),
    (_utc(2026, 8, 28, 16, 20), 31.6, 62, "Feierabendrunde"),
    (_utc(2026, 8, 29, 7, 55), 86.2, 190, "Lange Ausfahrt Dümmer See"),
    (_utc(2026, 8, 30, 10, 10), 54.9, 121, "Sonntagsrunde mit Jan"),
    (_utc(2026, 9, 2, 18, 5), 26.5, 44, "ROUVY — Sweet Spot 2x20"),
    (_utc(2026, 9, 3, 19, 30), 38.8, 74, "Zwift Gruppenfahrt"),
]


def _fixture() -> list[RideFacts]:
    rows = COMMUTE_ROWS + OTHER_ROWS
    return [
        RideFacts(
            activity_id=100 + i,
            started_at=started,
            distance_m=km * 1000,
            duration_s=mins * 60,
            title=title,
        )
        for i, (started, km, mins, title) in enumerate(rows)
    ]


def _commute_ids(rides: list[RideFacts]) -> set[int]:
    return {r.activity_id for r in rides[: len(COMMUTE_ROWS)]}


def _other_ids(rides: list[RideFacts]) -> set[int]:
    return {r.activity_id for r in rides[len(COMMUTE_ROWS):]}


# ──────────────────────────────────────────────────────────────────────
# The pattern the whole feature exists for
# ──────────────────────────────────────────────────────────────────────


def test_both_commute_legs_are_caught():
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)

    routine = {aid for aid, v in result.verdicts.items() if v.is_routine}
    assert routine == _commute_ids(rides), (
        "every one of the ten commute rides must be caught, and nothing else"
    )

    # Two legs, not one merged blob: 13.1 km and 17.7 km are 35 % apart and stay
    # separate clusters, each with its own five occurrences.
    legs = sorted(
        (c for c in result.clusters.values() if c.is_routine),
        key=lambda c: c.distance_m,
    )
    assert len(legs) == 2
    assert [c.occurrences for c in legs] == [5, 5]
    assert round(legs[0].distance_m / 1000, 1) == pytest.approx(13.1, abs=0.1)
    assert round(legs[1].distance_m / 1000, 1) == pytest.approx(17.7, abs=0.1)
    # Local clock, not UTC: 02:5x UTC in September is just before 05:00 in Berlin.
    assert 4 * 60 + 40 <= legs[0].start_minute_local <= 5 * 60
    assert 15 * 60 + 40 <= legs[1].start_minute_local <= 16 * 60 + 30
    assert all(c.weekday_class == "werktags" for c in legs)


def test_the_rides_that_must_survive_survive():
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    for aid in _other_ids(rides):
        assert result.verdicts[aid].is_routine is False


def test_a_distance_threshold_would_have_been_wrong():
    """The measurement that ruled out the obvious fix, kept as a test.

    Under 15 km removes the 12.1 km mountain effort and still leaves the
    17.7 km evening commute in the feed. Repetition catches both legs and
    keeps the mountain."""
    rides = _fixture()
    under_15 = {r.activity_id for r in rides if (r.distance_m or 0) < 15_000}
    mountain = next(r for r in rides if r.title == "Bergwertung Steinegge")
    evening = [r for r in rides if (r.distance_m or 0) == 17_700]

    assert mountain.activity_id in under_15          # a real effort, removed
    assert all(r.activity_id not in under_15 for r in evening)  # commute kept

    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert result.verdicts[mountain.activity_id].is_routine is False
    assert all(result.verdicts[r.activity_id].is_routine for r in evening)


def test_reason_is_plain_german_and_states_the_numbers():
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    reason = result.verdicts[rides[0].activity_id].reason
    assert "5 fast gleiche Fahrten" in reason
    assert "60 Tagen" in reason
    assert "13,1 km" in reason          # German decimal comma
    assert "Uhr" in reason
    assert "werktags" in reason
    # The marked leg quotes the rider's own shorthand back at them.
    assert "MdRzA" in reason


# ──────────────────────────────────────────────────────────────────────
# The negative cases
# ──────────────────────────────────────────────────────────────────────


def test_a_rider_whose_rides_are_all_different_has_no_routine():
    rides = [
        RideFacts(
            activity_id=200 + i,
            started_at=NOW - timedelta(days=3 * i + 1, hours=i),
            distance_m=(20 + 11 * i) * 1000,
            duration_s=3600 + 600 * i,
            title=f"Ausfahrt {i}",
        )
        for i in range(9)
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert not any(v.is_routine for v in result.verdicts.values())
    assert set(result.verdicts) == {r.activity_id for r in rides}


def test_two_occurrences_are_a_coincidence_not_a_routine():
    rides = [
        RideFacts(
            activity_id=301,
            started_at=_utc(2026, 9, 1, 16, 5),
            distance_m=24_000,
            duration_s=3300,
            title="Feierabendrunde",
        ),
        RideFacts(
            activity_id=302,
            started_at=_utc(2026, 9, 3, 16, 12),
            distance_m=24_400,
            duration_s=3350,
            title="Feierabendrunde",
        ),
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert not any(v.is_routine for v in result.verdicts.values())
    reason = result.verdicts[301].reason
    assert "Nur 2 ähnliche Fahrten" in reason
    assert "Ab 3" in reason


def test_third_occurrence_flips_the_same_cluster():
    """The bar is the only thing between the previous test and this one."""
    base = [
        RideFacts(301, _utc(2026, 9, 1, 16, 5), 24_000, 3300, "Feierabendrunde"),
        RideFacts(302, _utc(2026, 9, 3, 16, 12), 24_400, 3350, "Feierabendrunde"),
    ]
    third = RideFacts(303, _utc(2026, 9, 4, 16, 0), 24_200, 3320, "Feierabendrunde")
    assert not any(
        v.is_routine for v in detect_routine(base, tz=BERLIN, now=NOW).verdicts.values()
    )
    after = detect_routine(base + [third], tz=BERLIN, now=NOW)
    assert all(after.verdicts[aid].is_routine for aid in (301, 302, 303))


def test_weekend_twin_is_not_the_weekday_commute():
    """Same distance, same hour, Saturday: a different habit, not more of the
    same one — and two weekday rides alone are not a routine."""
    rides = [
        RideFacts(401, _utc(2026, 9, 1, 16, 0), 24_000, 3300, "Runde"),   # Tue
        RideFacts(402, _utc(2026, 9, 3, 16, 0), 24_000, 3300, "Runde"),   # Thu
        RideFacts(403, _utc(2026, 8, 29, 16, 0), 24_000, 3300, "Runde"),  # Sat
        RideFacts(404, _utc(2026, 8, 22, 16, 0), 24_000, 3300, "Runde"),  # Sat
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert not any(v.is_routine for v in result.verdicts.values())
    keys = {v.cluster_key for v in result.verdicts.values()}
    assert len(keys) == 2, "the weekday pair and the weekend pair are two clusters"
    assert any("werktags" in k for k in keys if k)
    assert any("wochenende" in k for k in keys if k)


def test_a_repeated_epic_is_never_routine():
    """The guard against hiding the best rides. Three 210 km days in two months
    repeat, but they are more than twice the rider's usual — that is a
    remarkable two months, not a habit to suppress."""
    usual = [
        RideFacts(
            500 + i,
            NOW - timedelta(days=2 * i + 1, minutes=17 * i),
            (28 + i) * 1000,
            3600,
            "Runde",
        )
        for i in range(12)
    ]
    epics = [
        RideFacts(600 + i, _utc(2026, 8, 8 + 7 * i, 5, 0), 210_000, 30_000, "Marathon")
        for i in range(3)
    ]
    result = detect_routine(usual + epics, tz=BERLIN, now=NOW)
    for e in epics:
        assert result.verdicts[e.activity_id].is_routine is False
        assert "bleibt sichtbar" in result.verdicts[e.activity_id].reason


# ──────────────────────────────────────────────────────────────────────
# Title markers
# ──────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "title",
    [
        "Nachtradfahrt MdRzA",
        "MdRnH",
        "Mit dem Rad zur Arbeit",
        "Arbeitsweg morgens",
        "Heimweg",
        "Pendelfahrt",
        "Morning commute",
    ],
)
def test_commute_markers_are_recognised(title):
    assert commute_marker(title) is not None


@pytest.mark.parametrize("title", ["Diepholz Radfahren", "Bergwertung", None, ""])
def test_non_markers_are_not(title):
    assert commute_marker(title) is None


def test_a_marker_alone_never_hides_a_ride():
    """Most riders never tag, so a tag can never be the only evidence: one
    labelled ride with nothing like it stays in the feed."""
    rides = [
        RideFacts(701, _utc(2026, 9, 2, 6, 30), 9_000, 1800, "MdRzA"),
        RideFacts(702, _utc(2026, 8, 20, 11, 0), 74_000, 10_000, "Tour"),
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert result.verdicts[701].is_routine is False


def test_two_rides_the_rider_titled_as_commuting_are_enough():
    """Two matching rides BOTH titled MdRzA are not a coincidence, they are a
    statement — the marker lowers the bar from three to two, and never below a
    cluster."""
    rides = [
        RideFacts(801, _utc(2026, 9, 1, 6, 30), 9_000, 1800, "MdRzA"),
        RideFacts(802, _utc(2026, 9, 3, 6, 35), 9_100, 1820, "MdRzA"),
        RideFacts(803, _utc(2026, 8, 20, 11, 0), 74_000, 10_000, "Tour"),
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert result.verdicts[801].is_routine is True
    assert result.verdicts[802].is_routine is True
    assert result.verdicts[803].is_routine is False
    assert "als Arbeitsweg betitelt" in result.verdicts[801].reason


def test_one_marker_in_an_untagged_pair_is_not_enough():
    rides = [
        RideFacts(811, _utc(2026, 9, 1, 6, 30), 9_000, 1800, "MdRzA"),
        RideFacts(812, _utc(2026, 9, 3, 6, 35), 9_100, 1820, "Radfahren"),
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert not any(v.is_routine for v in result.verdicts.values())


# ──────────────────────────────────────────────────────────────────────
# The documented limit
# ──────────────────────────────────────────────────────────────────────


def test_a_thrice_repeated_trainer_session_is_also_called_routine():
    """THE HONEST LIMIT, asserted rather than hidden.

    Nothing in distance, start time and weekday separates "commute" from
    "disciplined repetition". A rider who does the same 42 km ROUVY route three
    Tuesdays at 19:00 will be marked routine — which is why the reason names
    exactly what was seen and why the override exists."""
    rides = [
        RideFacts(
            900 + i,
            _utc(2026, 8, 11 + 7 * i, 17, 0),
            42_300,
            4080,
            "ROUVY — Sweet Spot",
        )
        for i in range(3)
    ] + [
        RideFacts(910 + i, _utc(2026, 8, 15 + 6 * i, 9, 0), (60 + 9 * i) * 1000, 9000, "Tour")
        for i in range(3)
    ]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert result.verdicts[900].is_routine is True
    # …and one word from the rider undoes it, permanently.
    fixed = apply_override(result.verdicts[900], False)
    assert fixed.is_routine is False
    assert fixed.decided_by == "rider"


# ──────────────────────────────────────────────────────────────────────
# The rider's word beats the detector, in both directions
# ──────────────────────────────────────────────────────────────────────


def test_override_keeps_a_ride_the_detector_would_hide():
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    caught = result.verdicts[rides[0].activity_id]
    assert caught.is_routine is True

    kept = apply_override(caught, False)
    assert kept.is_routine is False
    assert kept.decided_by == "rider"
    assert kept.reason == "Von dir als sehenswert markiert."
    # The detector's finding survives so the screen can still show it.
    assert kept.cluster_key == caught.cluster_key
    assert kept.occurrences == 5


def test_override_hides_a_ride_the_detector_would_keep():
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    epic = next(r for r in rides if r.title == "Samstagsrunde Wiehengebirge")
    verdict = result.verdicts[epic.activity_id]
    assert verdict.is_routine is False

    hidden = apply_override(verdict, True)
    assert hidden.is_routine is True
    assert hidden.decided_by == "rider"
    assert hidden.reason == "Von dir als Routine markiert."


def test_clearing_an_override_hands_the_ride_back_to_the_detector():
    v = RoutineVerdict(1, True, "k", 5, "weil", "detector")
    assert apply_override(v, None) is v


# ──────────────────────────────────────────────────────────────────────
# HIDDEN IS NOT DELETED — the assertion that matters most
# ──────────────────────────────────────────────────────────────────────


def test_the_detector_marks_every_ride_and_removes_none():
    """The contract in one line: verdicts in == rides out. A `detect_routine`
    that returned a shorter list would be a filter, and a filter is how a
    commute quietly stops counting."""
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert set(result.verdicts) == {r.activity_id for r in rides}
    assert len(result.verdicts) == len(rides) == 18


@pytest.mark.asyncio
async def test_routine_rides_still_count_toward_training_load():
    """A hidden commute is still real training.

    Runs the ACTUAL production training-load query builder
    (`pmc_service.get_daily_tss_by_sport`) and asserts three things:
    its SQL has never heard of this feature, every ride's TSS survives into the
    series, and the days that contain nothing but commutes still carry load.
    """
    from app.services.pmc_service import get_daily_tss_by_sport

    rides = _fixture()
    routine = {
        aid
        for aid, v in detect_routine(rides, tz=BERLIN, now=NOW).verdicts.items()
        if v.is_routine
    }
    assert len(routine) == 10, "the commutes are marked — that is the premise"

    # Every ride carries load; the commutes carry a modest but non-zero amount.
    tss_by_id = {
        r.activity_id: (28.0 if r.activity_id in routine else 95.0) for r in rides
    }

    captured: dict = {}

    class CapturingDB:
        async def execute(self, stmt, params=None):
            captured["sql"] = str(stmt)
            captured["params"] = params
            by_day: dict = {}
            for r in rides:
                day = r.started_at.astimezone(BERLIN).date()
                by_day[day] = by_day.get(day, 0.0) + tss_by_id[r.activity_id]
            res = MagicMock()
            res.fetchall.return_value = [
                SimpleNamespace(day=d, sport="cycling", daily_tss=v)
                for d, v in sorted(by_day.items())
            ]
            return res

    out = await get_daily_tss_by_sport(CapturingDB(), user_id=1)

    sql = captured["sql"].lower()
    for forbidden in (
        "routine",
        "ride_routine_overrides",
        "hide_routine_rides",
        "is_routine",
    ):
        assert forbidden not in sql, (
            f"the training-load query must not know about {forbidden!r} — "
            "hiding a ride from the feed must never remove it from the load"
        )

    total = sum(row["daily_tss"] for row in out)
    assert total == pytest.approx(sum(tss_by_id.values()))
    # 10 commutes × 28 TSS is load the athlete actually did, and it is all here.
    assert total - 8 * 95.0 == pytest.approx(10 * 28.0)

    # A day whose only ride is a commute still shows up with its load.
    commute_only_day = datetime(2026, 9, 1, tzinfo=BERLIN).date()
    day_row = next(r for r in out if r["day"] == commute_only_day)
    assert day_row["daily_tss"] == pytest.approx(56.0)


def test_routine_rides_still_count_toward_eddington_and_totals():
    """The statistics read `activities`, so they see every ride. This asserts
    the cost of ever changing that: dropping the commutes would move the
    rider's Eddington number and their kilometre total."""
    rides = _fixture()
    routine = {
        aid
        for aid, v in detect_routine(rides, tz=BERLIN, now=NOW).verdicts.items()
        if v.is_routine
    }
    all_km = [(r.distance_m or 0) / 1000 for r in rides]
    without = [
        (r.distance_m or 0) / 1000 for r in rides if r.activity_id not in routine
    ]

    assert sum(all_km) - sum(without) == pytest.approx(154.2, abs=0.1)
    assert eddington.compute(all_km) > eddington.compute(without), (
        "if anything ever filtered routine rides out of the statistics, the "
        "rider would silently lose an Eddington point they earned"
    )


# ──────────────────────────────────────────────────────────────────────
# Parameters and edges
# ──────────────────────────────────────────────────────────────────────


def test_distance_tolerance_is_relative_not_absolute():
    """10 % of 13 km is 1.3 km; 10 % of 130 km is 13 km. A pair 4 km apart is
    two different rides at commute scale and the same ride at tour scale."""
    near = [
        RideFacts(1000 + i, _utc(2026, 9, 1 + i, 6, 0), 13_000 + 4_000 * (i % 2), 1800)
        for i in range(4)
    ]
    assert not any(
        v.is_routine
        for v in detect_routine(near, tz=BERLIN, now=NOW).verdicts.values()
    )

    far = [
        RideFacts(1100 + i, _utc(2026, 9, 1 + i, 6, 0), 130_000 + 4_000 * (i % 2), 18_000)
        for i in range(4)
    ]
    assert all(
        v.is_routine for v in detect_routine(far, tz=BERLIN, now=NOW).verdicts.values()
    )


def test_the_evening_legs_eighty_minute_spread_stays_one_cluster():
    """13:11 to 14:31 UTC is an 80-minute spread on the same commute. A ±45 min
    tolerance would have split it into a 3 and a 2 and found neither."""
    rides = _fixture()
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    evening = [r for r in rides if (r.distance_m or 0) == 17_700]
    keys = {result.verdicts[r.activity_id].cluster_key for r in evening}
    assert len(keys) == 1

    tight = detect_routine(
        rides, tz=BERLIN, now=NOW, params=RoutineParams(start_tol_minutes=30)
    )
    tight_keys = {tight.verdicts[r.activity_id].cluster_key for r in evening}
    assert len(tight_keys) > 1, "the tolerance is doing real work"


def test_rides_outside_the_window_are_ignored_but_still_answered():
    old = RideFacts(1200, NOW - timedelta(days=400), 13_100, 1860, "Alt")
    rides = _fixture() + [old]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert result.verdicts[1200].is_routine is False
    assert "Fenster" in result.verdicts[1200].reason
    assert result.clusters[
        result.verdicts[_fixture()[0].activity_id].cluster_key
    ].occurrences == 5


def test_a_ride_without_distance_is_never_clustered():
    rides = [RideFacts(1300 + i, _utc(2026, 9, 1 + i, 6, 0), None, 1800) for i in range(4)]
    result = detect_routine(rides, tz=BERLIN, now=NOW)
    assert not any(v.is_routine for v in result.verdicts.values())
    assert "Ohne aufgezeichnete Distanz" in result.verdicts[1300].reason


def test_clustering_does_not_depend_on_input_order():
    rides = _fixture()
    a = detect_routine(rides, tz=BERLIN, now=NOW)
    b = detect_routine(list(reversed(rides)), tz=BERLIN, now=NOW)
    assert {k: v.is_routine for k, v in a.verdicts.items()} == {
        k: v.is_routine for k, v in b.verdicts.items()
    }


def test_the_timezone_used_is_the_riders_own():
    """02:57 UTC is a pre-dawn commute in Berlin and a late-evening ride in
    Auckland. The weekday class flips with it — which is the point of reading
    each rider's own clock rather than the viewer's."""
    rides = _fixture()
    berlin = detect_routine(rides, tz=BERLIN, now=NOW)
    auckland = detect_routine(rides, tz=ZoneInfo("Pacific/Auckland"), now=NOW)
    morning = rides[0].activity_id
    assert berlin.verdicts[morning].cluster_key != auckland.verdicts[morning].cluster_key


def test_defaults_are_the_documented_ones():
    assert DEFAULT_PARAMS.window_days == 60
    assert DEFAULT_PARAMS.min_occurrences == 3
    assert DEFAULT_PARAMS.distance_rel_tol == 0.12
    assert DEFAULT_PARAMS.start_tol_minutes == 75
    assert DEFAULT_PARAMS.split_weekend is True
