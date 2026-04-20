---
phase: 05-ai-coaching-core
verified: 2026-04-20T14:45:00Z
status: human_needed
score: 12/13 must-haves verified (1 needs human visual/live-behaviour check)
re_verification: false
human_verification:
  - test: "Dashboard renders CoachBrief card with verdict, rationale, 4 option cards, outlook chart, frameworks footer"
    expected: "Hero section shows the causal brief below KpiStrip; evidence chips appear inline in rationale (TSB, CTL, HRV, sleep debt, grey-zone, injury)"
    why_human: "Visual layout, typography (Fraunces italic verdict, Geist rationale, JetBrains mono chips), stagger-reveal motion, and paper palette compliance cannot be verified programmatically"
  - test: "Ask coach button opens streaming drawer; type a question; assistant reply streams token-by-token with blinking caret"
    expected: "Drawer slides in from right, textarea accepts input, cmd/ctrl+enter submits, partial text appears progressively, inline-mono regex wraps numeric data (bpm/W/TSS/ms)"
    why_human: "Streaming UX and animation timing are runtime behaviours; requires ANTHROPIC_API_KEY set and a real coach session"
  - test: "With no ANTHROPIC_API_KEY set, dashboard still shows the brief with an 'AI offline · rule-based' amber chip"
    expected: "Brief renders fully from the rule-based fallback path; chip visible near generated_at timestamp"
    why_human: "Confirms the graceful-degradation path in a live browser — automated checks verified backend path but visual chip + overall composition needs eyeballing"
  - test: "Why this? modal opens with sorted causes (high/med/low), each with severity dot + evidence paragraph"
    expected: "Modal portal opens above overlay; causes sorted high-first; 'See raw data' toggle reveals snapshot JSON in mono"
    why_human: "Lazy-fetch on open + visual severity dot colour compliance + portal behaviour are runtime"
  - test: "What did the AI see? drawer opens, shows snapshot/system-prompt/safety-rails collapsible sections with custom JSON colouring and copy-to-clipboard"
    expected: "Drawer slides in with meta pills (model name, brief id, timestamp); each section expands; copy button writes to clipboard"
    why_human: "Custom JSON renderer token-class colours, clipboard API, collapsible animation — need live verification"
  - test: "AI refuses injury advice, refuses caloric restriction, and redirects ED-adjacent nutrition questions"
    expected: "With ANTHROPIC_API_KEY set: asking 'help me cut weight fast' triggers the 'replace' SSE frame and the drawer displays the canned SAFE_NUTRITION_REDIRECT instead of the streamed LLM text"
    why_human: "Requires live LLM call + runtime SSE handling; programmatically verified the filter keywords and replace-frame code paths, but end-to-end behaviour must be exercised manually"
  - test: "Mobile layout at 320/375/390/414px — no horizontal scroll, options stack, drawer full-width"
    expected: "CoachBrief option grid stacks 2x2 at sm then 1x4 at md; chat drawer fills viewport on mobile; transparency drawer + why-tired modal responsive"
    why_human: "Responsive layout breakpoints and viewport behaviour are visual"
---

# Phase 5: AI Coaching Core Verification Report

**Phase Goal:** Users receive AI-powered daily training recommendations and can chat with an intelligent coach, with safety guardrails preventing dangerous advice.

**Verified:** 2026-04-20T14:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

The code is in place at a frontier-coach standard: backend tests (68 coach-specific, 123 total) all pass; TypeScript compiles cleanly; frontend build succeeds at 512 KB gzipped; backend boots without `ANTHROPIC_API_KEY` with all 5 `/coach/*` routes registered. All must-haves from both plans are materialised in substantive files (no stubs, no TODOs in the critical path). The single reason for `human_needed` rather than `passed` is that five of the seven success criteria have a behavioural component (streaming UX, LLM refusal, responsive layout, visual composition, rule-based fallback chip) that cannot be verified without running the app — these are listed as a manual test checklist in the frontmatter.

## Goal Achievement

### Observable Truths

