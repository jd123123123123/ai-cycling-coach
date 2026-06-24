"""Validation tests for the tab-layouts schemas."""
import pytest
from pydantic import ValidationError

from app.schemas.user_tab_layout import CardPref, TabLayoutsPayload


def test_cardpref_defaults_hidden_false():
    assert CardPref(id="coach-brief").hidden is False


def test_payload_round_trips_layouts():
    payload = TabLayoutsPayload(
        layouts={"today": [{"id": "coach-brief", "hidden": True}, {"id": "today-hero"}]}
    )
    dumped = payload.model_dump()
    assert dumped["layouts"]["today"][0] == {"id": "coach-brief", "hidden": True}
    assert dumped["layouts"]["today"][1] == {"id": "today-hero", "hidden": False}


def test_payload_rejects_too_many_tabs():
    with pytest.raises(ValidationError):
        TabLayoutsPayload(layouts={f"tab{i}": [] for i in range(33)})


def test_payload_rejects_too_many_cards():
    with pytest.raises(ValidationError):
        TabLayoutsPayload(layouts={"today": [{"id": f"c{i}"} for i in range(65)]})


def test_cardpref_rejects_long_id():
    with pytest.raises(ValidationError):
        CardPref(id="x" * 65)
