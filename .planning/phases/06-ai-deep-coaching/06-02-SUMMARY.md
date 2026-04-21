---
phase: 06-ai-deep-coaching
plan: 06-02
subsystem: ai-coaching

tags: [anthropic, tool-use, claude, workout-modification, safety-rails, audit-trail, sqlalchemy, alembic, pytest]

# Dependency graph
requires:
  - phase: 06-01 (analytical tool-use backend)
    provides: TOOL_REGISTRY + dispatch_tool + run_tool_use_loop (user-scoped, ignores tool_input identity; max_iterations=5 safety net; is_error recovery path) — all reused unchanged for the write tool
  - phase: 05.1 (precision-prescription)
    provides: 12-template library + parametrize_template (server-side watts authority + ±15% duration clamp) + _safe_template_for_ceiling mapping — cascade + downgrade logic re-uses these
  - phase: 05-01 (ai-coaching-core)
    provides: coach_briefs as append-only audit trail; rails_applied_after_LLM transparency contract (mark downgraded, never silent)
  - phase: 03 (garmin-integration)
    provides: Activity ORM — drives already-trained-today rejection guard

provides:
  - modify_planned_workout tool — the first WRITE tool in the coach chat tool-use loop; LLM can now execute "I only have 45 min", "make it harder", "swap to indoor" requests
  - workout_modifier service — pure modification operations (shorten, lengthen, harder, easier, indoor) with rails-aware downgrade cascade; no DB I/O so trivially testable
  - TEMPLATE_HARDER_CASCADE + TEMPLATE_EASIER_CASCADE — ordered template traversal keyed on intensity category (rest→recovery→endurance→tempo→sweet_spot→threshold→vo2), NOT raw TSS (z2_long_180 at 135 TSS is not "harder" than tempo_3x10 at 70 TSS)
  - Audit row shape coach_briefs.evidence.modification = {date, modification_type, params, before, after, rails_downgraded, reason, rails_context_at_time} — append-only, model_used='tool-use-modify'
  - PlannedWorkout schema: indoor (bool default false) + blocks_source (varchar default 'ai_prescribed') + template_id (varchar nullable) — enables undo affordance in 06-04
  - CHAT_MODIFICATION_PROMPT_{SIMPLE,TECHNICAL} — new context='chat_modification' variant in system_prompt_for_language; instructs LLM to narrate rails downgrades honestly in both language modes

affects:
  - 06-03 (chat UI surfaces modifications) — consumes the tool_result shape this plan emits
  - 06-04 (multi-turn context + undo affordance) — blocks_source='user_modified' marker + audit-row before-state enable undo
  - 07 (periodization engine) — template_id column on PlannedWorkout establishes the link to the 12-template library
  - all future write tools — this plan establishes the write-tool pattern (rails-aware, audit-rowed, ValueError→tool_result pattern instead of raise)

# Tech tracking
tech-stack:
  added: []  # no new dependencies — reuses Anthropic SDK + sqlalchemy + alembic already in repo
  patterns:
    - "rails-downgrade-transparency: every rails-blocked modification returns a non-error tool_result with rails_downgraded=True + reason; LLM narrates the downgrade; never silent (preserves 05-01 contract)"
    - "audit-trail-via-coach-briefs: write tools append to the same immutable JSONB evidence column used for AI briefs, keyed by verdict='modification'; no new table, no new migration for the audit shape"
    - "tool-use-write-pattern: handler loads → guards (user-scope, already-trained, missing-FTP) → delegates to pure modifier → persists + audits in ONE transaction → returns structured tool_result; ValueError→{success:False,reason} (never raises back to Claude)"
    - "cascade-by-intensity-category: template cascades traverse physiological intensity (rest→recovery→endurance→tempo→sweet_spot→threshold→vo2), NOT raw TSS, because a long Z2 ride has higher TSS than a short threshold session but is not 'harder'"

