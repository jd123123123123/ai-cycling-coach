# Training Frameworks & Metrics Research
*Compiled April 2026 — for AI Cycling Coach feature prioritization*

---

## Executive Summary: Top 10 Metrics to Add Next

Ranked by **signal quality vs. computation cost** from data we already have (power, HR, pace, HRV, sleep, body battery from Garmin sync):

| Priority | Metric | Data Needed | Effort |
|----------|--------|-------------|--------|
| 1 | **Aerobic Decoupling (Pw:HR)** | Power + HR (per activity) | Low |
| 2 | **Efficiency Factor (EF = NP/HR)** | Power + HR (per activity) | Low |
| 3 | **Training Intensity Distribution (TID)** | HR or power zones across all activities | Low |
| 4 | **Mean Maximal Power (MMP) curve** | Power (all activities, rolling max) | Medium |
| 5 | **Critical Power (CP) + W' estimate** | MMP at 2–3 durations (3min, 8min, 20min) | Medium |
| 6 | **Durability score** (power drop after kJ threshold) | Power + kJ from long rides | Medium |
| 7 | **HRV trend (rMSSD baseline + CV)** | Garmin HRV status / overnight HRV | Low-Medium |
| 8 | **W' Balance (Wbal)** real-time depletion | CP + power stream | Medium |
| 9 | **Zone 2 metabolic efficiency trend** | HR + power over time at fixed watts | Medium |
| 10 | **TSB-targeted taper model** | Existing CTL/ATL + race date | Low |

**What these unlock:** Moving from "how much did you train?" to "how well are you adapting?" — the question every serious athlete and coach actually cares about.

**Requires extra sensors (not yet):** VLamax (lab lactate test or INSCYD), DFA-alpha1 (real-time R-R intervals, not available in standard Garmin FIT files), Running Economy (metabolic cart), CGM glucose (Supersapiens/Abbott).

---

## 1. Load / Fitness / Freshness — Beyond Basic CTL/ATL/TSB

### The Banister Impulse-Response Model (1975, still gold standard math)
The foundational model: **Performance = Fitness(t) − Fatigue(t)**. Both fitness and fatigue rise with training load (TSS/impulse) but decay exponentially with different time constants. The classic defaults (τ_fitness=42d, τ_fatigue=7d) are population averages — not individualized.

**What's new in 2025/2026:**
- A 2025 paper (arXiv 2503.14841) introduces a **3D impulse-response model** that tracks aerobic, anaerobic, and neuromuscular energy system adaptations separately rather than a single fitness-fatigue pair.
- Research confirms time constants vary meaningfully: masters athletes (>45y) need longer τ_fatigue (10–14d vs 7d); high-CTL athletes (>100) need longer τ_fitness (50–56d).
- **Practical action:** Expose τ_fitness and τ_fatigue as adjustable per-athlete parameters in our PMC. Default 42/7 but allow coach override.

### WKO5 iLevels (Individualized Power Zones)
WKO5 (TrainingPeaks/Dr. Andy Coggan) generates **athlete-specific zones** based on modeled VO2max and FRC (Functional Reserve Capacity) from the full power-duration curve — not just a fixed percentage of FTP. Zones shift as the athlete's phenotype changes (sprinter vs. climber vs. time trialist).

**Key insight:** A 300W FTP rider who is a sprinter and a 300W FTP rider who is a diesel engine have very different optimal training zones. iLevels correct for this.

**Practical action:** Build a power-duration curve from rolling MMP data; derive phenotype score (anaerobic vs. aerobic dominant) from the curve shape; adjust zone boundaries accordingly.

### Polarized Training Distribution Score (Seiler)
Dr. Stephen Seiler (Univ. of Agder) established that elite endurance athletes naturally converge on **~80% low intensity (below LT1), ~20% high intensity (above LT2), with very little time in the "moderate" zone**. This is the 3-zone model:
- Zone 1: < LT1 (easy, "could talk normally")
- Zone 2: LT1–LT2 (moderate, threshold-ish — should be minimized)
- Zone 3: > LT2 (hard intervals)

A 2024 meta-analysis (PMC11329428) confirmed polarized outperforms threshold-focused approaches for VO2max and work economy over medium-term training cycles.

**Practical action:** Calculate **TID (Training Intensity Distribution)** per week/month. Flag weeks where >15% of time falls in the "moderate zone" (Z2 of the 3-zone model). Display as a pie chart. Coach alert when distribution drifts toward "junk miles."

