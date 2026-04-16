---
phase: 02-training-engine
plan: 03
subsystem: api
tags: [fastapi, sqlalchemy, timescaledb, pmc, ewma, coggan, seiler, ftp-history, rls, training-zones]

# Dependency graph
requires:
  - phase: 02-01
    provides: compute_pmc_series, coggan_power_zones, seiler_3_zones_running pure functions
  - phase: 02-02
    provides: Activity ORM (hypertable), ActivityCreate/Read schemas, PMC/FTP schemas, get_db_for_user RLS

provides:
  - pmc_service.py: get_daily_tss_by_sport (SQL GROUP BY), compute_user_pmc (per-sport + total EWMA), get_zones
  - GET /training-load/pmc — CTL/ATL/TSB per sport + combined total time series
  - GET /training-load/zones — Coggan 7-zone power + Seiler 3-zone running zones
  - PUT /athletes/me/ftp — FTP update with source field, appends to history via flag_modified
  - GET /athletes/me/ftp/history — chronological FTP progression timeline

affects:
  - 02-04 (daily_metrics API will build on PMC data; may query pmc_service)
  - 03-garmin (Garmin sync will auto-trigger TSS calculation, PMC will reflect imported activities)
  - 05-ai-coaching (CTL/ATL/TSB + zones are primary inputs to AI coaching recommendations)
  - frontend (PMC chart component, zones display, FTP tracking widget all powered by these endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL aggregation pattern: raw SQL with sqlalchemy.text() + f-string for server-side constants (days), bound param for user_id"
    - "Python gap-fill pattern: rest days filled with TSS=0 after SQL query (not time_bucket_gapfill, unreliable with multi-sport GROUP BY)"
    - "flag_modified pattern: required for SQLAlchemy to detect mutation of JSON column (ftp_history list append)"
    - "Partial zones pattern: zones endpoint returns only zones where thresholds are configured — no error if FTP/pace not set"

key-files:
  created:
    - backend/app/services/pmc_service.py
    - backend/app/api/training_load.py
    - backend/app/api/ftp.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Python gap-fill for rest days instead of time_bucket_gapfill — SQL gapfill with multi-sport GROUP BY produces one row per (sport, day) which requires a second aggregation step; Python iteration is simpler and avoids the gapfill interaction with PARTITION GROUP BY"
  - "Total PMC from summed daily TSS (single EWMA), not sum of per-sport CTLs — summing CTLs overstates fitness and violates the EWMA model"
  - "FTP endpoint separate from athlete PATCH — source field and clean history append semantics; legacy entries from PATCH route lack source field, handled via .get('source', 'manual') fallback"
  - "PUT /athletes/me/ftp always appends to history (no dedup check) — each explicit FTP update is a deliberate measurement, dedup is caller's responsibility"

patterns-established:
  - "PMC service pattern: SQL aggregate by sport -> Python gap-fill -> compute_pmc_series per series"
  - "flag_modified pattern: any endpoint mutating a JSON list column must call flag_modified(model, 'field') before commit"

# Metrics
duration: 2min
completed: 2026-04-16
---

# Phase 02 Plan 03: Training Load API Summary

**PMC endpoints (CTL/ATL/TSB per sport + combined), Coggan/Seiler zones, and FTP history timeline — full training load API surface with Python gap-fill for rest-day decay**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-16T15:31:48Z
- **Completed:** 2026-04-16T15:33:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- pmc_service.py with SQL daily TSS aggregation by sport, Python gap-fill for rest days, per-sport and combined-total EWMA PMC computation, and zones from profile thresholds
- GET /training-load/pmc returning full CTL/ATL/TSB/TSS time series for cycling/running/gym + combined total
- GET /training-load/zones returning Coggan 7-zone power model and Seiler 3-zone polarized running model (partial response when only one sport configured)
- PUT /athletes/me/ftp with flag_modified JSON mutation detection + source field; GET /athletes/me/ftp/history with chronological sorting and legacy-entry source fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: PMC service and training load API endpoints** - `079a8d3` (feat)
2. **Task 2: FTP update endpoint with history and flag_modified** - `0ddc427` (feat)

**Plan metadata:** (next commit — docs)

## Files Created/Modified

- `backend/app/services/pmc_service.py` - SQL aggregation, Python gap-fill, compute_user_pmc, get_zones (131 lines)
- `backend/app/api/training_load.py` - GET /training-load/pmc and GET /training-load/zones (69 lines)
- `backend/app/api/ftp.py` - PUT /athletes/me/ftp and GET /athletes/me/ftp/history with flag_modified (116 lines)
- `backend/app/main.py` - Registered training_load_router and ftp_router

## Decisions Made

- **Python gap-fill vs time_bucket_gapfill**: TimescaleDB's `time_bucket_gapfill` with a multi-sport `GROUP BY` generates one row per (sport, day) combination, requiring a second pass to build the total. Python `_gap_fill_series()` iterates dates and fills missing ones with TSS=0 — simpler, no TimescaleDB extension edge cases, and correct for the single-dimension EWMA used by `compute_pmc_series`.

- **Total PMC from summed TSS, not sum of per-sport CTLs**: The EWMA fitness model is non-additive. If a cyclist has CTL=50 and running CTL=30, their combined fitness is NOT 80 — that's double-counting the adaptation decay. Correct approach: sum the daily TSS across sports first, then run a single EWMA on the summed series.

- **FTP endpoint separate from athlete PATCH**: The existing `PATCH /athletes/me` route already tracks FTP history on profile update but uses a different entry format (no `source` field). A dedicated FTP router adds the `source` field and clear semantics. `_build_history_response()` handles the legacy format with `.get("source", "manual")` fallback.

- **PUT /athletes/me/ftp always appends**: Each call is treated as a deliberate FTP measurement event. Deduplication (e.g., prevent appending the same value twice) is considered caller responsibility — the history should reflect all explicit updates.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 02-04 (daily_metrics)**: PMC service established the daily TSS aggregation pattern; daily_metrics can build on same SQL approach or reuse pmc_service directly.
- **Ready for frontend PMC chart**: `/training-load/pmc?days=90` returns `entries` (total) and `per_sport` dict — matches the charting structure needed for recharts/chart.js PMC visualization.
- **Ready for zones display**: `/training-load/zones` returns only zones where thresholds are configured — frontend can conditionally render cycling vs running sections.
- **FTP tracking widget**: PUT + GET /athletes/me/ftp/history ready for the FTP progression chart and manual update flow.
- **Concern**: FTP history in athlete PATCH route stores entries without `source` field; the FTP router handles this via fallback but if the PATCH route is used often it may create mixed history formats. Consider adding `source` to the PATCH route's history append in a future plan.

---
*Phase: 02-training-engine*
*Completed: 2026-04-16*
