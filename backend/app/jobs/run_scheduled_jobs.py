"""Railway cron entrypoint — run all four scheduled sweeps once, sequentially.

Invoked as ``python -m app.jobs.run_scheduled_jobs`` by a Railway cron service on
a ``*/15 * * * *`` schedule (see backend/railway.cron.json). This replaces the
in-process APScheduler that used to run from the FastAPI lifespan — that never
fired reliably because Railway idles the web container between HTTP requests.

The four sweeps are the exact same functions the scheduler used to register; no
job logic changes here. Each runs in its own try/except so a single failing sweep
logs and is skipped rather than aborting the run. The process always exits 0 so
Railway does not mark the cron run failed and retry-storm — ``restartPolicyType``
is NEVER for the same reason.

Running the hourly sweeps every 15 minutes is safe: they are all idempotent /
deduped (brief refresh per athlete-local day, plan adaptation snapshot-
fingerprinted, morning push gated to the local morning hour and deduped per day,
Garmin sync incremental). This does NOT run alembic — migrations stay owned by the
web service's start.sh.
"""
from __future__ import annotations

import asyncio
import logging

from app.scheduler import (
    run_all_user_syncs,
    run_brief_refresh_sweep,
    run_hourly_plan_adaptation,
    run_morning_push_briefs,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    """Run each sweep once, sequentially, isolating failures."""
    # (label, coroutine function) — order is intentional: Garmin sync first so the
    # freshest activity data feeds the adaptation / brief sweeps that follow.
    sweeps = [
        ("garmin_sync", run_all_user_syncs),
        ("plan_adaptation", run_hourly_plan_adaptation),
        ("brief_refresh", run_brief_refresh_sweep),
        ("morning_push", run_morning_push_briefs),
    ]

    succeeded: list[str] = []
    failed: list[str] = []

    logger.info("Scheduled jobs run starting — %d sweeps", len(sweeps))
    for name, sweep in sweeps:
        try:
            await sweep()
            succeeded.append(name)
        except Exception:
            failed.append(name)
            logger.exception("Sweep %s failed — continuing with the rest", name)

    logger.info(
        "Scheduled jobs run complete: %d succeeded (%s), %d failed (%s)",
        len(succeeded),
        ", ".join(succeeded) or "none",
        len(failed),
        ", ".join(failed) or "none",
    )


if __name__ == "__main__":
    asyncio.run(main())
