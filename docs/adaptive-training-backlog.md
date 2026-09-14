# Adaptive training implementation backlog

This specification translates [the research review](adaptive-training-research.md) into testable implementation increments. It is a proposal, not a statement that the features below are deployed. The baseline already has hourly and post-ride adaptation. No additional wearable or external paid service is required for the first increment.

## P0 — reliable evidence and plan decisions

### AT-01: One evidence clock and complete invalidation

**Existing files:** `backend/app/services/adaptive_readiness.py:build_adaptive_directive`; `plan_adaptation_engine.py:_build_snapshot`; `hrv_state.py`; `garmin_sync_service.py`.

**Change:** Define measurement date/time separately from ingestion time. Apply bounded athlete-local dates to sleep, HRV and activity evidence. Introduce dependency versions covering profile FTP, injury/status, historical baseline corrections, streams, feedback and plan inputs. Replace the quiet-run fingerprint’s latest-row-only assumptions.

**Acceptance:** Import a night from ten days ago now: it cannot become last night’s sleep. Correct a baseline HRV value while today remains unchanged: the engine reevaluates. Change FTP, injury flag or RPE with otherwise identical daily metrics: cached decisions are invalidated. Future-dated samples never authorize today’s workload. DST transitions keep the correct local day.

### AT-02: Serialize all plan writers

**Existing files:** `plan_adaptation_engine.py:run_for_user`; `plan_absorption.py:_absorb`; `plan_adaptation_log.py`; `backend/app/models/plan_adaptation.py`; plan apply/rebuild endpoints.

**Change:** Use one per-athlete transaction boundary/lock for automatic and manual plan mutations. Add expected plan revision and a database-enforced idempotency key. Persist a full before/after prescription and evidence version. Queue notifications through an outbox after commit. Preserve user-authored rows and the existing illness policy consistently.

**Acceptance:** Simultaneous app-open sync, hourly worker and stream-complete event yield one valid decision and at most one notification. A concurrent user edit is not overwritten. Retrying after timeout returns the existing revision. A failed transaction leaves neither a partial plan nor a misleading explanation. Queries and writes cannot cross user ownership boundaries.

### AT-03: Evidence-proportionate readiness and progression

**Existing files:** `adaptive_readiness.py:assess_adaptation`; `plan_adaptation_engine.py:_green_streak`, `_rule_green_upgrade`; `readiness_score.py`; `readiness_decision.py`.

**Change:** Separate permission to attempt the planned session from evidence supporting progression. Remove claims that normal HRV proves adaptation or that an ambitious preference makes weak evidence stronger. Preserve the planned rest/taper logic. Require relevant successful exposure and adequate coverage for an automatic increase; mark exact progression rules as versioned heuristics.

**Acceptance:** Normal HRV with unknown durability does not independently trigger escalation. Missing sleep is not labeled a positive recovery signal. An under-budget recovery week does not earn extra work. Explicit illness wins over green wearable metrics. High ambition changes agreed goals/commitment, not evidence confidence. No published text advertises a volume multiplier the actual prescription does not execute.

### AT-04: Connect the RPE already being collected

**Existing files:** `backend/app/models/ride_feedback.py`; `backend/app/api/activities.py:put_ride_rpe`; `training_review.py:load_review`; `plan_absorption.py`; `decision_log.py`.

**Change:** Emit a versioned feedback event on create/update. Compare the stored four-level answer with the intended workout difficulty and recent comparable sessions. Keep its ordinal meaning; do not silently claim it is a validated continuous Borg measurement. Add optional reason only when the response conflicts with execution: time/traffic, legs, general fatigue, discomfort or fueling.

**Acceptance:** A technically completed session rated all-out can prevent the next automatic progression. Missing RPE preserves normal operation with lower response certainty. Editing feedback reevaluates without applying session load twice. A traffic/time explanation does not lower inferred physiological capacity. Deleting feedback returns it to unknown.

## P1 — understand the actual training stimulus

### AT-05: Immutable prescription-to-ride matching

**Existing files:** `training_review.py:load_review`; `ride_compliance.py`; `backend/app/models/planned_workout.py`; recommendation/brief models; workout export service.

**Change:** Create an immutable prescription snapshot/version when serving or exporting the session. Associate actual activities to it using IDs where possible and a transparent time/sport match otherwise. Handle split recordings and multiple rides explicitly. Never grade against post-ride edits.

