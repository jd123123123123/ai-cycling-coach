# Adaptive cycling training for RIDR

## Decision

RIDR should optimize the next useful training stimulus against the rider’s actual response, event demands, available time and recovery. The strongest near-term opportunity is to connect evidence the app already holds: post-ride perceived exertion, the structure of completed intervals, historical performance at comparable accumulated work, and the context in which the effort happened. More frequent computation is useful; more frequent escalation is not an outcome to optimize.

The current implementation already runs an hourly adaptation sweep and a post-session absorption flow. A new scheduler alone would duplicate existing behavior. The proposed replacement is an event-driven decision pipeline with one versioned athlete state, explicit uncertainty, and one transactional plan revision. It should continuously check whether the plan remains appropriate, while usually leaving an appropriate plan unchanged.

The desired product promise is **the strongest sustainable progress this rider can demonstrate**, not a guaranteed percentage gain or a “superhuman” setting. Good execution, improving repeatability and better late-ride power are legitimate successes even when FTP does not change. No retrieved study validates RIDR’s current readiness weights, escalation multipliers, or a universal hourly adaptation algorithm.

## Evidence scope

Evidence was checked through **14 September 2026**, prioritizing primary trials, original analyses, systematic reviews and official product documentation. The intended population is ambitious adult amateur cyclists, from limited-time riders to experienced event competitors. Findings in professional men, runners, older inactive adults or laboratory protocols are identified rather than silently generalized. This is a focused evidence review and source-code audit, not a preregistered systematic review or an audit of real users’ private records.

Source inspection covers the local `stages-release` checkout, which contains the deployed Plan implementation. Source behavior establishes what the code can do; it does not establish that every rider’s Garmin account supplies every field, that every background job succeeds in production, or that a stored value has adequate quality. No production training plans were changed for this report.

## 1. What recent evidence changes

### Training distribution needs to follow the rider and the task

Rosenblat and colleagues’ 2025 individual-participant network meta-analysis included 13 studies and 348 endurance athletes, of whom 52 were women. Polarized and pyramidal interventions did not differ significantly overall in VO₂max or time-trial improvement. Exploratory subgroup findings favored different distributions at different performance levels. This supports maintaining multiple approaches and evaluating the individual response; it does not establish a simple threshold at which every athlete should switch models.[^1]

A randomized study published on 6 August 2026 compared six weeks of three weekly HIIT sessions with or without another 240 minutes of low-intensity cycling. In 19 moderately trained cyclists/triathletes, both groups improved time-trial performance; the extra volume did not produce a statistically detectable additional benefit. The small sample, short intervention and mixed population limit inference about long-term durability, elite riders or the value of easy volume generally.[^2]

**RIDR recommendation:** Replace the fixed mapping “FTP goal → sweet spot; VO₂ goal → polarized” with a goal-demand profile plus an initial training hypothesis. Preserve suitable easy volume, but do not add hours merely to fill a ratio. Compare completed work and response over several weeks before changing the hypothesis. Count session intent and actual time in intensity domains separately: a three-zone research distribution is not interchangeable with the app’s seven FTP bands.

### Concentrated blocks are a specialist option, not an aggressive default

A 2025 study of 22 highly trained cyclists compared a concentrated moderate-intensity block with a high-intensity block. Both improved 15-minute power; some adaptations differed by intensity. Importantly, the study included six days of active recovery after each block, and only one participant was female. Its repeated-block design does not establish that this is the best continuous schedule for an amateur with work and family demands.[^3]

**RIDR recommendation:** Allow a future supervised “training camp/block” mode only when the rider deliberately selects it, has relevant training history and has the recovery window available. The normal engine must not discover five hard sessions in six days by incrementally escalating otherwise ordinary weeks. Store block intent, the recovery commitment and the next evaluation point as explicit constraints.

### Durability is highly relevant, but comparing arbitrary ride halves is insufficient

The recent cycling durability literature distinguishes performance when fresh from performance after accumulated work. A systematic review published online in 2025 and assigned to the 2026 journal volume included 21 studies with heterogeneous laboratory, field and race methods. Prior work intensity matters, not just accumulated kilojoules; heterogeneous protocols prevent one universal “fatigue-resistance threshold.”[^4]

An original 2025 amateur cycling study used 14 endurance-trained riders, averaging approximately 9.6 training hours weekly. Its small sample supports the practical relevance of fresh-versus-fatigued assessment while leaving substantial uncertainty about prediction and optimal training interventions.[^5]

Rothschild and colleagues’ 2025 analysis of 51 trained cyclists found relationships between HR/respiratory-frequency decoupling and deterioration of the first ventilatory threshold during controlled prolonged cycling. This supports contextualized drift monitoring. It does not validate a whole outdoor ride’s first-half/second-half ratio as a direct measurement of fitness, glycogen depletion or an individual’s physiological threshold.[^6]

A 2026 experiment with 16 men and 16 women found sex differences in some responses to prolonged heavy-intensity cycling. Population composition therefore matters when building norms or transferring models. Individual longitudinal comparisons should precede any sex-based adjustment.[^7]

**RIDR recommendation:** Make durability a first-class event-specific dimension: “your sustained power after substantial work” and “how HR changes during comparable steady riding.” Store these as separate observations. Match prior work, intensity, duration, device, indoor/outdoor context and weather where possible. A rider who cruises home after an early hard climb has not demonstrated worse durability merely because the second half is lower power.

### HRV helps choose when to execute a plan; it does not prove growth

