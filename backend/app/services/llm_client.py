"""Central LLM completion helper with a provider fallback chain.

Degradation order for PLAIN-TEXT (non-tool-use) LLM calls:

    Claude (Anthropic, PRIMARY)  →  OpenAI (fallback)  →  raise

Claude is ALWAYS tried first and, when it succeeds, OpenAI is NEVER touched —
so there is zero behaviour change and zero extra cost when the Anthropic key is
healthy. OpenAI is attempted ONLY when Claude fails in a way that looks like a
credit / quota / billing / auth / rate-limit / server problem (see
``_is_credit_or_quota_failure``). When OpenAI is unset, also fails, or the
Anthropic error is something else (e.g. an empty response), this helper RAISES —
so each caller's own ``try/except`` rule-based fallback stays the FINAL layer.

The rule-based deterministic fallbacks live in the callers (period_report,
race_debrief, analytics summarize, weekly_wrapped); this module only owns the
two network providers.

Tool-use / structured-output surfaces (coach_service brief+chat,
weekly_plan_llm, chart_interpreter, plan_import) do NOT use this helper — a
plain-text completion cannot satisfy a forced-tool JSON schema (or vision).
Those degrade Claude → rule-based directly in their own except-handlers.
"""
from __future__ import annotations

import logging
import inspect
from functools import lru_cache
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LLMResult:
    """The text a provider returned, plus which provider/model served it.

    ``provider`` is "anthropic" or "openai"; ``model`` is the concrete model id
    so a caller's ``model_used`` reflects the OpenAI fallback when it served.
    """

    text: str
    provider: str
    model: str


def _is_credit_or_quota_failure(exc: Exception) -> bool:
    """True when an Anthropic error indicates no-credit / quota / billing / auth
    / rate-limit / server trouble — the only conditions under which we spend an
    OpenAI call. Any other error (bad request that ISN'T a balance problem, an
    empty response, a validation error) returns False so it re-raises straight to
    the caller's rule-based fallback."""
    import anthropic

    # 401 / 403 / 429 — always worth trying the other provider.
    if isinstance(
        exc,
        (
            anthropic.AuthenticationError,
            anthropic.PermissionDeniedError,
            anthropic.RateLimitError,
        ),
    ):
        return True
    # 400 — only when the message is specifically about credit/balance/quota.
    if isinstance(exc, anthropic.BadRequestError):
        msg = str(getattr(exc, "message", "") or exc).lower()
        return any(k in msg for k in ("credit", "balance", "quota", "billing"))
    # Any other API status error: 402 (payment required), 429, or 5xx.
    if isinstance(exc, anthropic.APIStatusError):
        code = getattr(exc, "status_code", None)
        if isinstance(code, int) and (code in (402, 429) or code >= 500):
            return True
    return False



@lru_cache(maxsize=8)
def _create_params(create) -> frozenset[str]:
    """Which keyword arguments this SDK's `messages.create` actually accepts.

    Cached because it is pure reflection over a bound method that never changes
    within a process, and it sits on the hot path of every generated sentence.
    """
    try:
        return frozenset(inspect.signature(create).parameters)
    except (TypeError, ValueError):
        # Un-introspectable (a mock, a C shim): assume it takes what we ask, so
        # the guard can never be the reason a working call stops being made.
        return frozenset()


def _accepts(client, name: str) -> bool:
    params = _create_params(client.messages.create)
    return not params or name in params


async def _anthropic_complete(
    *,
    system: str,
    user: str,
    max_tokens: int,
    model: str,
    temperature: float | None,
    thinking: dict | None,
) -> LLMResult:
    """The PRIMARY path — identical to what each caller did inline today."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        # Every caller wrapped the system prompt in a cache_control ephemeral
        # block — preserve that so prompt caching keeps working unchanged.
        "system": [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
        ],
        "messages": [{"role": "user", "content": user}],
    }
    # NO sampling params unless the caller asked: the Opus tier 400s on them.
    #
    # AND ONLY IF THIS SDK STILL TAKES THEM. `temperature` was removed from
    # `messages.create()` in the 1.x SDK — it is not in `output_config` either,
    # it is gone from the Messages surface. The requirement was unpinned, so a
    # rebuild pulled 1.2.0 and every call carrying a sampling hint raised
    # TypeError: the coach brief, the period report and the wrapped flavour all
    # failed at once, in production, with nothing in the UI to say why.
    #
    # The version is pinned below 1.0 now, which is the actual fix. This guard
    # is what stops the same shape of break recurring: a sampling hint is an
    # optimisation, and losing it should cost a little output quality, never the
    # whole feature.
    if temperature is not None and _accepts(client, "temperature"):
        kwargs["temperature"] = temperature
    if thinking is not None and _accepts(client, "thinking"):
        kwargs["thinking"] = thinking

    response = await client.messages.create(**kwargs)
    text = "".join(
        getattr(b, "text", "") or "" for b in (getattr(response, "content", None) or [])
    ).strip()
    if not text:
        raise RuntimeError("empty Claude response")
    return LLMResult(text=text, provider="anthropic", model=model)


async def _openai_complete(
    *, system: str, user: str, max_tokens: int, response_json: bool
) -> LLMResult:
    """The FALLBACK path — plain chat.completions. Raises when OPENAI_API_KEY is
    unset (so the caller drops to its rule-based fallback) or the call fails."""
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OpenAI fallback unavailable (OPENAI_API_KEY unset)")

    import openai

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    kwargs: dict = {
        "model": settings.OPENAI_MODEL,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if response_json:
        kwargs["response_format"] = {"type": "json_object"}

    response = await client.chat.completions.create(**kwargs)
    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("empty OpenAI response")
    return LLMResult(text=text, provider="openai", model=settings.OPENAI_MODEL)


async def complete_text(
    *,
    system: str,
    user: str,
    max_tokens: int,
    model: str | None = None,
    temperature: float | None = None,
    thinking: dict | None = None,
    response_json: bool = False,
) -> LLMResult:
    """Complete ``system`` + ``user`` into text, Claude-first with OpenAI fallback.

    Returns an ``LLMResult`` (text + provider + model). Raises when neither
    provider can serve — the caller MUST wrap this in its own try/except that
    produces a deterministic rule-based result as the final layer.

    ``model`` defaults to ``COACH_MODEL``. ``temperature``/``thinking`` are
    passed to Anthropic only (OpenAI ignores them); ``response_json`` requests
    OpenAI's JSON mode on the fallback path.
    """
    model = model or settings.COACH_MODEL

    try:
        result = await _anthropic_complete(
            system=system,
            user=user,
            max_tokens=max_tokens,
            model=model,
            temperature=temperature,
            thinking=thinking,
        )
        logger.debug("LLM served by anthropic (%s)", model)
        return result
    except Exception as exc:  # noqa: BLE001
        if not _is_credit_or_quota_failure(exc):
            # Not a credit/quota problem (or an empty-response) — don't spend an
            # OpenAI call; let the caller's rule-based fallback handle it.
            raise
        logger.warning(
            "Anthropic unavailable (%s: %s) — falling back to OpenAI",
            type(exc).__name__,
            exc,
        )

    result = await _openai_complete(
        system=system, user=user, max_tokens=max_tokens, response_json=response_json
    )
    logger.info("LLM served by OpenAI fallback (%s)", result.model)
    return result


__all__ = ["LLMResult", "complete_text"]
