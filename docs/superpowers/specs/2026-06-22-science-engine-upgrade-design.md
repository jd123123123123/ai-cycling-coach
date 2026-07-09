# Science-engine upgrade — program design

**Date:** 2026-06-22
**Status:** Approved (decomposition + Phase-0-first sequencing)

## Goal

Make the coaching algorithm the most innovative, study-grounded one by adding
modern endurance-science models on top of the existing foundation
(Banister CTL/ATL/TSB, Coggan zones, Seiler polarized, ACWR/Bourdon,
Plews HRV-guided readiness, Issurin blocks, Friel phases, Mujika taper).

Companion bug (DONE, separate): freshness/recommendation must read rolling
trailing load, never the Monday-resetting weekly counter — see
`freshness-must-use-rolling-load` memory and the `feat/period-report` diff.

## Architecture principle

Every phase adds a **pure, dependency-free science service** (the pattern of
`training_load.py`, `readiness_score.py`) plus a thin DB/Garmin wiring layer.
Pure functions take plain inputs → plain outputs, unit-tested with TDD.

**Graceful degradation is mandatory:** every new metric returns `None` / falls
back to the existing behaviour when its input data is absent, so rides without
streams (the current 100% of rides) never regress any existing surface.

## Data reality (verified 2026-06-22)

- No per-ride time-series stored: no streams table; `raw_data` empty on all 42
  cycling rides; `normalized_power` null on all of them; only `average_power`.
