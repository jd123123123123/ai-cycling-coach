# Race Debrief — pro-grade single-ride analysis

**Date:** 2026-07-06
**Branch:** feat/period-report (or a new `feat/race-debrief`)
**Builds on:** the stream pipeline and science engine from
`2026-06-22-science-engine-upgrade-design.md` (CP/W′, MMP, durability,
decoupling, TID, phenotype — all live on real Garmin streams) and the three-act
presentation pattern from `2026-06-24-period-report-insights-design.md`.

## Goal

Give the athlete a **WorldTour-grade debrief of any single ride**, on demand.
Open any completed activity and get one scrollable report that answers *what
went well, what went badly, what to improve, and how to improve* — at four
levels of depth (a five-second verdict, the story of the ride, an exhaustive
metric breakdown, and a ranked plan). "How to improve" is dual: every weakness
gets a **race-day tactic** *and* a **training prescription**.

The analysis surfaces the same metrics WKO5 / Xert / myWindsock / TrainingPeaks
put in front of pro coaches, computed from the streams the app already ingests
(power, HR, cadence, altitude) plus two new stream channels (GPS, speed) and a
free weather source. The feature is framed for races but works on any ride.

### Design decisions (settled during brainstorming)

- **Race source:** no race flag. The debrief runs on *any single activity* on
  demand — the user opens a ride and gets the analysis.
- **Data richness:** add GPS + speed ingestion (route map, geo climb segments,
  speed/aero analysis). Maximally exhaustive.
- **Recommendations:** both race-day tactics and training prescriptions.
- **Coverage:** all-in — build every metric cluster; each card hides when its
  input data is absent.
- **Weather provider:** Open-Meteo historical API (free, no API key).
- **Delivery:** debrief is cached and warmed on sync, so it opens instantly.

## Non-goals

- No new "race" entity or `is_race` flag on `Activity`.
- No live/in-ride analysis — post-ride only.
- No rider-vs-rider (peloton) comparison, no Strava segment leaderboards
  against other users. Comparisons are against the athlete's own history/profile.
- No new charting dependency — reuse the installed uPlot / Recharts / ECharts /
  SVG stack.
- No change to the existing period-report, coach brief, or power-profile
  surfaces.

## Architecture principle

Every metric is a **pure, dependency-free science service** (the pattern of
`training_load.py`, `critical_power.py`): plain inputs → plain outputs, unit
tested with TDD. **Graceful degradation is mandatory** — each analyzer returns
`None` when its inputs are missing, the orchestrator runs each in its own
try/except, and the matching UI card hides. Concretely:

- No GPS stream → route map, geo-segments, CdA, wind, GAP hide.
- No dual-sided power meter → torque effectiveness, L/R balance, pedal
  smoothness hide.
- No weather (provider down / pre-GPS ride) → wind, heat, air-density hide.
- No `ANTHROPIC_API_KEY` → AI verdict falls back to rule-based text.

Nothing existing regresses; rides without a given input simply show fewer cards.

## Build phases

Each phase is a self-contained sub-project with its own implementation plan.
Phases 1–3 depend on Phase 0's data; within Phase 1 the analyzers are
independent and can be built in parallel.

| Phase | Sub-project | Depends on |
|---|---|---|
| 0 | Stream enrichment: GPS + speed + temperature + biomech channels; weather | — |
| 1 | Pure science services (the metric arsenal) | 0 (partial) |
| 2 | Orchestrator + `RaceDebrief` schema + endpoint + cache + AI verdict | 1 |
| 3 | Frontend: the four-act debrief page | 2 |

---

## Phase 0 — Stream enrichment

**Parser (`app/services/garmin_details_parser.py`).** Extend
`garmin_details_to_records` to also read, when present in the positional
`metricDescriptors`/`activityDetailMetrics` payload: `latitude`, `longitude`,
`speed` (or derive speed from distance Δ), `distance`, `temperature`, and the
biomechanics channels `left_right_balance`, `torque_effectiveness`,
`pedal_smoothness`. Missing channels stay absent — never zero-filled.

