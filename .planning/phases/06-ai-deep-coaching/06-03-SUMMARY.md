---
phase: 06-ai-deep-coaching
plan: 06-03
subsystem: ai-coaching-ui
tags: [react, react-query, sse, server-sent-events, tool-use, recharts, motion, typescript]

# Dependency graph
requires:
  - phase: 06-01-analytical-tool-use
    provides: TOOL_REGISTRY + run_tool_use_loop (5 read tools) + SSE /coach/chat
  - phase: 06-02-workout-modification-tool
    provides: modify_planned_workout write tool + rails-aware audit trail
  - phase: 05-02-coach-chat-and-transparency
    provides: CoachChat drawer, TransparencyDrawer shell, SSE fetch+ReadableStream pattern
provides:
  - SSE parser (parseCoachStream) normalising tool-use lifecycle + delta/replace/done/error into one ChatStreamEvent union
  - useChatStream React hook wrapping fetch+ReadableStream with role='user'|'assistant'|'tool' state machine
  - Inline chat cards: WorkoutModifiedCard (before/after + rails downgrade badge) and AnalyticalAnswerCard (PMC + recovery sparklines)
  - Per-tool "Analyzing your..." indicator copy in both language modes
  - React Query cache invalidation on successful modify_planned_workout (planned-workouts + coach-brief)
  - TransparencyDrawer "Tools Used" section with session-scoped tool_use log (humanized names, JSON input/output, status icons)
  - Module-singleton tool-use log snapshot (chatToolUseLog.ts) bridging CoachChat -> TransparencyDrawer without lifting state to the shell
  - Backend extension: run_tool_use_loop_events (async generator) emitting tool_use_start / tool_use_result / text events; generate_analytical_chat_stream emits SSE "event:" frames during the loop
