# Phase 7: Periodization + Workout Generation — Research

**Researched:** 2026-05-03
**Domain:** Multi-week periodized training plans, daily readiness-driven adaptation, structured workout authoring across cycling/running/gym
**Confidence:** HIGH on framework selection and pain points (anchored in two prior research files: `training-frameworks.md`, `athlete-pain-points.md`); MEDIUM-HIGH on adaptation thresholds (anchored in peer-reviewed studies cited below); MEDIUM on UI direction (synthesised from competitor patterns + existing Phase 6.1/6.2 design language)

---

## Summary

Phase 7 is where this app crosses from "smart daily prescriber" to "best training plan system in the world" — the user's words. The honest assessment after reading the prior research and the Phase 5–6.2 STATE: **this is too big for one phase**. Recommend splitting into 7.0 (periodization engine + week view), 7.1 (daily readiness-driven adaptation), 7.2 (rationale generation + taper/race polish). Details in Section 10.

The framework call is clear and opinionated: **default to a hybrid pyramidal-during-build / polarized-during-base periodization** (the modern 2025 elite-coach consensus per `training-frameworks.md`), implemented as a **block-periodised mesocycle generator** that picks the right TID for each phase. Friel's annual-plan boundaries (already in `coach_service.py`) become the macrocycle skeleton; Issurin block-periodisation drives the 3-6 week mesocycle structure inside each Friel phase; Seiler's TID rules drive the weekly intensity allocation; daily prescription stays as the existing 5.1 cascade with an HRV/sleep/RPE adapter layered on top.

**The single biggest pain point we are trying to kill** (per `athlete-pain-points.md` Section 1 / TrainerRoad complaints): *"AI adapts the workout down with no explanation."* Every plan change Phase 7 ships must come with a one-sentence "why" rendered inline. The TrainerRoad forum thread "AI has lost its mind" is the cautionary tale.

**Workout authoring authority:** keep the Phase 5.1 lock — LLM does NOT author intervals. Recommend extending the 12-template library to ~30 templates (full Coggan/pace coverage) rather than allowing LLM block assembly. Reasoning in Section 5.

**Primary recommendation:** Build the periodization engine as a deterministic Python service that emits a 7-day window of `PlannedWorkout` rows on every snapshot refresh, with HRV/sleep/RPE consumed as a post-pick adapter that can swap (not author) today's session. The "always for a week + why" UI lives on a new `PlanTab` in the existing segmented dashboard, with each day's card showing template name, target TSS, target IF, and a one-sentence rationale.

---

## 1. Athlete pain points across current periodization apps

Synthesised primarily from `.planning/research/athlete-pain-points.md` (which already covered TrainingPeaks, TrainerRoad, Garmin, Strava, Whoop, Intervals.icu deeply) plus targeted 2026 community signal-checks. Where I cite a specific complaint domain without re-fetching, I mark `(observed in prior research)`.

### 1.1 TrainerRoad — Adaptive Training (AT)
**What works:** AT genuinely adjusts workout difficulty per-week based on completion + RPE. Plans are coherent within a single discipline. Workout library is huge (~3000 structured workouts) and pushes to head units cleanly.

**What fails:**
- **AT goes opaque under stress** — the canonical complaint thread "AI has lost its mind" (TrainerRoad forum, 2025) describes athletes whose post-event progression silently degrades because outside rides aren't credited equivalently to indoor TR workouts. Source: prior research, TrainerRoad forum.
- **Too much intensity for >10h/week athletes** — AT plans drift toward 3-4 intensity sessions per week regardless of total volume; serious amateurs report this destroys their base. (Dylan Johnson "Problem with TrainerRoad Plans" thread, ~2023, ongoing.)
- **No multisport coherence** — runners + lifters get worse adaptation than single-sport cyclists; cross-modality TSS is treated naively.
- **Plans restart on event re-add** — adding a new B-race wipes built progression-level context.

**The lesson for us:** progression must be transparent. When we adjust, we say what we adjusted and why, in one sentence, in plain English by default.

### 1.2 TrainingPeaks — ATP (Annual Training Plan) + scripted plans
**What works:** ATP is the closest thing to a real coach's plan structure — Friel's framework rendered as a Gantt-like timeline. Coach-athlete workflow is industry standard. PMC + planned-vs-actual on every workout.

**What fails:**
- **Plans don't adapt to life.** *"You must adapt to the plan."* (cited in prior research, multiple forums.) A purchased 12-week plan is invalid the moment you get sick or have a breakthrough FTP test.
- **PMC/CTL gaming** — `8020endurance.com` argues athletes unconsciously chase TSS, parking themselves in the "grey zone" and sacrificing polarized quality. Citation: prior research.
- **Mobile UX cannot author structured workouts** on the fly.
- **CTL is intensity-blind** — three different Z3 sessions all log the same TSS but adapt the body very differently.
- **WKO5 is locked behind a 100-hour learning curve** — "built for the top 5%" critique.

**The lesson for us:** the plan must be the *recommendation*, not the *contract*. Every day's session is conditional on this morning's readiness. The plan is a hypothesis.

### 1.3 Athletica.ai — AI-driven adaptive plans
**What works (per Simple Endurance Coaching Medium review, fetched 2026-05-03):**
- Three-signal adaptation: HR response, neuromuscular response (power/GPS/accel), perceived exertion. *"Combines what it learns about your training stress... to adjust tomorrow's exercises."*
- Workout Wizard for time-constrained athletes — picks the highest-value session for the slot you have.
- Marketing line: *"adapts as your fitness, fatigue, and life change... without panic, punishment, or rigid rules."* This is the right tone — copy it.

**What fails (mixed reviews from app store + the Medium piece + prior research):**
- HR-zone calibration is fragile — *"4 months of disappointment from heart rate zones being off"* (App Store review, observed in prior research).
- The reviewer himself notes Athletica *"is pushing me a little harder than I expected"* — even the most adaptive AI tends to overprescribe relative to the athlete's lived state.
- Adaptation is reactive (post-workout), not pre-emptive (morning HRV/sleep). Doesn't pre-empt today; it adjusts tomorrow.

**The lesson for us:** Athletica's tone and three-signal adaptation are the right model. We can leapfrog by adding morning readiness as a fourth signal that adjusts *today's* session, not just tomorrow's.

