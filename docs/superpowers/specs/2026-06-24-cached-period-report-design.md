# Cached period report — design

**Date:** 2026-06-24
**Status:** Approved (pending spec review)

## Problem

The period report (`GET /analytics/period-report?days=N`) calls `build_report()`
live on every request. `build_report` assembles two equal windows (current +
previous), runs advanced per-activity metrics, and PMC aggregates — so switching
the window from 7 → 14 → 30 days on the Report page is visibly slow.

## Goal

Serve the period report from a DB cache so repeat views (and window switches) are
instant, and keep that cache fresh by regenerating it (a) after a workout is
synced and (b) once a day after the morning data refresh.

This mirrors the existing `coach_briefs` read-through cache + sync-invalidation
pattern already in the codebase — no new infrastructure.

## Scope

- Cache `PeriodReport` payloads per `(user, days)` in a new `period_reports` table.
- Make `GET /period-report` read-through.
- Proactively precompute the preset windows `7/14/30` on two triggers (post-workout
  sync, daily morning sync), reusing the existing background Garmin sync job.
- Surface a `generated_at` stamp on the report so the UI can show freshness.

## Non-goals (YAGNI)

- No history / audit trail of past reports (keep only the latest row per window;
  derived analytics, unlike coaching advice, doesn't need an immutable trail).
- No proactive precompute of arbitrary custom windows — custom `days` values are
  cached lazily (read-through), instant on the second view.
- No new standalone scheduler — the daily trigger piggybacks on the existing
  every-4h sync job (the "first sync past the morning hour" each day).
- No frontend redesign — same `GET /period-report?days=N` contract, just faster,
  plus an optional `generated_at` field the UI may display.

## Confirmed decisions (brainstorming)

- **Daily trigger = morning sync.** "After breakfast" means: the first background
  sync of the day that runs at/after a morning hour in the athlete's timezone
  precomputes the report. No separate cron.
- **Presets precomputed = `7`, `14`, `30`.** Custom windows are read-through only.
- **Cache keeps only the latest row per `(user, days)`** (upsert), no history.

## Architecture

### Cache table — `period_reports`

Modeled on `coach_briefs` (JSONB payload, RLS-protected). One row per
`(user_id, days)`:

```python
class PeriodReportCache(Base):
    __tablename__ = "period_reports"
    id: Mapped[int]          = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int]     = mapped_column(ForeignKey("users.id", ondelete="CASCADE"),
                                             nullable=False, index=True)
    days: Mapped[int]        = mapped_column(Integer, nullable=False)
    report: Mapped[dict]     = mapped_column(JSONB, nullable=False)  # PeriodReport.model_dump()
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                             server_default=func.now(), nullable=False)
    # UniqueConstraint(user_id, days) — one cached row per window per user
```

Migration: create table + `UniqueConstraint(user_id, days)` + enable RLS with the
standard `user_isolation` policy (`user_id = current_setting('app.current_user_id')`).

### Read-through service — `get_or_build_report`

New wrapper in `app/services/period_report.py`:

```python
PERIOD_REPORT_TTL_HOURS = 18  # backstop; sync invalidation handles intraday freshness

async def get_or_build_report(db, user_id, days) -> PeriodReport:
    cutoff = now_utc() - timedelta(hours=PERIOD_REPORT_TTL_HOURS)
    row = SELECT period_reports WHERE user_id, days, generated_at >= cutoff  # latest
    if row:
        return PeriodReport.model_validate({**row.report, "generated_at": row.generated_at})
    report = await build_report(db, user_id, days)
    upsert period_reports(user_id, days, report=report.model_dump(), generated_at=now)
    return report  # with generated_at = now
```

`build_report` itself is unchanged (pure orchestration). The wrapper owns
cache read, TTL check, build-on-miss, and upsert.

### Precompute helper — `precompute_preset_reports`

```python
PRESET_WINDOWS = (7, 14, 30)

async def precompute_preset_reports(db, user_id) -> None:
    for days in PRESET_WINDOWS:
        report = await build_report(db, user_id, days)
        upsert period_reports(user_id, days, report=report.model_dump(), generated_at=now)
    # best-effort: a failure for one window logs + continues (never breaks the caller)
```

### Endpoint change — `api/analytics.py`

`get_period_report` calls `get_or_build_report(db, _user.id, days)` instead of
`build_report(...)`. Validation (`3 ≤ days ≤ 365`) and signature unchanged.

### Sync triggers — `services/garmin_sync_service.py`

Inside `sync_user_garmin`, next to the existing coach-brief invalidation
(~line 498), after data is written:

1. **Invalidate** the user's cached reports the same way coach briefs are
   invalidated (delete rows `generated_at >= today UTC`) — best-effort, a delete
   failure must not break the sync return.
2. **Recompute presets** when either condition holds:
   - the sync brought **new activities** (a workout landed), or
   - this is the **first sync of the day at/after the morning hour** in the
     athlete's timezone (the daily "after breakfast" refresh).

   Both call `precompute_preset_reports(db, user_id)`. The morning-hour check:
   resolve the athlete-local "now" using `AthleteProfile.timezone` (IANA string,
   nullable → fall back to UTC); the morning hour is **09:00 athlete-local**. It
   is the "first sync past the morning hour today" when local time ≥ 09:00 AND
   the newest existing preset row's `generated_at`, converted to athlete-local,
   is before 09:00 today (or no preset row exists). Wrapped in try/except —
   precompute failure logs and is non-fatal to the sync.

### Schema — `schemas/period_report.py`

Add an optional `generated_at: datetime | None = None` to `PeriodReport`. Live
builds leave it None or stamp `now`; cached reads carry the stored timestamp.
The frontend may render it as an "as of" line (out of scope to wire here, but
the field is available).

## Data flow

```
Report page (days=N) ──GET /period-report?days=N──> get_or_build_report
                                                      │ fresh cache? → return stored report (fast)
                                                      │ miss/stale → build_report → upsert → return

Background sync (every 4h) ──> sync_user_garmin
   writes activities/metrics
   ├─ invalidate today's coach_briefs   (existing)
   ├─ invalidate today's period_reports (new)
   └─ if new activity OR first-sync-past-morning-hour:
        precompute_preset_reports(7,14,30)  → cache warm before next page view
```

## Error handling

- Cache read failure / malformed stored JSON → treat as miss, fall through to
  `build_report` (self-healing).
- Precompute / invalidation failures inside sync → logged, non-fatal (sync still
  returns its stats), matching the existing coach-brief invalidation's
  try/except posture.
- `build_report` errors propagate to the endpoint exactly as today.

## Testing

Backend pytest, mocked-DB style (per `tests/api/test_weeks.py` / existing
`test_period_report.py`):

- `get_or_build_report`: returns the cached payload when a fresh row exists
  (build_report NOT called); calls `build_report` + upserts when the row is
  missing or older than the TTL.
- `precompute_preset_reports`: invokes `build_report` for each of 7/14/30 and
  upserts three rows; one window failing does not abort the others.
- Sync invalidation: `sync_user_garmin` deletes today's `period_reports` rows.
- Sync precompute gate: precompute runs when new activities landed; the
  morning-hour path triggers once per day and not on every 4h sync.
- API: `GET /period-report` returns the cached report (200) and the
  `generated_at` field is present.

## Files touched

**New:** `app/models/period_report_cache.py`, an Alembic migration,
`tests/test_period_report_cache.py` (+ API test additions).
**Edit:** `app/models/__init__.py` (register model), `app/services/period_report.py`
(`get_or_build_report`, `precompute_preset_reports`, constants),
`app/api/analytics.py` (call wrapper), `app/services/garmin_sync_service.py`
(invalidate + precompute hook), `app/schemas/period_report.py` (`generated_at`).