### Norwegian Double-Threshold Method
Used by Ingebrigtsen brothers, Jakob Ingebrigtsen, and increasingly adopted in cycling. Key features:
- 4–6 threshold interval sessions/week (not 1–2 like polarized)
- Threshold defined **lactate-guided at ~2–4 mmol/L** (not power-based)
- Double-threshold days: two sessions separated by 6–8 hours, both at controlled lactate
- Base/recovery periods revert to 2–3 sessions/week

**Practical action:** Without lactate data, proxy using HR at threshold pace. Flag when weekly threshold volume exceeds ~120 min total (overreach risk without lactate verification).

### Pyramidal vs. Polarized vs. Threshold
| Distribution | Z1 | Z2 | Z3 | Best For |
|---|---|---|---|---|
| Polarized | 80% | <5% | 15-20% | VO2max development, base phases |
| Pyramidal | 70–75% | 20–25% | 5-10% | Competition prep, masters athletes |
| Threshold | 50-60% | 30-40% | 10-15% | Short-term TT peaking |

Most elite coaches use polarized in base, pyramidal in build, with threshold blocks 4–6 weeks out from A-race.

---

## 2. Performance Metrics

### Computable From Current Data (Power + HR + Pace)

**Critical Power (CP) and W'**
- CP = highest power sustainable indefinitely (asymptote of power-duration curve)
- W' = anaerobic energy reservoir above CP (measured in kJ, typically 10–30 kJ for trained cyclists)
- Formula: derive from MMP at 3+ durations (e.g., 3min, 8min, 20min) using hyperbolic fit
- **W'bal model (Skiba):** tracks depletion of W' in real-time during a ride. Predicts time to exhaustion during surges. Critically useful for pacing advice.
- Coggan/Skiba landmark paper; Frontiers in Physiology 2021 model refinement
- **Status:** Fully computable from our power data. High priority.

**Mean Maximal Power (MMP) Curve**
- Rolling best power at every duration (1s to 6h) across all historical activities
- The "fingerprint" of an athlete — shows phenotype (sprint-dominant: left-skewed; diesel: flat)
- Must normalize for freshness (fresh vs. fatigued MMP differs by 5–15%)
- **Status:** Computable. One of the highest-leverage additions.

**Efficiency Factor (EF = NP / avg HR)**
- Measures cardiac efficiency per unit of power
- Tracks aerobic fitness improvement: same power, lower HR = higher EF over time
- Friel standard: rising EF trend over 4–6 weeks confirms aerobic adaptation
- **Status:** Computable per-activity from existing data. Low effort.

**Aerobic Decoupling (Pw:HR)**
- Compares EF in first half of ride to second half
- <5% drift = aerobic system is holding; >5% = cardiac drift, insufficient base fitness
- Benchmark: a well-trained cyclist can hold decoupling <5% for 3+ hours at Z2 power
- Joe Friel: "the most important metric for building your aerobic engine"
- **Status:** Computable per-activity. Low effort. High signal.

**Durability (Fatigue Resistance)**
- Measures power output decline after accumulating a set kJ work threshold
- 2025 Frontiers paper (PMC12116599): successful amateur cyclists lost only 6.5% power after 1000 kJ vs. 12.5% for less successful athletes
- WKO5 approach: generate multiple power-duration curves at different kJ states (fresh, 500kJ, 1000kJ, 2000kJ)
- **Practical computation:** compare 20-min best power in first 30 min of a long ride vs. last 30 min after 1500+ kJ accumulated
- **Status:** Computable from long rides (>90min, >1000 kJ). Medium effort.

**Training Intensity Distribution (TID)**
- Classify each activity second/lap into Z1/Z2/Z3 (3-zone Seiler model) using HR or power
- 3-zone thresholds: LT1 (aerobic threshold ~65-70% HRmax / VT1), LT2 (anaerobic threshold ~80-85% HRmax / FTP)
- Display weekly and monthly distribution; trend toward polarized pattern
- **Status:** Computable. Medium effort.

### Requires Extra Sensors / Lab Testing

**VLamax (Maximal Lactate Production Rate)**
- Developed by Sebastian Weber (INSCYD platform), championed by Inigo San Millan
- Measures peak rate of glycolytic energy production (mmol/L/s)
- Sprinters: 0.7–1.0 mmol/L/s; pure endurance: 0.2–0.4 mmol/L/s
- High VLamax = strong sprint, but depresses FTP and fat oxidation for endurance
- Requires: either blood lactate protocol (lab) or INSCYD's metabolic profiling test
- **Status:** Requires lab test or INSCYD integration. Flag as Phase 8+ / premium tier.

