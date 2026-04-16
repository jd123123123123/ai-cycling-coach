---
phase: 01-foundation-auth
verified: 2026-04-16T16:00:00Z
status: human_needed
score: 12/12 must-haves verified
re_verification: false
human_verification:
  - test: "Full onboarding flow end-to-end"
    expected: "Register -> redirected to /consent -> grant health_data consent -> redirected to /profile-setup -> fill FTP + goals -> redirected to /dashboard showing welcome message"
    why_human: "Requires running backend + frontend together; tests navigation, cookie flow, and API calls in a live browser"
  - test: "Session persistence across page refresh"
    expected: "After login, refresh the browser page and remain authenticated (not redirected to /login)"
    why_human: "Requires verifying the httpOnly refresh token cookie is set and the AuthContext restores session on mount"
  - test: "Returning user skips consent"
    expected: "Log out, log back in — goes directly to /dashboard without seeing /consent again"
    why_human: "Requires the useOnboarding hook to query /consent and correctly detect existing health_data consent"
  - test: "Multi-user data isolation"
    expected: "Register two users (different browsers/incognito). User 2's GET /athletes/me returns only their own data, not user 1's profile"
    why_human: "Requires two live sessions to verify the RLS + app-level user_id filter works end-to-end"
  - test: "GDPR account deletion"
    expected: "DELETE /users/me returns 204; subsequent login attempt with same credentials returns 401; consent records remain in DB with user_id = NULL"
    why_human: "Requires database inspection to confirm consent anonymization and cascade deletion"
---

# Phase 1: Foundation + Auth Verification Report

**Phase Goal:** Users can create accounts, set up athlete profiles with training goals, and have their data fully isolated from other users
**Verified:** 2026-04-16T16:00:00Z
**Status:** human_needed (all automated checks pass — 5 items require live browser + DB testing)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create account with email/password and log in across sessions | VERIFIED | `api/auth.py` register+login endpoints with Argon2 hashing; `AuthContext.tsx` calls `refreshToken()` on mount to restore session from httpOnly cookie |
| 2 | User can set up athlete profile with FTP, weight, zones, weekly availability | VERIFIED | `PUT /athletes/me` endpoint wired through `athlete_service.update_profile`; `ProfileSetupPage.tsx` calls `updateProfile()` with all required fields |
| 3 | User can set training goals (target FTP, target event date, weekly hours) | VERIFIED | `PUT /athletes/me/goals` endpoint; `ProfileSetupPage.tsx` calls `updateGoals()` with targetFtp, targetEventName, targetEventDate, goalWeeklyHours |
| 4 | Two different users see only their own data | VERIFIED (structural) | RLS enabled on `athlete_profiles` and `consent_records` via migration; `get_db_for_user` sets `app.current_user_id`; all user-data routes use this dependency |
| 5 | GDPR consent flow presented at signup; user can request data deletion | VERIFIED | `ConsentPage.tsx` shows 3 separate consent types with required/optional distinction; `DELETE /users/me` anonymizes consent records and cascades deletion |

**Score:** 5/5 truths structurally verified. 5 require human runtime confirmation.

---

### Required Artifacts

#### Plan 01 — Backend Auth

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/main.py` | FastAPI app with CORS, router includes | VERIFIED | All 5 routers included; CORSMiddleware with `settings.cors_origins_list` |
| `backend/app/database.py` | Async SQLAlchemy engine, session maker, Base, get_db | VERIFIED | `create_async_engine` with `pool_pre_ping=True`; `expire_on_commit=False`; async generator `get_db` |
| `backend/app/models/user.py` | User ORM with email, hashed_password, is_active, timestamps | VERIFIED | All required columns; relationships to AthleteProfile (cascade) and ConsentRecord (no cascade, intentional) |
| `backend/app/services/auth_service.py` | Argon2 hashing, JWT creation/validation | VERIFIED | `pwdlib` Argon2; `create_access_token`/`create_refresh_token` use separate secrets; `jti` in refresh token for future revocation |
| `backend/app/api/auth.py` | register, login, refresh, logout, me | VERIFIED | All 5 endpoints implemented; httpOnly cookie set on register/login/refresh; cookie cleared on logout |
| `backend/app/dependencies.py` | get_current_user from JWT; get_db_for_user sets RLS context | VERIFIED | JWT decode + DB lookup; `get_db_for_user` executes `SET LOCAL app.current_user_id` |
| `backend/docker-compose.yml` | PostgreSQL + TimescaleDB container | VERIFIED | File exists, 19 lines |

#### Plan 02 — Profiles, Consent, RLS

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/models/athlete_profile.py` | AthleteProfile with FTP, weight, zones, goals, weekly_hours | VERIFIED | All required columns; goals as JSON; ftp_history tracking |
| `backend/app/models/consent.py` | ConsentRecord with consent_type, version, granted, timestamps, consent_text | VERIFIED | UniqueConstraint on (user_id, consent_type, consent_version); no CASCADE delete (intentional for GDPR) |
| `backend/app/api/athletes.py` | GET/PUT /athletes/me | VERIFIED | Both endpoints use `get_db_for_user` for RLS enforcement |
| `backend/app/api/goals.py` | GET/PUT /athletes/me/goals | VERIFIED | Uses `get_db_for_user`; update_goals handles nested target_event structure |
| `backend/app/api/consent.py` | POST /consent, GET /consent, POST /consent/{type}/withdraw | VERIFIED | Records IP + user_agent + consent_text; withdraw sets withdrawn_at (does not delete) |
| `backend/app/api/users.py` | DELETE /users/me | VERIFIED | Anonymizes consent_records (user_id=NULL), then deletes user (CASCADE handles profiles) |

