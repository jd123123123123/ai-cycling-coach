# Design — Deployment-independent scheduled jobs via Railway cron

**Date:** 2026-07-22
**Status:** Approved (design), pending spec review
**Author:** Claude + Jannis

## Problem

Garmin sync (and three other scheduled jobs) never run automatically in production.
Users must tap "sync" manually.

**Root cause (verified, not a code gap):** the four scheduled jobs run inside an
in-process `AsyncIOScheduler` started from the FastAPI `lifespan`
(`backend/app/main.py`). The backend is a single Railway web service. When Railway
idles/sleeps the container (no HTTP traffic), the scheduler stops ticking; on wake,
`misfire_grace_time` (300s) makes the due job *skip*. Net effect: background jobs
effectively never fire on their own. A manual sync works only because it is an HTTP
request that wakes the container.

Affected jobs (all in the same `lifespan`, all equally broken):
- `run_all_user_syncs` — Garmin sync, every 15 min
- `run_hourly_plan_adaptation` — hourly
- `run_brief_refresh_sweep` — hourly
- `run_morning_push_briefs` — hourly

Confirmations from the codebase:
- `lifespan` in `main.py` contains **only** scheduler wiring (no other startup logic).
- **Only** `main.py` imports `app.scheduler` — no tests depend on the scheduler object.

## Goal

Make all four jobs run on schedule regardless of whether the web container is awake,
without changing the jobs' own logic.

## Approach

Chosen: **Option A — Railway cron service** (over Option B, keep-web-always-on, which
is fragile and pays for an idle container). Within A, chosen sub-option: **a single
`*/15` cron entrypoint that runs all four sweeps sequentially**, rather than multiple
cron services per cadence — one thing to deploy and monitor, and over-running the cheap
idempotent hourly sweeps costs effectively nothing.

Why running hourly sweeps every 15 min is safe (they are already deduped/idempotent):
- brief refresh — deduped per athlete-local day
- plan adaptation — snapshot-fingerprinted, no-ops on an unchanged signal hour
- morning push — gated to the athlete's local morning hour, deduped per day
- Garmin sync — incremental (`last_sync_at − 2h` window)

## Components

### 1. Cron entrypoint — `backend/app/jobs/run_scheduled_jobs.py` (new)
- New package `backend/app/jobs/` (`__init__.py` + module).
- `async def main()` runs the four existing sweeps **sequentially**, each wrapped in its
  own try/except, logging a one-line summary. Reuses the functions verbatim from
  `app/scheduler.py` — no job-logic changes.
- Sync error isolation: a failing sweep logs and is skipped; the process still exits `0`
  so Railway does not mark the cron run failed and retry-storm.
- Runs `asyncio.run(main())` under `if __name__ == "__main__":`; invoked as
  `python -m app.jobs.run_scheduled_jobs`.
- Does **not** run `alembic` — migrations remain owned by the web `start.sh`.

### 2. Web app slimming — `backend/app/main.py` + `backend/app/scheduler.py`
- Gut the `lifespan` scheduler block (all four `add_job` calls + `scheduler.start()` /
  `scheduler.shutdown()`); the web process no longer runs background work. If `lifespan`
  becomes empty, keep a no-op `lifespan` or drop the arg — implementer's call, verified
  against remaining startup needs.
- Remove the unused `AsyncIOScheduler` object and its import from `app/scheduler.py`;
  keep the four `run_*` functions exactly as they are.
- Drop the `apscheduler` dependency from `backend/requirements.txt` and
  `backend/pyproject.toml` (now unused by both web and cron; cron uses plain asyncio).

### 3. Railway cron config — `backend/railway.cron.json` (new)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "cronSchedule": "*/15 * * * *",
    "startCommand": "python -m app.jobs.run_scheduled_jobs",
    "restartPolicyType": "NEVER"
  }
}
```
`restartPolicyType: NEVER` — a cron run is expected to exit; don't restart-loop it.

### 4. Manual Railway step (cannot be automated from here — documented for the user)
1. Railway → project → **New Service → GitHub Repo** (same repo).
2. Service **Settings → Config-as-code path** = `backend/railway.cron.json`.
3. Give it the **same environment variables** as the web service: `DATABASE_URL`,
   the Garmin credential decryption key, `ANTHROPIC_API_KEY` (brief refresh calls the
   LLM), and the VAPID push keys. Use Railway shared variables / a variable reference so
   they stay in sync.
4. Deploy. Confirm the cron run logs `Starting scheduled Garmin sync for all users`.

## Testing (TDD)

- `backend/tests/jobs/test_run_scheduled_jobs.py`:
  - all four sweeps are invoked (monkeypatch the four `run_*`, assert each called once);
  - a sweep raising an exception does **not** prevent the others from running, and the
    entrypoint still completes / exits 0.
- Existing suite must stay green after removing the scheduler from the web app
  (`main.py` still imports cleanly; app still boots).

## Out of scope / follow-ups
- Instant (webhook/push) Garmin ingestion — Garmin's official API is not available; this
  design keeps the near-live 15-min pull model.
- Reducing the interval below 15 min (Railway cron minimum considerations).

## Risks
- **Env drift** between web and cron services → cron silently no-ops or errors. Mitigated
  by shared variables and the confirm-the-log step.
- If Railway *also* sleeps a cron service between runs: cron services are triggered by the
  scheduler, not HTTP, so sleeping does not stop them from being invoked on schedule.
