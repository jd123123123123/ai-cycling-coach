"""Did these two people ride TOGETHER — and if so, what does that change?

A shared ride is the most social thing that happens in this app and until now
nothing noticed it. Two crew-mates could do four hours wheel to wheel and each
get a debrief written as though they had been alone, which is both a missed
moment and, worse, a wrong reading: `race_debrief` had to infer a group from a
falling power curve and a steady heart rate. When the ride is genuinely shared
we do not have to infer anything — we can see it.

HOW IT IS DETECTED, and why it takes two signals.

TIME ALONE IS NOT ENOUGH. Two people in the same crew ride at the same hour on
the same evening constantly; they live in the same town and they both go out
after work. An overlap in the clock says almost nothing.

SPACE ALONE IS NOT ENOUGH EITHER. They ride the same roads — that is usually
why they are in a crew together. Two tracks lying on top of each other on a
Tuesday and a Thursday is one popular road, not one ride.

So it needs BOTH, at the same moment: the two riders within a short distance of
each other, at the same wall-clock second, for a meaningful stretch. That is a
thing that essentially cannot happen by accident.

WHAT IT REFUSES TO ANSWER. A boolean. "Rode together" is a spectrum — bumping
into somebody at a café stop is not a shared ride, and neither is the ten
minutes of overlap where one rider's route home crosses another's. So this
returns the OVERLAP ITSELF, in seconds and as a share of each ride, and lets
the caller decide what is worth saying. A surface that wants a headline can
threshold it; a surface that wants nuance has the numbers.

It is deliberately pure — no session, no queries, no clock. Everything it needs
is passed in, so the whole thing is testable without a database, which for
something built on GPS noise and clock skew is the only way to trust it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

#: How close two riders must be to count as together, in metres.
#:
#: A group on the road occupies maybe 20 m end to end, and consumer GPS is good
#: to about 10 m on a clear day and considerably worse under trees or between
#: buildings. 75 m is comfortably outside the noise and comfortably inside "in
#: sight of each other". Tightening it to 25 m does not find more truth, it just
#: drops the wooded half of every ride.
TOGETHER_M = 75.0

#: Seconds between samples. The tracks are 1 Hz and comparing every second of a
#: four-hour ride is 14 400 haversines per pair for no gain: riders do not
#: separate and rejoin inside ten seconds, and at 30 km/h a rider covers 250 m
#: in that window — far enough that a real split is still caught on the next
#: sample.
SAMPLE_S = 30

#: Below this, say nothing. Two tracks crossing at a junction, or a café stop
#: where one rider arrives as the other leaves, produce a minute or two of
#: proximity that is not a shared ride. Five minutes is longer than any crossing
#: and shorter than any ride actually done together.
MIN_TOGETHER_S = 300


@dataclass(frozen=True)
class Track:
    """One rider's ride, reduced to what matching needs.

    `lat`/`lng` are the 1 Hz channels as stored; `started_at` is what turns an
    index in those arrays into a moment in time, and is the reason this works at
    all — two rides recorded on two watches share no index, only a clock.
    """
    activity_id: int
    user_id: int
    started_at: datetime
    lat: list[float | None]
    lng: list[float | None]

    @property
    def duration_s(self) -> int:
        return min(len(self.lat), len(self.lng))


@dataclass(frozen=True)
class Overlap:
    """What two tracks actually shared."""
    other_activity_id: int
    other_user_id: int
    #: Seconds the two were within `TOGETHER_M` of each other.
    together_s: int
    #: That, as a share of each rider's OWN ride. These differ whenever the
    #: rides differ in length, and the difference is the interesting part: an
    #: hour together is most of a short ride and a detail of a long one.
    share_of_self: float
    share_of_other: float
    #: Seconds from the start of THIS ride when they first and last matched.
    first_s: int
    last_s: int


def _metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance. Haversine rather than a flat approximation because
    the cheap version is wrong by a factor of cos(latitude) in longitude, which
    at 52°N — where this app's riders are — is a 38% error in one axis."""
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _at(track: Track, second: int) -> tuple[float, float] | None:
    """Where the rider was `second` seconds into their ride, or None.

    A None is not an error and not rare: GPS drops under bridges and in tunnels,
    and a paused watch leaves gaps. The caller skips the sample rather than
    treating a hole as a separation, because a rider who vanishes for ninety
    seconds under a railway arch has not left the group.
    """
    if second < 0 or second >= track.duration_s:
        return None
    a, o = track.lat[second], track.lng[second]
    if a is None or o is None:
        return None
    return float(a), float(o)


