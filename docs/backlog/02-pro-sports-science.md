# Backlog 02 — Pro / Sports-Science Lens

*Reviewer persona: an elite/pro road cyclist and their sports-scientist coach. This pair does not want horoscopes — they want defensible numbers with uncertainty attached, per-second physiology, periodization they can audit, and export/tooling that plugs into a real high-performance workflow (WKO5, Intervals.icu, head units, power meters). The good news: this codebase is unusually far along. The 1 Hz stream pipeline is **built and verified on live Garmin data** (`stream_ingestion.py`, `activity_analysis.py`, `activity_streams` table), and pure, citation-heavy science modules for CP/W′, Skiba W′bal, durability/decoupling, Seiler TID, Banister projection with confidence bands, and Mujika taper already exist. The problem is **reach and depth**: much of this science is either buried in the per-ride debrief, unreachable from the main nav (the entire `AnalyzeTab`/report surface is orphaned — imported by zero files), or left dead (`impulse_response.py`, `menstrual_adjustment.py`). This backlog is therefore weighted toward **unlocking and deepening what already exists**, then pushing the frontier where a serious athlete would feel the ceiling.*

Grounding notes used throughout: science-engine state per `docs/research/2026-07-our-app-inventory.md` §2 and the app-memory `science-engine-modules` / `training-science-methods`; positioning boundary from `docs/competitive-roadmap-tasks.md` (we own *before* = plan/brief and *after* = debrief/story; head units execute — **no in-app ERG/in-ride mode**). Effort: S ≈ days, M ≈ 1–2 weeks, L ≈ 3+ weeks.

---

## Theme A — Unlock the built science (highest leverage, lowest new-science cost)