**Stream storage (`app/models/activity_stream.py`,
`app/services/stream_extraction.py`).** `ActivityStream.streams` is already a
JSON blob; add the new keys (`latitude`, `longitude`, `speed`, `distance`,
`temperature`, and the optional biomech channels) alongside the existing
`power`/`heart_rate`/`cadence`/`altitude`. `records_to_streams` aligns them to
the same 1 Hz grid, applying the existing forward-fill/auto-pause-gap logic.
No schema migration for the blob shape; add a nullable `route_bbox` /
`has_gps` convenience column only if needed for list-level "has map" hints
(decide during Phase 3, default: derive from the blob).

**Weather (`app/services/environment_data.py`, new).** After ingest, if the
ride has GPS, fetch historical hourly weather (wind speed/direction,
temperature) for the ride's start coordinate + time window from **Open-Meteo**
(`archive-api.open-meteo.com`, free, no key). Cache the raw response on the
debrief (or a small `activity_weather` store) so it is fetched once. Pure
helpers compute **air density** (from altitude + temperature + pressure) and
**relative wind** (weather wind vector vs GPS-derived heading per segment).
Network failure → weather is `None`, environment cards hide.

**Backfill.** A one-off job re-runs `get_activity_details` for historical
cycling rides to populate GPS/speed where Garmin still has it, mirroring the
existing stream backfill.

## Phase 1 — Science services (the arsenal)

All pure, TDD'd, under `app/services/`. Reuse existing modules
(`power_curve`, `critical_power`, `w_balance`, `wbal_trace`, `durability`,
`normalized_power`, `tid_optimizer`, `power_phenotype`, `detailed_power_profile`)
rather than reimplementing.

**① Power & capacity**
- `wko_power_model.py` — fit the WKO-style power-duration model from the ride's
  MMP curve (and the athlete's 90-day envelope): **mFTP, TTE, Pmax, FRC (W′),
  VO₂max estimate, Stamina**. Extends `critical_power`'s fit.
- `effort_matching.py` — the ride's peak power at each duration (5s/15s/30s/
  1/5/10/20/60 min) vs the athlete's 90-day + all-time best → `% of best`, and
  **PR detection** (flag durations where this ride set a new 90-day/all-time
  best). Localize each peak effort's timestamp for Act-2 annotation.
- `durability_analysis.py` — recompute the power-duration curve for the segment
  **after 1,500 kJ** (kJ-adaptive: scale the threshold for short/long rides) and
  express **% power drop per duration** vs the fresh curve. Builds on
  `durability.py`.

**② Anaerobic — matches & battery**
- `matchbook.py` — from the `wbal_trace`, detect discrete **matches** (W′
  depletions past a threshold), each with timestamp, depth, and recovery;
  count **time above CP** and number of efforts.
- `quadrant_analysis.py` — per-sample **force** (torque = power ÷ angular
  velocity) vs **circumferential pedal velocity** (from cadence); classify into
  four quadrants and report time-share + a scatter sample for the UI.
- W′-bal trace + Xert-style min-reserve reuse `wbal_trace.py`.

**③ Pacing & execution**
- `pacing_analysis.py` — first/second-half NP split (± %), **Variability
  Index**, **surge/acceleration** detection (count + cost), **intensity by race
  phase** (thirds + the decisive final 30 min), time-in-zone (Coggan), and a
  power **fade curve**. TID model via `tid_optimizer`.

**④ Physiology & efficiency**
- `efficiency_metrics.py` — **Efficiency Factor** (NP ÷ avg HR), **aerobic
  decoupling** (reuse `durability.aerobic_decoupling`), cardiac cost / HR drift /
  post-climb HR recovery.

**⑤ Aerodynamics & environment**
- `cda_estimate.py` — estimate **CdA** from the power balance (power = aero +
  rolling + gravity + kinetic) over steady segments, using speed, gradient,
  mass, air density, and wind. Needs GPS+speed; better with weather. Returns
  `None` otherwise.
- `environment.py` — **relative wind** per segment (head/tail/cross), **heat
  stress** index, **air density**, and **gradient-adjusted power/pace (GAP)**.
  Consumes `environment_data.py`.

