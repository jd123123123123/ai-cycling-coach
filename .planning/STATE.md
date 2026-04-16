# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** All your body data combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.
**Current focus:** Phase 2 - Training Engine

## Current Position

Phase: 2 of 9 (Training Engine)
Plan: 02-03 complete, 02-04 next
Status: In progress
Last activity: 2026-04-16 -- Completed 02-03-PLAN.md (PMC API, zones, FTP history)

Progress: [███████...] ~50%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 35 min
- Total execution time: 1.08 + 0.75 + 0.25 + 0.75 + 0.033 hours = ~2.88 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-auth | 4 | ~170 min | ~43 min |
| 02-training-engine | 3 | ~8 min | ~2.7 min |

**Recent Trend:**
- Last 5 plans: 15 min, 45 min, ~4 min, ~2 min, ~2 min
- Trend: accelerating (pure implementation tasks, minimal research)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [01-01]: PyJWT over python-jose (abandoned); pwdlib[argon2] over passlib (deprecated) -- FastAPI official recs
- [01-01]: DB port 5433 to avoid conflict with existing local PostgreSQL on 5432
- [01-01]: jti on refresh tokens from day 1 to enable Redis revocation in Phase 2 without token schema change
- [01-01]: Redis refresh token revocation deferred to Phase 2 -- Phase 1 known limitation documented
- [01-02]: GDPR consent records anonymized on deletion (user_id=NULL) -- legal proof must survive account deletion
- [01-02]: FTP history as append-only JSON list on AthleteProfile -- sufficient for Phase 1, no separate table needed
- [01-02]: goals as JSON dict on AthleteProfile -- flexible, avoids migrations for goal type changes
- [01-02]: daily_metrics UNIQUE(user_id, date) dropped -- TimescaleDB requires partition col in all unique constraints; app-layer enforcement in Phase 3
- [01-02]: TimescaleDB hypertables (activities 7-day, daily_metrics 30-day) pre-created in Phase 1 -- avoids Phase 3 migration downtime
- [01-03]: Access token stored in JS module variable (never localStorage) -- XSS-safe per security pattern
- [01-03]: Axios 401 interceptor queues concurrent requests during refresh to prevent duplicate refresh calls
- [01-03]: Login uses URLSearchParams (form data) not JSON -- OAuth2PasswordRequestForm requires username/password fields
- [01-03]: RegisterPage redirects to /dashboard until Plan 04 creates /profile-setup route
- [01-04]: CONSENT_TYPES as const array in types/consent.ts -- single source of truth for text sent to backend (GDPR Article 9 granularity)
- [01-04]: Consent version pinned to "1.0" -- updating version will trigger re-consent flow for returning users
- [01-04]: useOnboarding hook (not inline in ProtectedRoute) -- dedicated hook for testability, checks /consent + /athletes/me on every protected entry
- [Roadmap]: Build training engine before Garmin integration (pure math, testable with synthetic data)
- [Roadmap]: Use unofficial python-garminconnect behind abstraction layer, swap for official API later
- [Roadmap]: Safety guardrails ship with AI coaching core (Phase 5), not deferred
- [Roadmap]: Nutrition designed as enhancement (Phase 8), not dependency -- manual entry as Yazio fallback
- [Roadmap]: Social/gamification last (Phase 9) -- needs users first, highest harm risk if rushed
- [02-01]: Lazy numpy import inside calculate_np() body — keeps module importable without numpy in all contexts
- [02-01]: NP test requires 60s power blocks (not 1s alternation) — 30s rolling window smooths sub-30s variation to mean
- [02-01]: Cycling TSS formula gives 61.73 for 220W/280FTP (not 61.2 as commonly cited)
- [02-02]: Activity ORM maps to pre-existing hypertable DDL, no new migration; env.py include_object skips activities + daily_metrics
- [02-02]: TSS=None when athlete profile lacks thresholds — activity created regardless, TSS populated when thresholds are set
- [02-02]: average_power used as NP fallback for cycling TSS (overestimates for variable-intensity rides, documented)
- [02-02]: Gym hrTSS defaults sex="male" — TODO add sex field to AthleteProfile in future plan
- [02-03]: Python gap-fill for rest days instead of time_bucket_gapfill — gapfill + multi-sport GROUP BY unreliable; Python iteration simpler and correct
- [02-03]: Total PMC from summed daily TSS (single EWMA), not sum of per-sport CTLs — summing CTLs violates EWMA model
- [02-03]: FTP endpoint separate from athlete PATCH — adds source field; legacy PATCH entries lack source, handled via .get("source","manual") fallback
- [02-03]: PUT /athletes/me/ftp always appends to history — each call is a deliberate measurement event; dedup is caller responsibility

### Pending Todos

- Legal review needed: consent record retention period after account deletion (before public launch)
- Production deployment: use non-superuser PostgreSQL role for full RLS enforcement (coach user is superuser in dev)
- Consider adding source field to athlete PATCH route FTP history append — currently FTP endpoint has source but PATCH route doesn't (mixed history format)

### Blockers/Concerns

- Garmin Connect Developer Program requires business entity approval -- apply immediately to unblock Phase 3
- Yazio has no official API -- run spike to validate before Phase 8 commits to integration
- [RESOLVED 01-01] TimescaleDB hypertable decision -- decided: activities/daily_metrics will be hypertables from day 1 (done in 01-02 migration)
- [RESOLVED 01-02] AthleteProfile + ConsentRecord relationships -- activated in Phase 2 as planned

## Session Continuity

Last session: 2026-04-16T15:33:45Z
Stopped at: Completed 02-03-PLAN.md (PMC API, training zones, FTP history)
Resume file: None