### 1.4 Intervals.icu — athlete fitness/freshness model + free
**What works (per `athlete-pain-points.md`):**
- Free/cheap, fast feature dev — community-loved.
- Power-curve / W'bal / decoupling all in one activity view.
- Custom graph builder (like a poor man's WKO5).
- WHOOP integration (live April 2026).

**What fails:**
- *"Shows the data but doesn't synthesize it into a decision."* (Martin-vs-mountain, Intervals.icu forum, 2026 — prior research.)
- No proactive AI — the dashboard is reactive, you must check it.
- UI is for data-literate power users; intimidating to newer athletes.
- Calendar building less discoverable than TP.
- No native head-unit workout push.

**The lesson for us:** the data is necessary but not sufficient. The synthesis layer (one-sentence why, today-do-this) is the moat.

### 1.5 Garmin Coach / Daily Suggested Workouts (DSW)
**What works:** Free, deeply integrated with the device, simple Training Status output ("Productive" / "Maintaining"), Body Battery as a single-number readiness signal that creates morning ritual.

**What fails (per prior research, the5krunner Aug 2025, DC Rainmaker comments):**
- **Body Battery is a black box** — Marco Altini publicly calls it *"made-up scores"*. No published validation.
- **"Detraining" / "Unproductive" status creates a guilt feedback loop** — when athletes miss days the app pressures them back into training when they should rest. Dangerous.
- **DSW is generic** — picks workouts from a small pool, doesn't periodise. Many runners report being shoved into the same recovery / threshold / long-run rotation regardless of macrocycle goal.
- **Connect+ enshittification** — March 2025 Reddit "DO NOT sign up" thread (8.9k upvotes) shows the brand-trust collapse.

**The lesson for us:** never punish rest. Never gate insight behind a paywall feature. Body Battery's UX (one daily number, morning) is right — but make every component of it inspectable.

### 1.6 Strava Premium — workout suggestions / Athlete Intelligence
**What works:** Segments + leaderboards + Local Legend = the gold standard engagement loop (variable-ratio reinforcement). Kudos as a daily check-in. Heatmap for route discovery.

**What fails (per prior research):**
- **Athlete Intelligence (premium 2024-25) is thin** — reviewed by Triathlete.com as *"a gimmick... offering little value and feeling too generic."*
- **FTP-change retroactive recalc bug** — known for years, never fixed; updating FTP rewrites all historical TSS.
- **Single zone set per athlete** breaks multi-sport calculation.
- **Relative Effort is HR-only** — power-meter users get no benefit.
- **Segment chasing distorts intent** — *"Chasing a KOM subtly changed the idea of what made a ride good."* (WeLoveCycling, 2025.)

**The lesson for us:** steal Strava's morning-ritual + variable-reward UX (PRs/Local Legend), but apply it to *training execution* (consistency, polarized %, EF trend) not raw output (KOM time). Phase 9's territory mostly — but Phase 7's plan view should hint at this.

### 1.7 Cross-app meta-pattern (most important section)
From `athlete-pain-points.md` Section 4: **every major platform fails the same two tests.**

1. **The "why am I tired?" test** — no app synthesises sleep + HRV + load + recent zone distribution into a single causal narrative. Our Phase 5.x already half-solves this; Phase 7 must extend it into "why is your week structured this way?"
2. **The "always for a week" test** — TrainingPeaks shows a calendar, Athletica shows tomorrow, Garmin shows today. **No app shows a 7-day forward plan with rationale per day** that updates when readiness changes. This is our differentiator.

---

## 2. Modern sports science: periodization frameworks (2020-2026)

| Framework | Origin | Weekly TID (Z1/Z2/Z3) | Mesocycle structure | Best for | Evidence |
|---|---|---|---|---|---|
| **Linear (Friel)** | Friel 1998, Friel 2018 | varies by phase, generally pyramidal | Foundation→Prep→Build1→Build2→Peak→Race→Transition (3-6 wk each) | First-year athletes, simple A-race calendars | Decades of practice; weak RCT base |
| **Block (Issurin)** | Issurin 2008, 2010 | concentrated single physiological target per block | Accumulation (4-6 wk) → Transmutation (3-4 wk) → Realization (1-2 wk) | Elites with single peak event; advanced athletes | Issurin 2008 PubMed review; Stöggl & Sperlich 2014 |
| **Polarized (Seiler)** | Seiler 2009, 2014 | 80/<5/15-20 across the whole macrocycle | Year-round 80/20 hard/easy | Aerobic-dominant endurance, base phases, masters | Seiler 2009 Sportscience; PMC11329428 (2024 meta); Treff et al. 2019 |
| **Pyramidal** | Esteve-Lanao et al. 2007 | 70-75/20-25/5-10 | Volume-heavy with regular threshold work | Competition prep, masters, road racers | Esteve-Lanao 2007 (Med Sci Sports Exerc) |
| **Norwegian double-threshold** | Tjelta 2013, popularized by Ingebrigtsens | high Z2 (lactate-controlled) + minimal Z3 | 4-6 threshold sessions/week, double days | Elite middle-distance runners, advanced cyclists | PMC11560996 (2024); requires lactate monitoring |
| **Hybrid 2025 consensus** | Modern coaches (San Millán, Seiler, Friel followers) | polarized base → pyramidal build → race-specific peak | Friel macrocycle + Issurin meso + Seiler weekly TID | Serious amateurs, multi-goal athletes | Synthesis of all of the above; this is what the literature converges on |

**Concrete decision points:**

### Why polarized for base phase (HIGH confidence)
- Seiler & Tonnessen (2009): elite endurance athletes naturally converge to 80/20 across all sports.
- 2024 meta-analysis (PMC11329428): polarized outperforms threshold-focused approaches for VO2max and work economy over medium-term cycles.
- Treff et al. 2019 (Frontiers in Physiology): rowers' polarized > pyramidal for 8-week base.
- **The 80/20 rule is well-replicated. Default to it.**

### Why pyramidal for build phase (MEDIUM confidence)
- Esteve-Lanao et al. 2007 showed pyramidal-trained runners beat polarized in 10K time-trial after 5 months — but the polarized group caught up over longer cycles.
- Practitioners (Friel, San Millán, Tim Cusick at WKO) consistently shift to pyramidal-then-threshold as race approaches because race-specific work IS in the threshold/sweet-spot range for endurance events.
- **Operationally:** pyramidal in build = increase Z3 from ~10% to ~20%, add tempo/sweet-spot sessions. This is what the Phase 5.1 phase-weighted Seiler distribution already does (build = 75/25). Keep it.

### Why block periodization is the right MESOCYCLE driver (MEDIUM-HIGH confidence)
- Stöggl & Sperlich 2014 (Frontiers Physiology): block periodization superior to traditional for elite cross-country skiers' VO2max gains.
- Issurin 2008: concentrated stimulus produces stronger adaptation than mixed loads.
- For our app: a build phase shouldn't be 6 weeks of mixed VO2/threshold/sweet-spot. It should be 3-week blocks each emphasising one stimulus.
- **Operationally:** within build, week 1-3 = sweet-spot accumulation, week 4-6 = VO2 transmutation, week 7 = peak/realization.

### Norwegian: HIGH-value reference, NOT default (LOW-MEDIUM confidence to default it)
- Lactate-monitoring is required to do it safely; without lactate, athletes overreach.
- Without R-R interval / lactate input we can't safely prescribe doubles.
- **Defer Norwegian as a Phase 7.2+ premium opt-in or Phase 8 once we have lactate-proxy data (DFA-α1 from R-R).**

### Reverse periodization, threshold-focused, Attia's Z2+VO2: NOT default
- Reverse: weak RCT support; only useful for time-constrained masters with deep aerobic base.
- Threshold-focused: outperforms only for short-term TT peaking; bad for season-long progression.
- Attia: longevity protocol, not race-prep. Our app is for serious athletes; offer as an "off-season / health goal" preset later.

### Default framework decision
**Friel macrocycle (already implemented in `coach_service.py:_phase_for_today`) → Issurin block mesocycles (NEW, Phase 7) → Seiler/pyramidal weekly TID (already in `_target_distribution_for_phase`) → 5.1 daily template cascade → 7.1 readiness adapter.**

This is the 2025 hybrid consensus per the prior `training-frameworks.md` Section 4. Cite Friel + Issurin + Seiler in plan rationales.

---

## 3. Daily adaptation: when and how plans should change

The literature on readiness-based daily prescription is more developed than people realise. The headline study:

### Vesterinen et al. 2016 — "Individual Endurance Training Prescription with Heart Rate Variability"
*Medicine & Science in Sports & Exercise* 48(7):1347-54.

**Method:** 40 recreational runners split into HRV-guided (EXP) vs. predefined (TRAD) training over 8 weeks intensive prep.
**Adaptation rule:** Hard session prescribed only if morning HRV (rMSSD-derived) was within the athlete's individualized **smallest worthwhile change (SWC)** band. Otherwise the session was downgraded to low-intensity.
**Result:**
- EXP group did fewer hard sessions (13.2 vs 17.7) but improved 3000m TT performance (+2.1% vs +1.1% n.s.).
- VO2max improved similarly in both groups.
- **HRV-guided trained less hard, performed better.**

**The threshold this study validates:** an athlete's individualised SWC band — typically ±0.5 SD of their 7-day rolling rMSSD — is the gate for hard sessions. Below the band → easy day. In the band or above → hard day OK.

### Düking et al. 2021 — wearable validation review
*Sensors* 21(20):6873.
- Concludes Garmin's overnight HRV (optical PPG) is acceptable for trend tracking but NOT for absolute rMSSD calibration.
- Use 7-day rolling baseline; flag when daily measurement is >1 SD below baseline.

### Halson 2014 — "Monitoring Training Load to Understand Fatigue in Athletes"
*Sports Medicine* 44(S2):139-147.
- Sleep duration, subjective wellness, and HRV are the best practical recovery markers for daily decisions.
- Composite of 2-3 markers > single marker.

### Foster et al. 2001 — session-RPE
*Journal of Strength & Conditioning Research* 15(1):109-115.
- Session-RPE × duration ≈ internal load — correlates with HR-derived TRIMP at r=0.7-0.9.
- Modern modification (Foster et al. 2017): if 7-day rolling sRPE ratio is high AND monotony is high (low day-to-day variation), inject a deload.

### Operational thresholds (concrete, opinionated, defensible)

| Signal | Source | Trigger downgrade | Trigger upgrade |
|---|---|---|---|
| HRV deviation | Vesterinen 2016, Düking 2021 | rMSSD <-10% vs 28d baseline OR ≥1 SD below 7d rolling mean | rMSSD ≥7d mean AND no other red flags |
| Sleep | Halson 2014 | ≥2 consecutive nights <80% of athlete's normal duration | ≥7h actual + ≥85% efficiency |
| Body Battery (Garmin proxy) | Internal heuristic, no peer review | <30 at wake | ≥70 at wake |
| sRPE last 3 sessions | Foster 2017 | mean ≥8/10 OR last session ≥9/10 with no planned hard | mean ≤6/10 |
| ATL/CTL acute:chronic | Banister via Phase 2 PMC | ATL/CTL >1.5 (Gabbett "danger zone" 2016) | <1.0 |
| Injury flag | profile | ALWAYS downgrade | n/a |

**Number of triggers required to act:**
- 1 red signal → swap today's session DOWN by one category (sweet-spot → endurance, vo2 → threshold, threshold → recovery).
- 2+ red signals → swap to recovery_30 OR rest_day (use existing `_safe_template_for_ceiling`).
- All green → execute planned session as written.
- **Never upgrade a planned hard session.** Athletes don't need surprise additions.

### When does adaptation feel like coaching vs nagging?
This is the make-or-break product call. From `athlete-pain-points.md` Section 4: **TrainerRoad sends constant adaptation notifications and athletes turn them all off, missing useful signals.** The cure:

1. **One adaptation per day, max.** Compute on first dashboard load; don't change during the day.
2. **Inline rationale, not modal.** The day's card shows "Today: Recovery 30min — your HRV is 12% below baseline (3 nights)." No alert, no notification, no tooltip-required. Visible by default.
3. **Always show the original.** "Was: Sweet-Spot 2×20. Swapped to Recovery." Builds trust per the `athlete-pain-points.md` Section 8 "transparency, not scores" principle.
4. **Honour overrides.** If the athlete clicks "do the hard one anyway", let them, and log the override (already in 06.x audit infrastructure).

### What pattern should trigger a deload?
A **planned deload week** belongs in the macrocycle (week 4 of every 4-week mesocycle). An **unplanned deload trigger** fires when:
- Last 3 days all show ≥1 red signal, OR
- 7-day sRPE rolling mean ≥7.5/10, OR
- Acute:Chronic >1.5 for 3+ days, OR
- Compliance grade ≥2 "overcooked" verdicts in last 5 sessions (5.3 already computes this — reuse).

When triggered: the next 5-7 days collapse into recovery + endurance only; the meso resumes after.

---

## 4. Tapering science

### Mujika & Padilla 2003 — "Scientific bases for precompetition tapering strategies"
*Medicine & Science in Sports & Exercise* 35(7):1182-7.
The original review. Defines taper as *"a progressive, nonlinear reduction of the training load."*

### Bosquet et al. 2007 — meta-analysis
*Medicine & Science in Sports & Exercise* 39(8):1358-65.
**The headline numbers everybody cites:**
- **Optimal volume reduction: 41-60%** of pre-taper.
- Reduction by **shortening session duration**, NOT cutting frequency.
- **Maintain intensity.** This is the cardinal rule.
- Frequency cut ≤20% (i.e., still train 5-6 days/wk during taper).
- **Performance gain: ~3% (range 0.5-6%).** Consequential for competition; meaningless if mis-applied.

### 2023 PLOS ONE meta-analysis (PMC10171681)
*Effects of tapering on performance in endurance athletes: a systematic review and meta-analysis.*
Confirms Bosquet's numbers. Adds nuance:
- Maintenance of training **frequency** correlates with performance improvement; cuts to frequency don't help.
- 2-week taper > 1-week taper for cycling TT performance.

### Mujika 2010 update — "Intense training: the key to optimal performance before and during the taper"
*Scandinavian Journal of Medicine & Science in Sports* 20(s2):24-31.
- Pre-taper *intensity* during the build is what locks in adaptation.
- Taper preserves rather than builds.

### Operational taper rules for Phase 7

| Race window | Action | Citation |
|---|---|---|
| 14-21 days out | Begin volume taper: -20% week 1 of taper | Bosquet 2007 |
| 7-14 days out | -40 to -60% volume; intensity sessions cut to 60-70% of normal duration but at race pace | Bosquet 2007, Mujika 2010 |
| 3-7 days out | -50% volume; 1 short opener at race pace; rest mostly Z1/easy | Mujika & Padilla 2003 |
| 1-2 days | Race pace activation (15-25 min including ≤5 min @ race power); full rest day before race | Mujika 2010 |
| Race day | execute | — |

### Integration with existing code
`coach_service.py` already has Friel phase boundaries:
- 7d=race, 21d=taper, 49d=peak, 112d=build, else base.

Phase 5.3 already projects TSB toward race (Mujika ATL-decay model for ≤14d windows). What 7.2 needs to add:

1. A `taper_plan(race_date, current_ctl, current_phase)` service that generates the 14-day countdown plan with explicit volume reduction percentages per day.
2. Hard rule: during taper window the template picker MUST refuse to upgrade intensity beyond the pre-taper ceiling. Add to `safety_rails.py`.
3. UI: race-day countdown chip on the new PlanTab when `days_to_goal ≤ 21`.

---

## 5. Workout authoring authority — extending the template library

This is THE architecture decision Phase 7 must lock.

### Recap of Phase 5.1 invariants (from STATE.md):
- **Templates are the atomic unit.** LLM picks/substitutes from 12 templates; cannot author intervals.
- **Server-side watts authority.** `parametrize_template(template, ftp)` materializes watts at request time.
- LLM can bend duration ±15%; clamped twice.
- Rails enforce via template downgrade, not option-blocking.

This is the right design. **Don't break it.** The two options:

### Option A: Extend library to ~30 templates (RECOMMENDED)
**Add ~18 new templates** covering the gaps:
- VO2max variants: 5×3, 6×3, 4×5, 30/15s (Tabata-style), 30/30s (Billat)
- Threshold variants: 2×15, 3×12, 4×8, 1×40
- Sweet-spot variants: 3×15, 4×12, 2×30
- Endurance variants: z2_endurance_45, z2_endurance_90, z2_endurance_180, z2_with_strides, z2_progressive
- Tempo variants: 2×20 tempo, 1×60 tempo
- Race-specific: criterium_simulation (1min on/off ladders), gran_fondo_brick, ttt_race_pace
- Recovery variants: recovery_45_with_openers, easy_spin_60
- Sport-specific running: easy_5km_z2, hill_repeats_8x90s, threshold_run_5x6, long_run_progressive_90, vo2_run_5x3
- Sport-specific gym: full_body_strength_a, full_body_strength_b, deadlift_focus, pliometric_explosive, mobility_recovery

**Pros:**
- Preserves the safety lock entirely.
- Every template is hand-vetted by sports science.
- Fits the existing `pick_template` + `parametrize_template` pipeline with zero new abstractions.
- LLM only needs to pick a template_id from a longer enum — same prompt-cache shape, same rails.

**Cons:**
- Doesn't cover the very-long tail (very specific race courses, custom intervals).
- ~18 new templates is real work but each is ~30-50 lines of dict.

### Option B: Approved interval-block primitives + LLM assembly
LLM composes warm-up + main-set + recovery + cool-down primitives.

**Pros:** Theoretically infinite flexibility.

**Cons:**
- New combinatorial safety surface — block A + block B might be safe individually but unsafe stacked.
- Every LLM-assembled workout needs a new TSS/duration/ceiling validator.
- Cache hit rate drops (every workout is unique).
- Loses the "this IS Coach Andrew Coggan's 2×20 sweet-spot" provenance.
- 5x harder to test.

### Decision: Option A
**Justification:**
1. **Safety:** Option B opens a new attack surface for hallucination; Option A is bounded.
2. **Flexibility:** 30 templates × duration ±15% × indoor/outdoor flag = ~600 distinct prescriptions, easily covering 95%+ of real-world athlete sessions.
3. **Implementation cost:** Option A is ~20 new dict entries + tests. Option B is a new compositional engine, validator, and test matrix.
4. **Provenance:** named templates carry coaching authority. "Coggan 2×20" is a well-known prescription; "LLM-assembled 23-min interval set" is not.

The canonical `templates.py` registry grows from 12 → ~30. Multi-sport split:
- 12-15 cycling
- 8-10 running
- 5-7 gym/strength

### One concession to flexibility
Allow LLM to pick `duration_scale` more aggressively (±25% for endurance templates only, with `safety_rails` checking final duration against the athlete's acute:chronic load). Z2_endurance_60 → 90min is a defensible scale for an athlete with high CTL. Recovery → never scaled longer.

---

## 6. Multi-sport balance — cycling + running + gym

### Wilson et al. 2012 — "Concurrent Training: A Meta-Analysis"
*Journal of Strength & Conditioning Research* 26(8):2293-2307.
21 studies, 422 effect sizes.
**Key findings:**
- Concurrent strength + endurance: hypertrophy ES 0.85 (vs 1.23 strength-alone), strength ES 1.44 (vs 1.76 strength-alone). **~25% interference for hypertrophy, ~15% for strength.**
- **The interference is sport-modality dependent: running interferes; cycling does NOT.**
- Likely cause: eccentric loading + larger muscle recruitment in running vs the concentric-dominant cycling.

### Coffey & Hawley 2017 — "Concurrent exercise training: do opposites distract?"
*Journal of Physiology* 595(9):2883-2896.
- Molecular signaling: AMPK (endurance) vs mTOR (strength) interference.
- Practical mitigation: **separate sessions by ≥6 hours**, ideally different days, fuel both adequately.

### 2023 Frontiers meta on training sequence (Petré et al.)
*Frontiers in Physiology* 14:1072679.
- Endurance-first vs strength-first: strength-first slightly better for VO2max gains, endurance-first slightly better for limb strength. Effect small.
- **Practical take: same-day order matters less than separation.**

### Operational rules for Phase 7

| Scenario | Rule |
|---|---|
| Cycling + strength same day | OK if ≥6h apart; cycling first if both quality |
| Running + strength same day | Avoid; if unavoidable, strength first, low-volume cycling option later |
| Two endurance modalities same day | Avoid intensity stacking — one Z3+ session per 24h max |
| Running TSS aggregation | Use elevated multiplier (1.3×) vs cycling for impact-cost in load tracking |
| Strength session timing | Schedule Mon/Thu (away from key endurance days Tue/Sat) |
| Race week | Drop strength entirely 7d before A-race |

### Sport-specific load aggregation
Phase 2 already computes per-sport TSS via the same Banister model. The acute:chronic ratio should remain unified (mixed-modality CTL is the right total-stress proxy), but the hard-session counter must split:
- Running threshold + cycling threshold same week = **count both** toward Seiler's hard-session budget.
- 2 cycling thresholds + 1 running threshold = 3 hard sessions, not 2.

**Existing code that supports this:** `coach_service._target_distribution_for_phase` + `safety_rails`. Phase 7 needs a `count_hard_sessions(week_window, athlete_id)` helper that respects the multi-sport interference rules.

---

## 7. The "always for a week + why" UI surface

### Best-in-class examples

| App | What works | What to copy |
|---|---|---|
| **Athletica** weekly preview | Each day shows session name + duration + intensity dot | The simplicity. Don't show TSS by default. |
| **TrainingPeaks calendar** | Drag-to-rearrange, planned-vs-actual overlay | The ability to override |
| **Whoop Strain Coach** week view | Weekly strain target with daily contribution bars | The single weekly target line + per-day contribution |
| **Garmin DSW** | Today + tomorrow with duration | The brevity. Avoid Garmin's fitness-status pressure copy. |
| **TrainerRoad calendar** | Week summary stat row at top | Weekly TSS + hard-session count + recovery percent |

### Recommended structure for the new `PlanTab`

```
┌───────────────────────────────────────────────────────────────┐
│ Week of May 4–10 · Build Phase Block 2 of 3 · Wk 5 of meso   │
│ Target: 380 TSS · 3 quality sessions · 80/20 polarized        │
│                                                                │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐           │
│ │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat  │ Sun  │           │
│ │ Rest │ Sweet│ Z2   │ Tempo│ Easy │ VO2  │ Long │           │
│ │      │ Spot │ 60   │ 3×10 │ 30   │ 5×3  │ Z2   │           │
│ │      │ 2×20 │      │      │      │      │ 180  │           │
│ │ —    │  85  │  60  │  70  │  35  │ 110  │ 145  │ ← TSS     │
│ │      │ ●●   │ ●    │ ●●   │ ●    │ ●●●  │ ●●   │ ← intensity│
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┘           │
│                                                                │
│ Why this week: Block 2 of build — sweet-spot accumulation.     │
│ Saturday is the meso's first VO2 session; HRV-permitting.      │
│ Sunday long ride hits 145 TSS to maintain CTL trajectory.      │
└───────────────────────────────────────────────────────────────┘
```

Per-day card on tap/click: full template breakdown, rationale, "execute" / "swap" / "skip" actions (already 06.2 territory).

### Where rationale lives

Three layers, in priority order:
1. **Per-day inline (one sentence)**: "Sweet-spot 2×20 to grow Zone 3 capacity in build phase." Always visible.
2. **Weekly preface (two sentences)**: above the week strip, explains the meso block structure.
3. **Expandable transparency drawer**: full prompt + LLM reasoning + chosen template alternates (already exists from 5.x — reuse).

**Don't put rationale behind a hover or modal** — `athlete-pain-points.md` Section 4: "AI plans that don't explain themselves" is the universal complaint. Make it default-visible.

### Specific recommendations for THIS app's design language

Fits cleanly into existing primitives (per Phase 6.1 / 6.2 STATE):
- **SegmentedTabs** — add `plan` tab between `today` and `week` (or replace `week`). Already supports URL persistence (`?tab=plan`).
- **WeekStrip mini variant** — already exists; reuse for the 7-dot day picker at top of `PlanTab`.
- **DashboardSection** — collapsible per-day expanded cards.
- **SideSheet** — open per-day-detail at desktop ≥768px (already used for ContributorsSheet); mobile opens a full screen.
- **IntervalRibbon** — already renders zone-coloured block ribbons; reuse for per-day expanded view.
- **eyebrow + serif headlines** — preserve the editorial-paper aesthetic. "Week 5 · Block 2 · Build" goes in eyebrow caps; "Sweet-Spot 2×20" goes in Fraunces serif display.
- **Tone tokens (forest/amber/coral)** — match Phase 6.2 sport-accent palette. Don't introduce new colors.

**Bundle budget:** Phase 6.2 lifted to 815 kB; Phase 7 should target +5% max (~+40 kB). PlanTab reuses existing primitives, so net new = the periodization service consumer + 1-2 small components. Stay under budget.

---

## 8. Concrete implementation recommendations per success criterion

### Success criterion 1: Multi-week periodized mesocycle aligned to goal

**Approach:** Friel macrocycle (already in `coach_service`) → Issurin block mesocycles (NEW) → Seiler/pyramidal weekly TID (already in `_target_distribution_for_phase`).

**New backend services:**
- `app/services/periodization_engine.py` — pure function `generate_mesocycle(athlete, today, goal_event) → MesocyclePlan`. Takes the Friel phase, splits into 3-week blocks, computes per-week TSS targets via CTL ramp rate (≤8% per week, Friel rule).
- `app/services/week_planner.py` — pure function `generate_week(meso_block, week_index, hist_window) → list[PlannedWorkoutDraft]`. Picks 7 templates respecting Seiler distribution + hard-session count + multi-sport interference rules.

**New tables:**
- `mesocycle_plans` — id, user_id, goal_event_id, phase, block_index, start_date, end_date, weekly_tss_targets (JSONB array), created_at
- (Optional) `goal_events` — id, user_id, event_date, event_type, target_metric, priority (A/B/C). Currently goal lives on AthleteProfile.goals JSON; consider promoting to a real table for Phase 7 if multi-goal calendars are in scope.

**New frontend components:**
- `PlanTab.tsx` — main week view (replaces or supplements WeekTab)
- `WeekHeader.tsx` — meso-block context strip
- `DayPlanCard.tsx` — compact per-day cell
- `DayPlanDetail.tsx` — SideSheet content for full template

**Hard rails:**
- CTL ramp must not exceed 8% week-over-week for advancing weeks; deload weeks force ≥20% drop.
- Plans NEVER stretch beyond the next macrocycle phase boundary (a base-phase plan stops at base→build transition, the next plan generates fresh).
- Plans regenerate when: athlete adds/changes goal event, FTP test, or 14 days elapse without regeneration.

### Success criterion 2: Daily adaptation to sleep/HRV/body battery/nutrition/load

**Approach:** Vesterinen 2016 SWC band as the gate. Multi-signal voting per Section 3 thresholds.

**New backend services:**
- `app/services/readiness_gate.py` — pure function `evaluate_readiness(athlete, planned_template, signals) → ReadinessVerdict(verdict, downgrades, rationale)`. Composes HRV, sleep, body battery, sRPE, A:C ratio.
- Extend `coach_service.session_type_for_today` to consume `readiness_gate` output as the highest-priority cascade rung (above intensity_ceiling).

**New columns / data:**
- `readiness_signals_snapshot` JSONB in CoachBrief.evidence (already has `rails_context`; add `readiness` peer field).
- Nutrition: stub for Phase 8; readiness_gate accepts `nutrition_deficit: bool | None` and only acts when set.

**New frontend components:**
- `ReadinessAdaptationBanner.tsx` — appears on TodayTab when adapter has swapped today; shows "Was X, swapped to Y, because Z" with "Override" button.

**Hard rails:**
- Adapter computes ONCE per day (cached in CoachBrief.evidence). Manual sync triggers recompute.
- Adapter NEVER upgrades intensity (Vesterinen-style SWC works one direction only).
- Athlete override is one-click and logged.

### Success criterion 3: Structured workouts with watts/pace per cycling/run/gym

**Approach:** Extend `templates.py` library to ~30 templates per Section 5. Reuse `parametrize_template` for athlete-scaled materialisation.

**New code:**
- `app/services/templates_running.py` (or merge into `templates.py`) — pace targets keyed off threshold pace (per `AthleteProfile.threshold_pace`)
- `app/services/templates_strength.py` — set/rep/load primitives keyed off RM estimates
- `parametrize_template` extended to dispatch on `Sport` (cycling watts, running pace, strength load).

**New tables:** none if RM/threshold pace already on AthleteProfile. Otherwise add `running_threshold_pace`, `strength_1rm` JSONB.

**Hard rails (preserve from 5.1):**
- Server-side authority — block targets always materialised at request time from current FTP/pace/RM.
- LLM cannot author intervals; can only pick template_id + duration_scale.

### Success criterion 4: Workouts respect current FTP/threshold values

Already solved by Phase 5.1 (`server-side watts authority`). Phase 7 just extends this to running pace and strength load. **Hard rail:** every materialised workout reads current threshold/FTP/pace from athlete profile at request time, never from frozen snapshot.

### Suggested wave breakdown

**See Section 10** for the full sub-phase split. Within Phase 7.0 alone, suggest 4-5 plans:

1. **07.0-01 — Periodization engine core**: `periodization_engine.py` + `mesocycle_plans` table + tests. No UI.
2. **07.0-02 — Week planner**: `week_planner.py` + integration with existing `coach_service` + emits PlannedWorkout drafts for 7-day window.
3. **07.0-03 — Template library expansion**: 18 new templates (cycling+running+gym), `parametrize_template` dispatch, full test matrix.
4. **07.0-04 — PlanTab UI**: WeekHeader + DayPlanCard + DayPlanDetail SideSheet, all reusing existing primitives.
5. **07.0-05 — Plan regeneration triggers + integration tests**: regenerate on FTP test, goal change, 14d staleness.

---

## 9. Rejected directions — explicitly NOT building

| Rejection | Why |
|---|---|
| **AI-generated free-form intervals** | Section 5 — opens hallucination attack surface; Phase 5.1 lock holds |
| **Daily plan rewrites with no rationale** | TrainerRoad's "AI has lost its mind" antipattern (`athlete-pain-points.md` 1.3) |
| **Compliance gamification that punishes rest** | Garmin "Detraining"/"Unproductive" pressure loop is the canonical bad pattern; Halson 2014 + Mujika 2010 both stress recovery is part of the work |
| **Push-notification streak ransom** | `athlete-pain-points.md` Section 5: 71% of fitness apps lose users by month 3, intrusive notifications are the #1 abandonment trigger |
| **Comparing against other users in plan view** | Strava-chasing distorts intent (`athlete-pain-points.md` 1.6, WeLoveCycling 2025); Phase 7 is about the athlete vs themselves |
| **Opaque "Coach says..." copy without the why** | `athlete-pain-points.md` Section 8: trust is built through transparency, not scores |
| **Black-box readiness composite** | Marco Altini critique (the5krunner 2025) — every readiness contributor must be inspectable; reuse the 6.1 ContributorsSheet pattern |
| **Plan-restart on event change** | TrainerRoad antipattern; new events APPEND to the macrocycle without wiping context |
| **Cross-platform leaderboards / KOMs** | Strava's territory; out of scope and out of brand |
| **In-app social feed** | Phase 9 territory at earliest; not Phase 7 |
| **Norwegian double-threshold default** | Requires lactate input we don't have; defer to Phase 8+ as opt-in |
| **Reverse periodization default** | Weak RCT support; only useful for niche masters athletes |
| **Adapter that upgrades intensity** | Vesterinen SWC works one direction (downgrade only); upgrading would create surprise hard-day pressure |
| **Compliance scoring that rewards "all-green" weeks** | Athletes need to learn to absorb amber/coral days — pure-green incentivises ignoring readiness |

---

## 10. Recommended Phase 7 split

**The user said "best in the world." Honest scope check: phase 7 as scoped (4 success criteria covering periodization + adaptation + multi-sport + thresholds) is bigger than any prior phase. Past phase velocity averages ~50min per plan; estimating Phase 7 at ~10-14 plans total. Split:**

### Phase 7.0 — Periodization engine + week view shell
**Goal:** Multi-week mesocycle generation with 7-day forward plan UI. Static (no readiness adaptation yet — uses existing 5.1 daily picker as fallback).

**Success criteria:**
1. Given goal event + FTP + current PMC, system generates a coherent 6-12 week mesocycle aligned to Friel phases + Issurin blocks
2. PlanTab UI shows 7-day forward plan with per-day card + one-sentence rationale
3. Template library extended to ~30 templates covering cycling+running+gym
4. Plan persists, regenerates on goal change / FTP test / 14d staleness

**Estimated plans: 5** (per Section 8 wave breakdown)
**Critical dependencies:** None — extends 5.1 cleanly
**Risk:** Periodization engine math is testable but scope-creepy; lock to Friel phases + Issurin blocks + Seiler weekly TID — don't add Norwegian or block-2-of-3 nuances.

### Phase 7.1 — Daily readiness-driven adaptation
**Goal:** The plan adapts today's session based on this morning's readiness signals.

**Success criteria:**
1. `readiness_gate` service composes HRV + sleep + body battery + sRPE + A:C ratio into a verdict
2. Verdict drives template downgrade with one-sentence rationale shown inline on TodayTab
3. Athlete can override with one click; override is logged
4. Adaptation preserves the rest of the 7-day plan (compensates volume on later days, doesn't cascade-break the meso)

**Estimated plans: 3-4**
**Critical dependencies:** 7.0 must ship; Vesterinen SWC math depends on 28-day rolling HRV baseline (already computed in PMC service)
**Risk:** Multi-signal voting tuning will need iteration; ship with conservative defaults (downgrade-favouring)

### Phase 7.2 — Rationale generation + taper/race-prep polish
**Goal:** Polish the "why" everywhere; ship taper countdown + race-week protocol.

**Success criteria:**
1. Per-week and per-day rationales generated by LLM with structured prompt (template choice + Friel phase + Seiler distribution all cited)
2. Taper window (≤14d to A-race) triggers the Mujika protocol with explicit volume-reduction percentages
3. Race-week safety rails refuse to upgrade intensity beyond the pre-taper ceiling
4. Race-day countdown UI; opener session day -1; full rest day 0
5. Post-race transition: 7-day automatic recovery block with limited intensity

**Estimated plans: 3-4**
**Critical dependencies:** 7.0 + 7.1 must ship; LLM rationale generator can reuse the Phase 5.x prompt-cache architecture
**Risk:** LLM rationale quality varies; need rule-based fallback (already the 5.x discipline) — `_rule_based_rationale(meso_block, day_of_week)` produces the deterministic baseline

### Total estimate
- Plans: 11-13 across 7.0/7.1/7.2
- Calendar: ~3 weeks at past velocity
- Bundle delta: target +5-8% (~50 kB) reusing primitives

---

## 11. Open questions

1. **Goal events as a separate table?** Currently goal lives on `AthleteProfile.goals` JSON. Multi-goal calendars (B-race + A-race + C-race) need a real table. Recommend creating in 7.0-01.
2. **DFA-α1 / R-R interval ingestion** for Norwegian-grade lactate proxy — not blocking 7.x; flag for Phase 8.
3. **Strength-session 1RM tracking** — does AthleteProfile already have RM JSONB? If not, add migration in 7.0-03.
4. **Indoor vs outdoor FTP split** — long-running TrainingPeaks UserVoice request (`athlete-pain-points.md` 4.8). Phase 7 should support per-session indoor flag (already on PlannedWorkout per 06-04 STATE) but not split FTP itself; defer to Phase 8.
5. **"Plan compliance vs replanning" UI metaphor** — when athlete misses 3 days in a row, do we offer "shift the plan" or "re-pick from current state"? Recommend the latter — re-generate the meso from today's CTL/TSB. Cleaner mental model.

---

## 12. Sources

### Peer-reviewed (HIGH confidence)
- Banister et al. 1975 — Systems model of training
- Bosquet et al. 2007 — Effects of tapering: meta-analysis. *Med Sci Sports Exerc* 39(8):1358-65. [PubMed 17762369]
- Coffey & Hawley 2017 — Concurrent training: do opposites distract? *J Physiol* 595(9):2883-2896. [PMC5407958]
- Düking et al. 2021 — Wearable HRV validation review. *Sensors* 21(20):6873.
- Esteve-Lanao et al. 2007 — Pyramidal vs polarized in runners.
- Foster et al. 2001 — Session-RPE method. *J Strength Cond Res* 15(1):109-115.
- Halson 2014 — Monitoring training load to understand fatigue. *Sports Med* 44(S2):139-147.
- Hydren & Cohen 2015 — Polarized review.
- Issurin 2008, 2010 — Block periodization theory.
- Mujika & Padilla 2003 — Scientific bases for taper. *Med Sci Sports Exerc* 35(7):1182-7.
- Mujika 2010 — Intense training before/during taper. *Scand J Med Sci Sports* 20(s2):24-31.
- 2023 PLOS ONE meta-analysis — Tapering in endurance athletes [PMC10171681].
- Seiler & Tonnessen 2009 — Intervals, thresholds, LSD. *Sportscience*.
- Seiler et al. 2024 — Polarized meta-analysis [PMC11329428].
- Stöggl & Sperlich 2014 — Block periodization in elite endurance. *Front Physiol*.
- Treff et al. 2019 — Polarized vs pyramidal in rowers. *Front Physiol*.
- Vesterinen et al. 2016 — Individual endurance training prescription with HRV. *Med Sci Sports Exerc* 48(7):1347-54. [PubMed 26909534]
- Wilson et al. 2012 — Concurrent training meta-analysis. *J Strength Cond Res* 26(8):2293-2307. [PubMed 22002517]

### Coach/practitioner (MEDIUM)
- Joe Friel — Annual Training Plan; *The Cyclist's Training Bible*
- Andrew Coggan — TSS, NP, IF, PMC, iLevels
- Iñigo San Millán — Zone 2 mitochondrial science
- Stephen Seiler — TID research, durability Q&A (Fast Talk Labs)
- Tim Cusick (WKO) — Data-to-decisions framing
- Marco Altini — HRV4Training, wearable validation
- Vladimir Issurin — Block periodization
- Kolie Moore (Empirical Cycling) — RPE-vs-power decoupling

### Community signal (LOW-MEDIUM, used for pain points only)
- TrainerRoad forum (Adaptive Training, Dylan Johnson responses)
- Intervals.icu forum (TP comparison, AI coach threads)
- DC Rainmaker (Garmin Connect+ comments)
- Reddit r/Velo, r/AdvancedRunning, r/triathlon (themes only — no specific URLs cited)
- 80/20 Endurance ("PMC is lying to you")
- Simple Endurance Coaching Medium (Athletica review, fetched 2026-05-03)

### Prior internal research (used heavily, treat as canonical)
- `.planning/research/training-frameworks.md` (April 2026)
- `.planning/research/athlete-pain-points.md` (April 2026)
- `.planning/STATE.md` decisions 05-01 through 06-04 (Phase 5/5.1/5.2/5.3/6/6.1/6.2)

---

## 13. Metadata

**Confidence breakdown:**
- Periodization framework default (hybrid Friel + Issurin + Seiler): **HIGH** — converges across multiple peer-reviewed studies and elite-coach practice
- Daily adaptation thresholds (Vesterinen SWC, Halson multi-marker): **HIGH** for direction, **MEDIUM** for exact numeric thresholds (population studies; will need per-athlete tuning post-launch)
- Tapering protocol (Bosquet/Mujika): **HIGH** — 20+ year replicated finding
- Workout authoring: extend templates over LLM-assembly: **HIGH** confidence on the call (driven by safety + Phase 5.1 invariants), MEDIUM on whether 30 templates is the right number (could be 25, could be 40)
- Multi-sport interference: **HIGH** for Wilson 2012 finding (running interferes more than cycling), MEDIUM for our concrete same-day timing rules (extrapolated from Coffey & Hawley)
- UI direction: **MEDIUM-HIGH** — derived from prior research and existing design language; final aesthetic choices belong to the planner + designer
- Phase 7 split: **HIGH** confidence it should be split; MEDIUM on the exact 7.0/7.1/7.2 boundary

**Research date:** 2026-05-03
**Valid until:** 2026-08-03 (3 months — endurance science is stable; UI/competitor landscape shifts faster)

---

## RESEARCH COMPLETE

**Phase:** 7 — Periodization + Workout Generation
**Confidence:** HIGH on framework, MEDIUM-HIGH on adaptation thresholds, HIGH on the recommended split

### Key findings
- Default to a hybrid framework: Friel macrocycle + Issurin block mesocycles + Seiler/pyramidal weekly TID. Already 70% built (Phase 5.1).
- Daily adaptation gate: Vesterinen 2016 SWC band — HRV ≥1 SD below 7d mean OR <-10% vs 28d baseline → downgrade. Multi-signal voting per Section 3.
- Workout authoring: keep the 5.1 template lock; extend library 12 → ~30 templates. Reject LLM block-assembly.
- Tapering: Bosquet 2007 / Mujika 2010 — -41 to -60% volume, maintain intensity, cut frequency ≤20%, 2-week window optimal.
- The phase is too big for one go. **Split into 7.0 (engine + week UI) / 7.1 (readiness adapter) / 7.2 (rationale + taper polish).** Estimated 11-13 plans total.

### Confidence assessment
| Area | Level | Reason |
|---|---|---|
| Framework default | HIGH | Multi-source peer-reviewed convergence |
| Daily-adaptation thresholds | MEDIUM-HIGH | Vesterinen 2016 + Halson 2014 anchor; numeric tuning expected |
| Workout authoring authority | HIGH | Driven by Phase 5.1 safety lock + simple cost analysis |
| Multi-sport interference | HIGH (literature) / MEDIUM (concrete rules) | Wilson 2012 well-replicated |
| UI direction | MEDIUM-HIGH | Synthesised from competitor patterns + 6.1/6.2 primitives |
| Phase split | HIGH | Scope is unambiguously >1 phase |

### Open questions for planner
- Goal events table (recommended in 7.0-01) vs JSON-on-profile
- 1RM tracking for strength templates
- DFA-α1 / R-R deferred to Phase 8
- Plan-compliance vs re-generation UX metaphor

### Ready for planning
Research complete. The planner can now break Phase 7 into 7.0/7.1/7.2 sub-phases and begin plan generation for 7.0.