Javaloyes and colleagues’ cycling trial involved 17 well-trained cyclists, four baseline weeks and eight intervention weeks. The HRV-guided group improved several measures within the group, but conventional between-group comparisons were not significant. This is encouraging evidence for individualized timing, with insufficient precision to label every HRV-driven rule “high confidence” or attach the trial’s gains to an individual app user.[^8]

The measurement protocol matters. Firstbeat’s own guidance emphasizes consistent timing and posture and warns that changing measurement time reduces comparability.[^9] Overnight wearable HRV is not identical to a standardized waking chest-strap protocol. Device changes, missing nights, source changes and retrospective corrections should therefore be represented explicitly.

**RIDR recommendation:** Use HRV as one recovery signal relative to the rider’s own history. In-range HRV should normally permit the planned stimulus, not award additional intensity. Missing HRV should mean that this input is unknown; it should not exclude a rider from a useful training plan. Record supporting and conflicting evidence separately, including how the rider actually feels.

### Subjective response is a missing connection, not a missing questionnaire

A systematic review of 56 studies found subjective well-being measures responsive to acute and chronic training changes, often more consistently than commonly used objective measures. This older but relevant evidence supports combining athlete reports with sensors rather than trying to eliminate self-report.[^10] A 2026 scoping review mapped 71 studies using mobile or wearable monitoring; this describes implementation possibilities, not proof that higher sampling frequency improves cycling performance.[^11]

**RIDR recommendation:** Connect the RPE input already stored by the app. Ask one contextual follow-up only when useful: unusually hard, legs sore, limited by traffic/time, discomfort, or fueling difficulty. Do not require a long daily survey. Missing feedback should remain missing; the engine can still recognize mechanical work and preserve a reasonable plan.

### Sleep should influence the decision without becoming a precise capacity meter

A 2025 meta-analysis of 45 studies found impaired performance and higher perceived exertion after sleep deprivation, with heterogeneous tasks and populations. The athlete aerobic-endurance effect had a wide confidence interval. This supports taking poor sleep seriously, not translating a wearable sleep score of 54 versus 56 into a precisely validated difference in allowable watts.[^12]

**RIDR recommendation:** Use recent sleep duration, the rider’s normal pattern, consecutive short nights, subjective sleep quality and current symptoms. Treat sleep-stage estimates as context, not a primary trigger for changing intervals. A short night plus additional adverse signals can justify a lower-demand option; one proprietary score alone should not produce false certainty.

### Fueling is a performance lever and a confounder of “fitness”

The 2026 UCI road-cycling nutrition review emphasizes individualized race nutrition, preparation of gut tolerance and the changing demands of professional racing. Professional practices are not automatic targets for every amateur.[^13]

Norte and colleagues’ 2026 crossover study compared 0, 60 and 120 g/h carbohydrate during three hours of moderate cycling in 16 trained cyclists/triathletes, 15 of them men. Higher intake attenuated the subsequent reduction in estimated critical power, but did not prevent it; the protocol included standardized pre-exercise carbohydrate intake. This is evidence about acute durability under specific conditions, not a universal 120 g/h recommendation or proof of superior long-term adaptation.[^14]

**RIDR recommendation:** Build a practical fueling plan for long/key rides around duration, expected intensity, previous tolerance and available food. Record approximate actual intake and GI tolerance when voluntarily supplied. Do not infer precise carbohydrate/fat oxidation or glycogen remaining from FTP percentage alone. When a rider fades in heat with unknown intake, show possible explanations rather than diagnosing underfueling or lowering their fitness estimate.

### Strength deserves its own progression and recovery accounting

A 2025 randomized trial in 37 well-trained male cyclists compared two weekly off-bike or very-high-resistance on-bike sessions with a cycling-only control over ten weeks. Both resistance approaches improved strength and Wingate performance, without a significant VO₂max effect. The specific on-bike protocol was not ordinary low-cadence endurance riding.[^15]

**RIDR recommendation:** Treat strength as a separate progression with experience, equipment, soreness and recent lifting history. Account for it when scheduling key rides. Do not translate all strength work into a guessed cycling TSS and assume equivalent recovery cost. Explain the target as strength/power support rather than automatic FTP improvement.

### Better power models are useful only when their inputs support them

Field critical-power work demonstrates that protocol and effort selection affect validity and repeatability; deliberate maximal trials and opportunistic training files are different measurement situations.[^16] A newer method, RACLET, was published online in December 2025 and in print in 2026. Its 23-participant study showed promising reliability and concurrent validity, but this is an emerging test protocol, not a reason to silently replace a rider’s FTP from ordinary ride data.[^17]

**RIDR recommendation:** Maintain measured best efforts, modeled CP/W′, operational FTP and estimated VO₂max as distinct quantities. Confidence needs independent effort coverage, recency, device continuity and residual/model diagnostics. Many adjacent durations from the same maximal effort are not independent evidence. Do not extrapolate a two-parameter 2–20-minute model to 60 minutes and present that result as measured FTP.

### Novel does not automatically mean suitable for autonomous prescription

Blood-flow-restriction findings are a useful example. A 2025 trial in healthy men reported benefits over sham during a short HIIT intervention, while a 2026 study in 17 well-trained cyclists found similar performance improvements with and without BFR.[^18][^19] Different populations and protocols preclude a blanket conclusion. Restriction devices and specialist monitoring add practical risk and complexity.

A May 2026 DFAα1 preprint explores training-readiness/durability signals, but remains preprint evidence at the inspected version. RIDR also does not currently hold the beat-to-beat RR and artifact provenance needed to apply it responsibly.[^20]

