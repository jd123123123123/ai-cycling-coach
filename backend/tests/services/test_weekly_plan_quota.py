from types import SimpleNamespace
from unittest.mock import AsyncMock
import anthropic
import httpx
import pytest
from app.services import weekly_plan_llm as plans

@pytest.mark.parametrize('credit_error', [True, False])
async def test_billing_failure_uses_existing_plan_and_backs_off(monkeypatch, credit_error):
    clock = [1000.0]
    monkeypatch.setattr(plans.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(plans, '_quota_retry_at', 0)
    monkeypatch.setattr(plans.settings, 'ANTHROPIC_API_KEY', 'test-key-not-a-credential')
    message = 'Your credit balance is too low' if credit_error else 'Invalid model parameter'
    response = httpx.Response(400, request=httpx.Request('POST','https://example.test'))
    fail = anthropic.BadRequestError(message, response=response, body={'error':{'message':message}})
    create = AsyncMock(side_effect=fail)
    monkeypatch.setattr(anthropic, 'AsyncAnthropic', lambda **kwargs: SimpleNamespace(messages=SimpleNamespace(create=create)))
    args = ([], {'athlete':{'ftp':250}})
    assert await plans.personalize_week(*args) is None
    assert await plans.personalize_week(*args) is None
    assert create.await_count == (1 if credit_error else 2)
    clock[0] += 901
    assert await plans.personalize_week(*args) is None
    assert create.await_count == (2 if credit_error else 3)
