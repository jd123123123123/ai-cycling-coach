---
phase: 06-ai-deep-coaching
plan: 04
subsystem: ai-coaching
tags: [multi-turn-chat, undo, compensating-write, append-only-audit, claude-tool-use, sse, stateless-server]

# Dependency graph
requires:
  - phase: 06-ai-deep-coaching/06-01
    provides: TOOL_REGISTRY dispatch + run_tool_use_loop / run_tool_use_loop_events foundation
  - phase: 06-ai-deep-coaching/06-02
    provides: modify_planned_workout write-tool + evidence.modification.{before, after} audit payload
  - phase: 06-ai-deep-coaching/06-03
    provides: useChatStream hook, WorkoutModifiedCard, CoachChat.tsx (now at dashboard/ path)
  - phase: 05-ai-coaching-core/05-01
    provides: coach_briefs append-only audit contract (never mutate; always insert)
  - phase: 05-ai-coaching-core/05-02
    provides: Coach chat messages are session-local React state (not persisted) — ephemeral invariant

provides:
  - Multi-turn chat context window (N=10 client-side truncation, stateless server)
  - undo_last_modification tool (seventh in TOOL_REGISTRY) with 60-minute eligibility window
  - revert_from_audit(audit_row, db, ftp_w) — compensating write that restores PW + appends modification_undo audit row
  - Undo UI on the latest successful WorkoutModifiedCard only (session-scoped)
  - Completed Phase 6 (all 4 waves) — AI Deep Coaching ships end-to-end

affects: [Phase 7+ any surface wanting chat-history persistence, any future write tool that needs compensating-write pattern]

# Tech tracking
tech-stack:
  added: []  # No new libraries — all built on 06-01/02/03 primitives
  patterns:
    - stateless-multi-turn-context (client truncates, server trusts)
    - compensating-write-audit (undo as append-only inverse, not mutation)
    - route-writes-through-chat (single protocol for modify + undo)

key-files:
  created:
    - backend/tests/test_chat_multi_turn.py
    - .planning/phases/06-ai-deep-coaching/06-04-SUMMARY.md
  modified:
    - frontend/src/hooks/useChatStream.ts
    - frontend/src/components/coach/WorkoutModifiedCard.tsx
    - frontend/src/components/dashboard/CoachChat.tsx
    - backend/app/services/coach_tools.py
    - backend/app/services/workout_modifier.py
    - backend/app/services/coach_prompt.py
    - backend/tests/test_coach_tools.py

key-decisions:
  - "MAX_CONTEXT_TURNS=10 — ~5 exchanges fits follow-up context without prompt-cache churn"
  - "Undo window 60 min — session-scoped at backend even when UI session-scope is client-only"
  - "Undo flows through chat (not direct /coach/undo API) — single protocol, LLM narrates"
  - "Original audit row is NEVER mutated; undo writes modification_undo row with original_audit_id ref"

patterns-established:
  - "Client-side context truncation: toBackendHistory slices to last N conversational turns before sending"
  - "Compensating write via audit row: evidence.modification.before is the rollback payload; revert_from_audit re-materialises"
  - "Latest-only UI affordance: iterate messages[] backwards, tag the first matching tool card as isLatest=true"

# Metrics
duration: ~50min
completed: 2026-04-21
---

# Phase 6 Plan 04: Multi-Turn Context + Undo Modification Summary

**Chat now threads the last 10 turns on every /coach/chat call (stateless server), and the most-recent workout modification can be reverted via an Undo button that writes a compensating audit row without ever touching the original.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-04-21T (session start)
- **Completed:** 2026-04-21
- **Tasks:** 2 (autonomous, no checkpoints)
- **Files modified:** 7 (1 new test file; 6 existing)
- **Commits:** 3 atomic + 1 metadata
- **Backend tests:** 466 passing (was 452 at Wave 3; +14 new for 06-04)
- **Frontend:** tsc --noEmit clean, vite build green

## Accomplishments