**RIDR recommendation:** Keep BFR, automatic heat-stress protocols, hypoxic interventions and DFAα1-driven escalation out of the default autonomous engine. Track them as research candidates with explicit data and validation requirements. The immediate advantage lies in using existing reliable observations better.

## 2. Current product implementations worth learning from

| Product and inspected documentation | Documented behavior | Transferable idea for RIDR | Boundary |
|---|---|---|---|
| TrainerRoad AI Training Simulation, current 2026 documentation | Recalculates a four-week window after completed workouts and calendar changes; shows upcoming difficulty and fatigue-related changes | A stable horizon, explicit changed sessions, context around expected difficulty | Vendor documentation describes features, not independent efficacy; do not copy a predicted FTP without validation |
| TrainerRoad AI FTP Prediction | Forecast depends on recent performance and the current plan; withheld when history is insufficient | Differentiate projected from observed performance and show uncertainty | A forecast is not an earned improvement |
| JOIN readiness and activity feedback, pages updated August 2026 | Uses perceived recovery/soreness and post-activity feedback to adjust the suggestion | One-tap feedback at a relevant moment; athlete report can correct a sensor-derived expectation | Self-report is useful information, not undesirable manual work |
| Garmin Training Readiness | Combines sleep, HRV, load, recovery time and stress; updates during the day | Show data freshness and distinguish morning from current state | Its composite already incorporates overlapping inputs; counting the composite plus all components as independent signals double-counts evidence |

These are product observations, not comparative outcome claims.[^21][^22][^23][^24] RIDR can distinguish itself through a transparent relationship between the ride, the next decision and the rider’s specific goal, while retaining low input burden.

## 3. Read-only audit of the existing engine

### Useful foundations to retain

The code already contains substantially more than a static plan generator. `scheduler.run_hourly_plan_adaptation()` calls `plan_absorption.absorb_new_activities()` and `plan_adaptation_engine.run_for_user()`. Garmin sync also invokes absorption after new activities or maintenance/backfill. The hourly engine protects user-authored sessions in ordinary adaptations, checks recent health signals, avoids some adjacent quality-session placements, and emits before/after plan records.

`PlanAdaptation` is an append-only-by-convention explanation log. `decision_log.py` records inputs and an engine version. `hrv_state.py` centralizes HRV windows instead of allowing each consumer to calculate its own baseline. `training_review.load_review()` looks for a prescription that existed before the ride, rather than grading the rider against a revised recommendation. Missing or incomplete power data can produce an ungraded result.

`plan_absorption._absorb()` locks the athlete profile while absorbing activities and leaves incomplete scored rides eligible for a later retry. `plan_stimulus_adaptation.adapt_stimulus()` generally exchanges existing work or eases it, avoiding automatic catch-up additions. The outdoor placement service preserves prescribed intervals and explicitly labels route/physics assumptions. These are valuable architectural constraints.

### Gaps with direct implementation consequences

| Finding from inspected code | Practical consequence | Required correction |
|---|---|---|
| `adaptive_readiness.assess_adaptation()` treats in/above-band HRV plus “hungry” preference and non-worsening/unknown durability as grounds for escalation; text says the body is adapting | Preference can lower evidentiary requirements; permissive signals become positive proof | Preferences control goals and feasible commitment, not confidence in physiological adaptation. Require positive task-specific response evidence before progression |
| `volume_modifier` reaches 1.4, but comments explicitly say served session volume is not necessarily scaled upward | A directive multiplier is not the same as the actual prescription | Trace the exact executed prescription; remove unused physiological-looking numbers from the public explanation |
| `_rule_green_upgrade()` uses three recent HRV days and can accept absent sleep scores; under-budget status is a key condition | Missing corroboration can look like three fully recovered days; spare TSS budget becomes a reason to add work | Classify coverage separately and require a scheduled progression opportunity, not simply spare budget |
| `RideFeedback` is read/written in `api/activities.py`, but no reference was found in the inspected adaptation services | The rider’s answer does not yet close the core adaptation loop | Incorporate the stored answer into session interpretation and progression confidence; add an event on feedback update |
| Review score weights zone-dose fit, duration and TSS; `decide_stimulus()` mainly counts aggregate above-threshold seconds | Scattered surges and purposeful repeated intervals can receive similar physiological interpretation | Align intervals and evaluate repeatability, recovery and continuous work bouts while tolerating outdoor interruptions |
| Durability trend compares whole-ride HR drift with work within ±35%, minimum three matches | Matching total work alone leaves intensity, heat, stops, terrain and effort intent uncontrolled | Persist richer contextual observations and reject weak comparisons |
| `durability_drop()` exists but has no corresponding per-ride persisted field in `ActivityStream` | The core adaptation loop uses a weaker proxy while stronger raw material is available | Persist fresh/late effort observations with provenance; distinguish deliberate late test from unattempted power |
| `fueling_analysis._cho_fraction()` maps IF to carbohydrate fraction; `_carb_target_band()` returns 90–120 g/h for any IF ≥0.85, regardless of short duration | Physiological specificity and practical fueling needs are overstated | Duration-first recommendations, tolerance history, uncertainty and no inferred substrate grams as fact |
| `analyze_fueling()` can infer possible underfueling from long-ride HR drift alone | Heat, hydration, pacing or sensor problems may be mislabeled | Use “cause unclear” and ask only the relevant optional follow-up; do not convert this inference into a fitness downgrade |
| `critical_power.fit_critical_power()` calls CP + W′/3600 “eftp”; three MMP durations establish `identifiable` | Extrapolation outside the fitting range and correlated points can create false certainty | Separate model outputs from FTP; require independent efforts and validated applicability |
| `plan_goal.apply_goal_to_profile()` assigns one distribution from a broad focus | An endurance event and the rider’s actual limiter can collapse into a coarse label | Use a multi-dimensional demand profile and current evidence of limitations |
| `_build_snapshot()` fingerprints only the latest daily metric plus selected plan/load fields | Corrected historical HRV, feedback, injury flag or FTP changes may not invalidate a quiet run if other included fields remain identical | Version every input dependency and fingerprint the complete decision state |
| `build_adaptive_directive()` selects sleep freshness via `recorded_at`, not solely measurement date | A recently imported old night may appear recent; this needs regression verification | Apply upper/lower athlete-local measurement-date bounds and distinguish ingestion time |
| Hourly `run_for_user()` does not take the profile/plan lock used by absorption; adaptation dedup is query-then-insert and the ORM log has no idempotency unique key | Concurrent workers can race despite logical dedup | Serialize all plan writers and enforce database idempotency / expected plan version |
| Absorption deduplicates on activity ID after one completed review | Later corrected power/feedback may never revise a previously completed interpretation | Versioned activity evidence and compensating decisions, without applying the same load twice |
| Hourly load aggregation is cycling-only; post-session stimulus logic partly protects unknown other-sport work | Running/strength impact is uneven across decision paths | A common cross-sport recovery ledger with sport-specific interpretation |