**DFA-alpha1 (Real-Time AeT Estimation)**
- Non-linear HRV metric (detrended fluctuation analysis) that tracks cardiac fractal correlation
- DFA-a1 = 0.75 marks aerobic threshold (LT1); = 0.5 marks anaerobic threshold (LT2)
- Enables real-time AeT tracking without lactate testing — validated in triathletes (PMC8875480)
- Requires: R-R interval data at 1-second resolution during activity
- Garmin FIT files include R-R data on some devices (Fenix, Forerunner 955+) but not all
- Software: Runalyze, HRV Logger + Garmin, AIEndurance app
- **Status:** Needs R-R stream from device. Medium integration effort if device supports it.

**Running Economy (VO2/velocity)**
- Efficiency of converting O2 to movement; elite runners are 15-20% more economical than recreational
- Requires metabolic cart (lab) or estimated from pace + HR + altitude correction
- Elevation-adjusted pace (GAP) is a proxy but doesn't capture true economy
- **Status:** Lab only for true RE. GAP is computable now.

---

## 3. Recovery & Readiness Science

### HRV (rMSSD) — The Gold Standard Readiness Signal
- **rMSSD** (root mean square of successive differences) is the primary HRV metric for daily readiness
- Morning resting measurement (3–5 min, supine) is most reliable
- **Key patterns:**
  - Baseline: 7-day rolling mean
  - Coefficient of Variation (CV): normal <10%; >10% indicates unstable state
  - Acute suppression >10% below baseline = reduce intensity
  - Chronic suppression (3+ days) = likely overreaching
- HRV4Training (Marco Altini): validated methodology using smartphone camera PPG
- **Garmin's HRV Status:** uses overnight HRV from optical HR sensor; less accurate than chest strap but adequate for trends
- 2025 validation study: Oura Ring HRV accuracy beats Garmin optical in head-to-head; both show valid trends

### Garmin Body Battery & Training Readiness
- **Body Battery:** Firstbeat Analytics algorithm; derived from HRV + sleep + stress + activity
  - 0–100 scale; estimated energy reserve, not directly physiological
  - Starts at sleep start; charges during sleep proportional to HRV quality
  - Drains during activity proportional to intensity
  - **Known limitation (Altini 2025 critique):** composite score obfuscates which signal is driving the readiness estimate
- **Training Readiness:** Garmin's newer metric combining HRV status, sleep quality, recovery time, and acute load
  - When 3 of 4 inputs are poor, score predictably crashes — shows sensitivity but not specificity
- **Practical use:** Both metrics available via Garmin Connect API. Use as additional readiness signal, not primary.

### Oura Ring Readiness
- Contributors: HRV balance (30-day average vs. recent), resting HR, body temperature deviation, respiratory rate, sleep timing, previous day activity
- Body temperature deviation is unique — not replicated by Garmin or Whoop
- **Actionable for our app:** if athlete has Oura, pull readiness score via Oura API as optional additional signal

### Whoop Recovery
- Recovery score = HRV (%), resting HR (%), respiratory rate, sleep performance
- Strain score = cardiovascular load (proprietary scaling, not directly comparable to TSS)
- HRV measurement window: during slow-wave sleep (most accurate physiologically)
- **Practical use:** Whoop API available; pull recovery % as readiness modifier

### Subjective RPE as Calibration Signal
- Session RPE (Borg CR-10 scale) is highly correlated with internal load when athletes self-report honestly
- RPE vs. power at the same intensity is a sensitive overreaching indicator: same watts, higher RPE = beginning of fatigue accumulation
- **Practical action:** prompt athletes for RPE post-workout; track RPE/power ratio over time as a fatigue signal

---

## 4. Periodization Frameworks

### Block Periodization (Issurin)
Organize training into concentrated 3–6 week blocks, each with one primary physiological target:
1. **Accumulation block:** High volume, low-medium intensity. Build aerobic base, mitochondrial density. (~4–6 weeks)
2. **Transmutation block:** Moderate volume, high intensity. Translate base to specific fitness. (~3–4 weeks)
3. **Realization block:** Low volume, high intensity, race simulation. Peak and taper. (~1–2 weeks)

Superior to traditional periodization for elite athletes (Issurin, 2008 PubMed review). Maps cleanly to fitness-fatigue model: accumulate CTL in block 1, manage fatigue in block 3.