**Acceptance:** A recommendation revised after a ride cannot rewrite the historical target. Two activities covering one session can be interpreted together without duplicating dose. Two unrelated same-day rides remain separate. Uncertain attribution produces facts without a fake compliance score. Exported workout version matches the target shown to the rider.

### AT-06: Interval execution features

**Existing files:** `activity_analysis.py:analyze_streams`; `training_review.py:assemble_review`; `plan_stimulus_adaptation.py:decide_stimulus`; `ActivityStream`.

**Change:** Persist coverage, work-bout alignment, completed repetitions, power distribution, recovery duration, late-repetition fade and obvious interruption flags. Preserve zeros/coasting and distinguish dropout. Allow realistic outdoor start offsets and report differences. Keep zone-dose totals as useful supporting facts, not the whole stimulus model.

**Acceptance:** Five sustained hard bouts and equivalent seconds in scattered sprints produce different exposure descriptions. A traffic stop between intervals shifts alignment rather than ruining every later match. A power spike is not a new sprint record. HR-only recordings do not receive fabricated power execution. Do not claim time at measured VO₂max from watts alone.

### AT-07: Comparable durability observations

**Existing files:** `durability.py`; `adaptive_readiness.py:decoupling_delta_matched`; `activity_analysis.py`; `ActivityStream`; `ride_weather.py`.

**Change:** Persist late-effort observations across accumulated-work bands, including work/kg when weight provenance is adequate. Record prior intensity distribution, elapsed/moving context, duration, indoor/outdoor/device, temperature source, and whether a relevant effort was attempted. Keep controlled steady HR drift separate from late maximal power.

**Acceptance:** Easy ride home after an early climb is not scored as deterioration. Similar kJ in heat versus cool weather produces a qualified comparison. Insufficient matching history yields no trend. A longer ride alone cannot improve or worsen the durability label. Missing weight retains absolute-work analysis without guessed normalization.

### AT-08: Corrected evidence and a rolling planning horizon

**Existing files:** `plan_absorption.py`; `plan_stimulus_adaptation.py:adapt_stimulus`; `plan_adaptation_engine.py`; `PlanAdaptation`.

**Change:** Replace activity-ID-only finalization with activity-evidence revisions. Recompute load from latest state; append a superseding interpretation when necessary. Evaluate the next appropriate days across calendar-week boundaries. Carry completed workload and changed recovery needs into Monday rather than stopping every action at Sunday.

**Acceptance:** Summary first, streams later, then corrected power produces consistent successive interpretations with one load contribution. Sunday’s unexpected hard ride can protect Monday. A completed/started workout is immutable. A missed workout is not automatically added on top of the next week. No active plan means review facts only, not creation of an implicit plan.

### AT-09: Cross-sport recovery ledger

**Existing files:** `plan_adaptation_engine.py:_build_snapshot`; `plan_stimulus_adaptation.py:blocks_quality_spacing`; `mesocycle_generator.py:_plan_week_runs`; Activity and feedback models.

**Change:** Account for running, lifting and other relevant sessions in shared recovery constraints while retaining sport-specific performance models. Distinguish uncertain duration/RPE load from cycling power-based TSS. Link soreness to recent strength exposure when the rider reports it.

**Acceptance:** Hard running can block adjacent cycling quality. An unknown gym session is not silently treated as easy. Easy commuting counts for accumulated work. No metric suggests 50 estimated strength-TSS is physiologically interchangeable with 50 cycling-TSS.

## P2 — individualized development rather than generic templates

### AT-10: Mixed focuses and goals without an event

**Integration note:** A separate Plan-entry implementation is adding optional `focuses` and a date-free eight-week block. Coordinate with that branch rather than recreating its schema.

**Existing files:** `plan_goal.py:preview_goal`, `apply_goal_to_profile`; `mesocycle_generator.py:generate_mesocycle`, `build_week_drafts`; `training_periodization.py`; plan-goal schemas.

**Change:** Preserve an explicit focus list and optional priority. Build one dose budget across goals. Use a dominant development emphasis with supporting exposure when time is constrained; do not merge finished plans. `target_event_date` stays null without an event. Internal block end drives review/recovery, not a race taper. Goal-specific outcomes must match the selected focus.