- Multi-turn context threading: frontend slices to last 10 conversational turns, drops role='tool' UI cards before send, backend threads the full array into run_tool_use_loop + run_tool_use_loop_events without re-truncating (stateless authority).
- undo_last_modification tool (7th in TOOL_REGISTRY) finds the most recent verdict='modification' CoachBrief row within a 60-minute cutoff, rejects rows that already have a corresponding modification_undo row (JSONB lookup on original_audit_id), and delegates to revert_from_audit.
- revert_from_audit(audit_row, db, ftp_w) in workout_modifier: reads evidence.modification.before, re-materialises the template at the athlete's CURRENT FTP (watts fresh, not stale), restores PlannedWorkout.template_id + duration_seconds_target + interval_structure in place, appends a new verdict='modification_undo' row with reverted_from + restored_to + original_audit_id provenance. Original row is never touched.
- Chat modification prompt (chat_modification_simple + _technical) now documents both write tools. LLM is told to call undo on "undo that / revert / never mind / go back / put it back" phrasings and to narrate the revert after success.
- Undo UI on WorkoutModifiedCard: footer button (simple: "Put it back", technical: "Undo") shown only on the LATEST successful modify_planned_workout tool card in the session. Click sends "Undo that" through the standard chat stream, producing the same SSE frames any modification would. Click-guard prevents double-fire during in-flight stream.

## Task Commits

1. **Task 1: multi-turn-context-passing** - `86f488b` (feat)
   - Export MAX_CONTEXT_TURNS=10 + slice(-N) in toBackendHistory
   - test_chat_multi_turn.py with TestMultiTurnThreading (4 tests)
2. **Task 2 (backend): undo_last_modification tool** - `a4c905f` (feat)
   - revert_from_audit in workout_modifier
   - undo_last_modification schema + handler + TOOL_REGISTRY entry
   - chat_modification prompt extended with undo instructions
   - TestUndoLastModification (6 tests) + TestUndoRoundTrip (4 tests, parallel coverage)
3. **Task 2 (frontend): Undo button on latest modification card** - `56c4f37` (feat)
   - useChatStream.undoLastModification action
   - WorkoutModifiedCard Undo footer with click-guard
   - CoachChat latest-modification index computation + ctx-threaded renderMessage

**Plan metadata:** (pending — this commit)

## Files Created/Modified

- `frontend/src/hooks/useChatStream.ts` — MAX_CONTEXT_TURNS export, toBackendHistory slice, undoLastModification action, ChatStreamState interface extension
- `frontend/src/components/coach/WorkoutModifiedCard.tsx` — isLatest + onUndo + undoDisabled props; Undo2 icon footer button; click-guard via undoClicked local state
- `frontend/src/components/dashboard/CoachChat.tsx` — latest-modification backwards scan; ctx object threaded through renderMessage; ToolBubble signature extended
- `backend/app/services/workout_modifier.py` — revert_from_audit(audit_row, db, ftp_w) async function; updated module docstring clarifying pure vs DB-coupled split
- `backend/app/services/coach_tools.py` — undo_last_modification tool schema, _handle_undo_last_modification (60-min window + already-undone check), TOOL_REGISTRY entry, timedelta import
- `backend/app/services/coach_prompt.py` — _CHAT_MODIFICATION_BLOCK extended with undo_last_modification section (intent mapping + narration rules); heading updated from WRITE TOOL (singular) to WRITE TOOLS (plural)
- `backend/tests/test_coach_tools.py` — test_seven_tools_registered (was six); TestUndoLastModification class with 6 specs
- `backend/tests/test_chat_multi_turn.py` — NEW file (~385 LOC). TestMultiTurnThreading (4 tests) + TestUndoRoundTrip (4 tests)

## Decisions Made

