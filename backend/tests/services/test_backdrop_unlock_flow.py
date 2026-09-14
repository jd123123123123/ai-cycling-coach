"""Local ride → persisted unlock → studio selection, with no external services.

SQLite exercises the ownership queries and commits; it does not test Postgres
RLS or activity ingestion. Image generation and weather/place lookups are mocked.
"""
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api import garage
from app.models.garage import GarageAsset, RiderBackdrop, RiderStage
from app.models.place import Place
from app.models.shop import BikeRender
from app.services import cyclr_studio, gear, ride_economy, stage_frame, stage_unlock
from app.services.earn_modifiers import RideFacts


class LocalDB:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    @asynccontextmanager
    async def begin_nested(self):
        with self.session.begin_nested():
            yield

    async def flush(self):
        self.session.flush()

    def add(self, row):
        self.session.add(row)

    async def commit(self):
        self.session.commit()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


@pytest.fixture
def local_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    for model in (GarageAsset, RiderBackdrop, RiderStage, Place, BikeRender):
        model.__table__.create(engine)
    with Session(engine, expire_on_commit=False) as session:
        db = LocalDB(session)
        # Ownership must come from the persisted reward, not a history fallback.
        monkeypatch.setattr(garage, "_cheap_history_facts", AsyncMock(return_value=[]))
        monkeypatch.setattr(gear, "equipped_ids", AsyncMock(return_value=[]))
        monkeypatch.setattr(ride_economy, "_stamp_place", AsyncMock())
        monkeypatch.setattr(stage_unlock, "warm", Mock())
        monkeypatch.setattr(stage_unlock, "async_session_maker", lambda: db)
        monkeypatch.setattr(garage, "_ensure_cut_out", AsyncMock(side_effect=lambda db, bike: bike))
        monkeypatch.setattr(cyclr_studio, "edit_image", AsyncMock(return_value="simulated-render"))
        for kind in ("rider", "bike"):
            db.add(GarageAsset(user_id=1, kind=kind, name=f"original-{kind}",
                               image_url=f"original-{kind}-image",
                               created_at=datetime(2026, 9, 10)))
        session.commit()
        yield db
    engine.dispose()


def ride(distance_m=200_000, *, activity_id=200, started_at=None):
    return SimpleNamespace(id=activity_id, distance_meters=distance_m,
                           started_at=started_at or datetime(2026, 9, 11, 10, tzinfo=timezone.utc))


def facts(distance_m=200_000):
    return RideFacts(distance_m=distance_m, duration_s=28_800, elevation_gain_m=0,
                     start_hour=10, intensity_factor=.65, surface="road",
                     was_wet=False, temp_c=18)


async def assert_locked(db, user_id=1):
    with pytest.raises(HTTPException) as exc:
        await garage.select_backdrop("coast_road", SimpleNamespace(id=user_id), db)
    assert exc.value.status_code == 403


async def test_200km_persists_unlock_and_selects_it_without_replacing_base_bike(local_db):
    db = local_db
    await assert_locked(db)
    await ride_economy._pay_gear(db, 1, ride(), base_rc=100, chain_km=200, facts=facts())
    assert await stage_unlock.unlocked_by(db, 1, 200) == ["coast_road", "startrampe"]
    stage_unlock.warm.assert_called_once_with(1, ["coast_road", "startrampe"])
    # Re-read from storage, as a later Studio request does.
    db.session.expire_all()
    selected = await garage.select_backdrop("coast_road", SimpleNamespace(id=1), db)
    assert selected.stage == "coast_road"
    assert "coast_road" in [stage.id for stage in selected.stages]
    assert selected.bike_image == "original-bike-image"
    assert selected.bike_name == "original-bike"
    assert await garage._selected_backdrop(db, 1) == "coast_road"
    cyclr_studio.edit_image.assert_not_awaited()
    await assert_locked(db, user_id=2)


async def test_resync_and_another_200km_ride_do_not_grant_or_warm_twice(local_db):
    for activity_id in (200, 200, 201):
        await ride_economy._pay_gear(local_db, 1, ride(activity_id=activity_id),
                                     base_rc=100, chain_km=200, facts=facts())
    rows = (await local_db.execute(select(RiderBackdrop))).scalars().all()
    assert [(r.backdrop, r.activity_id) for r in rows] == [("coast_road", 200), ("startrampe", 200)]
    assert await stage_unlock.unlocked_by(local_db, 1, 200) == ["coast_road", "startrampe"]
    assert await stage_unlock.unlocked_by(local_db, 1, 201) == []
    stage_unlock.warm.assert_called_once_with(1, ["coast_road", "startrampe"])


@pytest.mark.parametrize("distance,expected", [(49_999, []), (50_000, []),
    (99_999, []), (100_000, ["coast_road"]),
    (199_999, ["coast_road"]), (200_000, ["coast_road", "startrampe"])])
