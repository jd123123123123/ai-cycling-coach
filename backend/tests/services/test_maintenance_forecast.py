"""The weather-ahead nudge: every leg of the rule can veto, and a veto is None.

The sentence only exists when tomorrow has a planned ride AND rain is likely
AND the drivetrain is worth cleaning — anything less and the workshop shows
nothing rather than a guess.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import maintenance_forecast as mf


class _Result:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _Db:
    """A stub AsyncSession: `execute` returns the planned-workout row or not."""

    def __init__(self, has_plan: bool):
        self._has_plan = has_plan

    async def execute(self, _stmt):
        return _Result((1,) if self._has_plan else None)


@pytest.fixture(autouse=True)
def clear_cache():
    mf._cache.clear()
    yield
    mf._cache.clear()


@pytest.fixture
def rainy(monkeypatch):
    monkeypatch.setattr(
        mf.rider_location, "last_ride_location", AsyncMock(return_value=(50.9, 6.9))
    )
    monkeypatch.setattr(
        mf.weather_client,
        "fetch_window_forecast",
        AsyncMock(return_value={"hourly": {"precipitation_probability": [10, 85, 40]}}),
    )


@pytest.mark.asyncio
async def test_fires_when_all_three_legs_hold(rainy):
    line = await mf.weather_ahead(
        _Db(has_plan=True), 1, chain_progress=0.6, drivetrain_fresh=False
    )
    assert line is not None
    assert "85 %" in line
    assert "Kette" in line


@pytest.mark.asyncio
async def test_fresh_drivetrain_vetoes(rainy):
    assert (
        await mf.weather_ahead(_Db(True), 1, chain_progress=0.9, drivetrain_fresh=True)
    ) is None


@pytest.mark.asyncio
async def test_clean_chain_vetoes(rainy):
    assert (
        await mf.weather_ahead(_Db(True), 1, chain_progress=0.1, drivetrain_fresh=False)
    ) is None


@pytest.mark.asyncio
async def test_no_planned_ride_vetoes(rainy):
    assert (
        await mf.weather_ahead(_Db(False), 1, chain_progress=0.6, drivetrain_fresh=False)
    ) is None


@pytest.mark.asyncio
async def test_dry_forecast_vetoes(monkeypatch):
    monkeypatch.setattr(
        mf.rider_location, "last_ride_location", AsyncMock(return_value=(50.9, 6.9))
    )
    monkeypatch.setattr(
        mf.weather_client,
        "fetch_window_forecast",
        AsyncMock(return_value={"hourly": {"precipitation_probability": [5, 20]}}),
    )
    assert (
        await mf.weather_ahead(_Db(True), 1, chain_progress=0.6, drivetrain_fresh=False)
    ) is None


@pytest.mark.asyncio
async def test_forecast_outage_degrades_to_none(monkeypatch):
    monkeypatch.setattr(
        mf.rider_location, "last_ride_location", AsyncMock(return_value=(50.9, 6.9))
    )
    monkeypatch.setattr(
        mf.weather_client, "fetch_window_forecast", AsyncMock(return_value=None)
    )
    assert (
        await mf.weather_ahead(_Db(True), 1, chain_progress=0.6, drivetrain_fresh=False)
    ) is None


@pytest.mark.asyncio
async def test_forecast_is_cached_per_location_and_day(rainy):
    db = _Db(True)
    await mf.weather_ahead(db, 1, chain_progress=0.6, drivetrain_fresh=False)
    await mf.weather_ahead(db, 1, chain_progress=0.6, drivetrain_fresh=False)
    assert mf.weather_client.fetch_window_forecast.await_count == 1
