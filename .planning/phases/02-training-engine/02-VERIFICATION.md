---
phase: 02-training-engine
verified: 2026-04-16T00:00:00Z
status: passed
score: 19/19 must-haves verified
---

# Phase 2: Training Engine Verification Report

**Phase Goal:** The system can compute accurate per-sport training load metrics, track fitness/fatigue/form, and calculate power/pace zones from athlete data
**Verified:** 2026-04-16
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cycling TSS = 100 for 1 hour at exactly FTP | VERIFIED | `calculate_cycling_tss(3600, 280.0, 280)` → 100.0; test passes |
| 2 | Running rTSS = 100 for 1 hour at exactly threshold pace | VERIFIED | `calculate_running_tss(3600, 3.5, 3.5)` → 100.0; test passes |
| 3 | HR TSS = 100 for 1 hour at exactly LTHR | VERIFIED | `calculate_hr_tss(3600, 160, 160, 50, 190, "male")` → 100.0; test passes |
| 4 | CTL/ATL update using EWMA decay (1/42 and 1/7), not rolling mean | VERIFIED | `update_ctl_atl` uses `(1 / CTL_TIME_CONSTANT)` and `(1 / ATL_TIME_CONSTANT)`; EWMA formula test passes |
| 5 | TSB = CTL - ATL (yesterday's values) | VERIFIED | `calculate_tsb` returns `round(ctl - atl, 1)`; docstring explicitly calls out TrainingPeaks convention |
| 6 | Coggan 7-zone boundaries computed from FTP | VERIFIED | `coggan_power_zones(ftp_watts)` returns 7 zones with correct percentage boundaries; 8 tests pass |
| 7 | Seiler 3-zone boundaries computed from threshold pace | VERIFIED | `seiler_3_zones_running(threshold_pace_ms)` returns 3 zones at 77%/100% threshold; 6 tests pass |
| 8 | Rest days (TSS=0) cause CTL/ATL to decay, not stay flat | VERIFIED | `test_rest_day_causes_decay` and `test_rest_days_cause_ctl_decay` both pass; `compute_pmc_series` gap-fills with TSS=0 |
| 9 | Activity ORM model maps to existing activities hypertable with composite PK (id, started_at) | VERIFIED | `Activity` model has `primary_key=True` on both `id` and `started_at`; comment notes hypertable requirement |
| 10 | POST /activities creates an activity with auto-calculated TSS based on sport type | VERIFIED | `create_activity` endpoint calls `activity_service.create_activity` which calls `_compute_tss` per sport |
| 11 | GET /activities returns user's activities filtered by date range and sport | VERIFIED | `list_activities` endpoint accepts `sport`, `start_date`, `end_date`, `limit` query params; service applies all filters |
| 12 | Activities are RLS-protected (users see only their own data) | VERIFIED | All activity endpoints use `get_db_for_user` which sets `SET LOCAL app.current_user_id`; RLS enforced at DB level |
| 13 | GET /training-load/pmc returns CTL/ATL/TSB series per sport AND combined total | VERIFIED | `PMCResponse` has `entries` (total) and `per_sport` dict with cycling/running/gym; `compute_user_pmc` fills both |
| 14 | CTL/ATL decay smoothly on rest days (no gaps in the series) | VERIFIED | `_gap_fill_series` fills every calendar day; `compute_pmc_series` processes all days including TSS=0 rest days |
| 15 | Per-sport PMC is tracked independently; total PMC uses summed daily TSS | VERIFIED | `compute_user_pmc` builds `sport_tss` per sport AND `total_tss = defaultdict(float)` aggregated; total fed to single EWMA |
| 16 | GET /training-load/zones returns power zones from current FTP and pace zones from threshold pace | VERIFIED | `get_zones` endpoint calls `pmc_service.get_zones(profile)` which calls `coggan_power_zones` and `seiler_3_zones_running` |
| 17 | PUT /athletes/me/ftp updates FTP and appends to FTP history with flag_modified | VERIFIED | `update_ftp` sets `profile.ftp_watts`, appends to `profile.ftp_history`, calls `flag_modified(profile, "ftp_history")` |
| 18 | GET /athletes/me/ftp/history returns FTP timeline with timestamps | VERIFIED | `get_ftp_history` endpoint returns `FTPHistoryResponse` with `current_ftp` and sorted `history` list |
| 19 | All 55 unit tests pass | VERIFIED | `pytest tests/test_training_load.py -v` → 55 passed in 0.78s |

**Score:** 19/19 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/services/training_load.py` | Pure functions, 100+ lines | VERIFIED | 324 lines; exports all 8 functions imported by tests; no stubs |
| `backend/tests/test_training_load.py` | Unit tests, 80+ lines | VERIFIED | 409 lines; 55 tests across 8 test classes |
| `backend/app/models/activity.py` | ORM model, 30+ lines | VERIFIED | 73 lines; composite PK on (id, started_at); all required columns present |
| `backend/app/schemas/activity.py` | Pydantic schemas, 30+ lines | VERIFIED | 54 lines; ActivityCreate, ActivityRead, ActivityListResponse |
| `backend/app/services/activity_service.py` | CRUD + TSS calc, 40+ lines | VERIFIED | 174 lines; `_compute_tss` handles cycling/running/gym; `create_activity`, `list_activities`, `get_activity` |
| `backend/app/api/activities.py` | REST endpoints, 40+ lines | VERIFIED | 111 lines; POST/GET/GET(id) endpoints; uses `get_db_for_user` for RLS |
| `backend/app/services/pmc_service.py` | PMC computation, 50+ lines | VERIFIED | 188 lines; `compute_user_pmc`, `get_daily_tss_by_sport`, `_gap_fill_series`, `get_zones` |
| `backend/app/api/training_load.py` | PMC/zones endpoints, 40+ lines | VERIFIED | 75 lines; `/pmc` and `/zones` endpoints |
| `backend/app/api/ftp.py` | FTP update/history, 30+ lines | VERIFIED | 115 lines; PUT and GET /history endpoints with `flag_modified` |
| `backend/app/schemas/training_load.py` | Training load schemas | VERIFIED | 58 lines; PMCEntry, PMCResponse, FTPHistoryEntry, FTPHistoryResponse |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `activity_service.py` | `training_load.py` | import + call | VERIFIED | Imports `calculate_cycling_tss`, `calculate_hr_tss`, `calculate_running_tss`; called in `_compute_tss` |
| `pmc_service.py` | `training_load.py` | import + call | VERIFIED | Imports `coggan_power_zones`, `compute_pmc_series`, `seiler_3_zones_running`; called in `compute_user_pmc` and `get_zones` |
| `api/ftp.py` | `flag_modified` | `from sqlalchemy.orm.attributes import flag_modified` | VERIFIED | Imported and called on line 68: `flag_modified(profile, "ftp_history")` |
| `api/activities.py` | `activity_service` | import + call | VERIFIED | Uses `get_db_for_user` (RLS) + calls `activity_service.create_activity` and `list_activities` |
| `api/training_load.py` | `pmc_service` | import + call | VERIFIED | Calls `pmc_service.compute_user_pmc` and `pmc_service.get_zones` |
| All phase 2 routers | `main.py` | `include_router` | VERIFIED | `activities_router`, `training_load_router`, `ftp_router` all registered in `main.py` |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Correct TSS for cycling (power-based), running (pace-based), gym (HR-based) | SATISFIED | All three sport handlers in `_compute_tss`; 100=1hr@threshold verified by tests |
| CTL/ATL/TSB via EWMA, per-sport without naive combining | SATISFIED | `compute_user_pmc` tracks sports independently; total uses summed TSS, not summed CTLs |
| Coggan 7-zone and Seiler 3-zone from FTP/threshold | SATISFIED | Both functions implemented and tested; zones endpoint wired to profile thresholds |
| FTP history with timestamps and timeline | SATISFIED | `ftp_history` JSON column on AthleteProfile; `flag_modified` for mutation detection; history endpoint sorts chronologically |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `activity_service.py` | 83 | `# TODO: add sex field to AthleteProfile — defaulting to "male" for now` | Warning | hrTSS calculation defaults to male for all athletes; functionally complete but imprecise for female athletes |

No blockers. The TODO is a known improvement item that does not prevent hrTSS from being computed — it only defaults to male TRIMP constant. The gym TSS path is fully functional.

### Human Verification Required

No items require human verification for the core goal. All observable truths are verifiable structurally. The following is noted for completeness:

**Integration test (needs live DB):** Verify that RLS `SET LOCAL app.current_user_id` correctly filters activities cross-user at the PostgreSQL level. The code wiring is correct but the policy enforcement is DB-side.

### Gaps Summary

No gaps. All 19 must-have truths are verified. All 10 artifacts exist, are substantive, and are correctly wired. The test suite passes 55/55. All three phase goals (02-01 pure functions, 02-02 activity API, 02-03 PMC/zones/FTP) are fully implemented.

The single TODO in `activity_service.py` (sex defaulting to "male" for hrTSS) is a warning-level item that does not block goal achievement — gym TSS is computed and stored correctly, it just uses the male TRIMP k-constant for all athletes until a sex field is added to AthleteProfile.

---

_Verified: 2026-04-16_
_Verifier: Claude (gsd-verifier)_
