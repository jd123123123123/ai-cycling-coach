"""Backfill elevation_gain_m (Höhenmeter) from already-stored raw_data.

Idempotent, network-free batch version of the self-heal step wired into
`garmin_sync_service.sync_user_garmin`. Iterates activities whose
`elevation_gain_m` is NULL but which carry a `raw_data` blob with a positive
ascent figure (Garmin `elevationGain`, synthetic/seeded `total_ascent`,
COROS-preserved `elevation_gain`, …) and fills the first-class column.

Usage:
    cd backend && python -m scripts.backfill_elevation --user-id 1
    cd backend && python -m scripts.backfill_elevation --all
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import event, select, text

from app.database import async_session_maker
from app.models.user import User
from app.services.activity_service import backfill_missing_elevation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill_elevation")


async def backfill_user(user_id: int) -> int:
    async with async_session_maker() as db:
        # Mirror the RLS setup used by the app: SET LOCAL is transaction-scoped,
        # and backfill_missing_elevation commits, so re-apply on every BEGIN.
        set_local_sql = text(f"SET LOCAL app.current_user_id = '{user_id}'")

        def _reapply_rls(session, transaction, connection):  # type: ignore[no-untyped-def]
            connection.execute(set_local_sql)

        event.listen(db.sync_session, "after_begin", _reapply_rls)
        await db.execute(set_local_sql)
        updated = await backfill_missing_elevation(db, user_id)
        logger.info("user_id=%s: %d rows backfilled", user_id, updated)
        return updated


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--user-id", type=int, help="Backfill a single user")
    group.add_argument("--all", action="store_true", help="Backfill every user")
    args = parser.parse_args()

    if args.all:
        async with async_session_maker() as db:
            user_ids = [row[0] for row in (await db.execute(select(User.id))).all()]
    else:
        user_ids = [args.user_id]

    total = 0
    for uid in user_ids:
        total += await backfill_user(uid)
    logger.info("Done — %d rows backfilled across %d user(s)", total, len(user_ids))


if __name__ == "__main__":
    asyncio.run(main())