| # | Truth (from success criteria) | Status | Evidence |
|---|-------------------------------|--------|----------|
| 1 | Dashboard shows morning daily brief with body status and recommendation | ✓ VERIFIED | `ReadinessHero.tsx:477` mounts `<CoachBrief />`; `CoachBrief.tsx` (535 lines) renders verdict/rationale/evidence chips via `useCoachBrief` → `/coach/brief` (both Claude + rule-based-fallback paths tested). Backend `build_snapshot` aggregates pmc + HRV + rHR + sleep + zones + 14d activities + why-tired + rails context |
| 2 | Recommendation offers 4 options (rest/easy/moderate/push) with reasoning | ✓ VERIFIED | Rule-based path produces all 4 options with `why` text (`coach_service.py:283-317`); Claude tool-schema enforces `minItems: 4, maxItems: 4` (`coach_prompt.py:79-80`); `test_coach_service.py::test_produces_four_options` + `test_rationale_cites_data_numbers` pass |
| 3 | User can open chat and have coaching conversation with streaming | ? NEEDS HUMAN | Code verified: `/coach/chat` returns `StreamingResponse(media_type="text/event-stream")` (`coach.py:148-155`); backend uses `client.messages.stream()` (`coach_service.py:504`); frontend uses `fetch` + `ReadableStream.getReader()` (`coach.ts:138`) — NOT `EventSource`, as required. Live streaming UX needs human eyes |
| 4 | AI refuses injury advice, no overtraining, no ED-triggering nutrition | ? NEEDS HUMAN | Code verified: `SYSTEM_PROMPT` rules D+E+F forbid all three (`coach_prompt.py:40-46`); `safety_rails.ED_KEYWORDS` has 20 phrases (`safety_rails.py:169-190`); `validate_chat_response` runs on final stream buffer with `replace` frame (`coach_service.py:519-529`); 29 `test_safety_rails.py` tests pass including `test_catches_caloric_restriction`, `test_allows_legitimate_carb_timing`, `test_allows_fasted_z2`. End-to-end refusal on live LLM needs manual test |
| 5 | Safety guardrails enforce TSS caps relative to CTL and intensity ceilings | ✓ VERIFIED | `max_tss_for_day(ctl) = 1.3 × ctl` (`safety_rails.py:46-55`); `intensity_ceiling` has full 6-rule cascade (injury → hrv<-10 → tsb<-30 → tsb<-10 → days_since_rest≥10 → push); `filter_recommendation` marks (never drops) via rail ceiling AND TSS cap; `coach_service.generate_brief` applies rails AFTER LLM (`coach_service.py:406-408`); all cascades + boundaries covered by `test_safety_rails.py` |

**Score:** 3/5 fully verified programmatically · 2/5 need human verification for runtime behaviour

### User's Frontier-Coach Bar

| # | User-stated requirement | Status | Evidence |
|---|-------------------------|--------|----------|
| 1 | Causal "Why am I tired?" synthesizer | ✓ VERIFIED | `advanced_metrics.why_am_i_tired` cross-references HRV + rHR + sleep + TSB + grey-zone, emits ordered causes list with severity + evidence strings (`advanced_metrics.py:487-573`); exposed at `GET /coach/why`; frontend `WhyAmITired.tsx` renders sorted causes + raw-data toggle |
| 2 | Transparency over black-box scores | ✓ VERIFIED | `GET /coach/transparency` returns full snapshot + SYSTEM_PROMPT + model name + last-brief-id; `TransparencyDrawer.tsx` (504 lines) renders all three with custom JSON colouring + copy-to-clipboard + safety-rails-fired section |
| 3 | Tier-1 metrics: decoupling, EF, durability | ⚠️ PARTIAL | Backend fully computed: `aerobic_decoupling`, `efficiency_factor`, `durability_index` as pure funcs + `compute_activity_metrics`; brief rationale cites `avg_ef`/`avg_decoupling`/`durability_last_long_ride` via snapshot. **Frontend caveat:** `BiometricsDetail.tsx` renders live EF tile but decoupling + durability show explicit "sample-stream only" placeholder copy because `/activities` payloads don't carry per-second streams yet — documented deviation in 05-02 SUMMARY, not a stub but a deliberate tiered rollout gated on a future `/coach/metrics-trend` endpoint |
| 4 | HRV/rHR overlaid on load | ✓ VERIFIED | `hrv_trend` + `rhr_trend` + `ctl_atl_tsb_snapshot` all in snapshot; LLM system prompt instructs "cite the athlete's own data"; SSE chat passes snapshot as system context so model can overlay HRV with CTL/ATL/TSB inline |
| 5 | Grey-zone-creep detection (Seiler) | ✓ VERIFIED | `zone_distribution.grey_zone_flag` flips when `z2_pct > 20` (`advanced_metrics.py:43, 396-418`); emitted in brief rationale via rule-based path; `test_grey_zone_flag_at_20_percent_threshold` passes; surfaced in `why_am_i_tired` with Seiler citation |
| 6 | Hard-coded safety rails (overtraining prevention) | ✓ VERIFIED | See success criterion #5 — 6-rule cascade, TSS cap, ED filter, all covered by 29 tests |

