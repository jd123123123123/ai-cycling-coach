"""The face on a referral card is the rider's collectible, or nothing.

THE BUG THIS PINS. Every other surface in the app reads the garage to answer
"what does this rider look like" — `W3RiderAvatar`, the crew standings, the bike
hero. The referral card did not: it read `users.avatar_url` directly. That
column also holds the raw-photo fallback from before the garage existed and from
renders that ran with no image model, so it can hold a snapshot the rider never
chose as their rider.

The visible symptom was a referrer looking at a card for someone who had not
made a rider at all and seeing a face on it anyway — a photo that rider never
picked, presented as their rider. "Someone who has not made one simply has
none" is the rule everywhere else, and this was the last place it did not hold.
"""
import inspect

from app.services import referral


def test_the_card_no_longer_reads_the_raw_photo_column():
    """`users.avatar_url` is not the rider's rider. Reading it here is the
    defect, so the assertion is that the read is gone — not merely that a
    garage read was added alongside it."""
    src = inspect.getsource(referral)
    assert 'getattr(user, "avatar_url", None)' not in src
    assert "avatar_url=await _rider_face(db, uid)" in src


def test_the_face_comes_from_the_garage_rider():
    src = inspect.getsource(referral._rider_face)
    assert "GarageAsset.image_url" in src
    assert 'GarageAsset.kind == "rider"' in src
    assert "GarageAsset.user_id == uid" in src


def test_the_face_is_thumbnailed_like_the_crew_standings():
    """A rendered rider is 50-200 KB and this list draws it in a small circle.
    The standings solved that already; the same helper solves it here."""
    src = inspect.getsource(referral._rider_face)
    assert "crew_avatars.thumbnail(" in src


def test_a_rider_with_no_collectible_has_no_face():
    """`thumbnail(None)` is the no-rider case, and it must be None rather than
    any kind of stand-in — a placeholder wearing someone's name is the thing
    this whole rule exists to prevent."""
    from app.services.crew_avatars import thumbnail

    assert thumbnail(None) is None


def test_a_pending_referral_still_has_no_face():
    """A referral nobody has accepted yet has no user at all. That path returns
    before any lookup and must keep doing so — `_rider_face` would be called
    with None."""
    src = inspect.getsource(referral._rider_stats)
    assert 'return _RiderStats("Pending rider", None, 0, 0.0, 0)' in src