### Polarized Periodization (Seiler)
- Base phase: 85-90% Z1, 10-15% Z3, near zero Z2
- Build phase: shift to 75-80% Z1, increase Z3 volume
- Competition phase: reduce total volume 15-20%, maintain Z3 quality
- Key finding: 6-week polarized blocks outperform equivalent threshold blocks for VO2max and lactate threshold (multiple RCTs, 2020-2024)

### Norwegian Method (Double-Threshold)
- **Base phase:** 3-4 threshold sessions/week at controlled lactate (2–3 mmol/L)
- **Build phase:** 4-6 threshold sessions/week, add one double-threshold day
- **Peaking:** reduce volume 20%, maintain session quality
- Critical requirement: lactate monitoring to ensure sessions don't drift into superthreshold
- Without lactate: proxy with HR ceiling at LT2 estimate + RPE ≤7/10

### Reverse Periodization
- Traditional: high volume → high intensity
- Reverse: start with high intensity (race-specific work), add volume later
- Best for: athletes with limited time, short race seasons, or coming off injury
- Evidence: weak RCT support but anecdotal success in experienced athletes with well-developed aerobic base

### Friel Annual Training Plan
- Foundation → Preparation → Build 1 → Build 2 → Peak → Race → Transition
- Each phase 3-6 weeks; CTL targets rise through Build, held in Peak, slight drop at Race
- Taper: reduce volume 40-50% while maintaining intensity; TSB target +15 to +25 for A-race
- Still valid framework; most modern approaches are variants of this structure

### Attia Zone 2 + VO2max Protocol (Longevity Lens)
- 3-4 Zone 2 sessions/week × 45-60 min (conversational pace, max fat oxidation)
- 1 VO2max session/week: 4×4 min at near-maximal effort, 3-min active recovery between
- Rationale: VO2max is the single strongest predictor of all-cause mortality; each decile improvement = 11% mortality reduction
- Pragmatic for amateur athletes; high ROI per training hour
- **For our app:** build VO2max trend tracking (estimated from HR + pace/power relationship)

### Hybrid Modern Approach (2025 Consensus)
Most elite coaches now use:
1. Polarized base (Oct–Jan for Northern Hemisphere cyclists)
2. Block accumulation (Jan–Mar): targeted high-volume weeks
3. Norwegian-style threshold build (Mar–Apr): quality threshold work
4. Peak/taper (race-specific): 2–3 weeks, TSB targeting +5 to +25
5. Competition phase: maintain fitness, manage fatigue, race readiness windows

---

## 5. Race / Event Readiness

### TSB Target Ranges for Peaking
- **TSB (Training Stress Balance) = CTL − ATL**
- A-Race target: TSB **+10 to +25** (feel fresh without losing fitness sharpness)
- Avoid TSB >+30 (detrained, no longer race-sharp)
- Stage race management: TSB should not fall below −40 during multi-day events without rest day
- Taper timeline:
  - 3-week taper: reduce weekly TSS by 30-50% while maintaining 1-2 intensity sessions
  - 10-day taper: reduce volume 40%, keep race-pace efforts, TSB rises ~3-5 points/day

### Power-Duration Curve as Peaking Indicator
- Compare current MMP at key durations (5min, 20min, 60min) to season bests
- Ideal peak: MMP at event-specific duration is within 3-5% of season best AND TSB is positive
- WKO5 tracks "power personal records" per duration — we should build equivalent

### Durability Requirements by Event Type
| Event | Key Duration | Durability Demand |
|---|---|---|
| Criterium/Short Road Race | 3–30 min | High W', repeatability above CP |
| Gran Fondo (4–6h) | 4–6h | Power after 2000+ kJ |
| Sportive/Century | 5–8h | Fat oxidation, EF at low power |
| Triathlon (Olympic) | 40min bike | High NP, minimal W' depletion |
| Triathlon (Ironman) | 5–6h bike | Strict power cap, fat oxidation |
| Stage Race | Multi-day | Day-2/3 power at same TSS |

---

## 6. Nutrition & Fueling Frameworks
*(Phase 8 territory — noted here for future integration)*

### Carbohydrate Periodization ("Train Low, Compete High")
- **Train Low:** intentionally deplete glycogen before/during low-intensity sessions to upregulate fat oxidation genes (PGC-1alpha, fat transporter proteins)
- **Compete High:** maximize glycogen for race performance
- Key mechanisms: glycogen threshold hypothesis — adaptations maximized when muscle glycogen falls below ~300 mmol/kg dry weight
- Caution: training low impairs high-intensity session quality and suppresses immune function
- Practical: "sleep low" approach — deplete glycogen in evening session, fast overnight, train next morning low