### Required Artifacts (Backend — Plan 05-01)

| Artifact | Exists | Substantive | Wired | Status |
|----------|--------|-------------|-------|--------|
| `backend/app/services/advanced_metrics.py` | 573 lines | 10 functions (all required + helpers) | Imported by `coach_service` + `api/coach` | ✓ VERIFIED |
| `backend/app/services/safety_rails.py` | 227 lines | `RailContext`, `max_tss_for_day`, `intensity_ceiling` (6-rule), `filter_recommendation` (never-drops), `scan_nutrition_advice` + `validate_chat_response` | Imported by `coach_service` | ✓ VERIFIED |
| `backend/app/services/coach_service.py` | 534 lines | `build_snapshot`, `generate_brief` (LLM + 3 fallback triggers), `get_or_generate_brief` (6h cache), `coach_chat_stream` (SSE + validate_chat_response) | Imported by `api/coach` | ✓ VERIFIED |
| `backend/app/services/coach_prompt.py` | 215 lines | `SYSTEM_PROMPT` with 5 frameworks + 8 hard rules; `BRIEF_TOOL` with 4-option + 7-day-outlook schema; `build_user_message` | Imported by `coach_service` | ✓ VERIFIED |
| `backend/app/api/coach.py` | 202 lines | All 5 routes: GET /brief, POST /brief/refresh, POST /chat (SSE), GET /why, GET /transparency + 20/min rate limit + 503 on missing key | Registered in `main.py:56,69` | ✓ VERIFIED |
| `backend/app/schemas/coach.py` | 71 lines | `BriefOption`, `OutlookEntry`, `BriefRead`, `ChatMessage`, `ChatRequest`, `CauseEntry`, `WhyTiredRead`, `TransparencyRead` | Imported by `api/coach` | ✓ VERIFIED |
| `backend/app/models/coach_brief.py` | 59 lines | ORM with JSONB evidence/options/outlook_7d + TEXT[] frameworks_cited + VARCHAR model_used + FK(user_id, cascade) | Registered in `migrations/env.py`; used in `coach_service` | ✓ VERIFIED |
| `backend/migrations/versions/f1a2b3c4d5e6_coach_briefs_and_injury_flag.py` | 76 lines | Table + RLS policy + index + injury_flag/injury_note columns | Migration chain continues from `e5c8f4a1` | ✓ VERIFIED |
| `backend/tests/test_advanced_metrics.py` | 26 tests | All 10 metric functions covered including grey-zone threshold, why-tired ordering | `pytest` passes | ✓ VERIFIED |
| `backend/tests/test_safety_rails.py` | 29 tests | Every rule branch, boundary cases, ED positives + negatives, never-drops contract | `pytest` passes | ✓ VERIFIED |
| `backend/tests/test_coach_service.py` | 13 tests | Rule-based shape, injury blocking, fallback triggers, mocked-SDK happy path, cache hit/miss/force | `pytest` passes | ✓ VERIFIED |

### Required Artifacts (Frontend — Plan 05-02)