These are source-level findings and testable failure modes, not claims that each has already caused a production incident. The proposed fixes should first run on deterministic fixtures and historical shadow replay.

## 4. Data inventory

“Available” below means a schema/path exists. It does not mean the field is present for a particular rider. Every feature should carry measurement time, ingestion time, source, quality and missingness.

| Data | Current storage/path | Status in the inspected adaptation path | Proposed use |
|---|---|---|---|
| Duration, distance, ascent, TSS, average/normalized power | `Activity` | Used, especially TSS; distance/ascent less central | External workload and event specificity; distinguish load method and FTP at scoring |
| FTP and historical FTP | `AthleteProfile.ftp_watts`, `ftp_history`, `Activity.ftp_watts_at_scoring` | Used | Preserve dated threshold provenance; historical comparisons in consistent units |
| 1 Hz power, HR, cadence, altitude | `ActivityStream.streams` | Partly used | Interval execution, time at demand, steadiness, repeated efforts, valid late-ride observations |
| GPS, speed, distance, device temperature, optional pedaling channels | `ActivityStream.streams` | Available conditionally; not central to adaptation | Stops/terrain/context and exclusion rules. Do not infer technique injury risk from noisy pedaling metrics |
| Per-ride MMP, CP, W′, eFTP, kJ, drift | `ActivityStream` | Used in analysis; adaptation mainly drift/kJ | Evidence-indexed power profile, late-power bands, model diagnostics |
| HRV, resting HR, sleep duration and score | `DailyMetric` | Used | Standardized recent recovery context and individualized baseline |
| Sleep stages, respiration, SpO₂ | `DailyMetric` | Available conditionally, not core inputs in inspected plan loop | Display context; persistent unusual patterns can prompt attention without diagnosing disease |
| Wake/current Body Battery and stress, training readiness, recovery hours | `DailyMetric` and intraday samples | Available conditionally; not fully used by hourly plan snapshot | Supporting context with timestamps and correlated-source handling; not additive independent votes |
| Subjective RPE | `RideFeedback` | Stored, not connected to inspected decision loop | Expected-versus-reported effort, progression tolerance, clarification of exceptions |
| Injury and athlete status | Profile flag and goals status | Used, but snapshot coverage incomplete | Immediate constraints and versioned event, consistent across all consumers |
| Goal date/type, custom goal, availability, experience, hard-day blackouts | `AthleteProfile` and plan-goal services | Used | Immutable intent and feasibility constraints; finer goal demands |
| Original planned prescription | `CoachRecommendation`, pre-ride `CoachBrief`, `PlannedWorkout` | Partly reconstructed | Explicit immutable prescription snapshot linked to the actual ride |
| Historical weather | `ActivityStream.weather` | Start-location/time summary available | Confound matching. A whole route’s conditions require more than its start point |
| Selected/event GPX | Owned routes and `target_event_gpx` | Outdoor placement exists | Terrain-specific continuous work windows and event demand, with uncertainty |
| Carb intake, fluid, GI tolerance | No dedicated fields identified in inspected models | Missing; fueling is modeled | Optional minimal post-key-ride input, not mandatory food diary |
| Muscle soreness, perceived recovery, life stress, reason for stopping | No general structured daily wellness model identified | Missing or represented only indirectly by status | Two-tap contextual assessment when decision-sensitive |
| RR intervals, ECG quality, lab lactate/VO₂, core temperature, glucose, sweat rate | Not available in inspected training schema | Missing | Never manufacture; future opt-in integrations only with a clear decision benefit |
| True physiology change caused by one ride | Not directly measurable by available streams | Not observable | Say “stimulus completed”; confirm change through later comparable performances |

## 5. Proposed decision architecture

### A shared state with three time scales

**Longer-term capacity** includes independently supported power-duration performance, fatigue resistance, accumulated tolerance, skill/strength exposure and event demands. Update observations after new rides, but change the estimate only when evidence supports it. One easy ride without a maximal effort is not a negative FTP test.

