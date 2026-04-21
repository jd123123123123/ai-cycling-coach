---
phase: 06-ai-deep-coaching
plan: 06-01
subsystem: ai-coaching
tags: [anthropic, tool-use, claude, chat, analytical, pmc, recovery, ftp]

requires:
  - phase: 05-ai-coaching-core
    provides: coach_service skeleton, rule-based fallback pattern, ED-keyword filter, prompt caching pattern
  - phase: 05.1-precision-prescription
    provides: template library, resolve_and_prescribe, snapshot shape
  - phase: 05.2-language-and-sync
    provides: system_prompt_for_language router, simple/technical jargon firewall, language-aware chat request schema
  - phase: 05.3-post-ride-review
    provides: ride_compliance + goal_trajectory functions reused by snapshot
  - phase: 02-03
    provides: compute_user_pmc (CTL/ATL/TSB math)
  - phase: 03-garmin-data-integration
    provides: DailyMetric + Activity tables populated by the sync service
provides:
  - backend/app/services/analytical_aggregates.py — 4 pure-async aggregators (PMC window, recovery trend, activity summary, FTP progression)
  - backend/app/services/coach_tools.py — Anthropic tool_use registry (5 read-only tools) + user-scoped dispatcher
  - backend/app/services/coach_service.py::run_tool_use_loop — max-iteration-bounded Claude tool_use loop with parallel dispatch + is_error recovery
  - backend/app/services/coach_service.py::generate_analytical_chat_stream — SSE wrapper over run_tool_use_loop with ED-filter on final buffer
  - backend/app/services/coach_service.py::_fallback_analytical_answer — deterministic no-API-key path ("why tired" + "last N weeks")
  - backend/app/services/coach_prompt.py::CHAT_ANALYTICAL_PROMPT_{SIMPLE,TECHNICAL} — tool-use system prompt variant wired via system_prompt_for_language(context="chat_analytical")
  - /coach/chat no longer 503s without ANTHROPIC_API_KEY; streams fallback answer
affects: [06-02, 06-03, 06-04]

tech-stack:
  added: [anthropic-tool-use]
  patterns: [tool-use-loop, parallel-tool-dispatch, deterministic-llm-fallback, user-scoped-tool-dispatch]

key-files:
  created:
    - backend/app/services/analytical_aggregates.py
    - backend/app/services/coach_tools.py
    - backend/tests/test_analytical_aggregates.py
    - backend/tests/test_coach_tools.py
    - backend/tests/test_coach_service_tool_use.py
  modified:
    - backend/app/services/coach_prompt.py
    - backend/app/services/coach_service.py
    - backend/app/api/coach.py