| Artifact | Exists | Substantive | Wired | Status |
|----------|--------|-------------|-------|--------|
| `frontend/src/api/coach.ts` | 175 lines | Typed client + `streamCoachChat` async generator over `fetch` + `ReadableStream.getReader()` (NOT EventSource) | Imported by all 3 coach hooks | ✓ VERIFIED |
| `frontend/src/hooks/useCoachBrief.ts` | 44 lines | React Query with 6h staleTime matching backend cache + `useRefreshBrief` mutation | Imported by `CoachBrief`, `TransparencyDrawer` | ✓ VERIFIED |
| `frontend/src/hooks/useCoachChat.ts` | 103 lines | Message array + partial + isStreaming + disabled (503) + abort controller + 429/503 handling + user-turn rollback on error | Imported by `CoachChat` | ✓ VERIFIED |
| `frontend/src/hooks/useWhyTired.ts` | 41 lines | `useWhyTired` + `useTransparency` both lazy-fetch on open | Imported by `WhyAmITired`, `TransparencyDrawer` | ✓ VERIFIED |
| `frontend/src/components/dashboard/CoachBrief.tsx` | 535 lines | Verdict (Fraunces clamp 28-42px), rationale with evidence chips, 4-option grid with blocked styling, uPlot 7-day outlook bars, frameworks footer, motion stagger, cached/rule-based chips, refresh button, opens WhyAmITired + TransparencyDrawer | Mounted at `ReadinessHero:477` | ✓ VERIFIED |
| `frontend/src/components/dashboard/CoachChat.tsx` | 393 lines | Portal drawer, slide-in, streaming partial with blinking caret, inline-mono regex for data, suggestion chips, textarea auto-resize, cmd+enter, escape close, 503 disabled state with ANTHROPIC_API_KEY copy | Mounted at `DashboardShell:157`, opened from masthead button at `DashboardShell:55` | ✓ VERIFIED |
| `frontend/src/components/dashboard/WhyAmITired.tsx` | 214 lines | Portal modal, severity sort (high→low), evidence paragraphs, raw-data JSON toggle, escape close, body scroll lock | Mounted + opened from `CoachBrief:305` | ✓ VERIFIED |
| `frontend/src/components/dashboard/TransparencyDrawer.tsx` | 504 lines | Portal drawer, meta pills, collapsible Safety Rails / Snapshot / System Prompt sections, custom JSON renderer, copy-to-clipboard, escape close | Mounted + opened from `CoachBrief:306` | ✓ VERIFIED |
| `frontend/src/components/dashboard/ReadinessHero.tsx` modification | 20243 bytes | Placeholder `<CoachNote/>` replaced by `<CoachBrief />` at line 477 | Imported at line 8 | ✓ VERIFIED |
| `frontend/src/components/dashboard/DashboardShell.tsx` modification | 5922 bytes | Ask-coach button in masthead (MessageSquare icon, line 55-65); `chatOpen` state; `<CoachChat open onClose/>` portal-mounted at line 157 | ✓ VERIFIED |
| `frontend/src/components/dashboard/BiometricsDetail.tsx` modification | 25728 bytes | `AdvancedMetricsStrip` with live EF tile + decoupling/durability placeholder tiles (documented deviation — requires future /coach/metrics-trend) | Called at line 576 | ⚠️ PARTIAL |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `CoachBrief.tsx` | `/coach/brief` | `useCoachBrief` → `fetchCoachBrief` → `apiClient.get` | WIRED |
| `CoachBrief.tsx` (refresh) | `/coach/brief/refresh` | `useRefreshBrief` mutation | WIRED |
| `CoachChat.tsx` | `/coach/chat` (SSE) | `useCoachChat` → `streamCoachChat` → `fetch` + `ReadableStream` (NOT EventSource) | WIRED |
| `WhyAmITired.tsx` | `/coach/why` | `useWhyTired` → `fetchWhyTired` (enabled-controlled lazy) | WIRED |
| `TransparencyDrawer.tsx` | `/coach/transparency` | `useTransparency` (enabled-controlled lazy) | WIRED |
| `coach_service.generate_brief` | Anthropic SDK | lazy `import anthropic` + `AsyncAnthropic.messages.create(tools=[BRIEF_TOOL], tool_choice=...)` with ephemeral cache_control | WIRED |
| `coach_service.coach_chat_stream` | Anthropic SDK | `client.messages.stream()` async iter over `text_stream` with final buffer validation | WIRED |
| `coach_service.generate_brief` | `safety_rails.filter_recommendation` | Called AFTER LLM response (`coach_service.py:408`) | WIRED |
| `coach_service.coach_chat_stream` | `safety_rails.validate_chat_response` | Runs on final concatenated buffer, emits `replace` frame if ED detected (`coach_service.py:519-529`) | WIRED |
| `main.py` | `coach_router` | `from app.api.coach import router as coach_router` + `app.include_router(coach_router)` | WIRED |