**⑥ Climbing**
- `climbing_analysis.py` — for each detected climb: **VAM** (m/h), **W/kg** for
  its duration, average gradient, and a **leaderboard** ranking climbs vs the
  athlete's history and against category W/kg benchmarks.

**⑦ Biomechanics** (all gated on advanced-pedal channels)
- `biomechanics.py` — torque effectiveness, L/R balance (and its drift under
  fatigue), pedal smoothness, cadence distribution, standing-vs-seated split.

**⑧ Fuel & metabolic**
- `fueling_analysis.py` — **kJ** expenditure (≈ kcal), estimated carb burn and a
  **90–120 g/h target band**, **CHO/fat substrate split** by intensity, the
  correlation between the energy deficit and the durability drop / decoupling
  spike ("you ran the tank dry → the fade"), and a **post-race refuel** note
  (carb + protein window).

**Ride segmentation & narrative** (shared inputs to several clusters)
- `ride_segmentation.py` — segment the ride into **climbs / descents / flats /
  efforts** from altitude + distance (+ GPS smoothing). Each segment carries
  distance, elevation, gradient, time, NP/avg power, W/kg, HR, speed. Feeds
  climbing, pacing, CdA, and the route map.
- `key_moments.py` — detect the **narrative beats**: biggest match burned, the
  crack point (power/HR decoupling + fade onset), best effort, decisive phase,
  strongest finish. Feeds Act-2 annotations and the AI verdict.

## Phase 2 — Orchestrator, schema, endpoint, AI verdict

**Orchestrator (`app/services/race_debrief.py`, new).**
`build_debrief(db, user_id, activity_id) -> RaceDebrief`. Loads the activity,
its `ActivityStream`, the athlete profile (mass, FTP, zones), the 90-day power
profile, and prior rides for comparison. Runs each Phase-1 analyzer **in its own
try/except** (one failing analyzer never sinks the report), assembles the
schema, then calls the AI verdict. Mirrors `period_report.build_report`.

**Schema (`app/schemas/race_debrief.py`, new).** A structured `RaceDebrief`:
- `header` — title, date, sport, and the **stat strip** (distance, elevation,
  moving time, NP, IF, TSS, kJ, avg speed).
- `verdict` — `grade_letter`, `grade_score`, one-line `ai_verdict`, `ai_model`,
  `went_well: list[str]` (≤3), `watch_out: list[str]` (≤3).
- `story` — downsampled synchronized series (`power`, `hr`, `wbal`, `altitude`,
  `speed`, `distance`/`time` axis) + `moments: list[KeyMoment]` (type, label,
  timestamp, tone) + `route: list[[lat,lng,power,grade]]` for the map.
- Eight cluster blocks, each optional: `power_capacity`, `anaerobic`, `pacing`,
  `efficiency`, `aero_environment`, `climbing`, `biomechanics`, `fueling`.
- `plan: list[Prescription]` — reuse the period-report `Prescription` shape,
  extended with `race_tactic: str` and `training_fix: str` (+ `training_ref`
  linking to a workout/block where applicable), priority-ordered, safety first.

Every block is `| None`; every list defaults empty. The schema is the single
contract the frontend renders against.

**Endpoint (`app/api/analytics.py`).**
`GET /analytics/activity-debrief/{activity_id}` → `RaceDebrief`. RLS via the
existing `get_db_for_user`. Reads the cache; builds + caches on miss.

**Cache (`app/models/race_debrief_cache.py`, new).** Keyed by `activity_id`
(+ user), storing the serialized `RaceDebrief` and an input fingerprint
(stream hash + profile version). Invalidated when the activity's streams are
re-ingested or the athlete profile changes. Warmed after Garmin sync for recent
rides, like `period_report_cache`.