**Acceptance:** VO₂ + endurance has the same agreed weekly time ceiling as either goal alone. Adding FTP cannot add a third hard day merely because its standalone template contains one. Sprint + endurance preserves quality of sprint opportunities. All selected focuses remain visible even if one receives maintenance emphasis. No fake event/countdown appears. An eight-week block has a meaningful continuation path. The engine never promises simultaneous maximal improvement in every capability.

### AT-11: Response-calibrated progression

**Existing files:** `workout_modifier.py`; `workout_templates.py`; `training_periodization.py`; `mesocycle_generator.py`; new response-history service.

**Change:** Track supported capability per relevant session family, including dose, execution and RPE. Progress one primary dimension at a time. Repeat a useful level when evidence is mixed. Use a stable weekly review to alter the development emphasis; preserve major event constraints.

**Acceptance:** Repeated controlled threshold work can lengthen duration before increasing power. One very good day does not reset every target. No recent maximal attempt is not evidence of lower FTP. New users and users without power receive a coherent pathway. A plateau explanation distinguishes sparse data from demonstrated lack of progress.

### AT-12: Fueling and context without invented physiology

**Existing files:** `fueling_analysis.py`; `outdoor_workout.py`; `rehearsal` services; feedback models.

**Change:** Replace blanket IF-based intake bands with duration, task, tolerance and preparation context. Optionally store approximate carb/fluid intake and GI tolerance on key rides. Reword drift-only underfueling conclusions as uncertain. Do not show exact substrate grams as measured. Use route/weather to adjust execution and comparisons, without inferring road safety from elevation alone.

**Acceptance:** A short high-IF ride does not automatically receive 90–120 g/h. A long hot ride with unknown intake has multiple possible explanations. A rider with GI issues is not automatically escalated to elite intake. No GPS means no invented route weather. Exported workout preserves recovery durations after outdoor placement.

### AT-13: Honest power-model confidence

**Existing files:** `critical_power.py`; `athlete_power_profile.py`; `wko_power_model.py`; `power_profile_view.py`.

**Change:** Distinguish measured best efforts, CP/W′, operational FTP and modeled long-duration estimates. Track independent effort sources, age, device and coverage. Add fit validity bounds and uncertainty beyond adjacent-duration residuals. Do not automatically rewrite FTP from an unsupported extrapolation.

**Acceptance:** Two points with R² = 1 remain low-information. Twenty adjacent MMP durations from one effort do not count as twenty independent tests. Negative/implausible fitted parameters are rejected. A device change can reduce comparability. A new operational FTP cannot retroactively alter the original target of a completed ride.

## P3 — outcome validation and presentation

### AT-14: Historical replay and prospective evaluation

**Existing files:** `decision_log.py`; `backend/app/models/engine_decision.py`; adaptation logs; dedicated replay tooling.

**Change:** Reconstruct evidence as it was known at each date, with delayed imports and feedback. Compare against the old engine and a stable-plan baseline. Track task-specific performance, RPE calibration, adherence, recurring exhaustion and plan churn. Require an opt-in prospective evaluation before claiming outcome superiority.

**Acceptance:** No future data leakage. Engine version changes are separable. Missing outcomes are reported. Forecast calibration is assessed independently of UI engagement. Subgroups with insufficient evidence are not assigned fake norms or guaranteed gains.

### AT-15: A concise explanation contract across Today, Plan and ride detail

**Existing files:** training-review schema, Plan adaptation API, W3 Today/Plan/ride review consumers.

**Change:** One shared structured result: measured ride fact; relevant interpretation; exact next change; uncertainty on demand. Visualize the actual workout difference and hours/TSS delta using the existing W3 system. “No change needed” is a valid successful result. Show sync/review state without blocking the page.

**Acceptance:** All surfaces display the same revision and prescription. Measured versus modeled values are distinguishable. No “+FTP from this ride” claim. Zero decorative certainty scores. Accessible one-screen summary, details expandable, reduced-motion respected. Review the exact before/after locally before publishing any visual change.

## Suggested first implementation slice

Ship AT-01 through AT-04 together behind a rollout flag, initially in shadow mode. This closes the current RPE loop, fixes stale/corrected input handling and makes existing adaptations dependable before adding new training mathematics. Then deliver AT-05 through AT-09 as the post-session engine upgrade. Mixed-focus entry can ship independently, but AT-10’s shared-dose constraints must be enforced before combining progression programs.

Completion means the right decision reaches the user reliably with an honest reason. It does not mean the engine changes the plan every hour.