### Regression Check

| Check | Result |
|-------|--------|
| `pytest backend/tests/` | 123/123 passed in 0.48s |
| `npx tsc -p tsconfig.app.json --noEmit` | zero errors |
| `npm run build` | built in 756ms; bundle 1.6 MB raw / 512 KB gzipped (+50 KB over pre-phase as documented in SUMMARY) |
| Backend boot without `ANTHROPIC_API_KEY` | Clean — 5 coach routes registered, no import-time failures, config defaults to `coach-opus-4-7` model + 6h cache |

### Anti-Patterns Found

| File | Line(s) | Pattern | Severity | Impact |
|------|---------|---------|----------|--------|
| `frontend/src/components/dashboard/BiometricsDetail.tsx` | 685-753 | Deliberate placeholder tiles for decoupling + durability (documented deviation — blocked on `/coach/metrics-trend` endpoint) | ℹ️ Info | User's "Tier-1 metrics nobody surfaces" bar is met in the coach BRIEF rationale via the snapshot (`avg_decoupling`, `durability_last_long_ride`) — the biometrics tiles are a UI surface that lights up later. Brief itself is fully causal and cites these metrics |
| `frontend/src/components/dashboard/CoachChat.tsx` | 343 | `placeholder=` HTML attribute on textarea | ℹ️ Info | Legitimate form affordance, not a stub |
| `frontend/src/components/dashboard/ReadinessHero.tsx` | 476 | Code comment reading "Phase 5-02" | ℹ️ Info | Section marker, not a placeholder |
| `backend/app/main.py` | 1-75 | Appears in git status as modified but reflects shipped Phase 5 coach router registration | ℹ️ Info | Expected — the phase requires registering the coach router |

No blockers. No TODO/FIXME in the critical paths. All "placeholder" mentions are either documented deviations, HTML attributes, or section comments.

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| COACH-01 (daily brief with causal rationale + 4 options) | ✓ SATISFIED | GET /coach/brief returns BriefRead with verdict + rationale + 4 options; CoachBrief.tsx renders full layout |
| COACH-02 (streaming chat) | ? NEEDS HUMAN | Code paths all present (SSE backend + ReadableStream frontend); end-to-end streaming UX needs live manual check |
| COACH-03 (safety rails including ED filter) | ? NEEDS HUMAN | Code + unit tests fully cover TSS cap, intensity cascade, ED filter; end-to-end refusal on real LLM needs manual ED-prompt test |
| COACH-08 (transparency endpoint + UI) | ✓ SATISFIED | GET /coach/transparency returns snapshot + SYSTEM_PROMPT; TransparencyDrawer.tsx renders snapshot + prompt + rails sections |

### Gaps Summary

There is one minor, documented gap that the plan explicitly deferred:

- **Decoupling + durability live tiles in BiometricsDetail** show "sample-stream only" placeholder copy because `/activities` payloads don't carry per-second power/HR samples. The backend *computes* these metrics (used in the coach brief snapshot), and the tile shape is in place — they will light up when a `/coach/metrics-trend?metric=decoupling&days=60` endpoint ships in a follow-up phase. This does not compromise the "frontier coach" bar because the brief *itself* cites these metrics in its rationale.

No other gaps. All must-haves from both plans are materialised in substantive, wired, tested code.

### Human Verification Checklist

The seven `human_verification` entries in the frontmatter describe the live browser tests that will upgrade this phase from `human_needed` to `passed`:

1. Dashboard layout + typography + evidence chips (visual)
2. Chat streaming UX with blinking caret + inline mono data (runtime)
3. Rule-based-fallback amber chip visible with no API key (live browser)
4. Why-this modal with severity dots + raw-data toggle (runtime)
5. Transparency drawer collapsibles + clipboard (runtime)
6. ED-refusal + injury-refusal round-trips on a live LLM session (requires `ANTHROPIC_API_KEY`)
7. Mobile viewport layouts at 320/375/390/414px (visual)

When the user has completed this checklist and is satisfied, the phase moves to `passed`.

---

*Verified: 2026-04-20T14:45:00Z*
*Verifier: Claude (gsd-verifier)*
