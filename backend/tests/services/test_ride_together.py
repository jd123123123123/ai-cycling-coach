"""Two people rode together — or they did not, and the difference is subtle.

Everything here is built out of synthetic tracks rather than fixtures, because
the cases that matter are the ones that look alike: the same road on two
different evenings, and the same road at the same moment. A test suite made of
real rides would only prove the happy path.
"""
from datetime import datetime, timedelta, timezone

from app.services.ride_together import (
    MIN_TOGETHER_S,
    SAMPLE_S,
    Track,
    find_companions,
    overlap,
)

T0 = datetime(2026, 8, 28, 17, 0, tzinfo=timezone.utc)


def line(n: int, *, lat0: float = 52.0, lng0: float = 13.0, step: float = 0.0002):
    """A rider going north at roughly 22 m/s of latitude per sample second."""
    return ([lat0 + i * step for i in range(n)], [lng0] * n)


def track(aid: int, uid: int, n: int, *, start=T0, **kw) -> Track:
    lat, lng = line(n, **kw)
    return Track(activity_id=aid, user_id=uid, started_at=start, lat=lat, lng=lng)


def test_the_same_road_at_the_same_moment_is_a_shared_ride():
    me = track(1, 10, 3600)
    mate = track(2, 20, 3600)
    o = overlap(me, mate)
    assert o is not None
    assert o.other_user_id == 20
    assert o.together_s > 3000


def test_the_same_road_on_a_different_evening_is_not():
    """The signal that time alone cannot carry. Identical routes, one day apart
    — which is the single most common shape in a crew, because that is what
    being in a crew means."""
    me = track(1, 10, 3600)
    mate = track(2, 20, 3600, start=T0 + timedelta(days=1))
    assert overlap(me, mate) is None


def test_the_same_moment_on_a_different_road_is_not():
    """And the signal that space alone cannot carry: two riders out at the same
    hour, twenty kilometres apart."""
    me = track(1, 10, 3600)
    mate = track(2, 20, 3600, lat0=52.2)
    assert overlap(me, mate) is None


def test_a_crossing_at_a_junction_is_not_a_shared_ride():
    """Two routes that touch for a minute. Below `MIN_TOGETHER_S`, so it is
    silence rather than a headline — this is the false positive that would make
    the feature untrustworthy the first time it fired."""
    n = 3600
    lat, lng = line(n)
    # The mate is far away except for a 60-second window in the middle.
    mlat = [l + 0.5 for l in lat]
    for i in range(1800, 1860):
        mlat[i] = lat[i]
    mate = Track(activity_id=2, user_id=20, started_at=T0, lat=mlat, lng=list(lng))
    assert overlap(track(1, 10, n), mate) is None


def test_a_late_start_still_matches_because_the_clocks_are_aligned():
    """The one that breaks a naive implementation. Index 600 in one ride and
    index 600 in another are the same ELAPSED second and a different moment; a
    mate who set off twelve minutes later is at the same place at the same time
    and at a completely different index."""
    skew = 720
    me = track(1, 10, 5400)
    lat, lng = line(5400)
    mate = Track(
        activity_id=2, user_id=20, started_at=T0 + timedelta(seconds=skew),
        # Their ride begins where ours had already reached at `skew`.
        lat=lat[skew:], lng=lng[skew:],
    )
    o = overlap(me, mate)
    assert o is not None
    assert o.first_s >= skew


def test_a_gps_dropout_does_not_end_the_ride_together():
    """A rider who vanishes under a railway arch has not left the group. Holes
    are skipped, not counted as a separation."""
    n = 3600
    lat, lng = line(n)
    mlat: list[float | None] = list(lat)
    for i in range(1200, 1400):
        mlat[i] = None
    mate = Track(activity_id=2, user_id=20, started_at=T0, lat=mlat, lng=list(lng))
    o = overlap(track(1, 10, n), mate)
    assert o is not None
    assert o.together_s > 3000


def test_the_share_is_per_rider_and_they_differ():
    """An hour together is most of a short ride and a detail of a long one, and
    reporting one number for both would be wrong for whoever rode longer."""
    me = track(1, 10, 7200)
    mate = track(2, 20, 1800)
    o = overlap(me, mate)
    assert o is not None
    assert o.share_of_other > o.share_of_self


def test_it_names_everybody_on_a_club_run():
    """A design that could only ever name one companion would be wrong about
    the most sociable rides in the dataset."""
    me = track(1, 10, 3600)
    mates = [track(2, 20, 3600), track(3, 30, 1800), track(4, 40, 3600)]
    found = find_companions(me, mates)
    assert {o.other_user_id for o in found} == {20, 30, 40}
    # Longest first, so a surface that shows one shows the person they actually
    # rode with rather than whoever the database returned first.
    assert found[0].together_s >= found[-1].together_s


def test_a_ride_never_matches_itself():
    me = track(1, 10, 3600)
    assert find_companions(me, [me]) == []


def test_an_empty_or_gps_less_ride_is_simply_silent():
    """A turbo session has no track, and the answer is no answer rather than a
    crash — this runs on every ride, including the ones done indoors."""
    empty = Track(activity_id=2, user_id=20, started_at=T0, lat=[], lng=[])
    assert overlap(track(1, 10, 3600), empty) is None
    assert overlap(empty, track(1, 10, 3600)) is None


def test_the_sampler_cannot_claim_more_time_than_the_ride_had():
    n = MIN_TOGETHER_S + SAMPLE_S
    o = overlap(track(1, 10, n), track(2, 20, n))
    assert o is not None
    assert o.together_s <= n


# ── what only a shared ride can tell you ──────────────────────────────────────

from app.services.ride_together import LEAD_MARGIN, shared_effort  # noqa: E402


def test_the_one_sitting_in_is_paying_less_for_the_same_road():
    """The number a solo debrief cannot produce, and the one that would have
    stopped this app telling a real rider he had blown up when he had in fact
    found a wheel to sit on."""
    n = 3600
    me, mate = track(1, 10, n), track(2, 20, n)
    o = overlap(me, mate)
    assert o is not None
    # Same road, same speed, and he is paying two thirds of what she is.
    eff = shared_effort(me, mate, o, [140.0] * n, [210.0] * n)
    assert eff.self_w == 140.0 and eff.other_w == 210.0
    assert eff.ratio is not None and eff.ratio < 0.75
    # And she is on the front for all of it.
    assert eff.other_led_s > 0
    assert eff.self_led_s == 0


def test_riding_evenly_reads_as_neither_leading():
    """A pair sitting side by side wobbles a few percent second to second, and
    calling that a lead change every thirty seconds would be noise dressed as a
    story."""
    n = 3600
    me, mate = track(1, 10, n), track(2, 20, n)
    o = overlap(me, mate)
    assert o is not None
    eff = shared_effort(me, mate, o, [200.0] * n, [200.0 * (LEAD_MARGIN - 0.05)] * n)
    assert eff.self_led_s == 0 and eff.other_led_s == 0


def test_no_power_meter_is_silence_and_not_a_crash():
    """Plenty of riders have no power. The comparison simply does not exist for
    them, which is different from it being zero."""
    n = 3600
    me, mate = track(1, 10, n), track(2, 20, n)
    o = overlap(me, mate)
    assert o is not None
    eff = shared_effort(me, mate, o, [None] * n, [200.0] * n)
    assert eff.self_w is None and eff.ratio is None