**Short-term readiness** includes recent workload, sleep, HRV, symptoms, soreness and perceived recovery. It determines whether today’s planned challenge remains appropriate. Uncertainty should be visible internally even when the interface remains simple.

**Immediate context** includes available time, chosen route, current weather and equipment. It changes feasibility or execution. Afternoon rain can move the same stimulus indoors without claiming the rider’s aerobic capacity changed.

The planner should maximize expected progress toward the selected goal under time, recovery and execution constraints. It should penalize unnecessary plan churn and unproductive excess work. A practical first version is a transparent rules-and-ranking engine; a complex reinforcement-learning system is not justified before reliable outcomes and counterfactual evaluation exist.

### Trigger policy

| Trigger | Recompute | Allowed outcome |
|---|---|---|
| App opens | Start/coalesce source sync, return cached screen immediately, evaluate new evidence when it arrives | Current plan or one explained revision; opening the app is not itself evidence for a change |
| Morning metrics arrive or are corrected | Freshness, recovery context and today’s prescription | Keep, ease, replace equivalent stimulus, or attention state |
| Hourly sweep | Lightweight dependency/version check | No-op when inputs are unchanged; retry incomplete upstream work |
| New session summary | Load ledger and provisional post-session interpretation | Account for load immediately; defer detailed stimulus certainty until streams arrive |
| Streams arrive/correct | Execution, profile observations and next-session feasibility | Finalize or supersede the provisional interpretation without duplicating load |
| Rider submits/corrects RPE or symptoms | Reconcile objective execution with subjective response | Update confidence and next suitable progression; immediate protective action for explicit illness/injury |
| Time/route/weather changes | Execution feasibility | Fit the existing stimulus to practical conditions, not a gratuitous full-plan rebuild |
| Weekly checkpoint | Goal-specific progress, completed exposure, tolerance and remaining calendar | Adjust the next block’s dose/format within a stable event strategy |

Do not increase training just because another hour has elapsed. Near session start, freeze routine changes; explicit rider edits or material new adverse information can override that freeze. The exact freeze window is a product setting to validate, not a biological constant.

### A post-session interpretation that is actually useful

1. **What happened:** valid duration/work, structured efforts, recovery between them, power/HR/RPE coverage and the originally prescribed task.
2. **What it trained:** a descriptive exposure vector such as sustained endurance, threshold-duration work, repeated high-intensity efforts and sprint exposure. It is not an estimate of millilitres of VO₂ gained.
3. **How it compared:** matched intervals and comparable previous sessions, including whether hard efforts were attempted at all.
4. **What changes:** precise future workout difference, its load/time effect and the preserved weekly objective—or an explicit unchanged decision.

For an outdoor VO₂-oriented workout, distinguish completed long hard bouts from seconds scattered above an FTP cutoff. A traffic stop that shifts the start of the third interval should not destroy the match. Conversely, accumulating the same zone minutes in brief sprints does not prove the same stimulus. Alignment should permit realistic start offsets and recovery extensions while reporting those differences.

Illustrative copy, using explicitly synthetic facts: “Vier von fünf Belastungen kontrolliert gefahren. Die letzte fiel deutlich ab und fühlte sich sehr hart an. Morgen bleibt locker; die nächste VO₂-Einheit wiederholt diese Stufe.” Another case: “Heute Ausdauer statt Intervalle. Deine lange Fahrt zählt; die Qualitätseinheit bleibt am Donnerstag. Kein Nachholen.” A successful ride can produce “Plan bleibt passend” without looking like the engine ignored it.

### Progression decisions

Progress a relevant dimension, not every dimension simultaneously. Threshold progression may lengthen repeatable work before raising watts. A sprint goal needs high-quality repeatable efforts and suitable recovery rather than longer exhausted sprints. A long fondo may benefit from durable power, pacing and feeding practice even with unchanged fresh FTP.

For the initial implementation, require repeated relevant successful exposures, suitable recovery context and available future time before increasing difficulty. The exact number of exposures and step size are **versioned product heuristics to test**, not claimed scientific thresholds. An unusually easy RPE can support progression, but cannot independently certify an inaccurate FTP or override a conflicting illness report.

When progress stalls, first distinguish insufficient exposure, execution constraints, stale targets, under-recovery, incomplete measurements and lack of a recent performance opportunity. Do not label a person a non-responder after one block. Prefer changing one controllable training variable and evaluating a relevant repeatable outcome.

### Mixed goals without an event date

An athlete can reasonably select VO₂-oriented performance and endurance together, or sprint power and FTP. These describe overlapping but distinct aims. They should produce one coherent plan with a shared time/recovery budget, not a concatenation of several single-goal plans.

Keep `focuses` as an ordered, explicit preference list and preserve `target_event_date = null` when no event exists. An internal eight-week block is a planning/review horizon, not an invented race date. Do not add a race taper just because the block ends; use a suitable review/recovery point and offer the next block based on response.

A practical initial policy is one dominant developmental emphasis per block with smaller supporting or maintenance exposure for the other selected aims. This is a product design recommendation, not a claim that all riders require one exclusive focus. The athlete’s current profile and time availability can determine which emphasis has the highest expected benefit; show this prioritization explicitly and allow the rider to change it.

For **VO₂ + endurance**, keep a suitable key high-intensity exposure and an achievable long/steady exposure within the same weekly budget. For **FTP + sprint**, preserve fresh, high-quality sprint opportunities rather than tacking exhausted sprints onto every threshold session. For **strength + endurance**, account for lifting experience, residual soreness and the quality of the next important ride. The specific dose and spacing should follow demonstrated tolerance, not a universal interference percentage.