key-decisions:
  - "Authenticated user_id is the ONLY accepted identity; dispatcher strips user_id/uid/owner_id/userId from tool_input before calling handlers — LLM cannot spoof"
  - "5 read-only tools (pmc_window, recovery_trend, recent_activities, ftp_history, planned_workout) cover the Phase 6 analytical surface. No write tools in 06-01 (workout modification is 06-02)"
  - "Defense-in-depth clamps: recovery days [1,90], activity limit [1,50] enforced in dispatcher (schemas also advertise the range)"
  - "Max 5 tool_use iterations — after that, return 'Analysis exceeded tool-use budget' instead of spinning. Safety net vs runaway LLM"
  - "dispatch_tool exception → tool_result with is_error=True (not raise) so Claude can recover in the next turn. Tool failures never crash the loop"
  - "Tool descriptions are LOAD-BEARING: they name the question patterns each tool answers ('last N weeks' → pmc_window, 'why am I tired?' → recovery_trend). Claude's picker reads these; investment here pays off on every call"
  - "Prompt caching preserved: system_prompt_for_language(language, context='brief') returns the exact existing string (default context='brief') so /coach/brief cache stays warm. context='chat_analytical' is a NEW cache entry"
  - "Fallback regex order: 'last N weeks' first, then 'why tired' — so 'why am I tired in the last 2 weeks' routes to the specific range summary rather than the generic rationale"
  - "Fallback 'why tired' reuses _rule_based_brief rationale verbatim — the answer matches /coach/brief fallback tone exactly; no new narrative infra"
  - "Fallback 'last N weeks' summary uses plain-English direction language (building→'fitness has been climbing', overreaching→'digging a deep hole') in simple mode; technical mode cites Banister + actual numbers"
  - "run_tool_use_loop returns str, caller (generate_analytical_chat_stream) chunks to ~20-char SSE deltas — synchronous-tools-before-stream pattern per Anthropic docs"
  - "/coach/chat now works WITHOUT ANTHROPIC_API_KEY (was 503). Degrades to deterministic fallback matching the 05-01 invariant 'every LLM path has a rule-based fallback'"
  - "pmc_window_summary slices compute_user_pmc output rather than rewriting the EWMA math — single source of truth for CTL/ATL/TSB stays in pmc_service"
  - "recovery_trend_summary flag thresholds: low_hrv @ ≤-10% vs 28d baseline, sleep_debt @ ≥5 short nights in window, rhr_elevated @ ≥+5% vs 28d baseline — matches advanced_metrics.why_am_i_tired convention"
  - "FTP trend label thresholds: ±2% over 30d → improving/declining/stable. Tighter than PMC's ±1.5 because FTP is a deliberate test/measurement, not an EWMA"

patterns-established:
  - "Tool-use loop: Anthropic messages.create with tools= → dispatch tool_use blocks in parallel → append assistant message + list of tool_result blocks as next user message → loop until end_turn or max_iterations"
  - "User-scoped dispatcher: strip identity-like keys from tool_input before passing to handler; authenticated user_id is authoritative"
  - "Deterministic LLM fallback: every chat path has a regex-pattern-matched fallback so the feature degrades gracefully without API access"
  - "Chunked-final-text SSE streaming: when the answer must be synthesised BEFORE streaming (as in tool-use), emit ~20-char deltas so UI still feels streaming"
  - "System-prompt context routing: system_prompt_for_language(language, context) returns different prompts per use-case (brief vs chat_analytical); default context preserves prompt-cache hashes"

duration: ~95min
completed: 2026-04-21
---

# Phase 6 Plan 06-01: Analytical Tool-Use Backend Summary

**Claude tool-use loop on /coach/chat with 5 read-only tools (PMC / recovery / activities / FTP / planned) and a deterministic fallback covering 'why am I tired?' + 'last N weeks' — /coach/chat now answers arbitrary analytical questions grounded in real data, with or without an API key.**

## Performance

- **Duration:** ~95 min
- **Started:** 2026-04-21T14:21Z (approx)
- **Completed:** 2026-04-21T15:22Z
- **Tasks:** 3 (all autonomous, TDD)
- **Files modified:** 3
- **Files created:** 5
- **Tests:** 52 new (19 + 21 + 13 – minus the 1 shared system-prompt fixture counted twice = 52 net); 371/371 green (was 319)

## Accomplishments

- **analytical_aggregates.py** — 4 pure aggregation functions that slice existing pmc_service / advanced_metrics output into the shapes the LLM / fallback expect. JSON-safe ISO-date strings throughout.
- **coach_tools.py** — Anthropic tool_use registry with Claude-picker-tuned descriptions. The dispatcher is security-hardened (user_id spoofing is ignored) and has defense-in-depth clamps on every numeric input.
- **run_tool_use_loop + deterministic fallback** — full Phase 6 chat surface lands without breaking the 05-series invariants (prompt caching on brief path, ED-keyword filter, rate limiter). With an API key: Claude calls tools, gets real data, writes the narrative. Without: regex dispatches to fatigue synthesiser or PMC-window template.
- **/coach/chat upgrade** — endpoint no longer 503s without an API key; streams the deterministic fallback instead (matches the 05-01 design rule "every LLM path has a rule-based fallback").
- **chat_analytical system prompts** — simple + technical variants, both list every tool with explicit question-pattern cues and typical tool-call combos so Claude picks well on its first turn.