key-files:
  created:
    - "backend/app/services/workout_modifier.py - 606 LOC pure modification service (no DB I/O). apply_modification + ORDERED_TEMPLATES + TEMPLATE_HARDER/EASIER_CASCADE + ModificationResult dataclass + _SAFE_TEMPLATE_FOR_CEILING mapping + _cascade_toward_duration helper."
    - "backend/tests/test_workout_modifier.py - 359 LOC. 30 tests: cascade monotonicity, per-modification-type contract, injury override parametrized across all 5 types, error handling."
    - "backend/tests/test_workout_modifier_safety_rails.py - 351 LOC. 35 tests: every modification_type × every rails scenario, precedence matrix (injury > ceiling > intent), transparency contract (reason strings non-empty, rail-specific), materialisation contract (blocks always have absolute watts)."
    - "backend/migrations/versions/b9c4d1e8f2a3_planned_workout_modification_fields.py - adds indoor/blocks_source/template_id columns with server_defaults (no backfill needed)"
  modified:
    - "backend/app/services/coach_tools.py - TOOL_SCHEMAS += modify_planned_workout schema; _handle_modify_planned_workout handler (user-scoped, already-trained guard, rails context loader, audit row writer); TOOL_REGISTRY += modify_planned_workout"
    - "backend/app/services/coach_prompt.py - PromptContext expanded to 'chat_modification'; CHAT_MODIFICATION_PROMPT_{SIMPLE,TECHNICAL} added with _CHAT_MODIFICATION_BLOCK (write-tool instructions + rails-downgrade narration rules)"
    - "backend/app/models/planned_workout.py - +indoor +blocks_source +template_id columns"
    - "backend/tests/test_coach_tools.py - test_five_tools_registered → test_six_tools_registered; 10 new TestModifyPlannedWorkout cases"

key-decisions:
  - "[06-02]: Cascade ordering by intensity category, NOT by raw TSS — z2_long_180 (135 TSS) is not 'harder' than tempo_3x10 (70 TSS); the mental model is physiological intensity, not workload"
  - "[06-02]: Write-tool ValueError becomes {success: False, reason: ...} (never raises) — keeps the Claude tool-use loop healthy; lets the LLM self-correct on the next turn; mirrors 06-01's is_error-tool-result recovery pattern"
  - "[06-02]: Already-trained-today guard lives in the TOOL HANDLER (not in apply_modification) because it requires DB lookup — the modifier stays pure (no DB coupling). The handler's guard fires BEFORE the modifier is called; no PW mutation, no audit row on rejection. Mirrors resolve_and_prescribe's post_ride override semantics."
  - "[06-02]: Rails context read from the latest CoachBrief's evidence.rails_context — more accurate intensity_ceiling than profile.injury_flag alone. Profile-only fallback when no brief exists. Injury always sourced from profile (real-time state overrides stale brief)."
  - "[06-02]: PlannedWorkout.template_id added as nullable (not required) — legacy rows stay valid; modifier falls back to z2_endurance_60 when it encounters null. Avoids a backfill migration."
  - "[06-02]: blocks_source='ai_prescribed' default + 'user_modified' on mutation — marker for future undo affordance (06-04). Rejected modifications do NOT flip the flag (no audit row either)."
  - "[06-02]: Audit row verdict='modification' + model_used='tool-use-modify' — distinguishes modification audit rows from AI-brief rows in the same coach_briefs table. /coach/brief's cache query already filters on prescribed_workout.isnot(None) so modification rows are invisible to the brief path."
  - "[06-02]: evidence.modification carries the full rails_context_at_time (ceiling + injury snapshot at modification time) — enables post-hoc explainability even if the profile flips injury_flag later"
  - "[06-02]: chat_modification prompt context separate from chat_analytical — prompt caching: /coach/chat analytical-only queries still hit the warm cache; modification queries break to a new cache entry. Alternative of always-embedding the write tool would have invalidated existing chat_analytical caches across all users"
  - "[06-02]: Title auto-updates to the modifier's metadata.title when present (e.g. 'Sweet spot — 2×20min') — keeps the calendar card in sync with the modification; old title would confuse the user"

patterns-established:
  - "Pattern: write-tool handler triad (guards → pure modifier → persist + audit). Every future write tool should follow: (1) load + user-scope resource, (2) guard on state invariants (already-trained, injury, missing-prerequisites), (3) delegate to a pure (no-DB) service, (4) persist mutation + write append-only audit row in one transaction, (5) ValueError → {success: False, reason: ...} never raises"
  - "Pattern: rails-downgrade transparency — every rails-blocked result carries rails_downgraded=True + a human-readable reason that cites which rail fired. LLM is instructed to narrate the downgrade. Never silent. Audit row records rails_downgraded + reason so post-hoc review shows exactly why the modification diverged"
  - "Pattern: cascade by physiological intensity category, not by workload metrics. When 'harder/easier' is the intent, the semantic is intensity-ladder traversal, not TSS-ladder"

# Metrics
duration: 55min
completed: 2026-04-21
---

