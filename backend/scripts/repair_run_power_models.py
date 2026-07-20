"""One-time repair: null the cycling power model on non-cycling stream rows.

`ActivityStream.mmp_curve IS NOT NULL` is the ingest-time cycling marker —
runs ingest with store_power_model=False so their (running-) power never
enters the cycling power-duration/CP model. Rows ingested BEFORE that
convention landed (July 2026) still carry mmp_curve/cp/w'/eftp/np for runs,
which inflates /analytics/power-profile's envelope and n_rides (audit P0-1).

Idempotent. Run on every environment once:
    cd backend && .venv/bin/python -m scripts.repair_run_power_models
"""
import asyncio

from sqlalchemy import text

from app.database import async_session_maker


async def main() -> None:
    async with async_session_maker() as db:
        res = await db.execute(
            text(
                """
                UPDATE activity_streams s
                SET mmp_curve = NULL,
                    cp_watts = NULL,
                    w_prime_j = NULL,
                    eftp_watts = NULL,
                    normalized_power = NULL
                FROM activities a
                WHERE a.id = s.activity_id
                  AND a.sport != 'cycling'
                  AND s.mmp_curve IS NOT NULL
                """
            )
        )
        await db.commit()
        print(f"repaired rows: {res.rowcount}")


if __name__ == "__main__":
    asyncio.run(main())