A 2026-issue systematic review of heavy strength training in adult endurance cyclists included controlled studies searched through February 2025 and supports performance benefits in some outcomes.[^25] It reinforces that goals can complement one another; it does not establish that adding strength is free of time or recovery cost. Mixing two cycling endurance focuses should not be described as the same physiological “interference effect” studied in concurrent resistance/endurance training.

When available time cannot support meaningful development of all selected aims, the engine should preserve the choices and make a transparent tradeoff: “Dieser Block legt den Schwerpunkt auf Ausdauer; kurze intensive Reize halten deine VO₂-Arbeit im Plan.” It should not silently remove a focus or expand the rider’s agreed hours.

## 6. Confidence, missing data and scientific language

Each recommendation should have a confidence object containing coverage, freshness, comparability and model applicability. A single percentage presented as “certainty” is inappropriate unless it is calibrated against a clearly defined future outcome. The source of uncertainty should remain available on demand: “Kein vergleichbarer später Anstieg”, “HF fehlt”, “FTP-Schätzung aus zwei Belastungen”, or “Wetter nur am Startpunkt”.

Keep four types of claims distinct:

| Type | Acceptable statement | Unacceptable inference |
|---|---|---|
| Measured | “18 Minuten oberhalb des gespeicherten FTP-Ziels” | “18 Minuten bei VO₂max” without oxygen measurement |
| Modeled | “Geschätzte zusätzliche kurzfristige Belastung” | “Fitness physiologically increased by 0.8 today” from CTL arithmetic |
| Inferred | “Die Erholungssignale sprechen heute eher für locker” | “HRV proves you are fully recovered” |
| Prospective | “Diese Einheit soll längere Anstiege unterstützen” | “This ride added 4 W FTP” |

Missing sources reduce the resolution of the decision rather than eliminating training. HR-only users can receive duration/RPE-based sessions and comparisons of like-for-like efforts; they should not receive fabricated power scores. A new rider gets a conservative starting hypothesis and simple observation opportunities, not a fake personal baseline. Rest and taper are planned interventions, not lost points.

## 7. Data and transaction contract

Introduce an immutable input envelope with `user_id`, `event_id`, `event_type`, `occurred_at`, `received_at`, `source_version`, `quality`, and affected athlete-local dates. Every feature stores its source IDs and feature-extractor version. Preserve raw imported values separately from corrected analysis values.

A `PlanRevision` should carry the expected previous revision, triggering evidence version, engine version, full changed workout prescriptions, constraints checked, and a compact explanation. Apply it transactionally under one per-athlete lock or equivalent database serialization. A unique idempotency key prevents retries or concurrent app-open/hourly/session workers from applying the same decision twice. Notifications should be emitted from a transactional outbox after commit.

Activity corrections must use a new evidence revision. Load is recomputed from the latest activity state rather than appended again. Earlier recommendations stay in history; a superseding decision explains the correction. An exported workout carries a revision so the app can show that the device file is stale when the prescription changes.

Preserve ownership checks in all source joins and derived queries. Never accept a client-provided rider ID as authorization. Nutrition/symptom answers and GPS remain private training inputs; no new sharing to crew, referral pages or social posters. A language model may summarize the structured decision but must not mutate numeric prescriptions, invent medical explanations or execute instructions inside an uploaded plan document.

## 8. Validation before changing real plans

### Scientific evaluation

First run the proposed engine in shadow mode on dated historical snapshots, using only evidence available at each decision time. Chronological replay must include delayed syncs and corrected activities; otherwise the model benefits from information a real decision could not have known. A later best effort should not be used to retroactively make an earlier recommendation look more informed.

Measure goal-relevant outcomes: repeatable sustained power, fresh and late power separately, completion of appropriate key sessions, perceived exertion calibration, time burden and consistency. Measure unwanted outcomes too: recurrent exhaustion, repeated symptoms, plan reversals and unnecessary training additions. Engagement, number of adaptations and TSS growth are not substitutes for performance and well-being.

Compare against the existing engine and a simple stable-plan baseline. Evaluate riders with and without power, different training histories, women and men where consented data supports it, indoor/outdoor use, and limited availability. Report uncertainty and missing outcomes. A prospective opt-in evaluation is needed before claiming improved training outcomes; an offline backtest alone cannot establish causality.

### Engineering scenarios

Required fixtures include: app-open and hourly job race; summary then delayed power stream; duplicate activity from two providers; corrected FTP; corrected historical HRV; old night imported today; missing RPE; high RPE despite green HRV; two rides on one day; hard run before cycling intervals; strength soreness; late Sunday ride affecting Monday; protected external-coach session; no active plan; target event already ended; timezone/DST transitions; invalid/spiking power; and unchanged evidence over 24 hourly sweeps.

Assertions must cover exact workout seconds and watts, dose limits, no additional catch-up session, no mutation before an existing ride’s start, atomic revision history, user isolation, and no duplicate notifications. Explainability snapshots must match the plan actually served and exported.

## 9. Delivery sequence

**First release:** Correct overconfident scientific language, unify freshness, wire existing RPE, make all plan writers transactional/idempotent, and eliminate quiet-cache omissions. These changes improve the reliability of existing adaptation without requiring another wearable.

**Second release:** Persist interval execution and comparable durability observations; improve post-session reflow across week boundaries; use a common cross-sport recovery ledger. Present the actual next-session change and a useful unchanged state.