### A1. Ship "The Lab" — a first-class deep-analytics surface · Area: new top-level route / Analyze tab
The richest analytics components already exist but are **orphaned**: `AnalyzeTab.tsx`, `TrendsTab.tsx`, `ReportTab.tsx` and the cards they import (`PMCChart`, `TrainingDistributionCard`, `TrajectoryCard`, `VO2MaxEstimate`, CP/W′ and W′bal cards, `FitnessSignalsCard`, `MonotonyStrainCard`) are imported by zero live files — `DashboardPage` routes `?tab=analyze` to the lightweight `HistoryTab` instead. Resurrect them into one coherent, navigable "Lab" surface (not mounted as-is — redesign to the Today/Load-Form quality bar) with power-duration curve, PMC, TID, projection, durability and W′bal in one place. This is the single biggest "WOW for serious athletes" per dollar because the engine is already done.
**Expected improvement:** turns a hidden capability into the headline reason a data-serious cyclist chooses this over Intervals.icu; likely the strongest retention lever for the pro segment (they currently can't find their own CP/W′ without opening a single ride).
**Effort:** M · **Rationale:** "resurrect means redesign" memory; inventory §6 names this the biggest single finding.

### A2. Surface CP / W′ / eFTP as an athlete-level, always-visible number · Area: Today, Profile, Lab
`athlete_power_profile.py` already aggregates per-ride MMP curves into an athlete CP/W′/eFTP (live brief carries CP 236.5 / eFTP 239 over 8 rides), but the athlete never sees it as a headline metric with its own trend and confidence. Give CP/W′/eFTP a persistent card with a sparkline of history, sample count, and a confidence chip, and auto-prompt "your eFTP has drifted to 248 W — update FTP?" (an explicitly listed remaining task). eFTP that silently disagrees with stored FTP is exactly the "one wrong confident number" trust wound.
**Expected improvement:** keeps prescription watts anchored to reality (FTP drift is the #1 cause of stale zones); a coach-grade athlete checks eFTP weekly.
**Effort:** S · **Rationale:** Monod–Scherrer/2-parameter CP; `science-engine-modules` names the eFTP→FTP auto-prompt as still-remaining.

### A3. Durability-adjusted power-duration curve + tracked fatigue-resistance trend · Area: Lab, History
`durability.py` computes power drop after a kJ threshold and aerobic decoupling per ride, but it's "LIVE-but-only-in-debrief" and **purely descriptive** — a read-only chart that feeds neither periodization nor prescription. Do the thing its own docstrings cite: refit CP/W′ *after* X kJ of work (Spragg 2023) to draw a **fatigued power-duration curve** overlaid on the fresh one, and track the fresh→fatigued gap (plus decoupling % and kJ-to-fade) over the season, keyed to the target event's kJ demands. Scale the kJ threshold to the athlete's typical ride length rather than the fixed 1500 kJ.
**Expected improvement:** directly serves event-terrain specificity (memory: "coaching must reflect event terrain"); the fresh-vs-fatigued curve gap is the single metric pros most lack tooling for and no wellness app can touch.
**Effort:** M · **Rationale:** Spragg 2023 durability = refit CP/W′ post-kJ; decoupling >5% = poor durability (Coggan/Allen); durability dose = kJ/kg above CP. Data (per-second streams + MMP) is already stored.

### A4. Mount the W′bal session trace with "matches burned" · Area: RideAnalysis / Lab
`w_balance.py` + `wbal_trace.py` (Skiba differential) are LIVE via `/analytics/wbal-trace` and feed race_debrief, and `matchbook.py` exists — but the only W′bal time-series lives buried in a collapsed act of the Debrief (`RideStory`), not on the main ride-analysis path. Render the trace as a signature viz on RideAnalysis/Lab (the roadmap even floats a W′ "matchbook" character), with the minimum-W′bal marker, match count, and tap-to-see each match's context (climb, attack, headwind section).
**Expected improvement:** makes anaerobic pacing legible; "you had 2.1 kJ of W′ left at the top" is a coach-grade insight no wellness app can produce.
**Effort:** S–M · **Rationale:** Skiba differential W′-balance is the best-validated anaerobic-work model, trivial on the built stream pipeline.

### A5. W′bal used *prescriptively* — validate that interval sessions are survivable · Area: Plan / WorkoutBuilder
Today W′bal is retrospective only, even though `w_balance.py`'s own docstring states the intent is to validate prescription. Run the W′bal model *forward* over a planned interval set (using the athlete's CP/W′) to check the session doesn't drive W′bal to zero before the last rep, and warn/adjust when it does — e.g. "rep 5 at 340 W exhausts W′; drop to 330 W or add 30 s recovery." Also upgrade the recovery term toward the Skiba-Clarke individualized τ_W′ (the classic differential over-optimistically refills W′ for slow-reconstitution athletes).
**Expected improvement:** turns W′bal from a post-hoc chart into a prescription guardrail — no more workouts that are physiologically impossible for *this* athlete; a genuinely novel authoring aid.
**Effort:** M · **Rationale:** Skiba-Clarke W′ reconstitution with individualized τ_W′; forward W′bal simulation of prescribed intervals.

---

## Theme B — Advanced per-second power analytics (deepen the stream pipeline)

### B1. Cycling pedaling dynamics: L/R balance, torque effectiveness, pedal smoothness, PCO, power phase · Area: RideAnalysis / Lab
The stream crawl already captures `right_balance→L/R`, PCO L/R, power-phase, and stamina (`garmin_details_parser` / `stream_extraction`), and some appear in debrief `BreakdownPanels`, but there is no dedicated pedaling-dynamics panel with trends. Surface L/R balance over the ride and across the season, torque effectiveness / pedal smoothness, and platform-center-offset — the data a rider with a Garmin Rally / Assioma / power-pedal set expects to see and no wellness app touches.
**Expected improvement:** unlocks a whole class of dual-sided-power-meter owners (the serious-athlete core); asymmetry trends flag bike-fit and post-injury compensation.
**Effort:** M · **Rationale:** data already ingested; asymmetry >~5% is a recognized fit/rehab signal.

### B2. Torque–cadence / quadrant analysis surfaced · Area: RideAnalysis / Lab
`quadrant_analysis.py` (force vs. velocity quadrants) is LIVE but only feeds `race_debrief`. Surface a quadrant plot (high-force/low-cadence "grinding" vs. high-velocity "spinning") per ride and by workout type, so the coach can verify a sweet-spot session was actually neuromuscularly what was prescribed.
**Expected improvement:** distinguishes "did the watts, wrong way" — grinding a VO2 effort at 60 rpm is a different stimulus; coaching value the LLM brief can cite.
**Effort:** S · **Rationale:** Coggan quadrant analysis; neuromuscular specificity of force application.

### B3. Interactive per-second ride viewer with synced channels · Area: RideAnalysis
Streams exist (power, HR, cadence, elevation, speed, GPS polyline, temperature) but the analysis view lacks a WKO/Intervals-grade synchronized multi-channel viewer with brushing, zoom-to-selection, and on-the-fly interval stats for any dragged window (avg/NP/W′ spent/decoupling for the selection). This is table stakes for a sports scientist reviewing an athlete's ride.
**Expected improvement:** ad-hoc effort analysis without exporting to another tool — a direct Intervals.icu/WKO substitute for the review workflow.
**Effort:** L · **Rationale:** selection-based interval analysis is the core review primitive in pro software.

### B4. Continuous log-x power-duration curve with historical & fresh-vs-fatigued overlays · Area: PowerProfileView / Lab
Today the power profile renders as **discrete anchor-duration bars**, not the continuous log-x power-duration curve pros expect. `power_curve.py`/`detailed_power_profile.py` already compute a dense MMP curve (22 durations) and `power_phenotype.py` classifies sprinter/pursuiter/TTist. Draw it as a proper continuous curve with overlays: this-season vs. last-season vs. 90-day best, W↔W/kg toggle (present), the CP model line, and (with A3) the fatigued curve. Add a "what's stale" indicator flagging durations not tested recently so the curve isn't quietly optimistic.
**Expected improvement:** the power-duration curve is the pro athlete's identity chart; a continuous curve + freshness flags prevent a stale 20-min best from inflating CP.
**Effort:** M · **Rationale:** log-x power-duration curve is the WKO/Intervals standard; MMP-curve staleness is a known CP-fit failure mode; phenotype already computed.

---

## Theme C — CP/W′, FTP & VO2 modeling with honest uncertainty

### C1. CP model with fit quality, confidence interval, and protocol guidance · Area: Lab
`critical_power.py` does a 2-parameter linear CP/W′ fit, but a coach needs the **fit diagnostics**: which durations anchored it, R²/standard error, and a confidence band on CP and W′ — plus a nudge when the anchoring efforts are too close together (e.g. all 3–8 min) to constrain W′. Offer a guided "CP test" protocol (e.g. 3-min + 12-min, or 20-min proxy) that schedules into the plan and recomputes.
**Expected improvement:** converts a point estimate into a trustworthy, testable model; prevents the classic W′ instability that makes W′bal traces meaningless.
**Effort:** M · **Rationale:** 2-parameter CP is ill-conditioned without spread-out durations; report uncertainty, never a bare number (per `training-science-methods`).

### C2. FTP/eFTP tracking with change-detection and breakthrough tagging · Area: Progress / Lab
FTP history exists (`api/ftp.py`) and breakthroughs are detected (`breakthrough_detector.py`), but eFTP from sustained efforts (NP on rides ≥20 min at ≥83% FTP — already the projection's sampling gate) isn't tracked as a continuous signal with step-change detection. Show eFTP as a running estimate with a "new threshold breakthrough" event when it steps up beyond noise, feeding both the FTP-update prompt (A2) and the celebration loop.
**Expected improvement:** athletes get earned, physiology-anchored FTP bumps instead of dreaded formal tests; ties science to the retention/celebration system.
**Effort:** S–M · **Rationale:** eFTP as a continuous marker (Xert-style) without Xert's opacity; sampling gate already defined in `performance_projection.py`.

### C3. Bayesian FFM projection: expose the bands and the "if you do X" fork · Area: Lab / Goal
`performance_projection.py` already emits a central path + 50/80% confidence bands (population priors τ1=42, τ2=10, k2/k1=2, MAP-fit p0/scale) but it's under-surfaced. Make it a first-class "where can I land by race day" chart with the bands drawn, and add scenario forks: project under the current plan vs. a +10% volume vs. a taper, so the coach can compare landing distributions.
**Expected improvement:** decision-support the pro coach actually asks for ("will this block get her to 5.2 W/kg?") with honest uncertainty, not a false point promise.
**Effort:** M · **Rationale:** plain FFM is out-of-sample R²≈0.15–0.21; the Bayesian priors + bands are what make it shippable — frame as bands, never guarantees.

### C4. Make the two fitness-fatigue models talk — individualized Banister τ · Area: engine (feeds Lab/Goal)
The app has **two disconnected FF implementations**: `impulse_response.py` fits per-athlete τ1/τ2/gains by grid search but is **dead (test-only)**, while `performance_projection.py` projects using *fixed population priors* (τ1=42/τ2=10) and ignores the fitted model entirely. Wire the individualized fit to feed the projection (C3) and goal trajectory once an athlete has enough performance samples, shrinking from the population prior toward personal constants as data accrues — the literal implementation of "learns how *you* respond." Also feed the projection cleaner eFTP samples from the stored per-second MMP curve rather than ride-summary NP/IF.
**Expected improvement:** projections that reflect this athlete's actual fatigue/adaptation kinetics; the credible version of the personalization competitors only claim.
**Effort:** M · **Rationale:** roadmap P2.12; population-prior→personal-MAP shrinkage is the defensible individualization path (per `training-science-methods`).

### C5. Surface the bike-native power-based VO2 estimate; label Garmin's honestly · Area: Recovery / Lab
There are already two VO2 numbers: Garmin's stored VO2max (a running/HR proxy of dubious cycling validity) and an **ACSM power-based estimate from 5-min power inside `wko_power_model.py`** that is computed but under-surfaced. Promote the bike-native power-derived VO2 as the primary trend (clearly labeled an estimate), keep Garmin's clearly sourced and secondary, and trend both against training phase.
**Expected improvement:** avoids a "confident wrong number" on a metric pros scrutinize; a bike-native MAP-based trend beats a borrowed wrist-HR estimate.
**Effort:** S · **Rationale:** cycling VO2 from MAP/5-min power (ACSM) is better-grounded than wrist-HR VO2; honest-label principle. The estimate already exists — this is surfacing, not new science.

---

## Theme D — Periodization, taper & plan trust

### D1. Auditable periodization view — show the mesocycle logic, not just the output · Area: Train / Plan
`mesocycle_generator.py` (Friel phase + Issurin 3:1 + Seiler TID, %FTP blocks) and `training_periodization.py` are deterministic and defensible, but the athlete/coach sees only the resulting week. Expose a season/mesocycle map: current phase, block position (build/build/build/recovery), planned CTL ramp, and *why* this week's TSS target — with the ramp cap (Friel ~8% WoW) and TSB floor visible.
**Expected improvement:** a coach can trust and adjust the plan because they can read its reasoning; opacity is TrainerRoad/Xert's most-resented failing.
**Effort:** M · **Rationale:** Issurin block periodization + Friel ramp caps are already the engine's rules — make them legible.

### D2. Taper optimizer with race-day TSB targeting · Area: Goal / Plan
`goal_trajectory.py` already forward-simulates the plan and knows the Mujika taper band (race-day TSB +5..+25 ideal, <−15 overreached, >+25 too fresh). Turn this into an explicit taper module for A-events: simulate 2–3 taper shapes (linear vs. exponential, duration) and recommend the one landing TSB in-band while preserving CTL, with a countdown card as the event nears.
**Expected improvement:** peaking is where amateurs blow it and pros obsess; landing race-day form in-band is the highest-stakes coaching moment.
**Effort:** M · **Rationale:** Mujika & Padilla 2003 taper targets already encoded; exponential taper preserves fitness while shedding fatigue.

### D3. Deterministic plan re-solve on missed/downgraded sessions · Area: Plan / adaptation
`plan_adaptation_engine.py` and absorb-and-replan exist; extend to a clean "redistribute lost TSS forward" solver when a key session is missed or downgraded, honoring the weekly CTL ramp cap and TSB floor rather than naively cramming. Show the athlete exactly what moved and why.
**Expected improvement:** the plan stays coherent through real life (illness, weather, travel) — the failure mode that makes athletes abandon rigid plans.
**Effort:** M · **Rationale:** "deterministic plan re-solve is the defensible slice of the RL hype" (`training-science-methods`); avoid RL/ML controllers.

---

## Theme E — Training Intensity Distribution & polarization

### E1. TID dashboard with phase target and drift alerts · Area: Lab
`tid_assessment.py` + `tid_optimizer.py` (Seiler polarized↔pyramidal, phase nudge) are LIVE in `/analytics` and period_report. Give TID a standing dashboard: rolling zone distribution (time-in-zone by CP-anchored zones, not just HR), classification vs. the phase-appropriate target, and a nudge when the athlete has drifted (e.g. base-phase intensity creep — the classic "grey zone" trap).
**Expected improvement:** polarization discipline is the most cited amateur error; a drift alert is concrete, coach-grade guidance.
**Effort:** M · **Rationale:** Seiler TID; base-phase intensity creep ("moderate-intensity rut") is the most common self-coached mistake.

### E2. True per-second time-in-zone (the highest-value data-ready fix) · Area: all analytics
The TID/zone engine is scientifically undercut by its input: `advanced_metrics.zone_distribution` (`advanced_metrics.py:359`) buckets **each whole activity into a single zone by activity-level IF** (IF<0.77→Z1, ≤1.0→Z2, >1.0→Z3), even though 1 Hz power streams are stored per ride. Recompute time-in-zone from the per-second stream (CP/FTP-anchored power zones, HR fallback) and have TID, monotony/strain and the intensity cards all read that source. This also upgrades the TID model from coarse 3-zone toward a proper 5/7-zone polarization index. The data to do this properly already sits in `activity_streams`.
**Expected improvement:** the single biggest accuracy upgrade per effort — real TID a power-meter athlete trusts; a hard sweet-spot ride currently mislabeled all-Z2 gets counted correctly.
**Effort:** M · **Rationale:** Seiler TID needs per-second (ideally LT1/LT2-anchored) binning; session-level IF is the "same heuristic every app uses" the code admits to. Competitive analysis §1 — "HR-only load models demonstrably fail."

---

## Theme F — HRV-guided training & readiness precision

### F1. HRV-guided autoregulation, made legible and per-session · Area: Today / Recovery
`adaptive_readiness.py` already implements the Nuuttila/Javaloyes ±0.5 SD lnRMSSD-baseline model with 5 directives, and `readiness_detector.py` does illness/overreaching detection. Surface the HRV baseline chart (μ7 ± SWC band with today's point) so the athlete sees *why* today became Z1, and let the directive actually reshape today's prescribed session (swap intensity) with a one-tap accept — HRV-guided training's real value is protecting negative responders, not beating a plan on average.
**Expected improvement:** turns readiness from a score into an action; protects the athletes most at risk of digging a hole.
**Effort:** M · **Rationale:** Plews/Altini rolling lnRMSSD + SWC; HRV-guided value = protecting negative responders (`training-science-methods`).

### F2. NFOR / non-functional overreaching watch across a block · Area: Recovery / Lab
The detector flags acute illness/overreaching, but a coach also watches **HRV CV collapse** (σ7/μ7 trending down) or a suppressed μ7 across a build block — the NFOR signature. Add a block-level "overreaching watch" that reads the trend, not just the day, and correlates it with the CTL ramp to say "this build is landing — or tipping."
**Expected improvement:** catches the slow slide into overtraining that daily readiness misses; the exact failure a pro coach is paid to prevent.
**Effort:** M · **Rationale:** HRV CV collapse / declining μ7 across a block = NFOR watch (`training-science-methods`); individual rolling baselines only.

### F3. Reconcile the readiness stack and consume the stored intraday HRV samples · Area: Recovery / engine
There are **four overlapping readiness services** (`readiness_score`, `readiness_detector`, `adaptive_readiness`, `morning_health_detector`) computing HRV baselines three different ways, and `intraday_sync_service.py` now stores 3-minute HRV / stress / body-battery arrays in `daily_metric_samples` that **nothing consumes**. Reconcile to one canonical HRV model, and put the intraday samples to work: true overnight rMSSD windows, an HRV-slope / CV trend, and morning-vs-night parasympathetic balance — replacing reliance on Garmin's opaque `hrv_status` proxy. Expose the readiness composite's input weights so a coach can see *why* the score is what it is (currently opaque).
**Expected improvement:** one trustworthy readiness number instead of three quietly-disagreeing baselines; unlocks a whole tier of HRV analytics from data already being stored for free.
**Effort:** M · **Rationale:** individual rolling lnRMSSD baselines (Plews/Altini); HRV CV/slope is the NFOR signal — but only if computed from real overnight windows, not a wrist proxy.

### F4. Menstrual-cycle-aware readiness — activate `menstrual_adjustment.py` · Area: Recovery / Profile
The module computes a bounded cycle-phase readiness delta but is **gated dead** — no cycle field on the profile, so the delta is always None. Add an opt-in cycle-tracking profile field (GDPR consent infra already exists) and wire the delta into `readiness_score.compute_readiness` (which already accepts `menstrual_readiness_delta`).
**Expected improvement:** serves the large, under-served population of serious female cyclists with physiology-aware readiness — a genuine differentiator.
**Effort:** S–M · **Rationale:** roadmap P2.5; bounded phase-based readiness nudge, opt-in and consented.

---

## Theme G — Environmental, aero & heat/altitude modeling

### G1. Heat-strain & thermal-load context for rides · Area: RideAnalysis / Debrief
`environment.py` (ISA air density, relative wind) and `weather_client.py` exist and `cda_estimate.py` inverts the power balance, but there's no heat-strain interpretation. Add a thermal-load read per ride (temp/humidity → environmental stress, HR-drift attributable to heat vs. fatigue) so a hot-day decoupling isn't misread as poor durability, and track cumulative heat exposure toward acclimation.
**Expected improvement:** correctly attributes cardiac drift (heat vs. fatigue) — a common misdiagnosis; supports deliberate heat-acclimation blocks pros use pre-altitude/hot races.
**Effort:** M · **Rationale:** heat inflates decoupling independent of fitness; 10–14 day heat-acclimation is an established plasma-volume/performance intervention.

### G2. Altitude-aware load & performance adjustment · Area: RideAnalysis / Plan
`environment.py` already models air density vs. altitude. Use altitude context to adjust expected power at altitude (reduced VO2max/CP), flag rides done at elevation so the power curve isn't unfairly penalized, and support altitude-camp planning (live-high context in the projection).
**Expected improvement:** prevents an altitude camp from reading as a fitness crash; serious athletes at elevation currently get punished by sea-level models.
**Effort:** M · **Rationale:** ~6–7% VO2max loss per 1000 m above ~1500 m; density already computed.

### G3. CdA trend & aero-vs-terrain decomposition · Area: RideAnalysis / Lab
`cda_estimate.py` returns a robust median CdA per suitable ride (with honest uncertainty caveats). Track CdA over time (position changes, kit) and decompose ride power into aero/rolling/gravity/kinetic components so the athlete sees where the watts went — the analysis a TT specialist lives in.
**Expected improvement:** field-aero feedback without a wind tunnel; directly serves TT/triathlon-adjacent riders.
**Effort:** M · **Rationale:** steady-state power-balance CdA inversion (Chung/"virtual elevation" family); label as directional, not wind-tunnel.

---

## Theme H — Race modeling & pacing

### H1. Course-aware pacing plan (pre-ride) · Area: Plan / new "Race" surface
`pacing_analysis.py`, `climbing_analysis.py` (VAM, W/kg, HC/1/2/3/4), `ride_segmentation.py` and `route_library.py` exist, mostly in debrief. For a target event with a known route, generate a **prospective** pacing plan: target power/W′ budget per segment, where W′bal will bottom out, fueling checkpoints — a race-model the athlete takes to the start line. (Stays within positioning: this is *before*, not in-ride execution.)
**Expected improvement:** converts scattered analyzers into a headline pre-race deliverable; W′-budget pacing is exactly how climbs/finales are won or blown.
**Effort:** L · **Rationale:** W′bal-constrained optimal pacing on graded courses (Skiba/de Koning); climbing power already modeled.

### H2. Post-race debrief: pacing execution vs. optimal · Area: Debrief
`race_debrief.py` already aggregates most science modules. Add an explicit pacing-quality read: where the athlete over-/under-spent W′ vs. the H1 model, negative/positive split, fade point, and a one-line "you left 2 kJ on the road / you went 8% too hard on climb 2."
**Expected improvement:** closes the plan→execute→review loop with a concrete pacing verdict — the most actionable race lesson.
**Effort:** M · **Rationale:** W′bal reconstruction of the ride vs. plan; achievement-first framing already the debrief's style.

### H3. Fueling / carbohydrate-demand modeling for long events · Area: Plan / Debrief
`fueling_analysis.py` is LIVE-in-debrief (in-ride fueling is explicitly the sanctioned bike-native carve-out). Extend to a **prospective** carbohydrate target (g/h) and total kJ/CHO demand for a planned event from its duration/intensity, and grade actual intake in the debrief.
**Expected improvement:** under-fueling is the top cause of long-event blow-ups; a g/h target is concrete and coach-endorsed (60–90+ g/h).
**Effort:** M · **Rationale:** kJ→CHO demand modeling; 60–90 g/h dual-source carb guidance is current sports-nutrition consensus.

---

## Theme I — Structured-workout export & head-unit integration (respect the no-ERG boundary)

### I1. Surface the existing workout export (.zwo/.erg/.mrc) with a "get it on your head unit" flow · Area: WorkoutDetailView
`workout_export.py` already produces .zwo/.erg/.mrc (verified) but it's not surfaced. Add a download/export affordance on planned workouts with a short device guide (Garmin/Wahoo/Zwift). This honors the positioning boundary — we prep the workout; the head unit executes.
**Expected improvement:** removes a hard blocker for structured-training athletes who won't adopt a coach app that can't hand a workout to their Edge/Karoo.
**Effort:** S · **Rationale:** roadmap P2.6; data-openness as a trust signal — serious cyclists check for export before committing.

### I2. True Garmin/Wahoo workout push — once official API lands · Area: integrations
`push_to_garmin_soon` is a stubbed "coming soon" button; `garmin_client.py` is read-only (scraper). Schedule real device push **only after** the official-API approval (P0.6). Do not build push against the scraper.
**Expected improvement:** one-tap "tomorrow's workout is on your Edge" — the frictionless loop TrainerRoad/JOIN users expect.
**Effort:** M (post-API) · **Rationale:** roadmap P2.6 explicitly gates push on official-API approval; advertising a dead integration is the Bevel 1-star wound.

### I3. Pro-grade structured-workout builder: graphical editing, target modes, import · Area: WorkoutBuilderView
The current builder is stepper-only (%FTP + minutes, up/down arrows) with ZWO *export*. A coach needs more: **direct-manipulation graphical editing** (drag block heights/widths on the chart), targets beyond %FTP (absolute watts, %CP, cadence and HR per block, over-unders and micro-bursts like 30/15s), a live TSS/IF/**W′-cost** preview (ties to A5), and **.zwo/.erg import** to ingest third-party structured workouts into the builder. `custom_workout_blocks.py` / `program_builder.py` / `workout_templates.py` and the `.zwo/.erg/.mrc/.fit` serializers already exist to build on.
**Expected improvement:** lets the coach persona author bespoke sessions instead of picking from the 12-template whitelist; graphical editing + import is table-stakes parity with TrainerRoad/Zwift's builders, and the W′-cost preview is genuinely novel.
**Effort:** L · **Rationale:** builds on the existing block model + serializers; W′-depletion-targeted intervals are a frontier prescription concept.

---

## Theme J — Deep integrations & data trust

### J1. .FIT upload endpoint (device-agnostic ingestion) · Area: integrations / onboarding
Named as a still-remaining task in `science-engine-modules`: there is no `.FIT` upload path, so any athlete not on Garmin (Wahoo/Hammerhead/Polar/manual) can't feed the stream pipeline that all the good science depends on. Add a FIT-parse-and-ingest endpoint that flows into `stream_ingestion.py`.
**Expected improvement:** removes the single biggest data-coverage blocker; makes the whole science engine reachable for non-Garmin power-meter athletes.
**Effort:** M · **Rationale:** FIT is the universal activity container; unlocks the entire per-second analytics stack for everyone.

### J2. Data export & one-way Intervals.icu push · Area: Settings / integrations
There is no export today. Add FIT/CSV export of activities + computed metrics (CP/W′/TSS/decoupling), and an optional one-way Intervals.icu push. "Your data is yours" is on-brand and a hard pre-commit checkbox for serious athletes.
**Expected improvement:** removes a purchase objection for the exact power-user segment; interoperability with WKO/Intervals workflows.
**Effort:** M · **Rationale:** roadmap P2.11; export openness as trust signal — "never hold data hostage."

### J3. Data-trust / validation layer: dropouts, spikes, dual-recording, calibration drift · Area: RideAnalysis / ingestion
The pipeline already handles Garmin smart-recording gaps and auto-pause (the NP 91→188 W fix), but a sports scientist needs **visible** data-quality flags: power dropouts, implausible spikes, GPS/elevation glitches, and power-meter calibration/zero-offset drift (e.g. a suspiciously low/high day flagged before it corrupts CP or the projection). Show a per-ride data-quality badge and quarantine bad rides from model fits.
**Expected improvement:** protects every downstream number (CP, W′, projection) from garbage-in; "one wrong confident number = churn" — data validation is a retention feature.
**Effort:** M · **Rationale:** competitive analysis — sync reliability and honest uncertainty are retention features; models must exclude corrupt rides.

### J4. Wahoo & Apple Health honesty sweep · Area: onboarding / integrations
Wahoo OAuth is coded but server-unconfigured (onboarding admits "coming soon"); Apple Health is manual-only. Either configure Wahoo server OAuth or hide the option, and audit Apple Health payload coverage. Advertising a dead integration is a direct trust wound.
**Expected improvement:** eliminates the "advertised-but-stubbed" 1-star risk; honest surface = trust.
**Effort:** S–M · **Rationale:** roadmap P2.7; the Bevel 1-star pattern is dead-integration advertising.

---

## Theme K — Coach-facing tooling

### K1. Coach/athlete multi-athlete roster view · Area: new coach surface
Everything today is single-athlete. A sports-scientist coach manages a squad. Add a roster overview: each athlete's readiness, CTL/ATL/TSB, TID drift, illness/overreaching flags, and days-to-event at a glance, drilling into any athlete's Lab. This is the tooling that turns the app from a solo product into a coaching platform.
**Expected improvement:** opens the coach/B2B segment; a coach who runs their squad here brings 10–30 athletes each.
**Effort:** L · **Rationale:** the persona is explicitly a coach+athlete pair; no competitor combines this engine with a warm athlete-facing app.

### K2. Annotatable, shareable ride/period reports (coach comments + RPE reconciliation) · Area: Debrief / period_report
`period_report.py` and `session_report.py` produce rich reports. Let a coach leave notes on a ride/week and let the athlete log session RPE; where session-RPE (sRPE load) disagrees with the power-derived TSS, flag it and let it correct the load model (roadmap P2.2). This is the human-in-the-loop layer coaches expect.
**Expected improvement:** RPE-vs-TSS disagreement is a leading fatigue/illness signal and calibrates internal-vs-external load; comments make it a shared coaching artifact.
**Effort:** M · **Rationale:** sRPE (Foster) internal-load cross-check; RPE disagreement flags fatigue (roadmap P2.2).

### K3. Model transparency / methods drawer · Area: Lab (global)
The engine is unusually citation-rich (`coach_knowledge.py`, per-metric citations, honest "—" system). Give the pro persona a "methods" drawer on each analytic: the exact formula, constants (τ1=42/τ2=10, CP model, SWC=0.5σ), assumptions, and uncertainty. Sports scientists trust what they can inspect.
**Expected improvement:** converts skeptics — the audience that distrusts black-box "AI coach" claims — into advocates; differentiates from Strava's "horoscope" Athlete Intelligence.
**Effort:** S · **Rationale:** the citations already exist in-code; exposing method + uncertainty is the credibility play against LLM-summary competitors.

---

## Suggested sequencing (pro-lens)

1. **Unlock first (weeks 1–3):** A1 Lab surface, A2 CP/eFTP headline + FTP prompt, A4 W′bal trace, E2 true per-second time-in-zone (data-ready, biggest accuracy fix), I1 export surface, J1 FIT upload — nearly all "wire what's built," highest WOW-per-effort.
2. **Deepen (weeks 3–8):** B1/B2 pedaling & quadrant, A5 prescriptive W′bal, C1/C3 CP-fit + projection bands, D1/D2 periodization view + taper, E1 TID dashboard, F1 HRV autoregulation + F3 readiness reconciliation, J3 data-trust.
3. **Frontier (post-October):** B3 per-second viewer, C4 individualized τ (wire the two FF models together), G1–G3 heat/altitude/aero, H1–H3 race model + pacing + fueling, I3 builder, K1 coach roster.

Each item builds on code that already exists; none requires abandoning the positioning boundary (before/after, not in-ride execution) or the honest-uncertainty ethic that is this app's signature.