**AI verdict (`app/services/race_debrief_ai.py` or within the orchestrator).**
Reuse the coach `brief_response` structured-output tool-use pattern on
`settings.COACH_MODEL` (the async `anthropic` client, lazily imported). The
prompt is fed the **computed numbers only** (grade inputs, key moments, the
cluster figures) and must return: grade, one-line verdict, three `went_well`,
three `watch_out`, and, per prescription, the `race_tactic` + `training_fix`.
Rule-based fallback (mirroring `coach_service`'s fallback) when the key is
absent or the call fails. Verify the exact current model id against
`app/config.py` before wiring — do not hard-code a model string.

## Phase 3 — Frontend (the four-act page)

Mirrors the three-act `ReportTab`, extended to four acts. New route
`/activities/:id/debrief` (full page). Entry points: a **"Debrief"** button on a
completed ride in Analyze→Overview history, the Workouts tab, the calendar, and
Today's finished ride. Data via `hooks/useRaceDebrief.ts` +
`api/debrief.ts`. Components under `components/debrief/`.

- **Act 1 · The Verdict** — `DebriefHero`: grade badge, one-line verdict, the
  stat strip, and the two-column *went well / watch out* summary.
- **Act 2 · The Story** — `RideStory`: a **uPlot** synchronized multi-lane
  timeline (power / HR / W′-balance / altitude / speed) with the `KeyMoment`
  annotations and a scrubber; `RouteMap`: a **self-contained SVG** polyline from
  the GPS route, colored by power/gradient with climbs highlighted (no external
  map tiles → no CSP/network dependency).
- **Act 3 · The Breakdown** — eight panels, each hiding when its block is null:
  `PowerCapacityPanel` (PD curve fresh-vs-fatigued overlay, WKO model, PR flags),
  `AnaerobicPanel` (W′-bal, matchbook, quadrant scatter, time>CP),
  `PacingPanel`, `EfficiencyPanel`, `AeroEnvironmentPanel`, `ClimbingPanel`
  (+ per-climb cards), `BiomechanicsPanel`, `FuelPanel`.
- **Act 4 · The Plan** — `DebriefPlan`: the ranked prescriptions, each with a
  **race-day tactic** chip and a **training prescription** chip (reuse the
  period-report `PrescriptionList` treatment).

Charts: uPlot (dense timeline), Recharts/ECharts (cards), SVG (route map, PD
curve, quadrant scatter). All strings ship DE + EN via the existing
`useT()` / `locale === 'de'` pattern; backend-authored strings (verdict,
prescriptions) stay English as today. Paper-grain design language,
`card-enter` staggered animations, shimmer loading, empty/insufficient states.

## Data flow

```
Garmin sync → get_activity_details → garmin_details_parser (+GPS/speed/temp/biomech)
  → stream_extraction (1 Hz aligned blob) → ActivityStream
  → environment_data (Open-Meteo, if GPS)
  → [cache warm] race_debrief.build_debrief:
       ride_segmentation + key_moments
       → ①…⑧ analyzers (each try/except → None on missing input)
       → race_debrief_ai (grade + verdict + tactics/fixes; rule-based fallback)
       → RaceDebrief  → race_debrief_cache
GET /analytics/activity-debrief/{id} → RaceDebrief → useRaceDebrief → four-act page
```

## Testing

- **Backend:** TDD per pure service in `tests/services/` with synthetic streams
  and real `.FIT`-derived fixtures (a GPS climb ride, a flat TT, a ride with no
  GPS, a ride with no advanced-pedal data). Assert each analyzer returns `None`
  on missing input. Orchestrator tests confirm one failing analyzer never sinks
  the report and that absent inputs yield absent blocks. AI verdict test asserts
  the rule-based fallback path with no key.
- **Frontend:** `tsc --noEmit`; Playwright on a seeded account — DE + EN, desktop
  + mobile — over three rides (full GPS+power, altitude-only/no-GPS, minimal) to
  confirm every panel renders and each degrades cleanly (map/CdA/biomech hide).

## Verification

Open a real GPS power ride → confirm the four acts render with sane numbers, the
route map and annotated timeline line up, PR flags and matches are correct, the
plan references the on-screen figures with both a tactic and a training fix, and
the debrief loads from cache instantly on second open. Repeat on a no-GPS ride
and confirm the map/aero/wind cards are absent rather than broken. Screenshot
desktop + mobile, DE + EN.
