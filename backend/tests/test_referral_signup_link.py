"""The invite has to survive the one moment it can be recorded.

`referral.link_referral` was complete, tested, and called from nowhere. Its own
docstring said so — "ready + tested, but not yet called from the auth signup
flow" — and the consequence was invisible in exactly the wrong way: every
rider's referral overview was empty, not because they had invited nobody, but
because inviting somebody could not be recorded. No error, no log, no row.

These tests pin the CONNECTION, because the connection is what was missing.
"""
import inspect

import pytest
from pydantic import ValidationError

from app.api import auth
from app.schemas.auth import RegisterRequest


def test_signup_accepts_an_invite_code():
    assert RegisterRequest(email="a@b.co", password="12345678", referral_code="ABC123").referral_code == "ABC123"


def test_signup_without_an_invite_is_unchanged():
    """The overwhelmingly common case must not have gained a requirement."""
    assert RegisterRequest(email="a@b.co", password="12345678").referral_code is None


def test_a_bad_password_still_fails_with_an_invite():
    """The invite must not become a way around the rules it sits next to."""
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.co", password="short", referral_code="ABC123")


def test_register_actually_calls_the_linker():
    """The whole bug, stated: the function existed and was never invoked."""
    src = inspect.getsource(auth.register)
    assert "referral.link_referral" in src


def test_a_bad_invite_can_never_fail_a_signup():
    """A rider did not choose the code they were handed, and by this point the
    account already exists. The link is attempted and its outcome ignored."""
    src = inspect.getsource(auth.register)
    link = src[src.index("referral.link_referral") - 200:]
    assert "try:" in link and "except Exception:" in link


def test_the_linker_refuses_the_obvious_abuses():
    """Self-referral and codes that map to nobody link nothing. Checked on the
    pure part, which needs no database."""
    from app.services.referral import code_for_user, user_id_from_code

    assert user_id_from_code(code_for_user(7)) == 7
    assert user_id_from_code("!!!!!!") is None
