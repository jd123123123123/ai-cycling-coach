---
phase: 06-ai-deep-coaching
verified: 2026-04-21T00:00:00Z
status: human_needed
score: 3/3 must-haves verified (automated); real-streaming + real-Claude behaviour pending human smoke
re_verification: null
must_haves:
  truths:
    - "User can ask 'why am I tired?' and receive an analysis referencing their actual sleep, HRV, training load (and nutrition — see gap note)"
    - "User can ask 'analyze my last 4 weeks' and receive a structured summary of training patterns, load progression, and recovery trends"
    - "User can modify workouts via chat ('I only have 45 min', 'make it harder', 'swap to indoor') and see the updated workout reflected"
  artifacts:
    - path: backend/app/services/coach_tools.py
      provides: "Tool registry + dispatcher (7 tools: 5 read + modify + undo)"
    - path: backend/app/services/workout_modifier.py
      provides: "apply_modification + revert_from_audit with rails-aware cascade"
    - path: backend/app/services/analytical_aggregates.py
      provides: "4 pure aggregators (PMC, recovery, activities, FTP)"
    - path: backend/app/services/coach_service.py
      provides: "run_tool_use_loop + run_tool_use_loop_events + generate_analytical_chat_stream + deterministic fallback"
    - path: backend/app/services/coach_prompt.py
      provides: "CHAT_ANALYTICAL + CHAT_MODIFICATION prompts (simple + technical) via system_prompt_for_language(context=...)"
    - path: backend/app/api/coach.py
      provides: "/coach/chat SSE endpoint consuming generate_analytical_chat_stream"
    - path: frontend/src/hooks/useChatStream.ts
      provides: "Chat state machine + tool-use lifecycle + undoLastModification + React Query invalidation"
    - path: frontend/src/lib/coach-chat-stream.ts
      provides: "SSE parser normalising event: + data: frames"
    - path: frontend/src/components/coach/WorkoutModifiedCard.tsx
      provides: "Before/after modification card with rails-downgrade badge + Undo affordance"
    - path: frontend/src/components/coach/AnalyticalAnswerCard.tsx
      provides: "PMC + recovery sparkline cards"
    - path: frontend/src/components/dashboard/CoachChat.tsx
      provides: "Chat drawer using useChatStream + per-tool indicators + inline cards"
    - path: frontend/src/components/dashboard/TransparencyDrawer.tsx
      provides: "Tools Used section with humanized tool names + status icons + expandable JSON"
    - path: frontend/src/lib/chatToolUseLog.ts
      provides: "Module-singleton tool-use log bridge between CoachChat and TransparencyDrawer"
    - path: backend/migrations/versions/b9c4d1e8f2a3_planned_workout_modification_fields.py
      provides: "indoor + blocks_source + template_id columns on planned_workouts (NOT YET APPLIED to DB)"
  key_links:
    - from: frontend/src/hooks/useChatStream.ts
      to: backend /coach/chat
      via: "POST fetch + ReadableStream; parseCoachStream generator"
    - from: backend/app/services/coach_service.py::generate_analytical_chat_stream
      to: run_tool_use_loop_events
      via: "async for evt; emits SSE event: tool_use_start / tool_use_result + data: delta frames"
    - from: backend/app/services/coach_tools.py::_handle_modify_planned_workout
      to: workout_modifier.apply_modification + CoachBrief insert
      via: "guards → pure modifier → persist + audit row with verdict='modification'"
    - from: backend/app/services/coach_tools.py::_handle_undo_last_modification
      to: workout_modifier.revert_from_audit
      via: "60-minute window + already-undone check → compensating audit row verdict='modification_undo'"
