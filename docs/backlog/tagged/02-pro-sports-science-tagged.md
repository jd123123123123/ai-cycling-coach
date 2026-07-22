# Backlog 02 — Pro / Sports-Science Lens — History Audit

Audited against the actual state and git history of the repo. Each of the 39 items is tagged
**NEW** (genuine new science/behavior on live foundations, no history risk),
**CONTRADICTS-DECISION** (proposes reviving/re-wiring something deliberately removed/replaced), or
**NEEDS-CHECK** (premised on "exists-but-dead/duplicate-of-a-deleted-surface", intent ambiguous).

Key facts established:
- Commit `cbe1a68` ("feat(analyze): curated Insights section + delete 29 orphaned components (P0.5)"), following `9654baf` ("Analyze hub — fold Trends/Report"), **deliberately deleted** `AnalyzeTab`, `TrendsTab`, `ReportTab`, `CriticalPowerCard`, `TrajectoryCard`, `FitnessSignalsCard`, `MonotonyStrainCard`, `WBalanceTraceCard`, `PolarizedDistribution`, `UncertainValue`, the CoachBrief island, etc., in favour of a curated `InsightsSection`.
- `InsightsSection.tsx` (created in the same commit) **still live-mounts** `PMCChart`, `TrainingDistributionCard`, `VO2MaxEstimate`, `EfficiencyTrend`, `FormProgressPanel`, `FtpConfidenceCard`. So those specific cards are NOT dead.
- Every backend science module named in the backlog **exists** under `backend/app/services/` (durability, w_balance, wbal_trace, matchbook, quadrant_analysis, power_curve, critical_power, performance_projection, tid_*, adaptive_readiness, menstrual_adjustment, cda_estimate, fueling_analysis, workout_export, etc.). Building on those is not a contradiction.
- CP/W′ are surfaced live: `usePowerProfile` (InsightsSection), `useWbalTrace` → `RideStory.tsx` / `DebriefView.tsx`.