- **MAX_CONTEXT_TURNS=10 (exported, client-side)** — Five complete exchanges is enough context for "what should I do about it?" to resolve to the prior "Why am I tired?" without inflating prompt size. Export keeps the N visible to tests + callers (could be made configurable per drawer later).
- **Backend trusts the client on truncation** — run_tool_use_loop normalises roles + drops empty content but never caps message count. Truncation is a UX concern (prompt cost + Claude context window), not a security one; keeping it client-side keeps the server stateless per 05-02.
- **Tool cards (role='tool') filtered at BOTH ends** — Frontend's toBackendHistory drops them before send; backend's working_messages loop also drops anything that isn't user|assistant. Defence-in-depth so a future bug in either side doesn't leak synthetic UI messages into the Anthropic payload.
- **Undo eligibility window: 60 min** — Session-scoped at the backend even though the UI's latest-only affordance already enforces session-scoping client-side. 60 min is generous enough to cover a distracted user (drawer closed, came back, wants to revert) while short enough to prevent cross-day reach-back.
- **Undo re-materialises at CURRENT FTP, not the FTP at modification time** — If the athlete tested FTP between modify and undo, the restored block watts reflect the new FTP. Consistent with 05-01's "server-side watts authority" decision: blocks always derive from today's FTP, never frozen numbers.
- **Undo flows through chat (not direct /coach/undo API endpoint)** — Single protocol: every PlannedWorkout mutation (modify + undo) goes through the tool-use loop, producing uniform SSE frames (tool_use_start / tool_use_result), uniform React Query invalidation hooks in useChatStream, uniform Tools Used transparency entries. Alternative direct-API approach would have required a second invalidation path + a second audit persistence site + custom UI feedback.
- **Append-only undo audit: original row untouched** — Match the 05-01 contract. revert_from_audit inserts a NEW row with verdict='modification_undo'; the original verdict='modification' row is never SELECT-FOR-UPDATE'd or mutated. Already-undone detection is a second SELECT on evidence.modification_undo.original_audit_id (JSONB astext comparison) — no status column needed on the original.
- **Click-guard in WorkoutModifiedCard (local state, not parent-controlled)** — undoClicked is private to the card, flips on first click, disables the button permanently for that card's lifetime. Prevents double-fire during in-flight stream without requiring CoachChat to track per-card state. Card remounts on session reset.
- **Model_used='tool-use-undo'** — Distinct from 06-02's 'tool-use-modify' so future queries can split modifications from undos cleanly in the coach_briefs log (e.g., "how often do users undo their modifications?").
- **Indoor flag preserved across undo (not restored from before snapshot)** — The indoor flag is a per-session user preference, not a modification-driven field. Undo reverts template_id + duration; keeps the current indoor setting. Rationale: if the user modified + then toggled indoor, undo shouldn't surprise-toggle outdoor on them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Accuracy] Test expected restored_duration_min=75 but parametrize_template clamps to ±15% of the template's natural base**

