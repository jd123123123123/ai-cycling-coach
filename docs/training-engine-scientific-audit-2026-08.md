# The adaptation engine: a scientific audit

**Date:** 2026-08-25 · **Scope:** the training-load model, the daily adaptation
directive, the vitals-based readiness composite, and the physiological models
feeding them.

**Method and its limits.** This is a *static* audit: I read the implementation
and judged it against the endurance-training literature. I did not run the
engine against athlete data, did not refit any model, and did not verify the
numerical claims in the docstrings against the cited papers themselves. Every
finding below is therefore one of three kinds, and I mark which:

- **[CODE]** — verifiable from the source alone. High confidence.
- **[METHOD]** — a statistical or design argument. Confidence stated inline.
- **[VERIFY]** — a claim about the literature that must be checked against the
  primary source before anyone defends it in a viva. I flag these rather than
  assert them, including where I suspect the code's own citation is overstated.

Files are cited as `path:line`.

---

## 1. Verdict

This is the top decile of what training software actually ships. The engine
tiers its evidence, refuses to fabricate, gates stale sensors, and implements
CP, W′-balance and durability faithfully. Several of its choices — 1 Hz stream
reconstruction, window-invariant PMC, suppressing ACWR at low chronic load —
are things most commercial platforms get wrong.

It is not yet defensible as a thesis, for one structural reason:

> **Every number in the decision path is a point estimate, and no part of the
> system has ever been tested against an outcome.**

The engine makes strong, present-tense claims ("Grünes Licht — belaste hart")
from a chain of unvalidated thresholds, then never asks whether the athlete who
was told that actually trained well the next day. A PhD does not require the
model to be right; it requires the model to be *falsifiable and falsified
against data*. That machinery is entirely absent here — with one telling
exception (§7.4).

The gap between "very good product engineering" and "12/10 defensible science"
is closed by three moves, in this order: **fix the four correctness bugs (§3),
resolve the three internal contradictions (§6), then replace the rule cascade
with an estimator that carries its own uncertainty (§9).**

---

## 2. What is genuinely strong

Credit first, because a viva committee will ask what you would keep.

**2.1 Evidence tiering is surfaced to the athlete.** [CODE]
`adaptive_readiness.py:78` types every `Signal` as `"RCT" | "expert" |
"guardrail"`. The HRV band is allowed to be a primary gate; TSB, decoupling and
ramp are explicitly demoted to soft signals. I have not seen another consumer
training product that admits, in its own UI, which of its claims are opinion.
This is the single most defensible thing in the codebase and it should be the
spine of the thesis, not a footnote.

**2.2 Refusal to speak from stale sensors.** [CODE]
`HRV_MAX_AGE_DAYS`, `HRV_RECENT_WINDOW_DAYS`, `SLEEP_MAX_AGE_DAYS`
(`adaptive_readiness.py:44–62`) exist because the engine previously green-lit
athletes off nine-day-old mornings and latched a bad night indefinitely. The
fix distinguishes *no data* from *stale data* and routes both to an inert
"unknown" state. Sensor-recency handling is a real and under-reported source of
error in wearable-driven prescription; this is a publishable observation on its
own.

**2.3 Self-report outranks physiology.** [CODE]
`adaptive_readiness.py:~300` — a declared sick/injured day returns `rest`
before any HRV arithmetic runs. Correct, and consistent with every consensus
statement on illness management.

**2.4 The 1 Hz reconstruction is real.** [CODE]
`stream_extraction.py:1–7` rebuilds an aligned 1 Hz stream from Garmin smart
recording and auto-pause gaps, with distinct gap policies. NP's 30-sample
window, TSS, W′-balance joule accounting and the durability kJ split all assume
1 Hz — and here that assumption is actually *established* rather than hoped
for. Most implementations silently compute NP over 30 *samples* of variable-rate
data. Keep this and say so.

**2.5 Window-invariant PMC.** [CODE]
`pmc_service.py:11–17` runs the EWMA from the athlete's first activity and
slices the requested window from the tail, so `?days=60` and `?days=90` report
the same TSB for the same day. Trivial-sounding; a common and embarrassing bug
elsewhere.

**2.6 Athlete-local day bucketing.** [CODE] `pmc_service.py` buckets on
`started_at AT TIME ZONE tz`, so a 22:30 ride does not land on tomorrow. Load
models are day-quantised and this is where they leak.

**2.7 ACWR suppressed below CTL 20.** [CODE] `readiness_score.py:~220` and
`safety_rails.py:99–104` both cite the instability of the ratio at small
denominators and skip the component. Correct handling of a known pathology.

**2.8 The physiological models are faithful.** [CODE]
CP is the 2-parameter linear model fit over 120–1200 s (`critical_power.py`) —
the classic valid band, with the right stated reasons for both cut-offs.
W′-balance implements the Skiba differential form correctly
(`w_balance.py:20–24`). Durability follows the post-kJ-threshold approach
(`durability.py`). These are correct transcriptions, not approximations.