async def test_distance_threshold(local_db, distance, expected):
    assert await ride_economy._open_backdrops(local_db, 1, ride(distance), facts(distance)) == expected


async def test_old_200km_ride_does_not_unlock(local_db):
    activity = ride(started_at=datetime(2026, 9, 9, 10, tzinfo=timezone.utc))
    assert await ride_economy._open_backdrops(local_db, 1, activity, facts()) == []
    await assert_locked(local_db)


async def test_two_shorter_rides_are_not_added_into_one_distance_reward(local_db):
    for activity_id in (1, 2):
        assert await ride_economy._open_backdrops(local_db, 1, ride(60_000, activity_id=activity_id),
                                                 facts(60_000)) == ([] if activity_id == 1 else [])
    await assert_locked(local_db)


async def test_warmed_image_is_reused_by_studio_with_original_bike_and_framing(local_db):
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    await stage_unlock._render_one(1, "coast_road")
    selected = await garage.select_backdrop("coast_road", SimpleNamespace(id=1), local_db)
    assert selected.bike_image == "simulated-render"
    call = cyclr_studio.edit_image.call_args
    assert call.args[0] == "original-bike-image"
    assert call.kwargs["aspect"] == cyclr_studio.STAGE_ASPECT
    assert call.kwargs["frame_ratio"] == stage_frame.RATIO_DEFAULT
    # Returning to an already rendered stage never pays for a second image.
    await stage_unlock._render_one(1, "coast_road")
    cyclr_studio.edit_image.assert_awaited_once()
    assert (await garage._get_asset(local_db, 1, "bike")).image_url == "original-bike-image"


async def test_scene_select_keeps_original_until_guarded_render_is_ready(local_db):
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    stage = await garage.select_backdrop("startrampe", SimpleNamespace(id=1), local_db)
    assert stage.bike_scene is False
    assert stage.bike_image == "original-bike-image"

    cyclr_studio.edit_image.assert_not_awaited()
    with pytest.raises(HTTPException) as exc:
        await garage.select_backdrop("startrampe", SimpleNamespace(id=2), local_db)
    assert exc.value.status_code == 403

async def test_gallery_matches_renderer_cache_key(local_db):
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    await stage_unlock._render_one(1, "coast_road")
    view = await garage.get_gallery(SimpleNamespace(id=1), local_db)
    assert next(s for s in view.stages if s.id == "coast_road").image == "simulated-render"
    assert next(s for s in view.stages if s.id == "startrampe").activity_id == 200
    assert view.owned_count == sum(s.owned for s in view.stages)

async def test_scene_master_requires_ownership(local_db):
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    with pytest.raises(HTTPException) as exc:
        await garage.get_gallery_image('startrampe', SimpleNamespace(id=2), local_db)
    assert exc.value.status_code == 403

async def test_scene_master_does_not_return_unchecked_preview(local_db):
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    with pytest.raises(HTTPException) as exc:
        await garage.get_gallery_image('startrampe', SimpleNamespace(id=1), local_db)
    assert exc.value.status_code == 404

async def test_measured_distance_unlocks_even_without_a_coin_payout(local_db):
    paid = await ride_economy._pay_gear(local_db, 1, ride(), base_rc=0, chain_km=0, facts=facts())
    assert paid == 0
    assert await stage_unlock.unlocked_by(local_db, 1, 200) == ["coast_road", "startrampe"]
    stage_unlock.warm.assert_called_once_with(1, ["coast_road", "startrampe"])


async def test_metadata_gallery_preserves_status_without_loading_or_converting_images(local_db, monkeypatch):
    from app.services import scene_render
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    asset = await garage._get_asset(local_db, 1, 'bike')
    key = garage._bike_key(asset, [], 'startrampe')
    local_db.add(BikeRender(build_key=key, status='ok', image='large-master-image'))
    await local_db.commit()
    local_db.session.expunge_all()
    convert = Mock(side_effect=AssertionError('metadata must not convert images'))
    monkeypatch.setattr(scene_render, 'display_image', convert)
    statements = []
    execute = local_db.execute
    async def capture(stmt):
        statements.append(str(stmt))
        return await execute(stmt)
    monkeypatch.setattr(local_db, 'execute', capture)
    view = await garage.get_gallery(SimpleNamespace(id=1), local_db, include_images=False)
    assert all(s.image is None for s in view.stages)
    assert next(s for s in view.stages if s.id == 'startrampe').render_status == 'ok'
    assert not any('bike_renders.image' in sql for sql in statements)
    convert.assert_not_called()


async def test_metadata_gallery_still_warms_missing_owned_scenes(local_db):
    await ride_economy._open_backdrops(local_db, 1, ride(), facts())
    stage_unlock.warm.reset_mock()
    view = await garage.get_gallery(SimpleNamespace(id=1), local_db, include_images=False)
    assert next(s for s in view.stages if s.id == 'startrampe').render_status == 'missing'
    stage_unlock.warm.assert_called_once_with(1, ['startrampe'])