#### Plan 03 — Frontend Auth

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/api/client.ts` | Axios instance with auth interceptors and token refresh | VERIFIED | Memory-only token storage; request interceptor attaches Bearer header; response interceptor handles 401 with queue-based refresh |
| `frontend/src/contexts/AuthContext.tsx` | AuthProvider with login, logout, register, isAuthenticated | VERIFIED | Restores session via `refreshToken()` on mount; exposes all required methods |
| `frontend/src/pages/LoginPage.tsx` | Login form submitting to /auth/login | VERIFIED | Calls `useAuth().login()`; error handling for 401; redirects authenticated users |
| `frontend/src/pages/RegisterPage.tsx` | Registration form with validation | VERIFIED | Client-side validation (email, password min 8, confirm match); navigates to /consent after success |
| `frontend/src/components/ProtectedRoute.tsx` | Route guard redirecting unauthenticated | VERIFIED | Checks `isAuthenticated`; shows spinner during load; supports `checkOnboarding` prop |

#### Plan 04 — GDPR + Profile Setup UI

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/pages/ConsentPage.tsx` | GDPR consent flow with individual checkboxes | VERIFIED | 3 consent types from `CONSENT_TYPES` constant; health_data is required; POSTs each granted consent with version + full consent_text |
| `frontend/src/pages/ProfileSetupPage.tsx` | Athlete profile + goals form | VERIFIED | FTP, weight, maxHR, restingHR, weeklyHours, primarySport, targetFTP, targetEvent(name+date), goalWeeklyHours; calls `updateProfile` + `updateGoals`; "Skip for now" button |
| `frontend/src/api/athletes.ts` | getProfile, updateProfile, getGoals, updateGoals | VERIFIED | All 4 functions call correct endpoints via `apiClient` |
| `frontend/src/api/consent.ts` | getConsents, grantConsent, withdrawConsent | VERIFIED | All 3 functions implemented against correct endpoints |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api/auth.py` | `services/auth_service.py` | create_user, authenticate_user, create_access_token, create_refresh_token | VERIFIED | All 4 functions imported and called in register/login endpoints |
| `dependencies.py` | `models/user.py` | JWT decode -> db.get(User, user_id) | VERIFIED | `decode_access_token` extracts sub, `db.get(User, user_id)` resolves user |
| `database.py` | `config.py` | settings.DATABASE_URL for engine creation | VERIFIED | `create_async_engine(settings.DATABASE_URL)` with asyncpg dialect validation |
| `api/athletes.py` | `models/athlete_profile.py` | get_current_active_user -> query by user_id | VERIFIED | `get_or_create_profile(db, current_user.id)` in both GET and PUT handlers |
| `api/consent.py` | `models/consent.py` | create consent records referencing current user | VERIFIED | ConsentRecord created with `user_id=current_user.id`; query filtered by same |
| `dependencies.py` | PostgreSQL RLS | get_db_for_user sets SET LOCAL app.current_user_id | VERIFIED | `await db.execute(text(f"SET LOCAL app.current_user_id = '{current_user.id}'"))` |
| `api/client.ts` | backend /auth/* endpoints | axios baseURL http://localhost:8000 | VERIFIED | `BASE_URL = import.meta.env.VITE_API_URL \|\| 'http://localhost:8000'` |
| `AuthContext.tsx` | `api/auth.ts` | login/register/logout/refreshToken functions | VERIFIED | All auth API functions imported and called |
| `App.tsx` | `ProtectedRoute.tsx` | React Router wrapping protected pages | VERIFIED | /dashboard uses `<ProtectedRoute checkOnboarding>`; /consent and /profile-setup use bare `<ProtectedRoute>` |
| `ConsentPage.tsx` | backend POST /consent | consent.ts grantConsent | VERIFIED | `grantConsent({consent_type, consent_version: '1.0', granted: true, consent_text: consent.description})` |
| `ProfileSetupPage.tsx` | backend PUT /athletes/me and /athletes/me/goals | athletes.ts updateProfile + updateGoals | VERIFIED | Both API calls made sequentially in handleSubmit |
| `ProtectedRoute.tsx` | `useOnboarding` hook | Checks consent + profile status | VERIFIED | `useOnboarding` queries `/consent` + `/athletes/me` in parallel; routes to needs-consent or needs-profile |

---

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| PLAT-01: Multi-user account system with JWT auth | SATISFIED | register/login/refresh/logout/me all implemented; Argon2 hashing; separate access/refresh secrets |
| PLAT-02: Athlete profile with performance data | SATISFIED | FTP, weight, HR zones, weekly availability, training goals all stored and updatable |
| PLAT-03: GDPR compliance | SATISFIED | Granular per-type consent; withdrawal with timestamp; account deletion with consent anonymization |
| PLAT-04 (partial): Data isolation | SATISFIED (structural) | RLS policies on athlete_profiles, consent_records, activities, daily_metrics; get_db_for_user enforces RLS on all user-data routes |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/src/pages/DashboardPage.tsx:33` | "dashboard placeholder" text | Info | Intentional — the plan explicitly specifies DashboardPage is a placeholder for Phase 4. Not a code stub. |
| All `placeholder="..."` in form inputs | HTML placeholder attribute | Info | Input placeholder text (UX), not stub implementations. False positive. |