affects: [06-04-multi-turn-memory-and-undo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - sse-tool-use-lifecycle — SSE frames typed with "event: tool_use_start / tool_use_result" emitted during the Claude tool-use loop (not only after) so UI can render intermediate state
    - react-query-invalidation-on-tool-result — write-tool success inside the chat stream invalidates planned-workouts + coach-brief query keys without a full page refetch
    - module-singleton-cross-sibling-state — CoachChat ↔ TransparencyDrawer share session state via a tiny subscribe/snapshot module instead of lifting state to the shell (preserves ephemeral-chat invariant from 05-02)
    - sse-backward-compat-event-extension — new event types delivered via "event:" SSE lines rather than in-data type-field additions, so 05-02 clients that ignore unknown event: lines still work

key-files:
  created:
    - frontend/src/lib/coach-chat-stream.ts (173 LOC — parseCoachStream generator + ChatStreamEvent union)
    - frontend/src/hooks/useChatStream.ts (351 LOC — state machine, tool-use log, invalidation)
    - frontend/src/components/coach/WorkoutModifiedCard.tsx (380 LOC — before/after grid + rails downgrade badge)
    - frontend/src/components/coach/AnalyticalAnswerCard.tsx (376 LOC — PMC + recovery sparklines)
    - frontend/src/components/coach/CoachChat.tsx (shim re-exporting dashboard/CoachChat)
    - frontend/src/components/coach/TransparencyDrawer.tsx (shim re-exporting dashboard/TransparencyDrawer)
    - frontend/src/lib/chatToolUseLog.ts (42 LOC — module-singleton + subscribe)
  modified:
    - frontend/src/components/dashboard/CoachChat.tsx (migrated from useCoachChat → useChatStream; inline cards; per-tool indicator copy; session reset on close)
    - frontend/src/components/dashboard/TransparencyDrawer.tsx (new "Tools Used" section with status icons + expandable JSON)
    - backend/app/services/coach_service.py (+ run_tool_use_loop_events async generator; generate_analytical_chat_stream now consumes it and emits tool_use_start / tool_use_result SSE frames)
    - backend/tests/test_coach_service_tool_use.py (+ 6 tests: TestRunToolUseLoopEvents + TestGenerateAnalyticalChatStream)

key-decisions:
  - "Backend tool_use_start / tool_use_result frames ship as SSE `event:` lines (not a new `type:` value in the existing JSON data field) — 05-02 clients that ignore unknown event: lines still work, so this is fully backward-compatible"
  - "run_tool_use_loop unchanged; new streaming variant run_tool_use_loop_events coexists — preserves the existing str-returning API for all 13 tool-use tests without modification"
  - "Inline tool cards live in messages[] as role='tool' synthetic entries (not a separate collection) — renders in chronological order next to assistant narration, matches the user's mental model of chat history"
  - "toBackendHistory strips role='tool' before sending — tool cards are UI artefacts; round-tripping them would confuse Claude's conversation state"
  - "IntervalRibbon NOT extracted to a shared path — the existing dashboard/IntervalRibbon.tsx already accepts language + no dashboard-specific coupling; WorkoutModifiedCard imports it directly. Extraction would've been cosmetic churn with no downstream benefit"
  - "TEMPLATE_LABELS map hand-written (12 templates × simple/technical) rather than derived from backend — backend template names are static strings not yet exposed via an API; hand-map is the pragmatic choice for this scope"
  - "Flash acknowledgement on modification kept inline (2.4s forest-green bar below drawer header) instead of pulling sonner — one-off toast is not worth a new dependency in this bundle-sensitive area"
  - "TransparencyDrawer ToolsUsedSection subscribes to the tool-use log while open — live updates mean opening the drawer mid-conversation shows tools as they fire, matching the 'transparency, not replay' ethos"
  - "session-reset fires 240ms after drawer close (after the slide-out animation) — wiping state synchronously on close caused a flash of empty-state copy during the fade-out"
  - "ChatMessageTool stores result as Record<string, unknown> rather than a discriminated union per tool — cards cast narrowly at render time; keeps the hook generic so new backend tools don't require hook changes"

patterns-established:
  - "SSE event-line vs data-type: tool_use_start / tool_use_result use SSE `event:` lines; delta / replace / done / error use bare data-JSON with `type:` field. Parser handles both shapes transparently, future backend additions can pick either convention"
  - "Write-tool success side-effects (React Query invalidation + onModification callback) live inside the hook's tool_use_result handler, not in the caller — single source of truth, future write tools just need to pick their invalidation keys here"
  - "Tool-use log is module-singleton not context — siblings of CoachChat can read it without state-lift to the shell (preserves ephemeral invariant)"
  - "Humanized display maps (TEMPLATE_LABELS in WorkoutModifiedCard, TOOL_HUMAN_NAMES + TOOL_INDICATOR_COPY in CoachChat/Drawer) all fall back to key-to-title-case for unknown ids — new backend tools/templates render readably without a frontend release"
  - "Inline chat cards receive Record<string,unknown> props + narrow locally — cards stay decoupled from the hook's generic tool-result shape and new cards can be added without touching useChatStream"

# Metrics
duration: ~70min
completed: 2026-04-21
---

# Phase 06 Plan 03: Chat UI Upgrades + Modification Surface Summary

**Tool-use lifecycle visible in chat: "Analyzing your..." indicators while tools dispatch, inline cards render modifications (before/after + rails downgrade badge) and analytical answers (PMC/recovery sparklines), and the TransparencyDrawer exposes every tool call in the session.**

## Performance

- **Duration:** ~70 min (plan estimated 75)
- **Started:** 2026-04-21
- **Completed:** 2026-04-21
- **Tasks:** 3 (+ 1 upstream backend auto-fix)
- **Files modified:** 9 (2 backend, 7 frontend)

## Accomplishments

- Backend SSE contract extended with `event: tool_use_start` / `event: tool_use_result` frames emitted DURING the Claude tool-use loop (not only after). Previously the frontend had no way to know a tool was running — tools ran synchronously before the first frame. `run_tool_use_loop` kept unchanged for test-compat; new `run_tool_use_loop_events` async generator powers the streaming path.
- Frontend SSE parser (`parseCoachStream`) normalises both frame shapes (event-line with JSON data, OR bare data-JSON with type field) into a single `ChatStreamEvent` union. Handles partial-frame chunks (ReadableStream reads split mid-frame) and surfaces malformed JSON as error frames rather than silently dropping data.
- `useChatStream` hook owns the full chat lifecycle: user→assistant→tool messages, partial streaming text, currentToolUse + toolUseLog, error/disabled state, React Query invalidation on `modify_planned_workout` success, onModification callback for consumers, AbortController-based unmount cleanup.
- `WorkoutModifiedCard` renders before/after as a 3-column grid (dimmed+strikethrough old, arrow, emphasised new) with template humanization per language mode and an amber "Safety-adjusted" badge+reason whenever rails_downgraded=true. Indoor toggle surfaces as a pill, duration delta shown in forest/amber.
- `AnalyticalAnswerCard` renders a 96×44px recharts sparkline + 3 stat chips (avg CTL/HRV + trend delta + ramp/sleep-debt) for PMC and recovery windows, with language-aware stat labels ("Avg fitness" vs "Avg CTL").
- CoachChat migrated from the 05-02 `useCoachChat` ad-hoc fetch loop to the new hook. Per-tool indicator copy ("Checking your fitness history" / "Updating your workout" / etc.) renders during `currentToolUse`. Session reset fires 240ms after drawer close to preserve the ephemeral-session invariant.
- TransparencyDrawer gains a "Tools Used" section (count pill in header, expandable per-entry JSON input+result panes, per-tool status icons). Subscribes to the session log while open so live tool calls appear in real time.

## Task Commits

1. **Backend fix-up: tool_use lifecycle SSE frames** — `7651a77` (feat(06-01))
   - `run_tool_use_loop_events` async generator (compat with existing `run_tool_use_loop: str`)
   - `generate_analytical_chat_stream` now emits `event: tool_use_start` / `event: tool_use_result` frames
   - 6 new tests locking event order + SSE shape. 452/452 backend tests green
2. **Task 1: SSE parser + useChatStream hook** — `152bcf0` (feat(06-03))
   - `frontend/src/lib/coach-chat-stream.ts` (173 LOC)
   - `frontend/src/hooks/useChatStream.ts` (351 LOC)
3. **Task 2: WorkoutModifiedCard + AnalyticalAnswerCard** — `2d9a113` (feat(06-03))
   - 380 + 376 LOC; both exceed min_lines contract (120 / 100)
4. **Task 3: CoachChat integration + Tools Used drawer** — `044689f` (feat(06-03))
   - CoachChat migrated to useChatStream; inline cards; per-tool indicators; session reset
   - TransparencyDrawer Tools Used section with live subscribe
   - `chatToolUseLog.ts` module-singleton bridging sibling modals
   - `components/coach/*.tsx` shim re-exports for frontmatter path contract

**Plan metadata:** this commit

## Files Created/Modified

### Created (7)
- `frontend/src/lib/coach-chat-stream.ts` — SSE parser (173 LOC)
- `frontend/src/hooks/useChatStream.ts` — chat state machine with tool-use lifecycle (351 LOC)
- `frontend/src/components/coach/WorkoutModifiedCard.tsx` — before/after modification card (380 LOC)
- `frontend/src/components/coach/AnalyticalAnswerCard.tsx` — PMC/recovery sparkline card (376 LOC)
- `frontend/src/components/coach/CoachChat.tsx` — re-export shim
- `frontend/src/components/coach/TransparencyDrawer.tsx` — re-export shim
- `frontend/src/lib/chatToolUseLog.ts` — module-singleton + subscribe (42 LOC)

### Modified (4)
- `frontend/src/components/dashboard/CoachChat.tsx` — migrated from `useCoachChat` → `useChatStream`; role='tool' dispatch to inline cards; per-tool indicator copy; flash acknowledgement on modification success; session reset on close
- `frontend/src/components/dashboard/TransparencyDrawer.tsx` — Tools Used section with status icons, expandable JSON panes, live subscribe
- `backend/app/services/coach_service.py` — `run_tool_use_loop_events` generator; `generate_analytical_chat_stream` now emits tool_use_start/result SSE frames
- `backend/tests/test_coach_service_tool_use.py` — 6 new tests covering event order + SSE frame shape

## Decisions Made

See frontmatter `key-decisions` for the full list. Highlights:
- **Backend SSE extension via `event:` lines, not a new `type:` value** — additive, 05-02 clients that ignore unknown event lines still work. Alternative considered: extend the JSON `type` union with `tool_use_start` / `tool_use_result`; rejected because any 05-02 client checking `type === 'delta' | 'replace' | 'done' | 'error'` would silently drop them. SSE `event:` lines let legacy clients route to the default data-JSON path transparently.
- **`run_tool_use_loop` kept unchanged** — added `run_tool_use_loop_events` alongside. All 13 existing tests pass without modification. Trading a tiny bit of duplication (the loop body) for zero regression risk.
- **Module-singleton for tool-use log** — CoachChat + TransparencyDrawer are siblings under the shell. Lifting chat state to the shell would break the 05-02 invariant that chat state lives inside the drawer. Subscribe/snapshot module is the minimum-coupling bridge.
- **Inline flash ack (2.4s forest bar) instead of sonner toast** — one-off acknowledgement isn't worth pulling a new dependency in a bundle-sensitive area. If more toast surfaces appear in 06-04 / 06-05, revisit.
- **IntervalRibbon reused, not extracted** — existing `dashboard/IntervalRibbon.tsx` is already language-aware with zero dashboard coupling. Extraction would be cosmetic churn. WorkoutModifiedCard imports it directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extended backend SSE contract to emit tool_use lifecycle frames during the loop**
- **Found during:** Task 1 setup (verifying the SSE contract before writing the parser)
- **Issue:** 06-01 left `run_tool_use_loop` as a `str`-returning coroutine that ran every tool synchronously BEFORE the first SSE frame. The frontend had no way to render "Analyzing your training data..." intermediate state because no frame was sent until all tools completed. Plan explicitly listed this as a possible fix-up in Task 1 — "if 06-01 did not emit these frames: extend `run_tool_use_loop` to yield SSE frames during the loop".
- **Fix:** Added `run_tool_use_loop_events` async generator emitting `{type: 'tool_use_start'|'tool_use_result'|'text'}` events. `generate_analytical_chat_stream` consumes it and emits `event: tool_use_start` / `event: tool_use_result` SSE frames alongside the existing `data:` delta frames. `run_tool_use_loop: str` kept unchanged so all 13 existing tests pass without modification.
- **Files modified:** `backend/app/services/coach_service.py`, `backend/tests/test_coach_service_tool_use.py`
- **Verification:** 452/452 backend tests green (446 baseline + 6 new: `TestRunToolUseLoopEvents` + `TestGenerateAnalyticalChatStream`). The new tests lock both the event generator's order (start→result→text) AND the SSE frame shape so the frontend contract is enforced.
- **Committed in:** `7651a77` (standalone commit, tagged `feat(06-01)` rather than `feat(06-03)` because it's a backend extension of the 06-01 contract)

---

**Total deviations:** 1 auto-fixed (Rule 3 — Blocking)
**Impact on plan:** The deviation was explicitly anticipated in the plan (Task 1 "Fix-up first" instructions). Frontend work proceeded with zero scope creep. No architectural changes — extended an existing contract rather than restructured.

## Issues Encountered

**1. `npm run build` + `tsc -b` wrappers failed (`sh: tsc: command not found` / `sh: vite: command not found`)** — the frontend `node_modules/.bin/` directory is empty on this machine even though the individual packages (`typescript/bin/tsc`, `vite/bin/vite.js`) are present. Worked around by invoking the bin files directly: `node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build`. No code change; worth flagging for future plans — a fresh `npm ci` would fix it but I didn't want to run that inside plan execution. Vite build green, dist output normal (~533 KB gzipped).

**2. First typecheck attempt of `useChatStream.ts` failed with `TS2352` on the `WorkoutModificationResult` cast** — `Record<string, unknown>` cannot be cast directly to the interface because `success` was declared `boolean` (required). Fixed by marking `success?: boolean` (already optional at the wire level anyway — backend may return `success=false` with `reason`) and using the `unknown`-bounce double-cast idiom.

## User Setup Required

None — no external service configuration required. Frontend build and backend tests both green on this machine.

Before production cutover (still outstanding from 06-02): restart Docker, run `alembic upgrade head` to apply `b9c4d1e8f2a3` (planned_workout modification fields), and smoke-test the full `/coach/chat` → UI flow via curl + a browser run against a seeded DB.

## Next Phase Readiness

Wave 3 (06-03) is **complete**. The full user-visible modification loop ships:
1. User opens chat, asks "I only have 45 min for Tuesday"
2. `currentToolUse` → `modify_planned_workout` → indicator "Updating your workout..." renders
3. Tool result arrives → `WorkoutModifiedCard` renders inline (before: Sweet-Spot 2×20 90 min → after: Sweet-Spot 2×20 45 min)
4. If rails downgraded: amber "Safety-adjusted" badge + reason visible next to the card
5. React Query invalidates `['planned-workouts']` + `['coach', 'brief']` → calendar + brief refetch without a page refresh
6. Flash "Workout updated" bar appears below drawer header for 2.4s
7. Coach narrates the change; TransparencyDrawer "Tools Used" now lists `modify_planned_workout` with the exact input+result that fired

**Wave 4 (06-04, next)** — multi-turn memory + undo affordance:
- `blocks_source='user_modified'` flag + `evidence.modification.before` payload are ready (shipped in 06-02). Undo should write a new audit row with `modification_type='undo'` to preserve the append-only contract.
- Multi-turn context passing: the current `useChatStream` sends the full `messages[]` on every send (stripped of role='tool' cards). Backend already handles that in `working_messages` normalisation. 06-04 will need to decide whether long conversations get summarisation or a hard cap.
- Undo button placement: probably a small "Undo" chip on WorkoutModifiedCard rendered only when the most-recent modification happened in-session. Tooltip in the card expansion area would also work.
- Transparency: undo should log its own tool_use_start/result frames so the Tools Used panel shows both the original modification and the undo as separate entries.

**Blockers/concerns for Wave 4:**
- Docker daemon still unresponsive (carried from 03-01). Every backend test here ran in the local `.venv`. Before production deploy: restart Docker, run migrations, integration-smoke `/coach/chat` end-to-end with a real FTP on the athlete profile.
- Rate limiter still in-memory — becomes a real issue when chat usage grows past the one-worker deploy.

---
*Phase: 06-ai-deep-coaching*
*Completed: 2026-04-21*