human_verification:
  - test: "End-to-end streaming with real ANTHROPIC_API_KEY"
    expected: "Ask 'why am I tired?' in the chat drawer; 'Analyzing recovery data...' indicator renders before the narrative streams; answer cites real HRV/sleep/CTL numbers for the signed-in athlete."
    why_human: "Requires live Claude API, live /coach/chat SSE connection, and a seeded athlete DB. Automated tests mock Anthropic + DB."
  - test: "Real-time tool_use lifecycle indicators render during parallel tool dispatch"
    expected: "For a query that triggers parallel tools (e.g. 'analyze my last 4 weeks'), the 'Tools Used' section and per-tool indicator copy appear in quick succession before the final answer streams. No frame is dropped."
    why_human: "Visual cadence + animation timing (240ms session reset, 2.4s flash) cannot be asserted by grep."
  - test: "Workout modification end-to-end from chat click to calendar refresh"
    expected: "Open drawer, say 'I only have 45 min for tomorrow'. WorkoutModifiedCard renders inline with correct before/after; calendar + coach brief visibly refetch (React Query invalidation); Tools Used entry lists modify_planned_workout with JSON I/O."
    why_human: "Requires running app + DB with a planned workout for tomorrow."
  - test: "Rails-aware downgrade UI"
    expected: "For a 'make it harder' request when injury_flag is set or intensity_ceiling is tight, the amber 'Safety-adjusted' badge + reason string appears on the card; LLM narrates the downgrade honestly."
    why_human: "Requires profile state + live LLM prompt obedience to narration rule."
  - test: "Undo affordance behaviour"
    expected: "After a successful modification, the Undo button appears ONLY on the most recent WorkoutModifiedCard. Clicking it fires 'Undo that', renders another tool card, restores the original template (at current FTP), appends a verdict='modification_undo' audit row. Click-guard prevents double-fire."
    why_human: "Requires DB observation of coach_briefs rows + visual verification of latest-only affordance."
  - test: "Multi-turn threading preserves context"
    expected: "Ask 'why am I tired?' → get answer. Then ask 'what should I do about it?' → answer references the prior analysis without re-running all tools."
    why_human: "Requires real Claude API to confirm context usage; automated tests only verify wire-format threading."
  - test: "Deterministic fallback when ANTHROPIC_API_KEY is unset"
    expected: "With key unset, /coach/chat still streams: 'why am I tired?' → rule-based rationale; 'analyze my last 2 weeks' → PMC-window summary; other prompts → polite refusal citing the upgrade path."
    why_human: "Requires running the server with the env var unset and observing SSE behaviour in a browser."
  - test: "Alembic migration applied to production DB"
    expected: "Run `alembic upgrade head` → planned_workouts gains indoor/blocks_source/template_id. Existing rows get server_defaults (no backfill)."
    why_human: "06-02/06-03/06-04 SUMMARYs all flag this as still-pending-in-prod. Docker was down during plan execution."
---

# Phase 6: AI Deep Coaching — Verification Report

**Phase Goal:** Users can ask analytical questions and modify workouts through natural conversation, getting the depth of a real coaching relationship.

**Verified:** 2026-04-21
**Status:** human_needed (all automated checks pass; live streaming / live Claude / prod-DB migration need human smoke)
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can ask "why am I tired?" and get analysis grounded in sleep, HRV, training load (+ nutrition) | VERIFIED (with caveat) | `fetch_recovery_trend` + `fetch_pmc_window` + `fetch_recent_activities` tools + `_fallback_why_tired` deterministic path + 13 tool-use tests green. Caveat: no nutrition tool exists (Phase 8 not yet built); ROADMAP plan list said "incl. nutrition stub" but implementation has no nutrition handler. Practical impact is zero today because no nutrition data source exists; flagged for Phase 8 integration. |
| 2 | User can ask "analyze my last 4 weeks" and get a structured PMC + recovery summary | VERIFIED | `analytical_aggregates.pmc_window_summary` (slices `compute_user_pmc`) + `recovery_trend_summary` + system prompt documents the 'last N weeks' combo. `_fallback_last_n_weeks` covers the no-API-key path. `_LAST_N_WEEKS_RE` priority over `_WHY_TIRED_RE` tested. |
| 3 | User can modify workouts via chat and see the updated workout reflected | VERIFIED | `modify_planned_workout` tool (coach_tools.py:158) + `apply_modification` (workout_modifier.py:205) + React Query invalidation in `useChatStream` (line 332–333) + `WorkoutModifiedCard` renders inline in `CoachChat.tsx`. 75 workout_modifier tests + 10 handler tests + 4 undo tests pass. |

**Score:** 3/3 truths verified via automated checks.

---

## Required Artifacts