# Phase 6 Plan 2: Workout Modification via Chat (Wave 2) Summary

**modify_planned_workout write-tool that executes natural-language modifications ("I only have 45 min", "make it harder", "swap to indoor") through the 12-template cascade + safety-rails + append-only audit trail on coach_briefs.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-04-21T18:00:00Z
- **Completed:** 2026-04-21T18:55:00Z
- **Tasks:** 3 (2 TDD + 1 integration)
- **Commits:** 6 atomic
- **Files modified:** 7 (3 created, 4 modified)
- **Tests:** 75 new (30 modifier + 35 rails + 10 handler); full suite 446/446 green

## Accomplishments

- **modify_planned_workout tool registered** — first WRITE tool in TOOL_REGISTRY; 5 modification types (shorten, lengthen, harder, easier, indoor); Claude can now execute user modifications via the existing tool-use loop without any loop changes.
- **workout_modifier.py** — 606-LOC pure service. Never authors intervals; routes everything through `parametrize_template` so server-side watts authority (05.1 invariant) is preserved even under LLM attack. No DB I/O → trivially testable.
- **Template cascades** — ORDERED_TEMPLATES traverses by physiological intensity (rest → recovery → endurance → tempo → sweet_spot → threshold → vo2); TEMPLATE_HARDER_CASCADE and TEMPLATE_EASIER_CASCADE are index shifts. "Harder" on sweet_spot_2x20 → threshold_2x15; "easier" on vo2_5x4 → threshold_2x15; bottom self-loops at rest_day.
- **Rails precedence enforced + tested** — injury_flag > intensity_ceiling > user intent. Injury always coerces to recovery_30; moderate ceiling caps harder cascade at sweet_spot; easy ceiling downgrades vo2→recovery_30. Every blocked modification returns `rails_downgraded=True` + a reason string citing the rail (never silent).
- **Already-trained-today guard** — if `date == today` AND an Activity exists, the tool rejects with `{success: False, reason: "Already trained today — nothing to modify."}` — NO PlannedWorkout mutation, NO audit row. Mirrors `resolve_and_prescribe`'s `post_ride` override.
- **Append-only audit trail** — every successful modification writes a CoachBrief row with `verdict='modification'`, `evidence.modification = {date, modification_type, params, before, after, rails_downgraded, reason, rails_context_at_time}`, `model_used='tool-use-modify'`. Immutable; post-hoc review shows exactly what changed and why.
- **chat_modification system prompts** — new context variant in `system_prompt_for_language`; prompt caching for `/coach/brief` + chat_analytical unchanged. Instructs the LLM to honestly narrate every downgrade with the reason string.
- **Alembic migration b9c4d1e8f2a3** — adds indoor/blocks_source/template_id to planned_workouts with server_defaults (no backfill needed). Legacy rows get indoor=false, blocks_source='ai_prescribed'.

## Task Commits

Tasks were executed in order; per-task atomic commits:

1. **Task 1 RED:** `0f563bb` — `test(06-02): workout_modifier tests + cascade validation (RED)`
2. **Task 1 GREEN:** `1cfb492` — `feat(06-02): workout_modifier service with template cascades and rails-aware downgrades`
3. **Task 2:** `9b5a061` — `test(06-02): workout_modifier safety_rails integration matrix`
4. **Task 3a (migration):** `1725056` — `feat(06-02): planned_workout schema fields for modifications`
5. **Task 3b (tool + prompts):** `672ee3a` — `feat(06-02): modify_planned_workout tool with audit trail and rails-aware persistence`
6. **Plan metadata:** (this commit) — `docs(06-02): complete workout-modification-tool plan`

_Note: Task 1 followed RED→GREEN TDD. Task 2 was already-green on first run (implementation from Task 1 covered the rails matrix). Task 3 split into a migration-only commit + an integration commit so the schema change is cleanly revertable without touching the handler code._

## Files Created/Modified

### Created
- `backend/app/services/workout_modifier.py` — pure modification service (606 LOC). Exports: `apply_modification`, `ModificationResult`, `ORDERED_TEMPLATES`, `TEMPLATE_HARDER_CASCADE`, `TEMPLATE_EASIER_CASCADE`.
- `backend/tests/test_workout_modifier.py` — per-modification-type tests + cascade monotonicity (359 LOC, 30 tests).
- `backend/tests/test_workout_modifier_safety_rails.py` — rails matrix (351 LOC, 35 tests). Every modification × every rail.
- `backend/migrations/versions/b9c4d1e8f2a3_planned_workout_modification_fields.py` — adds indoor/blocks_source/template_id columns.