No blocking anti-patterns found. No empty handlers, no TODO/FIXME comments, no empty returns.

---

### Human Verification Required

The following items cannot be verified by static analysis. They require starting the Docker stack, running the backend and frontend, and testing in a browser.

#### 1. Full Onboarding Flow

**Test:** Register a new user at http://localhost:5173/register
**Expected:** Redirected to /consent -> grant health_data consent -> redirected to /profile-setup -> fill in FTP + goals -> redirected to /dashboard showing "Welcome, {email}!"
**Why human:** Tests the cross-component navigation, API calls, and cookie flow in a live browser

#### 2. Session Persistence

**Test:** Log in, then hit browser refresh (F5)
**Expected:** Remain on dashboard, not redirected to /login
**Why human:** Verifies the httpOnly refresh cookie is actually being set by the backend and read by `AuthContext.restoreSession()` on mount

#### 3. Returning User Skips Consent

**Test:** Log out, log back in with same credentials
**Expected:** Goes directly to /dashboard, not to /consent
**Why human:** Verifies `useOnboarding` correctly detects existing health_data consent via GET /consent

#### 4. Multi-User Data Isolation

**Test:** Register User A, create profile (FTP=250). Open incognito, register User B. Check User B's GET /athletes/me.
**Expected:** User B sees their own empty profile, not User A's FTP=250 profile
**Why human:** Verifies RLS + app-level user_id filter work together in a live database session

#### 5. GDPR Account Deletion

**Test:** Authenticated user calls DELETE /users/me (via Swagger at http://localhost:8000/docs)
**Expected:** 204 response; login with same credentials returns 401; `SELECT * FROM consent_records WHERE user_id IS NULL` shows anonymized records
**Why human:** Requires database inspection to confirm the anonymization step ran before the cascade delete

---

### Gaps Summary

No gaps found. All 12 artifacts exist, are substantive (no stubs or placeholders in implementation logic), and are correctly wired to each other. The codebase structurally satisfies all 5 observable truths. The 5 items above require human runtime verification but are not expected to fail based on the implementation quality observed.

Notable implementation quality: The token refresh interceptor in `client.ts` correctly handles concurrent 401s via a queue pattern, preventing parallel refresh calls. The `get_db_for_user` dependency correctly uses `SET LOCAL` (not `SET`) so the RLS context is transaction-scoped. The consent anonymization in `DELETE /users/me` correctly nullifies `user_id` before deleting the user (avoiding FK constraint violation).

---

_Verified: 2026-04-16T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