## Tool Registry Inventory

| Tool name | Input | Aggregator called | Purpose |
|---|---|---|---|
| `fetch_pmc_window` | `{start_date, end_date}` | `pmc_window_summary` | Per-day CTL/ATL/TSB + trend classification (building/maintaining/freshening/overreaching) |
| `fetch_recovery_trend` | `{days?}` (default 14, clamp [1,90]) | `recovery_trend_summary` | Sleep/HRV/rHR per day + flags (low_hrv, sleep_debt, rhr_elevated) |
| `fetch_recent_activities` | `{limit?=10, sport_filter?}` (clamp [1,50]) | `activity_summary` | Last N rides with IF, EF, decoupling, zone + sport_mix aggregate |
| `fetch_ftp_history` | `{}` | `ftp_progression_summary` | FTP timeline with 30d/90d deltas + trend label |
| `fetch_planned_workout` | `{date}` | (direct ORM read) | Planned workout for a date or `{found: false}` |

All tools pass `user_id` as authoritative first-class parameter. Any `user_id`-like key in `tool_input` (`user_id`, `uid`, `owner_id`, `userId`) is stripped before the handler is called.

## Task Commits

Each task followed RED → GREEN:

1. **Task 1: analytical-aggregates-service**
   - `f282de1` — test(06-01): analytical aggregate service tests (RED)
   - `f3c155e` — feat(06-01): analytical aggregates for PMC window, recovery trend, activities, FTP
2. **Task 2: tool-registry-and-dispatcher**
   - `ba3147f` — test(06-01): coach tool registry + dispatcher tests (RED)
   - `2f7904d` — feat(06-01): tool registry with 5 read-only tools + user-scoped dispatcher
3. **Task 3: tool-use-loop-and-chat-endpoint-fallback**
   - `1371575` — test(06-01): tool-use loop + fallback tests (RED)
   - `930780d` — feat(06-01): coach chat tool-use loop with deterministic fallback

(Metadata commit follows this summary.)

## Files Created/Modified

**Created:**
- `backend/app/services/analytical_aggregates.py` — 4 pure aggregators (~400 LOC)
- `backend/app/services/coach_tools.py` — registry + dispatcher (~200 LOC)
- `backend/tests/test_analytical_aggregates.py` — 18 test cases (~400 LOC)
- `backend/tests/test_coach_tools.py` — 21 test cases (~330 LOC)
- `backend/tests/test_coach_service_tool_use.py` — 13 test cases (~370 LOC)

**Modified:**
- `backend/app/services/coach_prompt.py` — +CHAT_ANALYTICAL_PROMPT_{SIMPLE,TECHNICAL} + `context` param on `system_prompt_for_language`
- `backend/app/services/coach_service.py` — +`run_tool_use_loop`, +`_fallback_analytical_answer`, +`_fallback_why_tired`, +`_fallback_last_n_weeks`, +`generate_analytical_chat_stream`, +lazy `_get_anthropic_client`
- `backend/app/api/coach.py` — `/coach/chat` now streams the analytical loop; removed 503-without-key guard (fallback handles it)

## System Prompt Addition (chat_analytical variant)

**Shared `_CHAT_TOOLS_BLOCK`** (concatenated into both language variants):
- Names every tool with input shape + when-to-use cue
- Typical combos:
  - "Why am I tired?" → fetch_recovery_trend(14) + fetch_pmc_window(last 14d) + fetch_recent_activities(5)
  - "Analyze my last N weeks" → fetch_pmc_window(last N weeks) + fetch_recovery_trend(N*7)
  - "How's my FTP trending?" → fetch_ftp_history() + fetch_pmc_window(last 90d)
- Encourages parallel tool_use in a single response

**Simple variant:** inherits the 05.2 jargon firewall (no FTP/TSS/CTL/TSB/zone numbers/framework names) and adds tool-result-to-plain-language translation hints (CTL → "your training fitness", HRV drop → "your body's showing signs of fatigue").

