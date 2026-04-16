---
phase: 01-foundation-auth
plan: 04
subsystem: ui
tags: [react, typescript, tailwind, gdpr, consent, onboarding, athlete-profile]

# Dependency graph
requires:
  - phase: 01-02
    provides: Backend GDPR consent endpoints (POST /consent, GET /consent, POST /consent/{type}/withdraw) and athlete profile CRUD (GET/PUT /athletes/me, GET/PUT /athletes/me/goals)
  - phase: 01-03
    provides: React frontend scaffold with Axios client, AuthContext, ProtectedRoute, and routing infrastructure
provides:
  - ConsentPage with 3 granular GDPR consent types (health_data required; coaching_ai and data_analytics optional)
  - ProfileSetupPage with FTP, weight, HR zones, weekly hours, primary sport, and training goals form
  - useOnboarding hook checking consent + profile status to drive post-login routing
  - Complete onboarding routing: register -> /consent -> /profile-setup -> /dashboard
  - Types: ConsentRecord, ConsentRequest, CONSENT_TYPES constant, AthleteProfile, TrainingGoals, AthleteProfileUpdate
  - API modules: consent.ts (get/grant/withdraw) and athletes.ts (getProfile/updateProfile/getGoals/updateGoals)
affects: [02-athlete-profile, 05-training-engine-ui, 06-garmin-integration-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useOnboarding hook checks health_data consent then profile status to determine post-auth redirect target
    - Required consent (health_data) blocks form submission; optional consents (coaching_ai, data_analytics) can be skipped
    - Consent sent with exact displayed text and version "1.0" per GDPR Article 9 requirements
    - Profile and goals saved in sequence (profile first, then goals) before navigating to dashboard

key-files:
  created:
    - frontend/src/types/consent.ts
    - frontend/src/types/athlete.ts
    - frontend/src/api/consent.ts
    - frontend/src/api/athletes.ts
    - frontend/src/pages/ConsentPage.tsx
    - frontend/src/pages/ProfileSetupPage.tsx
    - frontend/src/hooks/useOnboarding.ts
  modified:
    - frontend/src/App.tsx
    - frontend/src/components/ProtectedRoute.tsx

key-decisions:
  - "CONSENT_TYPES defined as const array in types/consent.ts — single source of truth for consent text sent to backend and displayed in UI"
  - "useOnboarding hook placed outside ProtectedRoute — checks /consent and /athletes/me on every auth'd entry so returning users skip re-onboarding"
  - "Profile setup 'Skip for now' navigates to /dashboard with no API call — fields are all optional per backend schema"
  - "Consent version pinned to '1.0' in the constant — version bump requires updating CONSENT_TYPES to trigger re-consent flow"

patterns-established:
  - "Pattern: useOnboarding(user) hook returns { redirectTo } — consumers redirect based on value, hook stays pure"
  - "Pattern: Required consent blocks submit button disabled state, optional consent defaults unchecked"
  - "Pattern: API modules (consent.ts, athletes.ts) import from src/api/client.ts — consistent with auth.ts pattern from Plan 03"

# Metrics
duration: ~45min
completed: 2026-04-16
---

# Phase 1 Plan 4: GDPR Consent Flow and Athlete Profile Setup Summary

**Granular GDPR consent page (health_data required, coaching_ai + data_analytics optional), athlete profile/goals form, and useOnboarding hook wiring register -> /consent -> /profile-setup -> /dashboard end-to-end**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-16T~14:00Z
- **Completed:** 2026-04-16T~14:45Z
- **Tasks:** 1 (+ 1 checkpoint verified)
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Full GDPR consent flow: 3 separate consent type cards (individual checkboxes, full description text), health_data blocks progression until granted
- Athlete profile form with FTP, weight, max/resting HR, weekly hours, primary sport (cycling/running/triathlon dropdown), and training goals section
- useOnboarding hook automatically redirects post-login users to /consent or /profile-setup if onboarding incomplete, to /dashboard otherwise
- End-to-end flow verified by user: register -> consent -> profile setup -> dashboard; session persists; returning user goes directly to dashboard

## Task Commits

Each task was committed atomically:

1. **Task 1: GDPR consent flow, athlete profile setup, and onboarding routing** - `eb964f2` (feat)

**Plan metadata:** (to be committed with this summary)

## Files Created/Modified
- `frontend/src/types/consent.ts` - ConsentRecord, ConsentRequest interfaces and CONSENT_TYPES const array with 3 GDPR consent types
- `frontend/src/types/athlete.ts` - AthleteProfile, TrainingGoals, AthleteProfileUpdate interfaces
- `frontend/src/api/consent.ts` - getConsents, grantConsent, withdrawConsent API functions
- `frontend/src/api/athletes.ts` - getProfile, updateProfile, getGoals, updateGoals API functions
- `frontend/src/pages/ConsentPage.tsx` - GDPR consent UI: cards per type, required/optional distinction, submits to POST /consent
- `frontend/src/pages/ProfileSetupPage.tsx` - Two-section form (profile + goals), skip button, saves then navigates to /dashboard
- `frontend/src/hooks/useOnboarding.ts` - Checks health_data consent + profile existence to determine redirect target
- `frontend/src/App.tsx` - Added /consent and /profile-setup routes; register now navigates to /consent
- `frontend/src/components/ProtectedRoute.tsx` - Integrated useOnboarding hook for post-auth routing logic

## Decisions Made
- **CONSENT_TYPES as const array:** Single source of truth for consent text — the exact displayed text is sent to the backend per GDPR Article 9 granularity requirements. Version "1.0" is pinned; updating version will trigger re-consent.
- **useOnboarding outside ProtectedRoute:** The hook runs on every authenticated entry to protected routes, so returning users who already consented and set up profile go directly to /dashboard without re-checking each time.
- **Skip for now button:** Sends no API call — all profile fields are optional per the backend schema from Plan 02. Users can complete profile later from dashboard settings.
- **Profile then goals in sequence:** updateProfile() called first, then updateGoals() — consistent with backend's separate PUT /athletes/me and PUT /athletes/me/goals endpoints.

## Deviations from Plan

None - plan executed exactly as written. The useOnboarding hook was mentioned as "can live in a hook or in ProtectedRoute" — placed in a dedicated hook file for testability, which aligns with the plan's intent.

## Issues Encountered
None - build compiled cleanly. All TypeScript types resolved on first attempt. End-to-end flow verified by user without issues.

## User Setup Required
None - flows from existing backend (port 8000) and frontend (port 5173) setup.

## Next Phase Readiness
- Phase 1 is complete: full user journey works end-to-end (register, consent, profile, dashboard, login persistence, logout)
- All 5 frontend pages exist: Login, Register, Consent, ProfileSetup, Dashboard
- `frontend/src/api/athletes.ts` and `frontend/src/api/consent.ts` are ready for Phase 2+ features to extend
- `useOnboarding` hook can be extended with additional onboarding steps (e.g., Garmin connect) in Phase 3
- Remaining concern: legal review needed on consent record retention period after account deletion (before public launch)
- Phase 2 (Training Engine) can begin immediately

---
*Phase: 01-foundation-auth*
*Completed: 2026-04-16*
