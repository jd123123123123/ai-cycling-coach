"""Tests for the central LLM fallback helper (Claude → OpenAI → raise).

Every provider is mocked — NO real network. We assert:
  - Anthropic success never touches OpenAI (Claude stays primary).
  - A credit/quota/auth/rate/5xx Anthropic failure falls back to OpenAI.
  - A non-credit Anthropic failure re-raises WITHOUT calling OpenAI.
  - OPENAI unset → the fallback raises (caller drops to rule-based).
  - Both providers failing → raises (caller drops to rule-based).
  - The credit/quota error detector classifies each anthropic exception type.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import anthropic
import httpx
import pytest

from app.services import llm_client
from app.services.llm_client import _is_credit_or_quota_failure, complete_text


# ── helpers to build provider mocks ──────────────────────────────────────────

def _anthropic_response(text: str):
    """A messages.create() return value carrying one text block."""
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])


def _patch_anthropic(monkeypatch, *, returns=None, raises=None):
    create = AsyncMock(
        return_value=returns if returns is not None else None,
        side_effect=raises,
    )
    client = MagicMock()
    client.messages = MagicMock(create=create)
    monkeypatch.setattr(anthropic, "AsyncAnthropic", MagicMock(return_value=client))
    monkeypatch.setattr(llm_client.settings, "ANTHROPIC_API_KEY", "test-anthropic-key")
    return create


def _openai_response(text: str):
    msg = SimpleNamespace(content=text)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


def _patch_openai(monkeypatch, *, key="test-openai-key", returns=None, raises=None):
    import openai

    create = AsyncMock(
        return_value=returns if returns is not None else None,
        side_effect=raises,
    )
    client = MagicMock()
    client.chat = MagicMock(completions=MagicMock(create=create))
    monkeypatch.setattr(openai, "AsyncOpenAI", MagicMock(return_value=client))
    monkeypatch.setattr(llm_client.settings, "OPENAI_API_KEY", key)
    monkeypatch.setattr(llm_client.settings, "OPENAI_MODEL", "gpt-4o-mini")
    return create


def _rate_limit_error(msg="rate limited"):
    return anthropic.RateLimitError(
        msg, response=httpx.Response(429, request=httpx.Request("POST", "http://x")), body=None
    )


def _credit_bad_request():
    return anthropic.BadRequestError(
        "Your credit balance is too low to access the API",
        response=httpx.Response(400, request=httpx.Request("POST", "http://x")),
        body=None,
    )


def _plain_bad_request():
    return anthropic.BadRequestError(
        "messages.0: invalid field",
        response=httpx.Response(400, request=httpx.Request("POST", "http://x")),
        body=None,
    )


def _server_error():
    return anthropic.InternalServerError(
        "upstream boom",
        response=httpx.Response(503, request=httpx.Request("POST", "http://x")),
        body=None,
    )


# ── the detector ─────────────────────────────────────────────────────────────

class TestCreditQuotaDetector:
    def test_rate_limit_is_fallback_worthy(self):
        assert _is_credit_or_quota_failure(_rate_limit_error()) is True

    def test_auth_and_permission_are_fallback_worthy(self):
        auth = anthropic.AuthenticationError(
            "bad key", response=httpx.Response(401, request=httpx.Request("POST", "http://x")), body=None
        )
        perm = anthropic.PermissionDeniedError(
            "forbidden", response=httpx.Response(403, request=httpx.Request("POST", "http://x")), body=None
        )
        assert _is_credit_or_quota_failure(auth) is True
        assert _is_credit_or_quota_failure(perm) is True

    def test_credit_bad_request_is_fallback_worthy(self):
        assert _is_credit_or_quota_failure(_credit_bad_request()) is True

    def test_plain_bad_request_is_not(self):
        assert _is_credit_or_quota_failure(_plain_bad_request()) is False

    def test_5xx_is_fallback_worthy(self):
        assert _is_credit_or_quota_failure(_server_error()) is True

    def test_unrelated_exception_is_not(self):
        assert _is_credit_or_quota_failure(RuntimeError("empty Claude response")) is False


# ── the chain ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestCompleteText:
    async def test_anthropic_success_never_calls_openai(self, monkeypatch):
        anth = _patch_anthropic(monkeypatch, returns=_anthropic_response("claude says hi"))
        openai_create = _patch_openai(monkeypatch, returns=_openai_response("should not run"))

        result = await complete_text(system="s", user="u", max_tokens=50)

        assert result.text == "claude says hi"
        assert result.provider == "anthropic"
        assert anth.await_count == 1
        assert openai_create.await_count == 0  # OpenAI NEVER touched on success

    async def test_credit_failure_falls_back_to_openai(self, monkeypatch):
        anth = _patch_anthropic(monkeypatch, raises=_credit_bad_request())
        openai_create = _patch_openai(monkeypatch, returns=_openai_response("openai to the rescue"))

        result = await complete_text(system="s", user="u", max_tokens=50, model="claude-sonnet-4-6")

        assert result.text == "openai to the rescue"
        assert result.provider == "openai"
        assert result.model == "gpt-4o-mini"
        assert anth.await_count == 1
        assert openai_create.await_count == 1

    async def test_rate_limit_falls_back_to_openai(self, monkeypatch):
        _patch_anthropic(monkeypatch, raises=_rate_limit_error())
        openai_create = _patch_openai(monkeypatch, returns=_openai_response("fallback text"))

        result = await complete_text(system="s", user="u", max_tokens=50)
        assert result.provider == "openai"
        assert openai_create.await_count == 1

    async def test_response_json_uses_openai_json_mode(self, monkeypatch):
        _patch_anthropic(monkeypatch, raises=_rate_limit_error())
        openai_create = _patch_openai(monkeypatch, returns=_openai_response('{"ok": true}'))

        result = await complete_text(system="s", user="u", max_tokens=50, response_json=True)
        assert result.provider == "openai"
        kwargs = openai_create.await_args.kwargs
        assert kwargs["response_format"] == {"type": "json_object"}

    async def test_non_credit_failure_reraises_without_openai(self, monkeypatch):
        _patch_anthropic(monkeypatch, raises=_plain_bad_request())
        openai_create = _patch_openai(monkeypatch, returns=_openai_response("must not run"))

        with pytest.raises(anthropic.BadRequestError):
            await complete_text(system="s", user="u", max_tokens=50)
        assert openai_create.await_count == 0  # not a credit problem → no OpenAI

    async def test_openai_unset_raises(self, monkeypatch):
        _patch_anthropic(monkeypatch, raises=_credit_bad_request())
        # Key unset → OpenAI is skipped and the helper raises so the caller's
        # rule-based fallback runs.
        monkeypatch.setattr(llm_client.settings, "OPENAI_API_KEY", None)

        with pytest.raises(RuntimeError, match="OpenAI fallback unavailable"):
            await complete_text(system="s", user="u", max_tokens=50)

    async def test_both_providers_fail_raises(self, monkeypatch):
        _patch_anthropic(monkeypatch, raises=_credit_bad_request())
        _patch_openai(monkeypatch, raises=RuntimeError("openai down too"))

        with pytest.raises(RuntimeError, match="openai down too"):
            await complete_text(system="s", user="u", max_tokens=50)

    async def test_empty_anthropic_response_reraises_without_openai(self, monkeypatch):
        # An empty Claude response is a RuntimeError, NOT a credit problem, so it
        # re-raises straight to the caller's rule-based fallback (no OpenAI call).
        _patch_anthropic(monkeypatch, returns=_anthropic_response("   "))
        openai_create = _patch_openai(monkeypatch, returns=_openai_response("nope"))

        with pytest.raises(RuntimeError, match="empty Claude response"):
            await complete_text(system="s", user="u", max_tokens=50)
        assert openai_create.await_count == 0