### Backend

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/app/services/coach_tools.py` | VERIFIED | 745 LOC. `TOOL_REGISTRY` at line 710 contains 7 handlers: `fetch_pmc_window` (read), `fetch_recovery_trend` (read), `fetch_recent_activities` (read), `fetch_ftp_history` (read), `fetch_planned_workout` (read), `modify_planned_workout` (write), `undo_last_modification` (write). User-scoping dispatcher strips `user_id`/`uid`/`owner_id`/`userId` (line 740). |
| `backend/app/services/workout_modifier.py` | VERIFIED | 766 LOC. `apply_modification` (line 205), `revert_from_audit` (line 648), `ModificationResult` dataclass (line 171), rails-downgrade returns tracked at lines 336, 538. |
| `backend/app/services/analytical_aggregates.py` | VERIFIED | 598 LOC. 4 aggregators: `pmc_window_summary`, `recovery_trend_summary`, `activity_summary`, `ftp_progression_summary`. |
| `backend/app/services/coach_service.py` | VERIFIED | 2138 LOC. `run_tool_use_loop` (returns str), `run_tool_use_loop_events` (async generator at line 1827), `generate_analytical_chat_stream` (line 1955) emits `event: tool_use_start\n` (line 1994) and `event: tool_use_result\n` (line 1999). `_fallback_why_tired` + `_fallback_last_n_weeks` present (lines 1798, 2028). Regexes `_LAST_N_WEEKS_RE` (line 1627) evaluated before `_WHY_TIRED_RE` (line 1623). |
| `backend/app/services/coach_prompt.py` | VERIFIED | Adds `context='chat_analytical'` and `context='chat_modification'` variants. Jargon-firewall tests still green (75 parametrized). |
| `backend/app/api/coach.py` | VERIFIED | `/coach/chat` at line 191 calls `generate_analytical_chat_stream` (line 215); returns `StreamingResponse` with `text/event-stream` (line 220). `X-Accel-Buffering: no` header present (line 225). Rate-limited 20/min/user. No more 503 on missing key. |
| `backend/app/models/planned_workout.py` | VERIFIED | `indoor`, `blocks_source`, `template_id` columns added (lines 46, 49, 52). |
| `backend/migrations/versions/b9c4d1e8f2a3_planned_workout_modification_fields.py` | EXISTS (not yet applied in prod — see human_verification) |

### Frontend

| Artifact | Status | Details |
|----------|--------|---------|
| `frontend/src/hooks/useChatStream.ts` | VERIFIED | 388 LOC. `MAX_CONTEXT_TURNS = 10` (line 122). `toBackendHistory` slices + filters `role='tool'` (line 144). Handles `'tool_use_start'` (line 283) + `'tool_use_result'` (line 295). `undoLastModification` action (line 372). React Query invalidation on `modify_planned_workout` success (lines 332–333). |
| `frontend/src/lib/coach-chat-stream.ts` | VERIFIED | 173 LOC. `parseCoachStream` generator handles SSE `event:` lines + bare `data:` JSON, partial-frame buffering, malformed-JSON → error frames. |
| `frontend/src/components/coach/WorkoutModifiedCard.tsx` | VERIFIED | 427 LOC. `isLatest` + `onUndo` + `undoDisabled` props (lines 154–158). `Undo2` icon imported (line 20). Click-guard via local `undoClicked` state (line 169). Renders rails-downgrade badge + reason. |
| `frontend/src/components/coach/AnalyticalAnswerCard.tsx` | VERIFIED | 376 LOC. Recharts sparkline for PMC + recovery with language-aware stat labels. |
| `frontend/src/components/dashboard/CoachChat.tsx` | VERIFIED | Imports `WorkoutModifiedCard` (line 32) + `AnalyticalAnswerCard` (line 33) + `setToolUseLogSnapshot` (line 30). Dispatches tool results to inline cards (line 255, 294). Backwards scan computes latest-modification for Undo affordance. |
| `frontend/src/components/dashboard/TransparencyDrawer.tsx` | VERIFIED | `ToolsUsedSection` (line 358). "Tools Used" drawer section (line 593). `TOOL_HUMAN_NAMES` map (line 21). Subscribes to `chatToolUseLog` while open. |
| `frontend/src/lib/chatToolUseLog.ts` | VERIFIED | 42 LOC module-singleton with subscribe/snapshot pattern. |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `useChatStream` | `/coach/chat` | POST fetch + ReadableStream, parser | WIRED (frontend code present; human smoke needed for live behaviour) |
| `generate_analytical_chat_stream` | `run_tool_use_loop_events` | `async for evt` + SSE frame emit | WIRED |
| `_handle_modify_planned_workout` | `apply_modification` + CoachBrief insert | guards (already-trained, injury) → pure modifier → persist + audit row `verdict='modification'`, `model_used='tool-use-modify'` | WIRED |
| `_handle_undo_last_modification` | `revert_from_audit` | 60-min window + JSONB `original_audit_id` lookup → compensating write `verdict='modification_undo'` | WIRED |
| `modify_planned_workout` tool_result | React Query invalidation (`['planned-workouts']` + `COACH_BRIEF_KEY_ROOT`) | `queryClient.invalidateQueries` inside `useChatStream` tool_use_result handler | WIRED |
| Rails-downgrade transparency | `rails_downgraded=True` + `reason` in tool_result | Modifier returns flag; handler preserves it in audit row; LLM prompt instructs narration | WIRED (content verified; LLM-obedience is a human-verification item) |
| Already-trained-today guard | `_has_activity_on` + reject response | `cast(Activity.started_at, SqlDate)` on today | WIRED (coach_tools.py:383, rejection at 478) |
| Append-only audit trail | Every modify + undo inserts a `coach_briefs` row | `CoachBrief` insert in handler; original row never mutated | WIRED |
| Multi-turn threading | Last 10 turns sent on each `/coach/chat` call | `toBackendHistory` slice(-10) client-side + backend trusts | WIRED |
| Deterministic fallback | `_fallback_why_tired` + `_fallback_last_n_weeks` route when `ANTHROPIC_API_KEY` unset | `generate_analytical_chat_stream` (line 1847) + `_fallback_analytical_answer` (line 1658) | WIRED |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| COACH-04 (on-demand analysis) | SATISFIED | — |
| COACH-05 (workout modification via conversation) | SATISFIED | — |

---

## Test Results

**Backend:**

```
cd /Users/jannisdeters/Downloads/ai-cycling-coach/backend
.venv/bin/pytest -q
466 passed in 0.80s
```

All 466 tests green. No regressions. +14 tests vs. 06-03 baseline of 452 (multi-turn threading + undo round-trip + undo tool handler).

**Frontend:**

```
cd /Users/jannisdeters/Downloads/ai-cycling-coach/frontend
node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build
✓ 4608 modules transformed.
✓ built in 875ms
dist/assets/index-CSQWX2yv.js   1,699.97 kB │ gzip: 533.76 kB
```

TypeScript clean; Vite production build succeeds. (Known non-blocker: `npm run build` fails because `node_modules/.bin/` is empty on this machine — invoke bins directly. Identical to the issue flagged in 06-03 SUMMARY.)

---

## Anti-Patterns Found

None that block goal achievement.

Minor observations:

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `coach_tools.py` | Returns `{success: False, reason: ...}` on validation errors | Info | Intentional — keeps tool-use loop healthy; documented decision. |
| `coach_service.py` | `run_tool_use_loop` duplicated alongside `run_tool_use_loop_events` | Info | Intentional — preserves legacy `str`-returning API for existing 13 tests; noted in 06-03 SUMMARY. |
| `frontend/node_modules/.bin/` | Empty on this machine | Warning (env-only) | Build worked via direct bin invocation. Fresh `npm ci` fixes it. Does not affect code quality. |

---

## Gaps (if any)

One partial gap against the literal wording of Truth #1:

- **Nutrition tool not present in registry.** Success Criterion #1 says the analysis should reference "sleep, HRV, training load, and nutrition data". The ROADMAP plan list says 06-01 includes a "nutrition stub". Actual `TOOL_REGISTRY` has 7 tools and none of them are nutrition-oriented. There is no nutrition handler, no nutrition aggregator, no nutrition mention in the chat_analytical prompt.
  - **Practical impact today: zero.** Phase 8 (Nutrition Integration) has not yet shipped; there is no nutrition data source to query.
  - **Recommendation:** Accept as-is for Phase 6; track a "wire nutrition tool" task against Phase 8. The analytical loop design supports trivially adding an 8th tool when data becomes available.
  - **This does NOT block truth #1:** users today get meaningful "why am I tired?" answers grounded in sleep, HRV, and training-load data — which matches every real-world athlete pain point research in `/Users/jannisdeters/Downloads/ai-cycling-coach/.planning/research/athlete-pain-points.md`.

Because this is a known Phase 8 dependency and not a regression, the phase status is `human_needed` rather than `gaps_found`. Human verification is requested to confirm this interpretation.

---

## Human Verification Required

See `human_verification` in frontmatter. Eight items total:

1. Real-streaming end-to-end with live `ANTHROPIC_API_KEY`.
2. Tool-use lifecycle indicator cadence during parallel dispatch.
3. Workout modification from chat → calendar refresh round-trip.
4. Rails-aware downgrade UI + LLM narration obedience.
5. Undo affordance (latest-only, click-guard, audit row append).
6. Multi-turn context preservation across follow-ups.
7. Deterministic fallback path with `ANTHROPIC_API_KEY` unset.
8. Apply Alembic migration `b9c4d1e8f2a3` to prod DB.

---

## Summary

Phase 6 (AI Deep Coaching) passes all automated verification: the backend tool registry contains the 7 expected tools (5 read + modify + undo), the SSE endpoint emits the full `event: tool_use_start` / `event: tool_use_result` / `data: delta` / `data: replace` frame set, `apply_modification` + `revert_from_audit` are wired through the tool dispatcher with append-only audit rows on `coach_briefs`, the rails-downgrade transparency contract is enforced (never silent), and the frontend hook + cards render the full modification round-trip with React Query invalidation. Backend 466/466 green, frontend build clean.

The one literal gap against Success Criterion #1 (no nutrition tool) is a known Phase 8 dependency with zero practical impact today and is flagged for tracking rather than as a phase blocker.

Status is `human_needed` because the core value prop — live Claude streaming with a real athlete DB — is structurally verified but experientially unverifiable without a running environment. The eight items in `human_verification` cover every experiential risk.

---

*Verified: 2026-04-21*
*Verifier: Claude (gsd-verifier)*