def overlap(self_track: Track, other: Track) -> Overlap | None:
    """How much of these two rides was ridden together. None when essentially
    none of it was.

    THE CLOCKS ARE ALIGNED FIRST, and that is the whole trick. Index 600 in one
    ride and index 600 in another are the same *elapsed* second and almost never
    the same *moment* — one rider left at 17:02 and the other at 17:19. Every
    comparison here is made at a shared wall-clock second, converted back into
    each rider's own index by the difference in their start times.
    """
    if self_track.duration_s == 0 or other.duration_s == 0:
        return None

    # The window in which both were riding at all, in seconds from THIS ride's
    # start. `skew` is how far into this ride the other rider set off — negative
    # when they started first.
    skew = int((other.started_at - self_track.started_at).total_seconds())
    begin = max(0, skew)
    end = min(self_track.duration_s, skew + other.duration_s)
    if end - begin < MIN_TOGETHER_S:
        return None

    hits = 0
    first = last = None
    for s in range(begin, end, SAMPLE_S):
        a = _at(self_track, s)
        b = _at(other, s - skew)
        if a is None or b is None:
            continue
        if _metres(a[0], a[1], b[0], b[1]) <= TOGETHER_M:
            hits += 1
            if first is None:
                first = s
            last = s

    together_s = hits * SAMPLE_S
    if together_s < MIN_TOGETHER_S or first is None or last is None:
        return None

    return Overlap(
        other_activity_id=other.activity_id,
        other_user_id=other.user_id,
        together_s=together_s,
        share_of_self=round(together_s / self_track.duration_s, 3),
        share_of_other=round(together_s / other.duration_s, 3),
        first_s=first,
        last_s=last,
    )


def find_companions(self_track: Track, candidates: list[Track]) -> list[Overlap]:
    """Every crew-mate who was actually there, longest overlap first.

    Plural on purpose. A club run is five people, and a design that could only
    ever name one of them would be wrong about the most sociable rides in the
    dataset — which are exactly the ones worth surfacing.
    """
    found = [o for c in candidates if c.activity_id != self_track.activity_id
             and (o := overlap(self_track, c)) is not None]
    return sorted(found, key=lambda o: o.together_s, reverse=True)


@dataclass(frozen=True)
class SharedEffort:
    """What the two riders were each paying, over the stretch they shared.

    This is the thing a solo ride cannot tell you and the reason the feature is
    worth more than a badge.
    """
    #: Mean watts over the shared seconds, per rider. None when a rider had no
    #: power meter — which is common and is not an error.
    self_w: float | None
    other_w: float | None
    #: `self_w` as a share of `other_w`. Below 1 means this rider was paying
    #: less for the same road, which is what sitting in looks like in numbers.
    ratio: float | None
    #: Whole seconds each spent as the harder-working one, sampled the same way
    #: the overlap is. The story of a ride is usually in how these two trade.
    self_led_s: int
    other_led_s: int


#: How much more power counts as "on the front" rather than as noise. Two riders
#: side by side vary by a few percent second to second; a rider genuinely doing
#: the work on the front of a pair is spending 25-30% more than the one behind.
#: 15% is below that and above the wobble.
LEAD_MARGIN = 1.15


def shared_effort(
    self_track: Track, other: Track, o: Overlap,
    self_power: list[float | None], other_power: list[float | None],
) -> SharedEffort:
    """Who was working, over the part they rode together.

    WHY THIS IS THE INTERESTING NUMBER. Two riders on the same road at the same
    speed are doing the same job against gravity and doing very different jobs
    against the air, and the difference is entirely who is in front. A rider
    sitting in pays 25-30% less for an identical hour. That is invisible in a
    solo debrief — it is exactly the drop that made this app tell somebody's
    father he had blown up — and it is legible the moment there is a second
    rider to compare against.

    ONLY THE SHARED SECONDS COUNT. Averaging each rider's whole ride would
    compare a two-hour day against a four-hour one and call the difference
    drafting. The window is the overlap and nothing else.

    Sampled at `SAMPLE_S` like the matching, so a rider whose power meter drops
    out for a climb does not silently reweight the average toward the flat.
    """
    skew = int((other.started_at - self_track.started_at).total_seconds())
    mine: list[float] = []
    theirs: list[float] = []
    self_led = other_led = 0

    for s in range(o.first_s, o.last_s + 1, SAMPLE_S):
        i, j = s, s - skew
        a = self_power[i] if 0 <= i < len(self_power) else None
        b = other_power[j] if 0 <= j < len(other_power) else None
        if a is None or b is None:
            continue
        mine.append(float(a))
        theirs.append(float(b))
        # A lead is claimed only past the margin, so a pair riding evenly reads
        # as neither leading rather than as both trading every thirty seconds.
        if a > b * LEAD_MARGIN:
            self_led += SAMPLE_S
        elif b > a * LEAD_MARGIN:
            other_led += SAMPLE_S

    self_w = round(sum(mine) / len(mine), 1) if mine else None
    other_w = round(sum(theirs) / len(theirs), 1) if theirs else None
    ratio = round(self_w / other_w, 3) if self_w and other_w else None
    return SharedEffort(
        self_w=self_w, other_w=other_w, ratio=ratio,
        self_led_s=self_led, other_led_s=other_led,
    )