### Modified
- `backend/app/services/coach_tools.py` — `TOOL_SCHEMAS` += modify_planned_workout; `_handle_modify_planned_workout` + helpers (`_get_planned_workout_for_user`, `_has_activity_on`, `_load_rails_context`, `_build_user_snapshot_from_profile`); `TOOL_REGISTRY` += handler.
- `backend/app/services/coach_prompt.py` — `PromptContext` expanded; `CHAT_MODIFICATION_PROMPT_{SIMPLE,TECHNICAL}` added; `system_prompt_for_language` routes the new context.
- `backend/app/models/planned_workout.py` — `+indoor +blocks_source +template_id` columns (docstring updated).
- `backend/tests/test_coach_tools.py` — test_five_tools_registered → test_six_tools_registered; +10 TestModifyPlannedWorkout cases.

## Decisions Made

See frontmatter `key-decisions` section for full list. Top-3 most load-bearing:

1. **Cascade ordering by intensity category, NOT raw TSS.** A 3h Z2 ride (135 TSS) is not "harder" than a 30-min VO2 session (65 TSS). The cascade traverses a physiological ladder (rest→recovery→endurance→tempo→sweet_spot→threshold→vo2). Tests enforce this via category-rank monotonicity, not TSS monotonicity.

2. **Write-tool ValueError becomes `{success: False, reason: ...}` (never raises).** Keeps the tool-use loop healthy — Claude self-corrects on the next turn instead of crashing. Validation errors surface as structured tool_results (same pattern as 06-01's is_error recovery, but even less disruptive because we don't set is_error=True for user-intent failures).

3. **Already-trained-today guard in the HANDLER, not the MODIFIER.** The modifier stays pure (no DB). The handler checks activities for today before calling the modifier, and returns a reject response without touching PlannedWorkout or coach_briefs. Mirrors `resolve_and_prescribe`'s post_ride guard so the UX is consistent across brief generation + chat modifications.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Template library IDs didn't match plan's aspirational list**
- **Found during:** Task 1 (planning vs implementation review)
- **Issue:** The plan listed template IDs like `z1_recovery_30`, `sweet_spot_2x15`, `sweet_spot_3x15`, `threshold_2x20`, `vo2_6x3`, `anaerobic_8x1` that do not exist in the actual `workout_templates.TEMPLATES` registry. The library shipped by 05.1 uses different names: `recovery_30`, `sweet_spot_2x20`, `threshold_2x15`, `over_under_3x5`, `vo2_5x4`, `vo2_micro_30x30`, plus `z2_long_120` and `z2_long_180`.
- **Fix:** Used the ACTUAL template IDs from `workout_templates.TEMPLATES`. Documented the mapping in ORDERED_TEMPLATES with TSS comments so future readers can see the decision. Added cascade test that asserts every ORDERED_TEMPLATES entry exists in TEMPLATES so a future rename fails CI immediately.
- **Files modified:** `backend/app/services/workout_modifier.py` (ORDERED_TEMPLATES definition), `backend/tests/test_workout_modifier.py` (test_every_ordered_template_exists_in_library)
- **Verification:** `test_every_ordered_template_exists_in_library` passes; full cascade test suite passes.
- **Committed in:** `1cfb492`

**2. [Rule 1 - Bug] Cascade monotonicity test assumed TSS ordering, which is physiologically wrong**
- **Found during:** Task 1 GREEN (initial cascade implementation)
- **Issue:** The plan test said "harder cascade monotonically increases TSS". But z2_long_180 (135 TSS, long endurance) has HIGHER TSS than tempo_3x10 (70 TSS, tempo) — yet tempo is clearly "harder" physiologically. A TSS-ordered cascade would make "harder on tempo_3x10" go sideways to z2_long_180 (easier intensity, longer duration), which is nonsense.
- **Fix:** Reframed the test as "harder cascade monotonically increases INTENSITY CATEGORY rank" (rest=0 < recovery=1 < endurance=2 < tempo=3 < sweet_spot=4 < threshold=5 < vo2=6). ORDERED_TEMPLATES reordered: endurance templates grouped by volume (z2_endurance_60 → z2_endurance_90 → z2_long_120 → z2_long_180), THEN the intensity ladder starts at tempo_3x10.
- **Files modified:** `backend/app/services/workout_modifier.py` (ORDERED_TEMPLATES reordered), `backend/tests/test_workout_modifier.py` (test_harder_cascade_monotonic_intensity / test_easier_cascade_monotonic_intensity)
- **Verification:** All 30 workout_modifier tests pass; test_harder_cascade_monotonic_intensity asserts category rank never drops.
- **Committed in:** `1cfb492`