**Technical variant:** preserves Banister/Coggan/Seiler/San Millán/Friel/Mujika naming with a ≤5-word parenthetical the first time a jargon term appears.

**Backward-compat:** `system_prompt_for_language(language)` with no `context` argument returns the exact same SYSTEM_PROMPT_SIMPLE / SYSTEM_PROMPT_TECHNICAL strings as before. `/coach/brief`'s prompt cache keeps the same hash — zero cache cost.

## Fallback Path Regex Patterns

Defined in `coach_service.py`:

```python
_WHY_TIRED_RE = re.compile(
    r"\b(why.*(tired|fatigued|exhausted|wiped|beat|drained)|recover)\b",
    re.IGNORECASE,
)
_LAST_N_WEEKS_RE = re.compile(
    r"(?:last|past|previous)\s+(\d{1,2})\s+weeks?",
    re.IGNORECASE,
)
```

**Priority:** `_LAST_N_WEEKS_RE` runs before `_WHY_TIRED_RE` so a prompt like "why am I tired in the last 2 weeks" routes to the specific PMC-window summary rather than the generic fatigue narrative.

**N clamp:** captured week count clamped to [1, 12] (single quarter cap — beyond that the PMC EWMA decay window matters more than the aggregate).

**No-match:** polite refusal mentioning the ANTHROPIC_API_KEY upgrade path. Simple-mode copy: *"Chat with the full coach needs the upgrade … Without it I can still tell you 'why am I tired?' or walk you through 'my last N weeks' — ask me either of those and I've got you."*

## Test Count Delta

| Area | Before | After | New |
|---|---|---|---|
| Full suite | 319 | 371 | +52 |
| analytical_aggregates | 0 | 18 | +18 |
| coach_tools | 0 | 21 | +21 |
| coach_service_tool_use | 0 | 13 | +13 |

All 371 green; 0 regressions.

## Decisions Made

See frontmatter `key-decisions` for the full 15-item list. Highlights:

1. **User-id spoofing ignored** — dispatcher strips `user_id`/`uid`/`owner_id`/`userId` from `tool_input` before calling handlers.
2. **Max 5 tool_use iterations** — after that, return partial-result notice instead of infinite-looping.
3. **Dispatch errors → `is_error` tool_result** (never raise) — Claude can self-correct on the next turn.
4. **Backward-compat prompt cache** — `system_prompt_for_language(language)` with no context kwarg returns the exact prior strings; `/coach/brief`'s cache stays warm.
5. **Fallback regex order: `last N weeks` before `why tired`** — specific beats generic.
6. **`/coach/chat` no longer 503s without a key** — streams deterministic fallback instead.
7. **Tool descriptions name question patterns** — Claude's picker reads them; invest in description quality.

## Deviations from Plan

**None that required user decision.** Minor implementation choices diverged from the plan text but stayed within its intent:

**1. [Rule 3 - Blocking] Docker unavailable — switched to local venv for test execution**
- **Found during:** pre-task-1 baseline check
- **Issue:** Docker daemon not running (noted in STATE blockers since 03-01); plan verification strings reference `docker compose exec backend pytest`
- **Fix:** Rebuilt `/backend/.venv` with python3.13 from homebrew and installed `.[dev]` editable. All tests run locally via `.venv/bin/pytest` (no DB required — every DB interaction is mocked)
- **Files modified:** `backend/.venv/` (not committed; git-ignored)
- **Verification:** 371/371 pytest passes locally
- **Not committed:** venv is dev tooling