**2.9 Honest absence.** Throughout, a missing value produces an em dash or a
dropped component rather than a zero or an invented default. For a system whose
outputs are behavioural instructions, this is an ethical property, not a
cosmetic one.

---

## 3. Correctness defects

These are bugs, not disagreements. Ordered by consequence.

### 3.1 The "latest ride" in the durability gate is not the latest ride [CODE] — **FIXED**

`adaptive_readiness.py`, decoupling block:

```python
drows = await db.execute(
    select(ActivityStream.decoupling_pct).where(
        ActivityStream.user_id == user_id,
        ActivityStream.decoupling_pct.isnot(None),
    ).limit(30)          # <-- no ORDER BY
)
decs = [float(r[0]) for r in drows.all()]
latest = decs[0]
```

There is no `ORDER BY`. In PostgreSQL the row order of an unordered `SELECT` is
unspecified, so `decs[0]` is an arbitrary ride, and `.limit(30)` takes an
arbitrary 30 of them. `decoupling_delta = latest - median(prior)` therefore
compares a random ride to the median of a random subset.

**Consequence.** `decoupling_delta` is the sole input to `durability_improving`
and `durability_worse`, which decide whether an in-band athlete gets `escalate`
(volume ×1.12+) or merely `push`, and which contribute to the `concern`
composite that can force `hold`. A real prescription is being driven by row
order. **Fix:** `.order_by(ActivityStream.<timestamp>.desc())`.

### 3.2 The Plews CV penalty never fires [CODE] — **FIXED**