**3. [Rule 2 - Missing Critical] Added template_id column to PlannedWorkout**
- **Found during:** Task 3 (handler implementation — needed to load current template for cascade anchor)
- **Issue:** The plan assumed PlannedWorkout already had `template_id`. It did not. Without a template_id the modifier has no cascade anchor — it would have to guess the current template from `interval_structure`, which is lossy (blocks can be serialised without a template reference).
- **Fix:** Added `template_id: Mapped[str | None]` to PlannedWorkout model + migration. Nullable so legacy rows don't need backfill; handler falls back to `z2_endurance_60` when null. Safe default because cascades are relative (starting from z2 still produces sensible harder/easier outputs).
- **Files modified:** `backend/app/models/planned_workout.py`, `backend/migrations/versions/b9c4d1e8f2a3_planned_workout_modification_fields.py`
- **Verification:** Full test suite 446/446 green; migration follows existing pattern from a076ea752213 + d2f9b4c7a1e5.
- **Committed in:** `1725056`

---

**Total deviations:** 3 auto-fixed (2 bugs in plan assumptions, 1 missing-critical schema addition)
**Impact on plan:** None of these expanded scope. The cascade-ordering fix was semantic (tests now match physiological intent, not workload metrics). The template_id column was necessary for the handler to work correctly — without it the cascade has no anchor.

## Issues Encountered

- **Docker daemon still unresponsive** (carried from 03-01): Backend tests run against the local python3.13 venv at `backend/.venv`. Every DB interaction in new code is mocked via `_mock_modify_db` helper (inspects SQL text to route queries to stubbed results), so no live DB required. Before deploying to production, restart Docker Desktop and run `docker compose exec backend pytest` + `alembic upgrade head` to apply b9c4d1e8f2a3.

## Next Phase Readiness

**Ready for 06-03 (chat UI for modifications):**
- tool_result shape is stable: `{success, date, modification_type, template_id, duration_min, indoor, rails_downgraded, reason, before, predicted_tss, title, framework_cited}` — frontend can render a modification confirmation card directly from this.
- `rails_downgraded=True` flows through unchanged; the UI should render the `reason` verbatim alongside the new prescription.
- `success=False` with `reason="Already trained today..."` is a distinct response that the UI should catch and render as a friendly acknowledgement (no modification card).
- System prompt in `chat_modification` mode already instructs the LLM to emit the right narration tone per language mode.

**Ready for 06-04 (multi-turn context + undo):**
- `blocks_source='user_modified'` marker on PlannedWorkout flags rows that have a rollback candidate.
- `coach_briefs.evidence.modification.before` carries the pre-modification template_id + duration_min — exactly what an undo needs.
- Append-only audit means undo doesn't lose information — the original mutation stays in the audit trail; undo writes a new audit row with `modification_type='undo'`.

**Open concerns:**
- Mocked tests do not exercise TimescaleDB-specific behaviour for Activity lookups. `_has_activity_on` uses `cast(Activity.started_at, Date)` which works on PostgreSQL; verify on Docker-up first before production cutover.
- Handler does NOT currently re-compute `build_snapshot` — it reads the latest brief's `rails_context`. If the user's latest brief is stale (>6h old or generated before a new injury was flagged) the ceiling might be wrong. **Mitigation:** profile.injury_flag always overrides the brief's injury_flag (real-time state wins). For ceiling accuracy, the follow-up plan could call `build_snapshot` — rejected here as overkill (adds ~200ms to a write tool that's supposed to be snappy).
- 12-template library is hand-curated; when the library grows (per the roadmap, Phase 7 adds periodization-aware templates), ORDERED_TEMPLATES + TEMPLATE_HARDER/EASIER_CASCADE must be updated in lockstep. The cascade validity test (`test_every_ordered_template_exists_in_library`) catches rename-only changes at CI, but category-rank reshuffling is a judgement call.

**Test coverage delta:**
- 06-01 baseline: 371 tests
- 06-02 new: +75 (30 workout_modifier + 35 safety_rails + 10 handler)
- **Total: 446/446 green**

---
*Phase: 06-ai-deep-coaching*
*Wave: 2 of 4 complete*
*Completed: 2026-04-21*
