from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
from app.api.weeks import _historical_week


def test_history_does_not_invent_load_or_generate_plan():
    day = date(2026, 9, 14)
    rides = [SimpleNamespace(started_at=datetime(2026, 9, 14, 12, tzinfo=timezone.utc), sport='cycling', tss=None, duration_seconds=1800),
             SimpleNamespace(started_at=datetime(2026, 9, 14, 14, tzinfo=timezone.utc), sport='cycling', tss=40, duration_seconds=1200)]
    workouts, activities, meso = MagicMock(), MagicMock(), MagicMock()
    workouts.scalars.return_value.all.return_value = []
    activities.scalars.return_value.all.return_value = rides
    meso.scalar_one_or_none.return_value = None
    db = MagicMock(); db.execute = AsyncMock(side_effect=[workouts, activities, meso]); db.commit = AsyncMock()
    with patch('app.api.weeks.generate_mesocycle', new_callable=AsyncMock) as generate:
        result = asyncio.run(_historical_week(db=db, current_user=SimpleNamespace(id=12), athlete=SimpleNamespace(target_event_type=None), primary_sport='cycling', week_offset=-1, current_monday=date(2026,9,21), today=date(2026,9,21), language='simple', locale='de', fallback_meso=None))
        generate.assert_not_called()
    assert result.week_start == day
    assert len(result.days) == 7
    assert result.days[0].actual_tss is None
    assert result.days[0].actual_duration_seconds == 3000
    assert result.week_comparison.ride_count == 2
    assert result.week_comparison.fit_pct is None
    assert result.week_comparison.actual_tss is None
    assert result.meso_block.phase == 'unknown'
    db.commit.assert_not_called()
    db.add.assert_not_called()