- `daily_metric_samples` = intraday biometrics (HRV/RHR/body-battery), not rides.
- The Garmin client (`garmin-health-data`) exposes only daily/summary endpoints —
  no activity-details/sample endpoint (it already can't fetch HRV/body-battery).

Consequence: CP, W′bal, and durability are gated on intra-ride power/HR data
that is neither stored nor currently fetchable. The unlock is a stream pipeline
(Phase 0) with a vendor-independent `.FIT` upload fallback.

## Phases

| Phase | Sub-project | Depends on |
|---|---|---|
| 0 | Stream ingestion + power-duration (MMP) curve + true NP/decoupling | — |
| 1 | Critical Power + W′-balance | 0 |
| 2 | Durability / fatigue-resistance | 0 |
| 3 | Individualized dose-response (fitted Banister τ) | 1 |
| 4 | Broaden inputs: TID optimization, female physiology, heat/altitude | independent |

### Phase 0 — Stream foundation
- `activity_streams` table: downsampled 1 Hz power/HR/cadence/altitude per
  activity (compact JSON/binary blob keyed by activity_id).
- Derived on `activities`: `mmp_curve` (best power @ 5s/1/3/5/8/12/20/60 min),
  computed `normalized_power`, `decoupling_pct`, `total_kj`.
- Ingestion: extend Garmin client with `get_activity_details(activity_id)` +
  a `.FIT`/`.TCX` upload path (de-risks the scraper).
- Pure services: `power_curve.py` (rolling max-power → MMP),
  `normalized_power.py` (30 s rolling avg → 4th-power mean → NP/IF/VI),
  `decoupling.py` (first-half vs second-half Pw:HR).
- Backfill job for historical rides where available.

### Phase 1 — Critical Power + W′-balance
- `critical_power.py`: fit CP & W′ from MMP curve (2-/3-parameter model; needs
  ≥2 maximal efforts across durations). Expose CP, W′, CP-derived eFTP.
- `w_balance.py`: Skiba differential W′bal over a workout stream → flags
  over/under-depleting intervals; grades executed rides by W′bal trajectory.

### Phase 2 — Durability / fatigue resistance
- `durability.py`: MMP recomputed after N kJ (1500/2500) → % drop vs fresh;
  decoupling trend → a "durability score" feeding prescription.

### Phase 3 — Individualized dose-response
- `impulse_response.py`: fit per-athlete fitness/fatigue τ + gains by regressing
  daily TSS → performance signal (CP/eFTP from Phase 1; HR-efficiency fallback).
  Replaces fixed 42/7-day constants in projections; Banister defaults until
  enough data.

### Phase 4 — Broaden inputs (feasible now)
- `tid_optimizer.py`: classify polarized↔pyramidal from existing zone
  distribution; nudge toward phase-appropriate target (Stöggl, Rosenblat 2019).
- Female physiology: self-reported menstrual-phase profile field adjusting
  readiness/prescription (luteal-phase load tolerance). Pure scorer +
  `readiness_score` input.
- Heat/altitude: environmental-load multiplier when elevation/weather present;
  deferred otherwise.

## Testing & rollout
- TDD per pure service; fixtures for stream-based math (synthetic + `.FIT`).
- Each phase behind graceful degradation; Phases 1–3 light up as stream
  coverage grows; Phase 4 ships immediately.

## Implementation status (2026-06-22)

**Built + TDD'd (pure science cores, 45 new tests, all green):**
- `power_curve.py` — mean-maximal power curve (Phase 0 math).
- `critical_power.py` — CP / W′ / eFTP fit from the MMP curve (Phase 1).
- `w_balance.py` — Skiba differential W′-balance over a stream (Phase 1).
- `durability.py` — power drop after kJ + aerobic decoupling (Phase 2).
- `impulse_response.py` — fitted per-athlete Banister τ1/τ2/gains (Phase 3).
- `tid_optimizer.py` — polarized↔pyramidal classification + nudge (Phase 4).
- `menstrual_adjustment.py` — cycle-phase readiness nudge (Phase 4).

**Wired into the live algorithm:**
- `readiness_score.compute_readiness` accepts an optional, bounded
  `menstrual_readiness_delta` (no-op by default → existing behaviour unchanged).

**Phase 0 pipeline — BUILT + verified end-to-end (916 tests green):**
- `activity_streams` table + RLS + migration `c9d0e1f2a3b4` (applied).
- `ActivityStream` model.
- `stream_extraction.py` — timestamped records → aligned 1 Hz streams (TDD).
- `activity_analysis.py` — keystone orchestrator: streams → NP/IF/VI, MMP curve,
  CP/W′/eFTP, W′bal, durability, decoupling (TDD, composes all science modules).
- `stream_ingestion.py` — analyze + upsert streams, backfill `activities.NP`,
  `latest_critical_power()` lookup. Verified live: a synthetic stream produced
  CP 236 W / W′ 13810 J / eFTP 240 and backfilled NP.

**Garmin stream ingestion — BUILT + verified on LIVE data (922 tests green):**
- `garmin_client.get_activity_details(activity_id)` — hits Garmin's
  `/activity-service/activity/{id}/details` via `_connectapi` (the OAuth token
  grants full access; same pattern as get_hrv/get_body_battery).
- `garmin_details_parser.garmin_details_to_records` — maps the positional
  `metricDescriptors`/`activityDetailMetrics` payload → stream records (TDD).
- `stream_extraction` reworked for real-world data: forward-fills short
  smart-recording/dropout gaps, EXCLUDES large auto-pause gaps as stops (TDD).
  This fixed a real bug where zero-filling sub-1 Hz gaps cratered NP (91 → 188 W
  on a real 3 h ride).
- `garmin_sync_service` now auto-ingests cycling streams after each
  `create_activity` (best-effort, cycling-only, commit=False inside the sync txn).
- Verified live: 8 of the athlete's real rides backfilled — NP/CP/durability/
  decoupling computed (CP avg 203 W, durability 2.6–33.7 % drop, kJ up to 2779).

**Athlete CP + surfacing — BUILT + verified live (930 tests green):**
- `athlete_power_profile.py` — aggregate per-ride MMP curves into the best-effort
  envelope and fit athlete-level CP/W′/eFTP (TDD). `compute_athlete_power_profile`
  loads stored `activity_streams.mmp_curve` and fits.
- Wired into `build_snapshot` → `power_profile` evidence + a "Critical Power"
  section in the LLM prompt (TDD). Verified live: the coach brief now carries
  CP 236.5 W / W′ 9472 J / eFTP 239 W (r²=0.98 over 8 rides) — eFTP ≈ stored
  FTP 240, validating the pipeline end-to-end.

**UI surfacing — BUILT (Critical Power card, verified in-browser):**
- `GET /analytics/power-profile` endpoint (athlete CP/W′/eFTP + MMP envelope).
- `usePowerProfile` hook + `CriticalPowerCard.tsx` in the Analyze → Overview →
  Estimates section. Signature element: an SVG power-duration curve that flattens
  toward the CP drawn as a dashed asymptote (shows what CP *is*), eFTP-vs-stored-FTP
  delta badge, empty/loading states, EN/DE. Matches the app's paper-grain design
  language. Verified live: renders CP 237 W / eFTP 239 / W′ 9.5 kJ over 11 rides.

**Power profile enriched — more data points + info (verified in-browser):**
- Densified MMP durations (10 → 22) → a richer power-duration curve.
- `detailed_power_profile.py` recomputes from STORED streams (no Garmin refetch):
  dense MMP envelope, CP/W′/eFTP, CP & per-duration W/kg, peak power at
  5s/1min/5min/20min (W + W/kg), durability (best/avg drop after 1500 kJ),
  avg decoupling, total kJ, ride count. `/analytics/power-profile` returns it all.
- `CriticalPowerCard` expanded: CP W/kg, a 4-box peak-power strip with W/kg, a
  fatigue-resistance row (durability + decoupling + total kJ). Verified live:
  CP 243 W / 2.97 W/kg, peaks 571/377/266/242 W, durability −10%, 13,865 kJ.

**Power profile — round 2 (max data density, verified in-browser):**
- 8 peak-power durations (5/15/30 s, 1/5/10/20/60 min) with W + W/kg.
- `power_phenotype.py` — Coggan rider-type (Sprinter/Pursuiter/Time-Trialist/
  All-Rounder) from curve-shape reserves (TDD). Surfaced with reserve multiples.
- `/analytics/power-profile` adds a per-ride breakdown (date, NP, kJ, decoupling,
  durability, CP) — the most granular view.
- `CriticalPowerCard`: W↔W/kg toggle (curve + peaks + CP + asymptote all switch),
  8-box peak grid, phenotype badge, fatigue row, collapsible 12-row per-ride
  table. Verified live, zero console errors.

**Round 3 — W′bal + TID surfaced (verified in-browser):**
- Per-ride breakdown gains a W′↓ column (min W′-balance in kJ; amber when the
  ride bonked / went negative) from `w_balance_summary` over each stored stream.
- `tid_assessment.py` + `/analytics/training-distribution` wire `tid_optimizer`
  to live 28 d zones + detected phase. `TrainingDistributionCard` (Intensity
  section) names the model (polarized/pyramidal/threshold/HI), shows a 3-zone
  bar, phase-alignment badge, and a corrective nudge. Verified: "Threshold" vs
  "Polarized" target (taper), 42/58/0 split, advice rendered.

**Round 4 — W′-balance trace ("anaerobic battery", verified in-browser):**
- `wbal_trace.py` + `/analytics/wbal-trace` — picks the most-depleting recent
  ride and returns its downsampled W′-balance trajectory (always keeps the
  global min). `WBalanceTraceCard` renders it as an area chart with the empty
  (0%) line. Verified: emptied to −8.35 kJ on a real interval ride.

**Remaining (optional next increments):**
- `.FIT` upload endpoint (fitdecode available) as a vendor-independent source.
- Use eFTP to auto-prompt FTP updates; feed CP/eFTP history into
  `fit_fitness_fatigue` for individualized projections (Phase 3).
- Profile fields + UI for cycle tracking (sex, cycle_day) to feed
  `menstrual_adjustment` into `build_snapshot`.
- TID assessment surfaced in the brief/Analyze tab from existing zone data.
- Phase 3: feed CP/eFTP history into `fit_fitness_fatigue`, replace fixed
  42/7-day constants in projections once enough performance points exist.

## Risks
- Garmin details endpoint may be unreachable → `.FIT` upload path still delivers
  the foundation; CP/durability run on uploaded rides only.
- CP/τ fits are under-determined with sparse data → require minimum-data gates
  and fall back to existing FTP/Banister defaults.