### In-Ride Carbohydrate Intake Ladder
| Duration | CHO Target | Notes |
|---|---|---|
| <60 min | 0–30 g/hr | Optional for most |
| 60–120 min | 40–60 g/hr | Single CHO source (glucose) adequate |
| 120–180 min | 60–90 g/hr | Mix glucose:fructose (2:1 ratio) for gut absorption ceiling |
| >180 min | 90–120 g/hr | 1:0.8 glucose:fructose trained gut required |
| Gran Fondo (>5h) | 100–120 g/hr | Elite-trained gut; 300mg caffeine in final 90min |

Science: Jeukendrup (2010+) GLUT2/GLUT5 transporter research; modern high-carb fueling validated in Tour de France stage racers using CGM (Supersapiens) showing glucose stability correlates with power sustainability.

### Pre-Workout Fueling by Intensity
- Z1/Z2 (< LT1): fasted acceptable for sessions <90 min; builds metabolic flexibility
- Threshold/LT2: 30–60g CHO 60 min before; avoid high-fat/protein meals
- VO2max intervals: 40–60g CHO pre; 30–45g/hr during
- Race simulation: full race-day protocol (3–4g/kg CHO the day before + pre-race meal)

---

## 7. Sources

### Research Papers
- Banister et al. (1975): "Systems model of training for athletic performance" — original fitness-fatigue model
- Skiba et al. (2012, 2015): W' balance model; IJSPP
- Seiler & Tonnessen (2009): "Intervals, thresholds, and long slow distance" — Sportscience
- Seiler et al. (2024 meta-analysis): PMC11329428 — polarized vs. other TID
- Norwegian Training Session Models (2024): PMC11560996
- DFA-alpha1 validation: PMC7845545, PMC8875480, Frontiers Physiology 2024 (fphys.2024.1329360)
- Durability (2025): PMC12116599, PMC12243304 — Frontiers Sports Active Living
- 3D Impulse-Response Model (2025): arXiv 2503.14841, PMC12880663
- Carb periodization review: JISSN 2021 (s12970-021-00435-3)

### Coaches & Practitioners
- **Dr. Stephen Seiler** — Univ. of Agder; polarized training, 3-zone model, TID research
- **Dr. Andrew Coggan** — Critical Power, TSS, PMC, iLevels, NP/IF/TSS framework
- **Dr. Iñigo San Millán** — Zone 2 science, VLamax, lactate metabolism; UAE Team Emirates (Pogačar)
- **Dr. Philip Skiba** — W' balance model, power-duration modeling
- **Joe Friel** — Annual training plan, aerobic decoupling/EF metrics, TrainingPeaks co-founder
- **Dr. Peter Attia** — Zone 2 + VO2max longevity protocol; popularized 4×4 for health athletes
- **Sebastian Weber** — INSCYD platform, VLamax testing, metabolic profiling
- **Dr. Marco Altini** — HRV4Training, DFA-alpha1 methodology, wearable validation research
- **Dr. Vladimir Issurin** — Block periodization theory and design
- **Jan Olbrecht** — VLamax precursor work; "The Science of Winning" (2000)

### Tools & Platforms Referenced
- **WKO5** (TrainingPeaks): iLevels, MMP curves, durability modeling, phenotypic analysis
- **INSCYD:** VLamax + metabolic profiling without lab lactate test
- **HRV4Training / Elite HRV:** rMSSD tracking, DFA-alpha1 tools
- **Runalyze:** Open-source DFA-alpha1 implementation from Garmin FIT files
- **AIEndurance.com:** DFA-alpha1 threshold tracking app (Garmin + Zwift compatible)
- **Supersapiens/Abbott CGM:** Glucose stability during training

### Key Podcast Episodes
- Scientific Triathlon EP#177: Seiler polarized training deep-dive
- Scientific Triathlon EP#329: DFA-alpha1 threshold estimation with Bruce Rogers, MD
- Peter Attia #85 + #201: Iñigo San Millán Zone 2 deep-dives
- Fast Talk Labs: San Millán "Physiology of Base Season"

---

*Research compiled from web searches, PubMed, arXiv, and coach publications. April 2026.*
*Next update recommended: post-2026 Grand Tour season (August 2026) for any new power modeling breakthroughs.*