| Item# | Short title | Tag | Evidence (file/commit) |
|-------|-------------|-----|------------------------|
| A1 | Ship "The Lab" — resurrect AnalyzeTab/TrendsTab/ReportTab + orphaned cards | **CONTRADICTS-DECISION** | `cbe1a68` deleted `tabs/AnalyzeTab.tsx`, `tabs/TrendsTab.tsx`, `tabs/ReportTab.tsx`, `CriticalPowerCard.tsx`, `TrajectoryCard.tsx`, `FitnessSignalsCard.tsx`, `MonotonyStrainCard.tsx`, `WBalanceTraceCard.tsx`; team chose curated `InsightsSection.tsx` over dense-everything. Directly names reviving these. |
| A2 | CP/W′/eFTP as always-visible athlete-level number + FTP-drift prompt | NEW | `backend/app/services/athlete_power_profile.py` live; eFTP→FTP auto-prompt is a still-remaining task (memory `science-engine-modules`). |
| A3 | Durability-adjusted (fatigued) power-duration curve + season trend | NEW | `durability.py` live (debrief-only, descriptive); refit-CP-post-kJ is net-new science on stored streams. |
| A4 | Mount W′bal session trace with "matches burned" as signature viz | **NEEDS-CHECK** | Backend `w_balance.py`/`wbal_trace.py` + `useWbalTrace` are LIVE in `RideStory.tsx`/`DebriefView.tsx`, but a standalone `WBalanceTraceCard.tsx` ("the anaerobic battery… matches") was **deleted on purpose** in `cbe1a68`. Proposal duplicates that deleted card; intent of re-adding a standalone card unclear. |
| A5 | Forward/prescriptive W′bal — validate interval sessions are survivable | NEW | `w_balance.py` live; forward simulation over a planned set + Skiba-Clarke τ_W′ is genuinely new behavior. |
| B1 | Pedaling dynamics panel (L/R, torque eff, smoothness, PCO) | NEW | Channels already ingested (`stream_extraction`/`garmin_details_parser`); dedicated trend panel is new. |
| B2 | Torque–cadence / quadrant analysis surfaced | NEW | `quadrant_analysis.py` live (debrief-only); broader surfacing is additive, not a deleted surface. |
| B3 | Interactive per-second synced multi-channel ride viewer | NEW | Streams stored; brushing/zoom/selection-stats viewer is net-new. |
| B4 | Continuous log-x power-duration curve w/ historical & fatigued overlays | NEW | `power_curve.py`/`detailed_power_profile.py`/`power_phenotype.py` live; continuous-curve rendering is additive. |
| C1 | CP model with fit quality, CI, protocol guidance | NEW | `critical_power.py` live; CP surfaced via `usePowerProfile`. R²/SE/CI + guided test are new diagnostics, not the deleted CriticalPowerCard. |
| C2 | FTP/eFTP tracking with change-detection & breakthrough tagging | NEW | `api/ftp.py` + `breakthrough_detector.py` live; continuous eFTP step-change signal is new. |
| C3 | Bayesian FFM projection — expose bands + "if you do X" forks | **NEEDS-CHECK** | `performance_projection.py` bands exist; but `TrajectoryCard.tsx` ("the fitness (CTL) projection… projection to your target event") was **deleted on purpose** in `cbe1a68`. Base "surface the projection" duplicates that deleted card; scenario-forks are new. Intent ambiguous. |
| C4 | Wire individualized Banister τ (impulse_response) into projection | NEW | `impulse_response.py` has **zero non-test importers** (dead/test-only, confirmed), but was never wired then removed — roadmap P2.12 build-on-later. Adds new individualization science; not a removed feature. |
| C5 | Surface bike-native power-based VO2 estimate; label Garmin's honestly | NEW | ACSM power-VO2 in `wko_power_model.py` exists but under-surfaced; surfacing + honest labels is additive. |
| D1 | Auditable periodization / mesocycle view | NEW | `mesocycle_generator.py`/`training_periodization.py` live; exposing reasoning is new UI on live engine. |
| D2 | Taper optimizer with race-day TSB targeting | NEW | `goal_trajectory.py` encodes Mujika band; taper-shape simulator is new. |
| D3 | Deterministic plan re-solve on missed/downgraded sessions | NEW | `plan_adaptation_engine.py` live; forward TSS-redistribution solver is additive. |
| E1 | TID dashboard with phase target + drift alerts | NEW | `tid_assessment.py`/`tid_optimizer.py` live in `/analytics`; `TrainingDistributionCard` still live-mounted in `InsightsSection`. Standing dashboard is deepening, not revival. |
| E2 | True per-second time-in-zone (replace activity-level IF bucketing) | NEW | Confirmed `advanced_metrics.zone_distribution` buckets each whole activity by IF proxy (docstring admits it); per-second recompute from `activity_streams` is the flagged high-value accuracy fix. |
| F1 | HRV-guided autoregulation, per-session + legible | NEW | `adaptive_readiness.py` (Nuuttila/Javaloyes) live; baseline chart + one-tap session reshape is new. |
| F2 | NFOR / non-functional-overreaching block watch | NEW | `readiness_detector.py` does day-level; block-level CV-collapse trend watch is new. |
| F3 | Reconcile readiness stack + consume stored intraday HRV samples | NEW | 4 readiness services + `intraday_sync_service.py` storing `daily_metric_samples` that nothing consumes; reconcile + consume is new wiring, no deliberate removal. |
| F4 | Activate menstrual_adjustment (opt-in cycle-aware readiness) | NEW | `menstrual_adjustment.py` imported by `readiness_score.py` but gated dead (no profile field → delta always None). Activating gated code, roadmap P2.5; no removal. |
| G1 | Heat-strain & thermal-load context per ride | NEW | `environment.py`/`weather_client.py`/`cda_estimate.py` live; heat-strain interpretation is new. |
| G2 | Altitude-aware load & performance adjustment | NEW | `environment.py` models density-vs-altitude; performance adjustment/flagging is new. |
| G3 | CdA trend & aero-vs-terrain power decomposition | NEW | `cda_estimate.py` live (per-ride median); trending + decomposition is additive. |
| H1 | Course-aware prospective pacing plan | NEW | `pacing_analysis.py`/`climbing_analysis.py`/`ride_segmentation.py`/`route_library.py` live; prospective race-model is new (stays before-ride). |
| H2 | Post-race pacing execution vs optimal | NEW | `race_debrief.py` aggregates modules; explicit pacing-quality verdict is new. |
| H3 | Fueling / CHO-demand modeling for long events | NEW | `fueling_analysis.py` live-in-debrief; prospective g/h target is additive. |
| I1 | Surface existing workout export (.zwo/.erg/.mrc) | NEW | `workout_export.py` live but not surfaced; download affordance is additive (roadmap P2.6). |
| I2 | True Garmin/Wahoo push — only after official API | NEW | `push_to_garmin_soon` stub in strings; `garmin_client.py` read-only. Item explicitly gates on API approval — honest, roadmap-aligned, not a revival. |
| I3 | Pro-grade graphical workout builder + import | NEW | `custom_workout_blocks.py`/`program_builder.py`/`workout_templates.py` + serializers live; graphical editing + import is additive. |
| J1 | .FIT upload endpoint (device-agnostic ingestion) | NEW | No FIT upload path today (still-remaining, memory); flows into live `stream_ingestion.py`. |
| J2 | Data export + one-way Intervals.icu push | NEW | No export today; new interoperability (roadmap P2.11). |
| J3 | Data-trust/validation layer (dropouts, spikes, calibration drift) | NEW | Pipeline handles gaps/auto-pause; visible quality flags + model quarantine is new. |
| J4 | Wahoo & Apple Health honesty sweep | NEW | Wahoo OAuth coded but server-unconfigured; configure-or-hide + audit is new (roadmap P2.7). |
| K1 | Coach/athlete multi-athlete roster view | NEW | App is single-athlete; roster surface is net-new. |
| K2 | Annotatable/shareable reports + RPE reconciliation | NEW | `period_report.py`/`session_report.py` live; coach notes + sRPE-vs-TSS cross-check is new (roadmap P2.2). |
| K3 | Model transparency / methods drawer | NEW | Citations exist in `coach_knowledge.py`; exposing formula/constants/uncertainty is additive. |

## Counts
- CONTRADICTS-DECISION: 1
- NEEDS-CHECK: 2
- NEW: 36
- Total: 39