**2. [Intent-matching, not a rule fix] Plan called for `post_ride_review`-style `result = "rest_day"` in `fetch_planned_workout`; I return the ORM row shape**
- **Found during:** Task 2 (tool handler shape)
- **Decision:** Plan said `{template_id, target_tss, scheduled_date, blocks, blocks_source, notes}`, but PlannedWorkout ORM has `{id, title, sport, date, duration_seconds_target, description, interval_structure}` — no `template_id`/`target_tss` fields in Phase 4 schema
- **Fix:** Return the actual ORM fields under pragmatic names (`title`, `scheduled_date`, `target_duration_seconds`, `description`, `blocks: interval_structure`). Plan's schema was aspirational for a future Phase 7 PlannedWorkout extension
- **Files modified:** `backend/app/services/coach_tools.py`
- **Verification:** test_coach_tools.TestFetchPlannedWorkout::test_found_returns_workout_shape passes
- **Committed in:** `2f7904d`

**3. [Intent-matching] Plan listed `coach_chat_stream` as existing; I added `generate_analytical_chat_stream` rather than modifying it**
- **Found during:** Task 3 (API endpoint wiring)
- **Decision:** `coach_chat_stream` (the old 05.x path with inline snapshot in the user message) is still useful for future non-analytical chat; kept as-is and added a new stream function that wraps the tool-use loop. `/coach/chat` now calls the new one
- **Files modified:** `backend/app/services/coach_service.py`, `backend/app/api/coach.py`
- **Verification:** 13 new tests for the tool-use loop + full suite green
- **Committed in:** `930780d`

---

**Total deviations:** 1 auto-fix (1 blocking — Docker unavailable). Two intent-matching implementation choices documented for traceability.
**Impact on plan:** None on the surface area promised. Plan's verify block references `docker compose exec backend pytest`; actual verification was the same command against a local venv. The tests themselves pass and cover every acceptance criterion.

## Issues Encountered

- **Docker daemon inactive** — fell back to local python3.13 venv. Smoke-test the `/coach/chat` endpoint with a curl against a local uvicorn is therefore deferred to Task 3 of plan 06-02 (once the DB migration + live Anthropic key are provisioned). All code paths are unit-tested with mocks.
- **No other issues.** TDD cycle ran clean for all three tasks; every RED test failed as expected before implementation and passed after.

## Next Phase Readiness

**Wave 1 (this plan, 06-01) is complete.** The following are now stable and consumable by Waves 2–4:

- `coach_tools.TOOL_SCHEMAS` + `coach_tools.TOOL_REGISTRY` + `coach_tools.dispatch_tool` — **06-02 extends this registry** with write tools (workout modification). The dispatcher's user-scoping pattern is the template.
- `coach_service.run_tool_use_loop` — **06-02 can reuse this function** for its modification flow (add write tools to the registry, reuse loop).
- `coach_prompt.system_prompt_for_language(language, context)` — **06-02 adds `context='chat_modification'`**; `context='brief'` stays the default so existing caches are safe.
- `coach_service.generate_analytical_chat_stream` — **06-03 (UI)** consumes this exact SSE contract (delta / replace / done frames).
- `backend/app/schemas/coach.ChatRequest` — **06-04 (conversation persistence)** may extend `messages: list[ChatMessage]` with more than one turn; the backend already accepts multi-turn `messages` lists.

**Pending before launch:**
- Provision `ANTHROPIC_API_KEY` in production — until then `/coach/chat` runs the fallback path (still useful but limited to fatigue + last-N-weeks patterns).
- Move in-memory chat rate limiter to Redis when scaling past a single uvicorn worker (pre-existing concern from 05-01, unchanged).
- Wire 06-02's workout-modification tools into the same registry; do not land concurrent edits on `coach_tools.py` / `coach_service.py` without rebasing on top of this commit (`930780d`).

**Performance note:** each analytical answer runs at most 5 Claude round-trips (one per tool_use iteration). Tool dispatches are local async calls (no external HTTP), so the wall-clock is dominated by the Claude API. Typical conversation: 2 round-trips (tools → text). Prompt caching keeps the system-prompt tokens cheap within the 5-min cache window — same behaviour as `/coach/brief`.

---

*Phase: 06-ai-deep-coaching*
*Completed: 2026-04-21*
