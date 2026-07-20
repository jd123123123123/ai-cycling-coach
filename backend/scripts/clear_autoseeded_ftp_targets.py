"""One-time cleanup: remove auto-seeded goals.target_ftp values (audit P0-1).

Until July 2026 onboarding silently copied the typed FTP into
goals.target_ftp, producing unexplained targets like '350 W · 110 W to go ·
69%' that no projection supports — the audit's 'demoralizing auto goal'.
The auto-seed writers are deleted; every existing target_ftp predates a real
choose-your-goal UI, so all of them are seeds. Season Goals now renders an
empty state with a +5% suggestion until the athlete explicitly adopts one.

Idempotent. Run once per environment:
    cd backend && .venv/bin/python -m scripts.clear_autoseeded_ftp_targets
"""
import asyncio

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.database import async_session_maker
from app.models.athlete_profile import AthleteProfile


async def main() -> None:
    async with async_session_maker() as db:
        profiles = (await db.execute(select(AthleteProfile))).scalars().all()
        cleared = 0
        for p in profiles:
            goals = p.goals if isinstance(p.goals, dict) else None
            if goals and "target_ftp" in goals:
                goals.pop("target_ftp", None)
                flag_modified(p, "goals")
                cleared += 1
        await db.commit()
        print(f"cleared auto-seeded target_ftp on {cleared} profile(s)")


if __name__ == "__main__":
    asyncio.run(main())
