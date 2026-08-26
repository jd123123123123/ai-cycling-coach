"""The rules that decide whether a notification system feels alive or broken."""

import types

import pytest

from app.services import crew_notify


class _Act:
    def __init__(self, user_id: int, title: str | None = "Feierabendrunde"):
        self.user_id = user_id
        self.title = title


def _actor(uid: int, name: str = "Mara"):
    return types.SimpleNamespace(id=uid, display_name=name, email=f"{name}@x.de")


@pytest.fixture
def sent(monkeypatch):
    """Capture pushes instead of sending them."""
    calls: list[dict] = []

    async def _fake_send(db, profile, title, body, url):
        calls.append({"profile": profile, "title": title, "body": body, "url": url})
        return 1

    async def _fake_owner(db, user_id):
        return types.SimpleNamespace(user_id=user_id)

    monkeypatch.setattr(crew_notify, "push_configured", lambda: True)
    monkeypatch.setattr(crew_notify, "send_user_push", _fake_send)
    monkeypatch.setattr(crew_notify, "_owner_profile", _fake_owner)
    return calls


@pytest.mark.asyncio
async def test_reacting_to_your_own_ride_is_silent(sent):
    """The fastest way to make notifications feel broken is to congratulate
    somebody on their own activity."""
    n = await crew_notify.notify_ride_reaction(
        None, actor=_actor(7), activity=_Act(user_id=7), emoji="🔥"
    )
    assert n == 0
    assert sent == []


@pytest.mark.asyncio
async def test_a_crew_mate_reaction_reaches_the_owner(sent):
    n = await crew_notify.notify_ride_reaction(
        None, actor=_actor(2, "Mara"), activity=_Act(user_id=7), emoji="🔥"
    )
    assert n == 1
    assert sent[0]["profile"].user_id == 7          # the OWNER, not the actor
    assert "Mara" in sent[0]["title"]
    assert "🔥" in sent[0]["title"]
    assert "Feierabendrunde" in sent[0]["body"]
    assert sent[0]["url"] == "/e/w3-crew"           # the screen that has the feed


@pytest.mark.asyncio
async def test_a_comment_carries_its_own_text(sent):
    """A notification that hides the message is one you must open the app to
    read — which is the thing it was meant to save you."""
    await crew_notify.notify_ride_comment(
        None, actor=_actor(2, "Mara"), activity=_Act(user_id=7), text="  stark gefahren!  "
    )
    assert sent[0]["body"] == "stark gefahren!"


@pytest.mark.asyncio
async def test_a_long_comment_is_truncated_not_dropped(sent):
    await crew_notify.notify_ride_comment(
        None, actor=_actor(2), activity=_Act(user_id=7), text="x" * 400
    )
    assert len(sent[0]["body"]) <= 120
    assert sent[0]["body"].endswith("…")


@pytest.mark.asyncio
async def test_an_untitled_ride_still_reads_as_german(sent):
    await crew_notify.notify_ride_reaction(
        None, actor=_actor(2), activity=_Act(user_id=7, title=None), emoji="💪"
    )
    assert "einer Fahrt" in sent[0]["body"]


@pytest.mark.asyncio
async def test_push_failure_never_reaches_the_caller(monkeypatch):
    """A push is a courtesy; the reaction is data. The write must stand."""
    async def _boom(*a, **k):
        raise RuntimeError("vendor endpoint down")

    monkeypatch.setattr(crew_notify, "push_configured", lambda: True)
    monkeypatch.setattr(crew_notify, "_owner_profile", _boom)
    n = await crew_notify.notify_ride_reaction(
        None, actor=_actor(2), activity=_Act(user_id=7), emoji="🔥"
    )
    assert n == 0


@pytest.mark.asyncio
async def test_unconfigured_web_push_is_a_silent_no_op(monkeypatch):
    monkeypatch.setattr(crew_notify, "push_configured", lambda: False)
    n = await crew_notify.notify_ride_comment(
        None, actor=_actor(2), activity=_Act(user_id=7), text="hi"
    )
    assert n == 0