**Third release:** Introduce goal-demand profiles, individually calibrated progression and optional fueling/tolerance context. Add context-aware outdoor comparisons and stable weekly evaluation. A higher training ambition can widen agreed time commitment, but cannot manufacture evidence for faster progression.

**Research track:** Validate confidence calibration and prospectively compare performance outcomes before adding predictive FTP gains, automatic threshold updates, or specialist experimental training methods. Keep the system understandable enough that a rider can see why today’s work belongs in their plan.

## Sources

[^1]: Rosenblat MA et al. “Which Training Intensity Distribution Intervention will Produce the Greatest Improvements in Maximal Oxygen Uptake and Time-Trial Performance in Endurance Athletes? A Systematic Review and Network Meta-analysis of Individual Participant Data.” *Sports Medicine*, online 31 January 2025, March 2025 issue. [PubMed and DOI](https://pubmed.ncbi.nlm.nih.gov/39888556/). Search cutoff in the paper: 11 February 2024. Abstract inspected; full quantitative claims above limited to the abstract.
[^2]: Moran-MacDonald A et al. “The effectiveness of polarized versus high-intensity training in moderately trained cyclists: a randomized parallel-design study.” *European Journal of Applied Physiology*, 6 August 2026. [PubMed](https://pubmed.ncbi.nlm.nih.gov/42560532/); DOI 10.1007/s00421-026-06380-w. Abstract inspected.
[^3]: Rønnestad BR et al. “Block Training With Moderate- or High-Intensity Intervals Both Improve Endurance Performance in Well-Trained Cyclists.” *European Journal of Sport Science*, November 2025. [Original article](https://pmc.ncbi.nlm.nih.gov/articles/PMC12575440/); [PubMed](https://pubmed.ncbi.nlm.nih.gov/41169000/). Abstract and protocol figure description inspected.
[^4]: “Is intensity the most important factor in determining the amount of prior work accumulated that affects cyclists’ acute durability? A systematic review.” *European Journal of Applied Physiology*, online 2025, volume 126 (2026), 163–179. [Publisher article](https://link.springer.com/article/10.1007/s00421-025-05885-0). Full methods/results inspected.
[^5]: “Enhanced durability predicts success in amateur road cycling: evidence of power output declines.” *Frontiers in Sports and Active Living*, 14 May 2025. [Original article](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1530162/full). Do not infer causal prediction from the title alone.
[^6]: Rothschild JA et al. “Durability of the moderate-to-heavy intensity transition can be predicted using readily available markers of physiological decoupling.” *European Journal of Applied Physiology*, 22 May 2025. [Publisher article](https://link.springer.com/article/10.1007/s00421-025-05815-0); [author institution repository](https://openrepository.aut.ac.nz/items/8e2279d5-f66d-48a7-9c0b-28140c4d6a8f). Original methods/abstract and discussion inspected.
[^7]: “Sex Differences in Durability Following Heavy Intensity Cycling Exercise in Trained Athletes.” April 2026. [PubMed](https://pubmed.ncbi.nlm.nih.gov/41954088/). Abstract inspected; no numerical sex correction proposed.
[^8]: Javaloyes A, Sarabia JM, Lamberts RP, Moya-Ramon M. “Training Prescription Guided by Heart-Rate Variability in Cycling.” *International Journal of Sports Physiology and Performance*, January 2019, 14(1):23–32. [PubMed](https://pubmed.ncbi.nlm.nih.gov/29809080/). Abstract inspected. Conventional between-group null result retained; magnitude-based inference not treated as definitive proof.
[^9]: Firstbeat. “Introduction to Firstbeat Sports,” section 6, Quick Recovery Test. [Official protocol guidance](https://www.firstbeat.com/en/professional-sports/learning-center/introduction-to-firstbeat-sports/). Current page accessed 14 September 2026; vendor measurement guidance, not an independent efficacy trial.
[^10]: Saw AE, Main LC, Gastin PB. “Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures: a systematic review.” *British Journal of Sports Medicine*, online 2015, March 2016 issue. [PubMed](https://pubmed.ncbi.nlm.nih.gov/26423706/). Includes 56 studies; search cutoff May 2014. Older foundational evidence retained explicitly.
[^11]: “Ecological momentary assessment of the stress-recovery process through technology mHealth in sports: a scoping review.” 7 March 2026. [PubMed](https://pubmed.ncbi.nlm.nih.gov/41795119/). 71 studies, 2012–2025; abstract inspected.
[^12]: “Effects of sleep deprivation on sports performance and perceived exertion in athletes and non-athletes: a systematic review and meta-analysis.” *Frontiers in Physiology*, 2025, DOI 10.3389/fphys.2025.1544286. [PubMed](https://pubmed.ncbi.nlm.nih.gov/40236824/). 45 studies; search through September 2024; abstract inspected.
[^13]: Jeukendrup AE et al. “UCI Sports Nutrition Project: Race Nutrition for Road Cycling.” *International Journal of Sport Nutrition and Exercise Metabolism*, online 31 March 2026, May 2026 issue, 36(3):215–232. [PubMed](https://pubmed.ncbi.nlm.nih.gov/41911900/). Review/consensus-oriented professional cycling guidance; abstract inspected.
[^14]: Norte and colleagues. “Graded Carbohydrate Ingestion up to 120 g·h−1 Attenuates the Reduction in Critical Power Following 3 h of Moderate-Intensity Exercise in a Dose-Dependent Manner.” *Scandinavian Journal of Medicine & Science in Sports*, 2026. [Original article](https://onlinelibrary.wiley.com/doi/10.1111/sms.70326); [PubMed](https://pubmed.ncbi.nlm.nih.gov/42322010/). Full methods and selected results inspected. Standardized feeding, laboratory task and predominantly male sample limit transfer.
[^15]: Barranco-Gil D et al. “Off- and On-Bike Resistance Training in Cyclists: A Randomized Controlled Trial.” *Medicine & Science in Sports & Exercise*, February 2025, online September 2024. [PubMed](https://pubmed.ncbi.nlm.nih.gov/39231694/). Abstract inspected.
[^16]: “Validity and reliability of critical power field testing.” 2014. [PubMed](https://pubmed.ncbi.nlm.nih.gov/25260244/). Foundational field-test validation; abstract inspected.
[^17]: Bowen M et al. “RACLET: the Ramp Above Critical Level Endurance Test to evaluate critical power in cycling.” *European Journal of Applied Physiology*, online 19 December 2025, May 2026 issue, 126(5):2515–2528. [PubMed](https://pubmed.ncbi.nlm.nih.gov/41417070/). Abstract inspected; emerging protocol, not adopted here.
[^18]: “Blood Flow Restriction during Rest Periods of High-Intensity Interval Training Enhances Endurance Performance: A Randomized Placebo-Controlled Study.” 2025. [PubMed](https://pubmed.ncbi.nlm.nih.gov/40792614/). Forty healthy men, three-week intervention; abstract inspected.
[^19]: “Similar performance and muscle adaptations between intervals with and without blood flow restriction in well-trained cyclists.” 2026. [PubMed](https://pubmed.ncbi.nlm.nih.gov/41696846/). Seventeen well-trained cyclists, six-day microcycle; abstract inspected.
[^20]: “Evaluating the sensitivity of heart rate variability fractal correlation properties to training load variations: Implications for monitoring training readiness and durability.” medRxiv, version 1, May 2026. [Preprint](https://www.medrxiv.org/content/10.64898/2026.05.27.26354281v1.full). Explicitly preprint evidence, not a prescription basis.
[^21]: TrainerRoad. [How to use AI Training Simulation](https://support.trainerroad.com/hc/en-us/articles/41652509070619-How-to-use-AI-Training-Simulation). Official current 2026 feature documentation, accessed 14 September 2026.
[^22]: TrainerRoad. [What is AI FTP Prediction?](https://support.trainerroad.com/hc/en-us/articles/41653598134043-What-is-AI-FTP-Prediction). Official current feature documentation, accessed 14 September 2026.
[^23]: JOIN. [What is Readiness in JOIN](https://help.join.cc/hc/en-150/articles/22387845984657-What-is-Readiness-in-JOIN), updated 27 August 2026; [Feedback in Seconds. A Smarter Plan Right Away](https://join.cc/cycling-tips/feedback-in-seconds.-a-smarter-plan-right-away.), current 2026 product announcement. Vendor documentation, not a comparative trial.
[^24]: Garmin. [Training Readiness](https://www.garmin.com/en-IE/garmin-technology/running-science/physiological-measurements/training-readiness/). Official description of inputs and intraday updates, accessed 14 September 2026.
[^25]: “Heavy strength training effects on physiological determinants of endurance cyclist performance: a systematic review with meta-analysis.” *European Journal of Applied Physiology*, January 2026, 126(1):193–222; online 2025. [PubMed](https://pubmed.ncbi.nlm.nih.gov/40632222/). Controlled-study synthesis; search through February 2025; abstract inspected.

## Source-code references

All paths are relative to the audited repository checkout. They identify implementation evidence, not clinical references.

| Area | Files and entry points |
|---|---|
| Scheduling / import | `backend/app/main.py` scheduler registration; `backend/app/scheduler.py:run_hourly_plan_adaptation`; `backend/app/services/garmin_sync_service.py:sync_user_garmin` |
| State and rules | `backend/app/services/adaptive_readiness.py:assess_adaptation`, `build_adaptive_directive`, `decoupling_delta_matched`; `backend/app/services/plan_adaptation_engine.py:_build_snapshot`, `_green_streak`, `_rule_green_upgrade`, `run_for_user`; `backend/app/services/hrv_state.py`; `backend/app/services/readiness_score.py` |
| Ride interpretation | `backend/app/services/training_review.py:assemble_review`, `load_review`; `backend/app/services/ride_compliance.py`; `backend/app/services/plan_absorption.py:_absorb`; `backend/app/services/plan_stimulus_adaptation.py:decide_stimulus`, `adapt_stimulus` |
| Performance / context | `backend/app/services/durability.py`; `backend/app/services/critical_power.py`; `backend/app/services/fueling_analysis.py`; `backend/app/services/activity_analysis.py`; `backend/app/services/outdoor_workout.py`; `backend/app/services/ride_weather.py` |
| Plan construction | `backend/app/services/plan_goal.py:apply_goal_to_profile`; `backend/app/services/mesocycle_generator.py`; `backend/app/services/training_periodization.py`; `backend/app/services/weekly_plan_llm.py:enforce_week_rails` |
| Provenance and user data | `backend/app/models/activity.py`; `activity_stream.py`; `daily_metric.py`; `athlete_profile.py`; `ride_feedback.py`; `plan_adaptation.py`; `backend/app/api/activities.py` feedback endpoints; `backend/app/services/decision_log.py`; `plan_adaptation_log.py` |