`readiness_score.py:110–130` implements a coefficient-of-variation penalty and
the module docstring names it as core rationale ("Plews 2013 / Plews 2017 —
slope > point"). Both production callers pass it `None`:

- `daily_decision.py:384` — `hrv_cv_pct=None,`
- `coach_service.py:728` — `hrv_cv_pct=None,  # not currently computed`

The day-to-day-variability signal — arguably the *more* informative half of the
HRV literature, and the half that distinguishes accumulating stress from a
one-off bad night — is dead code in production. The docstring reads as though
it is active.

### 3.3 The menstrual-cycle adjustment is called by nothing [CODE] — **BLOCKED, see below**

`menstrual_adjustment.py` defines `cycle_phase_from_day()` and
`menstrual_adjustment()`, and has a test. Grepping the application for its use:
the only importer is `tests/services/test_menstrual_adjustment.py`.
`readiness_score.py` mentions it only in a comment (line 82–85) and consumes a
`menstrual_readiness_delta` field that **no caller ever populates**.

So for female athletes the engine currently applies no cycle adjustment at all,
while the codebase contains a tested implementation of one. See §8.1 for why
this is not a cosmetic omission but a systematic bias.

**Correction (2026-08-25).** An earlier draft of this document called this "a
one-day fix — just wire it through". That was wrong, and the error is worth
recording. `menstrual_adjustment()` needs `cycle_day`, `cycle_length` and
`symptom_severity`, and **nothing in the system stores any of them**: no column
on `AthleteProfile`, no field in any schema, nothing in `goals`. The function
is not disconnected from its inputs — its inputs do not exist. Closing it means
a data model, a migration, an API and a UI to record a cycle, and only then the
wiring. That is a feature, not a bug fix, and migrations in this repo carry
their own deployment risk. It remains the highest-value gap; it is simply not a
day's work.

### 3.4 The CP fit's quality gate cannot discriminate [CODE] — **FIXED**

`critical_power.py:33` — `CP_MIN_POINTS = 2`. A least-squares line through two
points is exact: `r_squared` is 1.0 by construction. Any downstream check of
the form "trust the fit if r² is high" therefore passes most eagerly in exactly
the case where CP and W′ are least identifiable. Two points also make the fit
maximally sensitive to a single corrupt MMP value. **Fix:** require ≥3, prefer
≥4 points spanning the band, and report a standard error rather than r².

---

## 4. Statistical and methodological problems

### 4.1 The recent window is nested inside its own baseline [METHOD — high confidence] — **FIXED**

Both HRV models compare a 7-day mean against a 28-day baseline that *contains
those same 7 days*:

- `adaptive_readiness.py`: `baseline_window = ln[-28:]`, and `hrv_recent` is
  the mean of readings inside the last 7 calendar days — a subset of `ln[-28:]`.
- `advanced_metrics.hrv_trend`: `current_mean` (7 d) vs `baseline_28d_mean`,
  same nesting.

The comparison is therefore between a quantity and a set containing it. This
attenuates the apparent deviation (the baseline is dragged toward the recent
value by roughly a quarter of the deviation) and biases the verdict toward
"in band" — that is, toward *permitting load*. The bias is in the unsafe
direction and grows exactly when it matters most: during a sustained
suppression, when the baseline is being pulled down day by day, chronic
overreaching progressively normalises itself out of detection.

**Fix:** baseline from a preceding, non-overlapping window (e.g. days −8 to −35),
or a properly discounted reference (EWMA baseline with a much longer time
constant than the test statistic).

### 4.2 A mean is being tested against the spread of singles [METHOD]

`assess_adaptation` compares `hrv_recent` — a **7-day mean** — against
`baseline ± 0.5 × SD`, where the SD is the dispersion of **daily** lnRMSSD
values (`pstdev(baseline_window)`).

The standard error of a 7-day mean is approximately `SD/√7 ≈ 0.38 × SD`. So a
band of ±0.5 SD around the daily distribution corresponds to roughly ±1.3
standard errors of the statistic actually being tested — a materially wider
band than it appears, and one whose effective strictness varies with how many
readings the week happened to contain (3 readings vs 7 changes the SE by 50%,
while the band stays fixed).

**Important caveat, and this is the part to be careful about in a viva:** the
smallest-worthwhile-change convention in the HRV-guided training literature
does broadly compare a rolling mean to a baseline mean ± 0.5 × the baseline SD.
If that is what Nuuttila/Vesterinen/Plews did, then this code is *faithfully
replicating the literature*, and the criticism lands on the convention rather
than on the implementation. **[VERIFY]** — confirm the exact comparison used in
the specific trials cited at `adaptive_readiness.py:8–10` before claiming
either way. The defensible thesis position is: replicate the convention, *and*
report alongside it a variance-correct alternative (§9.3), and show empirically
whether the two disagree on real athletes and in which direction.

### 4.3 Two different tests against one threshold [METHOD — high confidence] — **FIXED**

`hrv_state` is decided by comparing the **7-day mean** to `low`. Two lines
later, `below_days` counts **individual daily readings** below the same `low`:

```python
below_days = sum(1 for d, v in rows
                 if (today - d).days < HRV_BELOW_WINDOW_DAYS and v < low)
```

These are different random variables with different dispersions being tested
against a single cut-point. A day whose raw value dips below a band built for
means is unremarkable; here two such days trigger `deload` (volume ×0.55). The
threshold that governs the most aggressive intervention in the system is the
one applied to the noisiest statistic.

### 4.4 The composite's "six independent signals" are not independent [METHOD — high confidence] — **FIXED**

`readiness_score.py:15–17` states the design rationale as combining "six
independent biological + load signals". Two collapses:

- **TSB and ACWR are transforms of the same 2-vector.** TSB = CTL − ATL; ACWR =
  ATL / CTL. Weights 0.20 and 0.15 — **35% of the composite is two views of
  (CTL, ATL)**. They are strongly and nonlinearly dependent by construction.
- **Body Battery is HRV-derived.** It is a Firstbeat product built substantially
  from heart-rate variability. Weights 0.22 (HRV) + 0.08 (BB) = 30%, partly
  redundant. The docstring's own justification for down-weighting BB — "vendor
  black box" — is a statement about transparency, not about independence.

Effective dimensionality is nearer **three** (load, autonomic, sleep) than six.
Consequences: the composite is overconfident, its weights are not interpretable
as importance, and a load spike moves the score through two channels at once.
A PhD-grade version derives weights from data (§9.4) or at minimum reports the
correlation matrix and a sensitivity analysis.

### 4.5 The ACWR in use is not the ACWR the thresholds came from [METHOD]

`readiness_score._acwr_component` computes `atl / ctl` and its docstring says
"ATL/CTL with 7d:28d windows". But `training_load.py:18–19` sets
`CTL_TIME_CONSTANT = 42`. The implemented quantity is a **7-day : 42-day EWMA
ratio**; the thresholds applied to it (0.8–1.3 sweet spot, >1.5 risk, >2.0 red)
come from the 7:28 rolling-average literature.

A 42-day denominator is smoother and slower than a 28-day one, so for the same
training the ratio's distribution differs — the sweet-spot band is not the same
band. This is a straightforward calibration mismatch between the docstring, the
code, and the source of the numbers. Either move to a 28-day chronic term for
this component or re-derive the cut-points for 7:42.

Separately, and more fundamentally: the coupled ratio (acute contained in
chronic) is subject to a well-known mathematical-coupling critique, and the
"2–4× injury risk" framing has been challenged on both statistical and causal
grounds. **[VERIFY]** the current state of that literature before defending
any ACWR use; the safe position is the one `adaptive_readiness` already takes —
warning only — which brings us to §6.1.

### 4.6 No uncertainty anywhere in the decision path [METHOD — high confidence] — **PARTIALLY ADDRESSED**

Nothing in the chain carries a variance. Specifically:

- `hrv_sd` is computed from as few as 10 readings (`len(baseline_window) >= 10`).
  The sampling distribution of an SD at n=10 is very wide; the band's width is
  itself a noisy estimate, and no allowance is made for that.
- `compute_readiness` renormalises weights over whatever components are present.
  An athlete with only Body Battery available receives a number on the same
  0–100 scale, with the same `push`/`moderate`/`easy` mapping, as an athlete
  with all six. **The construct silently changes while the output format does
  not.** `ReadinessReport` carries components, but the score consumers use is a
  bare integer.
- CP/W′ are returned without standard errors, so no downstream code can know
  whether an eFTP shift of 5 W is signal.

For a thesis this is the central architectural objection, and §9 is the answer.

### 4.7 Unvalidated constants throughout [METHOD]

Non-exhaustive: the readiness weights (0.25/0.22/0.20/0.15/0.10/0.08); the
ceiling cut-points (68/45/30); the TSB band scores (65/85/80/72/52/25); the CV
penalties (−15/−30); the sleep-debt penalties (−5/−10/−25); `deload` volume
0.55 and `hold` 0.8; the ambition multipliers (0.85/1.0/1.12/1.25) and `_VOL_CAP`
1.4; `concern` as an unweighted count `>= 2`.

None is derived, and none is wrong — they are reasonable coach-informed priors.
The defect is that they are presented with the same epistemic status as the
HRV band. A thesis must (a) declare them as priors, (b) show the output's
sensitivity to them, and (c) where possible, fit them.

---

## 5. Construct validity — the deepest layer

This is where a committee will push hardest, because these are the objections
that no amount of code quality can answer.

### 5.1 Nocturnal vendor HRV is not morning supine RMSSD [METHOD — high confidence in the concern]

The engine reads `DailyMetric.hrv_status` and takes its natural log as
"lnRMSSD-style stabilisation" (`adaptive_readiness._hrv_rows`). That field is a
Garmin-derived overnight value.

The HRV-guided training protocols the module cites were, to my knowledge, built
on **morning, supine, short-duration RMSSD measured under controlled
conditions** — standardised posture, standardised time-since-waking, often
paced breathing. Nocturnal HRV differs in absolute value, in variance, and in
what it is sensitive to (sleep architecture, position changes, alcohol timing,
last meal). It is a *related* construct, not the same one.

Applying a ±0.5 SD band and a −10% hard rail derived from one construct to a
different construct is the kind of substitution that invalidates an otherwise
well-run trial. **[VERIFY]** the measurement protocol in each cited trial. If
they are morning supine — and I believe they are — then the honest thesis
position is that this system implements a *nocturnal analogue* whose thresholds
require independent derivation, and the derivation is a study (§10.1).

This does not mean the approach is wrong. Nocturnal HRV has real advantages
(no compliance burden, many samples per night, less measurement noise from
protocol violations). It means the *numbers* cannot be borrowed.

### 5.2 The most opaque input carries the most weight [METHOD]

Sleep is weighted 0.25 — the largest — and is primarily Garmin's proprietary
0–100 sleep score. The module's stated weighting principle is that Body Battery
is weighted lightest "because its computation is a vendor black box". The sleep
score is equally a vendor black box, and consumer sleep staging has known
accuracy limits against polysomnography, particularly for stage classification.
The rationale and the weights contradict each other.

A defensible alternative weights the *measured* quantity (total sleep duration,
and timing regularity) over the *inferred composite*, since duration is the
component consumer devices estimate most reliably and the one the performance
literature most directly supports.

### 5.3 Decoupling is the wrong durability signal, and the right one is already in the repo [METHOD — high confidence] — **CONFOUND CONTROLLED**

The escalate gate turns on `decoupling_delta`: the latest ride's Pw:HR
decoupling minus the median of prior rides. Aerobic decoupling is strongly
confounded by ride **duration**, **intensity**, **ambient heat**, **hydration**
and **fuelling**. Comparing a 5-hour hot endurance ride against the median of a
month of 1-hour sessions measures the weather, not the athlete's fatigue
resistance.

Meanwhile `durability.py` implements the defensible metric — best power over a
window *after* a kJ-work threshold, versus the same window fresh — which is the
matched-work comparison the durability literature is built on. **The engine's
adaptation gate uses the confounded signal while the sound one sits unused in
the same codebase.**

**Fix:** drive `durability_improving`/`durability_worse` from post-kJ power
drop, computed only across rides matched on duration and work; keep decoupling
as a displayed descriptive, not as a gate.

### 5.4 The TID classification matches neither published convention [METHOD]

`advanced_metrics.zone_distribution` assigns **an entire activity** to one of
three zones by its Intensity Factor (<0.77 → Z1, 0.77–1.00 → Z2, >1.00 → Z3),
then reports the duration-weighted result as a "% time distribution".

This is a hybrid: it is not *session-goal* classification (which counts
sessions, not hours) and it is not *time-in-zone* (which requires per-second
data the system demonstrably has — the 1 Hz streams of §2.4). The two
conventions are known to give materially different pictures of the same
training, which is precisely why the distinction is drawn in the literature.

Concretely, a 4-hour endurance ride containing 20 minutes at VO2max has an IF
around 0.7 and is booked as 100% Z1; a 1-hour threshold session is booked as
100% Z2. The result systematically inflates Z2 (the "grey zone" the optimizer
warns about) and erases Z3 — so the polarisation advice is computed from a
distribution the athlete never trained.

**[VERIFY]** The docstring asserts "the research (Seiler 2009) shows
session-level classification correlates strongly with detailed second-by-second
TID at > 90% agreement." I could not verify this attribution, and I am
skeptical of it: my understanding is that the comparison of session-goal versus
time-in-zone methods is notable in that literature precisely *because the two
diverge*. **Do not carry this sentence into a thesis without checking the
primary source.** If it does not support the claim, the docstring is a
load-bearing misattribution — the justification for the cheap method rests on it.

**Fix:** compute time-in-zone from the 1 Hz streams (they exist), anchor the
boundaries on LT1/LT2 estimates rather than IF-of-FTP proxies, and report both
conventions.

### 5.5 TSS is a lossy scalar, and the system knows it [METHOD]

`TSS = duration × NP × IF / (FTP × 3600) × 100` maps a session to one number,
so 100 TSS of threshold work and 100 TSS of endurance riding are
interchangeable to CTL. They are not physiologically interchangeable, and the
rest of this codebase demonstrably knows it — that is what the TID optimizer,
the durability module and W′-balance are *for*. The load model is the one place
where the system's own sophistication is discarded.

This is a known and accepted limitation of the impulse-response family. Stating
it explicitly, and showing what a two-dimensional dose does instead, is a
thesis chapter (§9.2).

---

## 6. Internal contradictions

These matter more than any single threshold, because they mean the system gives
different answers about the same athlete on the same morning depending on which
code path is asked.

### 6.1 ACWR is simultaneously discredited, weighted, and a hard rail [CODE — certain] — **RESOLVED**

| Module | Treatment of ACWR |
|---|---|
| `adaptive_readiness.py:12` | "ACWR is used only as a warning, never a causal threshold (discredited)" — soft; at worst downgrades `escalate` → `push` |
| `readiness_score.py` | 15% of the weighted readiness composite |
| `safety_rails.py:70–110` | **Hard rail**: >2.0 → `rest`, >1.8 → `easy`, >1.5 → `moderate` |

One module calls the metric discredited; another lets it force a rest day. Both
are in the live decision path (`daily_decision.py:283` and `:349`). This cannot
be defended in a viva — not because either position is indefensible, but
because holding both is.

**Resolve deliberately.** My recommendation: keep ACWR as a *displayed
descriptive* and a soft warning, remove it from the hard rails and from the
composite, and replace its role with the load-derivative signal that is already
there and better founded (`tsb_velocity_2d`, `safety_rails.py:78`) plus the
uncertainty-aware ramp term of §9.

### 6.2 Three different HRV rules can disagree on one morning [CODE — certain] — **RESOLVED** (there were four)

- `adaptive_readiness`: ln-transformed, 7-day mean vs 28-day mean ± 0.5 SD.
- `readiness_score._hrv_component`: **raw** (untransformed) % change vs 28-day
  baseline, piecewise-linear scoring anchored at 70.
- `safety_rails`: raw `hrv_delta_pct < -10` → hard `easy`.

Three transformations (log vs linear), three reference constructions, three
decision rules. An athlete at −8% could be "in band, push hard" by the first,
~14/100 on the second, and untouched by the third. Which one the athlete sees
depends on the surface they open.

**Fix:** one HRV state estimator, computed once, consumed everywhere — exactly
the discipline `daily_decision.py:357` already applies to the readiness score
("the daily decision is the single producer; every surface must see one score").
Extend that principle one level down.

### 6.3 A model/athlete disagreement suppresses the model [CODE — certain]

`athlete_power_profile.reconcile_threshold` (line 155): manual FTP always wins;
when the model's eFTP disagrees by more than 10%, `model_valid` goes False and
the UI **hides CP/W′ entirely**.

Consider what that means. The system has fit a power-duration model to the
athlete's own maximal efforts, and it says their threshold is 20% away from the
number they typed in months ago. Every TSS, every zone, every CTL value and
every prescribed interval is scaled by that typed number. The system's response
to detecting the error is to **hide the evidence of it**.

The information flow is backwards. A large, persistent CP-vs-FTP divergence is
the single most valuable diagnostic the system produces about its own inputs.

**Fix:** treat divergence as a *flag on the load model*, surface it ("your
sessions have been prescribed off a threshold the data no longer supports"),
and offer re-basing (§7.2).

---

## 7. Systemic issues

### 7.1 FTP never updates itself [CODE]

`breakthrough_detector` is explicitly read-only ("no rows are written") and
detects eFTP shifts of ≥5 W. Nothing writes `ftp_watts` from CP, eFTP or a
detected breakthrough. FTP changes only when the athlete types a new one.

So the denominator of every intensity calculation drifts out of date by
default, and the system detects the drift (§6.3) without acting on it. For an
improving athlete this systematically **over-**estimates TSS (rides are scored
against a too-low threshold), inflating CTL and ATL and biasing the fatigue
signals toward caution.

### 7.2 Historical TSS is never re-based [CODE]

`recompute_missing_tss` (`activity_service.py:397`) recomputes only rows where
TSS is NULL. When FTP is updated, past TSS is left as computed under the old
threshold.

CTL is therefore a 42-day exponential average of loads expressed in **drifting
units**. Across a season in which FTP moved 10%, "CTL 85" in March and "CTL 85"
in August do not denote the same training. Every longitudinal statement the
product makes — progression charts, season trends, fitness comparisons — rests
on an unstated unit change.

Both re-basing policies are defensible (recompute all history against current
FTP; or store FTP-at-time and normalise at read). Neither is implemented, and
the choice is not documented. **This is a genuine thesis-level modelling
decision**, and either choice is defensible if argued.

### 7.3 The ambition multiplier moves a safety-relevant boundary [CODE + METHOD]

`_AMBITION` (0.85 → 1.25) scales the upside, and `hungry = ambition >= 1.1`
lets aggressive athletes escalate on *softer physiological evidence*
(`durability_improving or (hungry and not durability_worse)`).

The comment is careful that the back-off gate is never relaxed, which is right.
But the decision boundary for *escalation* now depends on a stated preference,
so two athletes with identical physiology receive different prescriptions. As
product design this is legitimate and probably good. As science it means the
system's output is not a function of the athlete's state alone, and any
evaluation must stratify on `push_intensity` or it will confound preference
with response.

### 7.4 The team knows how to validate — just not here [CODE]

`tests/services/rehearsal/test_verdict_vs_actual.py` and
`test_band_calibration.py` exist: the route-rehearsal subsystem is tested by
comparing its predictions against what actually happened, and its confidence
bands are calibration-checked.

No equivalent exists for the adaptation engine. There is no test that asks
whether `escalate` days are followed by better sessions than `hold` days,
whether the HRV band predicts anything, or whether the readiness score
correlates with any outcome. `test_pmc_window_invariance.py` verifies internal
consistency, not external validity.

The capability is in-house. It has simply never been pointed at the engine.

---

## 8. Missing science

### 8.1 Female physiology (highest-value gap)

Beyond the dead code of §3.3: ovarian-hormone fluctuation across the menstrual
cycle is associated with systematic variation in resting heart rate and
HRV-derived indices, with the luteal phase typically showing elevated RHR and
reduced HRV relative to the follicular phase.

Now trace that through this engine. The luteal phase lasts roughly two weeks —
comparable to the 28-day baseline window. A female athlete in the luteal phase
presents with depressed HRV and elevated RHR against her own 28-day mean, and
the system reads:

- `hrv_state = "below"` → `hold` (volume ×0.8), or `deload` (×0.55) after two days
- `_rhr_component` scores toward 0
- `concern` accumulates

**The engine will systematically prescribe reduced load during a predictable
phase of every cycle, for physiological variation that is not fatigue.** Over a
season that is a substantial and sex-specific training deficit produced by the
algorithm itself. This is not a hypothetical: it follows directly from the code
paths above, and it is the most consequential single finding in this audit.

The mitigation exists in the repo and is disconnected. Reconnecting it is a
one-day fix; doing it *properly* — cycle phase as a covariate in the state
estimator rather than a post-hoc point nudge (§9) — is a thesis chapter with a
genuine claim to novelty, because the applied literature here is thin and the
commercial products largely ignore it.

### 8.2 Non-training stress

The model's only inputs are training load and overnight physiology. Psychosocial
stress, work, travel and illness are absent except as self-reported status. The
classical monitoring literature is fairly consistent that brief subjective
measures track training response at least as well as, and often better than,
objective physiological ones. A short daily wellness item (sleep quality, mood,
soreness, stress) is cheap and would likely outperform Body Battery at 0.08.

### 8.3 Heat, altitude, and environmental context

`weather_client` and `environment` services exist, and rides are weather-tagged
elsewhere in the product. None of it reaches the adaptation engine. Heat strain
inflates HR at a given power (corrupting decoupling — §5.3 — and any HR-derived
load), and altitude alters both HRV and power. The data is already in the
system.

### 8.4 Illness detection

`readiness_detector` and `morning_health_detector` exist, but the adaptation
engine's only illness pathway is self-report. The combination the literature
associates with incipient infection — elevated RHR, suppressed HRV, elevated
respiration rate — is largely available from the same wearable and is not
assembled into a detector that gates training.

### 8.5 Individualisation of the load model

`CTL_TIME_CONSTANT = 42` and `ATL_TIME_CONSTANT = 7` are applied to every
athlete. The impulse-response literature is built on the premise that these
time constants are *individual parameters to be fitted*, and the variation
between athletes is large. Using population defaults is a reasonable cold-start;
never updating them is a modelling choice that is currently undeclared.

### 8.6 No dose–response feedback loop

Nothing closes the loop from prescription → execution → adaptation →
prescription. The engine does not learn that *this* athlete responds to
threshold work, or recovers faster than the 7-day ATL constant implies. Every
day's decision is made as if it were the first.

---

## 9. The upgrade: what makes this defensible

The unifying fix for §4.6, §6.2, §7.5 and §8.5 is to stop computing *scores*
and start estimating *states with uncertainty*.

### 9.1 A hierarchical Bayesian state-space model

Replace the rule cascade and the weighted composite with one latent-state model:

**Latent state** (per athlete, per day): fitness `f_t`, fatigue `g_t`, and an
autonomic/readiness state `r_t`.

**Process model** — the Banister/Busso form, but with *individual* parameters:

```
f_t = f_{t-1} · exp(−1/τ_f^(i)) + k_f^(i) · dose_t
g_t = g_{t-1} · exp(−1/τ_g^(i)) + k_g^(i) · dose_t
r_t = α^(i) · r_{t-1} + β^(i) · (cycle phase, sleep, non-training stress) + ε
```

**Observation models** — each sensor gets its own likelihood and its own noise:
lnRMSSD, RHR, sleep duration, Body Battery, sRPE, and performance surrogates
(post-kJ power drop, MMP breakthroughs). Missing observations are simply absent
from the likelihood; the posterior widens instead of the construct silently
changing (§4.6).

**Hierarchy**: individual parameters `θ^(i)` drawn from population priors, so a
new athlete starts at the population mean (today's constants — nothing is lost)
and migrates toward their own values as data accrues. This is the principled
version of §8.5, and it makes the cold-start behaviour identical to today's.

**Inference**: a particle filter or sequential Monte Carlo for the daily
update; full MCMC offline for parameter learning.

This single change answers "where is your uncertainty?", "why these time
constants?", "how do you handle missing sensors?" and "how does it
individualise?" — the four questions a committee will certainly ask.

### 9.2 A dose that is not one number

Replace scalar TSS in the process model with at minimum a **two-dimensional
dose** — volume (kJ or duration) and intensity distribution (time below LT1 /
between / above LT2, from the 1 Hz streams that already exist per §5.4) — with
separate gains `k` per dimension. This lets the model represent what the rest
of the codebase already believes: that 100 TSS of endurance and 100 TSS of
threshold are different stimuli.

### 9.3 Change detection instead of threshold crossing

For the HRV gate specifically, the variance-correct formulation of §4.2 is a
**sequential change-point / control-chart** problem: is the current level
different from the reference, given the *estimated measurement noise of this
athlete*? A CUSUM or Bayesian online change-point detector on lnRMSSD gives a
principled alarm rate, adapts its sensitivity to each athlete's own
variability, and yields a probability rather than a binary. It also disposes of
§4.3 by testing one statistic instead of two.

### 9.4 Decisions from a loss function

Today: state → threshold → directive. Instead: posterior → **expected utility**.
Define the loss over (expected adaptation gain, probability of maladaptation /
illness / injury), and choose the prescription that maximises expected utility
given the *full posterior*. The athlete's `push_intensity` (§7.3) then becomes
what it actually is — a risk-preference parameter in the loss function, stated
explicitly rather than embedded as a multiplier on a boundary. This is both
more defensible and more honest about what the ambition setting does.

### 9.5 Keep the evidence tiering

Carry §2.1 into the new architecture: every posterior-derived claim keeps its
provenance, and the UI keeps saying which claims are model, which are prior,
and which are convention. This is the product's best idea and it survives the
rewrite intact.

---

## 10. A research programme

Three studies. Each is feasible with the data this system already collects, and
each produces a defensible chapter.

### 10.1 Derivation study — nocturnal HRV thresholds (answers §5.1)

**Question.** What band on *nocturnal, vendor-derived* HRV identifies the same
states that the ±0.5 SD morning-supine band was built to identify?

**Design.** Observational, within-athlete, retrospective on the existing
database, ideally with a prospective sub-cohort measuring morning supine RMSSD
alongside the wearable for 8–12 weeks.

**Analysis.** Agreement between constructs (Bland–Altman on ln scale, and the
correlation of their *deviations from baseline*, which is what the engine
actually uses). Then derive the nocturnal band that maximises agreement with
the morning-derived state classification.

**Output.** Either a corrected band, or evidence that the two constructs
disagree enough that the nocturnal signal needs its own outcome-anchored
derivation (→ 10.2).

### 10.2 Validation study — does the directive predict anything? (answers §7.4)

**Question.** Do the engine's daily directives carry information about
next-day training capacity?

**Design.** Retrospective cohort on existing data; strictly pre-registered
analysis to avoid fitting the answer.

**Primary endpoint.** Next-session execution quality — a pre-declared composite
of prescribed-vs-achieved work and the post-kJ power drop of §5.3.
**Secondary.** 6-week change in CP; self-reported session RPE relative to
prescribed intensity; illness/NFOR incidence.

**Analysis.** Mixed-effects models with athlete as random effect, stratified by
`push_intensity` (§7.3). The critical comparison is against a **null model that
uses TSB alone** — if the multi-signal composite does not beat CTL/ATL
arithmetic, that is a real and publishable finding, and it is the single most
important number in this entire audit.

**Why this is the priority.** Everything else in this document is an argument.
This is a measurement. Run it first.

### 10.3 Intervention study — cycle-aware adaptation (answers §8.1)

**Question.** Does making the engine cycle-aware reduce inappropriate load
reduction in the luteal phase without increasing maladaptation?

**Design.** n-of-1 / single-case experimental design replicated across athletes
(A-B-A or randomised block by cycle), which suits this population far better
than a parallel-group RCT and is the appropriate design for individualised
interventions.

**Endpoints.** Prescribed load by cycle phase (the bias of §8.1, directly
measured); training completed; CP change; symptom and wellness reports.

**Novelty.** The applied literature on cycle-aware autoregulation is thin, and
this system is unusually well-instrumented to contribute. This is the chapter
with the strongest claim to originality.

---

## 11. Prioritised roadmap

**Done (2026-08-25).**

- §3.1 — the decoupling query now joins `Activity` and orders by `started_at`
  descending. Regression test asserts the compiled SQL contains an `ORDER BY`,
  because the bug is invisible in any behavioural test against a mock.
- §3.2 — `_hrv_cv_pct()` added to `advanced_metrics`, returned from `hrv_trend`
  as `cv_pct`, and passed by both production callers. The Plews penalty can
  now fire. Sample SD (n−1); `None` rather than `0.0` when there is nothing to
  disperse, since zero would read as "rock steady" on no evidence.
- §3.4 — **reshaped after the first attempt was wrong.** Raising
  `CP_MIN_POINTS` to 3 deleted eFTP for every athlete whose MMP curve has only
  two points in the 120–1200 s band (caught by `test_power_profile_view`), which
  trades a misleading number for no number. The floor stays at 2; the fit now
  carries `identifiable` (False at n=2) and `cp_se_watts` (undefined below n=3),
  and `model_confidence` — which multiplied by r², and so awarded its *highest*
  score to the exact-by-construction fit — caps an unidentifiable fit at 0.35.
  The defect was never that 2-point fits exist; it was that they looked certain.

**Still open — correctness.** §3.3, now scoped as a feature (see the correction
in that section).

**Done — coherence (2026-08-25).**

- **§6.2 + §4.1 + §4.2 + §4.3 — one HRV estimator.** New `hrv_state.py` owns
  the log transform, the windows, the band and the streak count. There were
  **four** constructs, not three: `plan_adaptation_engine._green_streak` had its
  own `ln_all[-28:]` band, and that one hands out MORE training when cleared.
  All four now read one estimate. The baseline is the PRECEDING 28 days and
  never overlaps the window it judges; `z_mean` (variance-correct) is reported
  beside the convention verdict so the two can be compared on real athletes
  rather than argued about; `below_days` is documented as the daily-scale test
  it always was. A stuck sensor (zero dispersion) is now `unknown` rather than
  "in band" — no dispersion, no scale, no claim.
- **§6.1 + §4.4 — one ACWR position: descriptive, never a gate.** Removed from
  the `safety_rails` cascade (it could force a rest day) and from the readiness
  composite (where it double-counted TSB: the two are transforms of one
  `(CTL, ATL)` state, so 35% of the score was one signal seen twice). It
  survives as a flag. Nothing protective was dropped, and that is *tested* rather
  than asserted: an athlete at ACWR 2.0 sits at TSB ≈ −CTL and is still capped by
  the −30 rail, with `tsb_velocity_2d` catching the spike as it happens.
- **§4.6 — partially.** `ReadinessReport` now carries `coverage` and
  `confidence`, so a score built from one vendor number no longer looks
  identical to one built from the full sensor set. Component-level uncertainty
  still awaits the estimator of §9.
- **§5.3 — confound controlled, not yet solved.** The sound metric (post-kJ
  power drop) is not persisted per activity, so it cannot be read cheaply here.
  Until it is, decoupling is compared only against rides of **comparable work**
  (±35% kJ, ≥3 matches, else no reading). The old unmatched median routinely
  judged a five-hour ride against a month of one-hour sessions and reported
  duration as fatigue — there is a test showing the two methods disagree in
  *sign* on a realistic training week.

**Still open — coherence.** §6.3 invert the FTP/eFTP relationship so divergence
flags the load model; §7.1/§7.2 threshold updating and re-basing.

**Then — measurement (months).** Study 10.2. Do not build §9 before running it:
if the composite does not beat TSB alone, the state-space model must be
justified on different grounds, and you need to know that first.

**Then — architecture.** §9.1–9.4, with §7.2's re-basing decision made and
documented as part of it.

---

## 12. Threats to this audit

Stated so they can be checked rather than discovered.

1. **I did not verify the citations.** Every `[VERIFY]` tag is a real
   uncertainty, and §5.4's suspicion about the TID attribution is the one most
   likely to change a conclusion.
2. **Static reading only.** I have not seen the distribution of real inputs. If
   `decoupling_pct` rows happen to arrive in insertion order in practice, §3.1
   is latent rather than active — it is still a bug, but its observed impact
   may be nil.
3. **I did not audit** the LLM narrative layer, the mesocycle generator's
   session-selection logic beyond its ramp constants, or `daily_decision`'s full
   887 lines. There is more to find.
4. **Effect sizes are unquantified.** I argue that the nested baseline biases
   toward permitting load; I have not computed by how much. Several findings
   could prove immaterial in magnitude, and §10.2 is what would show it.
5. **The clinical claims in §8.1 are directional.** The existence and direction
   of cycle-related HRV variation is well supported; the precise magnitude, and
   therefore how often the engine actually mis-prescribes, needs measuring in
   this cohort.
