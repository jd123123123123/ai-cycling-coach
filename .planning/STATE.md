# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** All your body data combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.
**Current focus:** Phase 1 - Foundation + Auth (complete)

## Current Position

Phase: 1 of 9 (Foundation + Auth)
Plan: All complete (01-01, 01-02, 01-03)
Status: Phase 1 complete -- ready to move to Phase 2
Last activity: 2026-04-16 -- Completed 01-02-PLAN.md (Athlete profile + GDPR consent + RLS)

Progress: [███.......] ~30%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 42 min
- Total execution time: 1.08 + 0.75 + 0.25 hours = ~2.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-auth | 3 | ~125 min | ~42 min |

**Recent Trend:**
- Last 5 plans: 65 min, 15 min, 45 min
- Trend: stable

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
- [Roadmap]: Build training engine before Garmin integration (pure math, testable with synthetic data)
- [Roadmap]: Use unofficial python-garminconnect behind abstraction layer, swap for official API later
- [Roadmap]: Safety guardrails ship with AI coaching core (Phase 5), not deferred
- [Roadmap]: Nutrition designed as enhancement (Phase 8), not dependency -- manual entry as Yazio fallback
- [Roadmap]: Social/gamification last (Phase 9) -- needs users first, highest harm risk if rushed

### Pending Todos

- Legal review needed: consent record retention period after account deletion (before public launch)
- Production deployment: use non-superuser PostgreSQL role for full RLS enforcement (coach user is superuser in dev)

### Blockers/Concerns

- Garmin Connect Developer Program requires business entity approval -- apply immediately to unblock Phase 3
- Yazio has no official API -- run spike to validate before Phase 8 commits to integration
- [RESOLVED 01-01] TimescaleDB hypertable decision -- decided: activities/daily_metrics will be hypertables from day 1 (done in 01-02 migration)
- [RESOLVED 01-02] AthleteProfile + ConsentRecord relationships -- activated in Phase 2 as planned

## Session Continuity

Last session: 2026-04-16T13:30:05Z
Stopped at: Completed 01-02-PLAN.md (Athlete profile + GDPR consent + RLS)
Resume file: None