- **Found during:** Task 2 test run
- **Issue:** Initial undo tests seeded `before_duration=75` for template `vo2_5x4`, but vo2_5x4's natural base is 57 minutes. parametrize_template clamps the duration_scale to [0.7, 1.15], so asking for 75 minutes on a 57-minute base lands at 65 (= 57 × 1.15), not 75.
- **Fix:** Seed `before_duration=57` (the template's natural duration), assert the restored duration lands in [50, 65] range (allowing for ±15% clamp drift without hardcoding the exact snap value). Realistic modeling of how `before` would actually have been captured by apply_modification in the first place.
- **Files modified:** backend/tests/test_coach_tools.py, backend/tests/test_chat_multi_turn.py
- **Verification:** All 10 new undo tests pass (6 in test_coach_tools + 4 in test_chat_multi_turn)
- **Committed in:** a4c905f

**2. [Rule 2 - Missing Critical] revert_from_audit needs ftp_w parameter (plan's signature omitted it)**

- **Found during:** Task 2 implementation
- **Issue:** Plan's `revert_from_audit(audit_row, db)` signature reads `before.template_id` but then needs to call `parametrize_template(template, ftp)` to materialise blocks. FTP is not stored in the audit row (security — audit rows stay user-ID-keyed, not credential-snapshotted). Without ftp_w, the function would either need a second DB query to load AthleteProfile (coupling workout_modifier to AthleteProfile) or silently fall back to a stubbed FTP.
- **Fix:** Added `ftp_w: int` as a third required parameter. The handler (_handle_undo_last_modification) loads AthleteProfile once and passes ftp_w in. Keeps workout_modifier's reduced DB coupling (only PlannedWorkout + CoachBrief) — AthleteProfile stays isolated to the handler layer.
- **Files modified:** backend/app/services/workout_modifier.py, backend/app/services/coach_tools.py
- **Verification:** Happy-path test confirms FTP is loaded once, revert_from_audit materialises correct watts, PW + audit row are written atomically
- **Committed in:** a4c905f

**3. [Rule 2 - Missing Critical] Undo prompt guidance missing "do not call modify + undo in same turn"**

- **Found during:** Task 2 prompt authoring
- **Issue:** Without explicit guidance, the LLM might try to "undo that and make it harder" in one tool-use turn — calling undo_last_modification, getting the result, then calling modify_planned_workout in the SAME assistant message. This would audit two rows back-to-back and potentially confuse the user who clicked Undo.
- **Fix:** Added explicit rule to _CHAT_MODIFICATION_BLOCK: "Never call undo_last_modification AND modify_planned_workout in the same response — pick one based on intent."
- **Files modified:** backend/app/services/coach_prompt.py
- **Verification:** Jargon-ban tests still pass (75/75) — the new simple-mode copy has no banned terms
- **Committed in:** a4c905f

---

**Total deviations:** 3 auto-fixed (1 accuracy test fix, 2 missing critical)
**Impact on plan:** All three were necessary for correctness. No scope creep; every deviation is a small clarification that keeps the contract coherent.

## Issues Encountered

- Plan's `CoachChat.tsx` path reference was `frontend/src/components/coach/CoachChat.tsx`, but the Wave 3 migration already moved it to `frontend/src/components/dashboard/CoachChat.tsx` (coach/ kept only as a re-export shim). Prompt context corrected the path; all edits applied to the canonical dashboard/ location.
- vo2_5x4 template's natural base duration is 57 min, not 75. Tests had to be adjusted to use realistic `before` snapshots (see Deviation 1).

## User Setup Required

None — no external service configuration; ANTHROPIC_API_KEY continues to be the prod requirement (existing pending todo).

## Next Phase Readiness

- **Phase 6 is COMPLETE (all 4 waves).** AI Deep Coaching ships end-to-end: tool-use loop for analytical questions (06-01), modification write tool with rails + audit (06-02), streaming SSE UI with inline cards + Tools Used transparency (06-03), multi-turn memory + undo affordance (06-04). All 466 backend tests green; frontend build clean.
- **Jargon-ban firewall still green** (75 parametrized tests) — the new simple-mode copy in WorkoutModifiedCard ("Put it back") and in the coach_prompt undo instructions introduces no banned terms.
- **Append-only audit trail is now compensating-write-aware** — future write tools can follow the pattern: mutate state, insert new audit row, detect already-compensated via JSONB original_audit_id lookup.
- **Blockers/concerns:**
  - Same production-readiness list as Wave 3: provision ANTHROPIC_API_KEY, Redis rate limiter, Docker daemon restart + alembic upgrade head (b9c4d1e8f2a3 migration still pending apply on this machine).
  - New: 60-min undo window is backend-enforced. If a user leaves the drawer open for 2 hours, the Undo button is still rendered client-side but will get {found: false, reason: 'No modifications in the last hour'} — the LLM narrates this gracefully but it's worth watching UX for confusion. Consider a stale-card visual (fade the Undo button at 50 min) in a future iteration.
  - Future: optional persistence of chat history (currently ephemeral per 05-02) could enable cross-session undo. Would need a ChatSession model + privacy controls — not needed for Phase 6.

---
*Phase: 06-ai-deep-coaching*
*Completed: 2026-04-21*
