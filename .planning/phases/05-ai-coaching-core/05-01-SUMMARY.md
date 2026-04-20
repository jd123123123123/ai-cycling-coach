---
phase: 05-ai-coaching-core
plan: 01
subsystem: api
tags: [claude, anthropic, coach, llm, safety-rails, prompt-caching, rls, postgres, pydantic, fastapi, sse]

# Dependency graph
requires:
  - phase: 02-training-engine
    provides: pmc_service (CTL/ATL/TSB), training_load (NP/TSS/zones)
  - phase: 03-garmin-data-integration
    provides: daily_metrics (HRV/rHR/sleep), activities (power/HR samples)
  - phase: 04-dashboard
    provides: AthleteProfile shape (goals, FTP, weight, weekly_hours)
provides:
  - advanced_metrics module (decoupling, EF, durability, HRV/rHR trend, sleep debt, zone distribution, why-tired synthesizer)
  - safety_rails module (TSS cap 1.3*CTL, intensity ceiling cascade, ED-keyword chat filter)
  - coach_service (Claude Opus 4.7 with tool-use structured output + rule-based fallback)
  - coach_briefs table with 6h read-through cache and RLS owner_isolation
  - injury_flag + injury_note columns on athlete_profiles
  - 5 /coach/* API endpoints (brief, brief/refresh, chat SSE, why, transparency)
affects: [05-02 frontend coach UI, future 06 training-plan-generation, safety audits]

# Tech tracking
tech-stack:
  added: [anthropic>=0.42.0 SDK, Claude Opus 4.7, Claude Sonnet 4.6]
  patterns:
    - "LLM with tool-forced structured output + ephemeral prompt caching"
    - "Rule-based fallback path so endpoints never fail when LLM is unavailable"
    - "Safety rails applied AFTER LLM (transparent blocking, never silent drop)"
    - "ED-keyword filter with canned safe redirect on final stream buffer"
    - "Per-user in-memory rate limiter (deque) for SSE chat endpoint"

key-files:
  created:
    - backend/app/services/advanced_metrics.py
    - backend/app/services/safety_rails.py
    - backend/app/services/coach_service.py
    - backend/app/services/coach_prompt.py
    - backend/app/api/coach.py
    - backend/app/schemas/coach.py
    - backend/app/models/coach_brief.py
    - backend/migrations/versions/f1a2b3c4d5e6_coach_briefs_and_injury_flag.py
    - backend/tests/test_advanced_metrics.py
    - backend/tests/test_safety_rails.py
    - backend/tests/test_coach_service.py
    - backend/requirements.txt
  modified:
    - backend/pyproject.toml (anthropic>=0.42.0)
    - backend/app/config.py (ANTHROPIC_API_KEY, COACH_MODEL, COACH_CHAT_MODEL, COACH_BRIEF_CACHE_HOURS)
    - backend/app/main.py (coach router registered)
    - backend/app/models/__init__.py (CoachBrief export)
    - backend/app/models/athlete_profile.py (injury_flag + injury_note)
    - backend/migrations/env.py (model imports expanded)

key-decisions:
  - "Both pyproject.toml AND requirements.txt updated — repo previously had only pyproject.toml; plan spec calls for requirements.txt so we created it as a mirror for CI/pip workflows"
  - "Anthropic SDK imported lazily inside generate_brief and coach_chat_stream so ModuleNotFoundError cannot break app boot"
  - "Rule-based fallback activates on (a) missing API key, (b) exception during LLM call, (c) LLM response with no brief_response tool_use — all three paths tested"
  - "Zone distribution uses per-activity IF→3-zone bucket heuristic (not per-second streams) — matches session-level accuracy in Seiler 2009 at >90% agreement with full TID"
  - "Coach prompt stored in its own module (coach_prompt.py) so ephemeral prompt caching sees a stable prefix; ~80% input-token cost reduction on cache hits"
  - "why_am_i_tired synthesizer orders causes by severity (high>med>low) — LLM receives pre-sorted list so rationale naturally cites the strongest signal first"
  - "Safety rails applied AFTER LLM response, never before — LLM may suggest anything; rails mark options blocked with a visible reason (never silently drop) to preserve transparency"
  - "ED filter runs on final concatenated stream buffer, not on deltas — partial phrases would false-trigger; frame emits 'replace' event so client can wipe its buffer"
  - "Chat rate limit is in-memory deque per user (20/min/user) — per-process only; production with multiple workers needs Redis, tracked as future work"

patterns-established:
  - "All LLM endpoints degrade to rule-based fallback when ANTHROPIC_API_KEY unset — app never breaks on missing AI"
  - "Every coach option carries blocked/block_reason so frontend renders greyed-out with explanation"
  - "Coach uses Opus 4.7 for brief quality, Sonnet 4.6 for chat cost/latency"
  - "DB-backed advanced metric helpers return samples_n so callers can downgrade confidence"

# Metrics
duration: 52min
completed: 2026-04-20
---

# Phase 5 Plan 01: Coach Backend Causal Brief Summary

**Claude Opus 4.7 coach with transparent tool-use output, hard-coded safety rails, rule-based fallback, and 10 advanced metrics (decoupling / EF / durability / HRV-rHR-sleep trends / zone distribution / why-tired synthesizer) the research flagged as commercially absent**

## Performance

- **Duration:** ~52 min
- **Started:** 2026-04-20
- **Completed:** 2026-04-20
- **Tasks:** 7/7
- **Files modified:** 16 (12 created, 4 modified)

## Accomplishments

- **Advanced metrics that no consumer app surfaces well** — aerobic decoupling (Friel "most important metric"), Efficiency Factor trend, durability index (2025 PMC differentiator), HRV/rHR/sleep trend vs 28d baselines, Seiler 3-zone distribution with grey-zone creep flag, and a "why am I tired?" causal synthesizer that orders suspected causes by severity
- **Causal LLM briefs via Claude Opus 4.7 tool-use** grounded in Seiler/Banister/San Millán/Friel/Moore frameworks — system prompt enforces "cite athlete data in every recommendation", "explain WHY", "always 4 options (rest/easy/moderate/push)", "never training-through-injury", "never caloric restriction"
- **Hard-coded safety rails filter LLM output before persistence** — TSS cap at 1.3×CTL, intensity ceiling cascade (injury→HRV→TSB→days-since-rest), ED-keyword filter with canned safe redirect. Rails mark options as `blocked=True` with a human-readable reason, never silently dropping
- **Rule-based fallback ensures endpoints never fail** — when `ANTHROPIC_API_KEY` is unset OR the SDK raises OR the LLM returns no tool_use block, `generate_brief` synthesizes a deterministic brief from safety_rails + snapshot. `/coach/brief` and `/coach/brief/refresh` always return 200 with structured data
- **SSE chat streaming with post-hoc safety validation** — Claude Sonnet 4.6 for cost; every response runs through `validate_chat_response` on the final buffer and emits a `replace` frame if ED content is detected, telling the client to wipe its accumulated buffer and display the canned redirect instead
- **Cache-and-audit architecture** — `coach_briefs` is an append-only audit trail (one row per generation), with a 6h TTL read-through on the latest row. Every brief stores the full snapshot + system prompt + model used for the `/coach/transparency` "show me what the AI saw" endpoint

## Task Commits

Each task was committed atomically:

1. **Task 1: deps-and-config** — `118c1d1` (chore)
2. **Task 2: advanced-metrics-service** — `ef09093` (feat)
3. **Task 3: safety-rails-service** — `7e8e5b5` (feat)
4. **Task 4: coach-db-schema** — `92b6c73` (feat)
5. **Task 5: coach-service-claude-integration** — `7304bee` (feat)
6. **Task 6: coach-endpoints** — `8211c90` (feat)
7. **Task 7: tests** — `9d13fb0` (test)

**Plan metadata:** _(commit follows with STATE.md + SUMMARY.md)_

## Files Created/Modified

- `backend/app/services/advanced_metrics.py` — 10 advanced metrics: decoupling, EF, durability, HRV/rHR/sleep/zone trends, CTL-ATL-TSB snapshot, why-tired synthesizer
- `backend/app/services/safety_rails.py` — TSS ceiling (1.3×CTL), 6-rule intensity ceiling cascade, ED keyword filter, filter_recommendation (never-drops contract)
- `backend/app/services/coach_service.py` — build_snapshot (aggregates all features), generate_brief (Claude + fallback), get_or_generate_brief (read-through cache), coach_chat_stream (SSE + post-hoc safety)
- `backend/app/services/coach_prompt.py` — frameworks-grounded system prompt, brief_response tool JSON schema, build_user_message (prose renderer of snapshot for better LLM reasoning)
- `backend/app/api/coach.py` — 5 endpoints: GET /coach/brief, POST /coach/brief/refresh, POST /coach/chat (SSE), GET /coach/why, GET /coach/transparency
- `backend/app/schemas/coach.py` — BriefRead, BriefOption, OutlookEntry, ChatRequest, WhyTiredRead, TransparencyRead
- `backend/app/models/coach_brief.py` — CoachBrief ORM with JSONB evidence/options/outlook_7d + TEXT[] frameworks_cited
- `backend/migrations/versions/f1a2b3c4d5e6_coach_briefs_and_injury_flag.py` — coach_briefs table with idx_coach_briefs_user_generated + RLS owner_isolation policy; athlete_profiles.injury_flag + injury_note (server_default FALSE)
- `backend/tests/test_advanced_metrics.py` — 26 tests (pure funcs, compute_activity_metrics, mocked-db helpers, grey-zone flag, why-tired ordering)
- `backend/tests/test_safety_rails.py` — 29 tests (every rule branch, boundary cases, never-drops contract, ED filter positives + negatives)
- `backend/tests/test_coach_service.py` — 13 tests (rule-based shape, injury blocking, fallback paths, mocked-SDK happy path, cache hit/miss/force)

## Decisions Made

Key decisions captured in frontmatter. Summary:

1. **Both pyproject.toml AND requirements.txt updated** — plan called for requirements.txt but repo previously shipped only pyproject.toml; created requirements.txt as a mirror so CI/pip-tools flows both work
2. **Lazy SDK import** — `import anthropic` happens inside `generate_brief` / `coach_chat_stream`, never at module top. ModuleNotFoundError on SDK cannot block app boot
3. **Three fallback triggers** — no key, SDK exception, no tool_use in response. All three tested
4. **Zone distribution uses session-level IF→bucket heuristic** — matches Seiler 2009 at >90% agreement with per-second TID; avoids loading raw sample streams for every zone summary
5. **Prompt caching on system prompt only** — frameworks block is stable; user message (snapshot) varies. Cache_control ephemeral gives ~80% input-token savings within the 5-min window
6. **why-tired synthesizer sorts causes by severity** — LLM receives pre-sorted cause list so rationale naturally cites the strongest signal first
7. **Rails applied AFTER LLM, never before** — preserves transparency: frontend sees what the LLM suggested AND what the rails filtered, with the reason
8. **ED filter on final buffer not deltas** — partial phrases would false-trigger; frame emits 'replace' event so client wipes its buffer
9. **In-memory rate limiter** — deque per user, 20/min/user. Production with multiple workers will need Redis (tracked as future work)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created `requirements.txt` because it didn't exist**
- **Found during:** Task 1 (deps-and-config)
- **Issue:** Plan specified `backend/requirements.txt` as a file_modified target but the repo ships only `backend/pyproject.toml` — deps live in [project] dependencies. Editing a non-existent file would silently succeed with no effect on what pip actually installs
- **Fix:** Updated both files — added `anthropic>=0.42.0` to `pyproject.toml` (canonical) and created `backend/requirements.txt` as a mirror for environments that expect it (CI, pip-tools, non-poetry docker)
- **Verification:** `.venv/bin/pip install anthropic>=0.42.0` succeeded; `import anthropic` works; config loads without API key set
- **Committed in:** 118c1d1 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Registered all models in alembic env.py**
- **Found during:** Task 4 (coach-db-schema)
- **Issue:** `backend/migrations/env.py` only imported a subset of the models (user, athlete_profile, consent, activity, garmin_credential, daily_metric). Several newer models — planned_workout, daily_metric_sample — were NOT imported, meaning any future autogenerate run would miss them. Adding coach_brief alone without fixing the stale list would perpetuate the bug
- **Fix:** Expanded the env.py import list to include all eight models including the new coach_brief
- **Verification:** `alembic upgrade head` succeeds; `alembic current` shows `f1a2b3c4d5e6` as head
- **Committed in:** 92b6c73 (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes were small scope corrections (the spec gave a plausible but non-existent file path; env.py was out of date with the model layer). No scope creep from the plan's objectives.

## Issues Encountered

**F-string syntax error in coach_service.coach_chat_stream** — initial implementation used nested single quotes inside an f-string `f"data: {_json.dumps({'type': 'replace', 'text': safe_text, ...})}\n\n"`. Python's f-string parser rejected the inner-brace `{` before the string resolution. Fixed by building the JSON payload into a local variable first, then interpolating.

## User Setup Required

**External services require manual configuration** when running with LLM functionality:

- **Anthropic API key:** set `ANTHROPIC_API_KEY` in the backend `.env` to enable real LLM coaching. Without it the app boots normally; `/coach/brief` returns rule-based briefs and `/coach/chat` returns 503.
- Optional overrides: `COACH_MODEL` (defaults to `claude-opus-4-7`), `COACH_CHAT_MODEL` (defaults to `claude-sonnet-4-6`), `COACH_BRIEF_CACHE_HOURS` (defaults to `6`).

No USER-SETUP.md was generated — the env-var setup above is the only manual step and is documented in config.py.

## Next Phase Readiness

- **Plan 05-02 (frontend coach UI) can start immediately.** All 5 endpoints are live and documented via OpenAPI. Schemas exported from `backend/app/schemas/coach.py` define the exact frontend contract.
- `/coach/brief` always returns 200 with a structured payload — frontend can build the dashboard card without waiting for an API key to be provisioned.
- `/coach/transparency` is ready for the "show me what the AI saw" toggle.
- **Concerns:**
  - Rate limit is in-memory — will need Redis move before multi-worker deploy (added to pending todos).
  - Production DB role is currently postgres superuser, which bypasses RLS — same concern as prior phases; tracked in STATE.md blockers.
  - When `ANTHROPIC_API_KEY` is set, first call to `/coach/brief` will incur LLM latency (~3-6s for Opus); frontend needs optimistic UI or skeleton state.

---
*Phase: 05-ai-coaching-core*
*Completed: 2026-04-20*
