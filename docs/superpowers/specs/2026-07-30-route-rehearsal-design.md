# Route Rehearsal — Design

**Ride it before you ride it.** Drop in a route; get a simulated ride against your own
CP, W′, CdA and durability: a projected time range, climb-by-climb target watts, the
point where you blow up, and what it will cost you in fuel.

*30 July 2026. Sits under `docs/competitive-analysis-2026-07.md` moat candidate 2
("terrain is the opponent"). Not on the existing roadmap — this is new work, chosen over
the remaining P1/P2 items because it is the single most differentiated thing this engine
can do that no competitor can copy without building a physiological model first.*

---

## 1. Why this and not something else

The market has route *planners* (Komoot, RideWithGPS) that know the road and nothing
about the rider, and training *engines* (TrainerRoad, Xert, JOIN) that know the rider and
nothing about the road. Nobody simulates one against the other. We can, because every
input already exists in this codebase:

| Input | Where it already lives |
|---|---|
| GPX → profile, climbs, waypoints | `services/crew_tour.py` |
| Gradient → target watts | `services/climb_companion.py` (`pace_factor`, `duration_scale`, `profile_bins`, `build_pacing_plan`) |
| Power balance (gravity + rolling + aero) | `services/cda_estimate.py` — *inverts* it; we solve it forward |
| Personal CdA from real rides | `services/cda_estimate.py` |
| CP / W′ | `services/critical_power.py`, `stream_ingestion.latest_critical_power` |
| W′bal integration | `services/w_balance.py` (`w_prime_balance`) |
| Durability fade | `services/durability.py` (`durability_drop`) |
| Climb detection | `services/climbing_analysis.py` |
| Carbs/hour demand vs actual | `services/fueling_analysis.py` |
| Cached tour profiles | `models/crew_event.py` (`tour_profile`, `tour_polyline`, …) |
| Route polyline per activity | `ActivityRead.route_polyline` (shipped 30 Jul 2026) |

This is composition, not new science. The novelty is the *combination*, and the moat is
that copying it requires a physiological model, not a map.

---

## 2. Scope

**In:**
- Four route sources: GPX upload, a crew event's stored tour, a past activity's route,
  and a route attached to the athlete's target event.
- Forward simulation with **weather + wind + drafting** (the full model — explicitly chosen).
- One scrubbable mobile surface with a verdict, the profile, per-climb detail, fuelling,
  and adjustable assumptions.
- Persisted rehearsals, revisitable and comparable.
- Predicted-vs-actual comparison when rehearsing an already-ridden route.

**Out (deliberately):**
- The training loop ("here are three sessions that close the gap"). Deferred by choice.
- Any comparison against other riders.
- In-ride execution or navigation — the positioning boundary in the strategy doc holds:
  we own the before and the after, head units own the during.

---

## 3. The experience

One surface, `/rehearse/:id`, at 390×844. Entry points: the target-event block on Plan,
a crew event detail ("Rehearse Saturday's ride"), a past ride ("Ride it again"), and a
GPX upload.

Top to bottom:

1. **Verdict** — a range, never a bare number (`4:52 – 5:28`), plus one generated
   sentence naming the decisive moment: *"You blow up on the Giau at km 84 unless you cap
   the Campolongo at 250 W."* The sentence is produced by the simulator's blow-up event,
   not authored copy.
2. **Profile** — the route's elevation silhouette, climbs tinted by gradient zone
   (`climb_companion.zone_for_gradient` already defines the bands). The hero, and the
   scrub target.
3. **Scrub readout** — km, gradient, target watts, predicted speed, elapsed, and **W′bal
   remaining**. The draining matchbook is the thing no competitor can render.
4. **Climb cards** — per named climb: length, average gradient, target watts, predicted
   time, W′ cost.
5. **Fuelling** — carbs/hour the route demands vs. the athlete's actual average
   (`fueling_analysis` computes the second half today).
6. **Assumptions row** — solo / small group / bunch, weather on/off. Each re-runs the
   simulation. The band visibly widens as assumptions are added: the cost of each
   assumption is legible rather than hidden.

---

## 4. Architecture

New backend package `app/services/rehearsal/`. Five modules, each independently testable,
none aware of HTTP.

### 4.1 `route_source.py`
Four adapters onto one shape. Downstream code sees only `RehearsalRoute`, so a fifth
source later costs exactly one adapter.

```python
@dataclass(frozen=True)
class RoutePoint:
    distance_m: float
    elevation_m: float
    lat: float
    lng: float

@dataclass(frozen=True)
class RehearsalRoute:
    points: list[RoutePoint]
    total_distance_m: float
    total_ascent_m: float
    name: str | None
    # Present only when the route is tied to a calendar day — gates weather.
    ride_date: date | None
```

- **GPX upload** → reuse `crew_tour`'s parser; do not write a second one.
- **Crew event** → read cached `tour_profile` / `tour_polyline`.
- **Past activity** → lat/lng/altitude from the stored stream.
- **Target event** → a route stored against the profile (see §7 migration).

### 4.2 `route_profile.py`
Bins the route into ~150 m segments carrying gradient and compass bearing, and groups
segments into named climbs using the existing detection. Bearing exists solely so wind can
be resolved per segment.

```python
@dataclass(frozen=True)
class Segment:
    start_m: float
    length_m: float
    gradient_pct: float
    bearing_deg: float      # for the wind projection
    climb_id: int | None
```

### 4.3 `rider_model.py`
Assembles the athlete. Every field is nullable, and nullability drives the refusal rules
in §6 rather than being silently defaulted.

```python
@dataclass(frozen=True)
class RiderModel:
    cp_watts: float | None
    w_prime_j: float | None
    mass_kg: float | None          # rider + bike
    cda_m2: float | None           # from cda_estimate over real rides
    cda_is_default: bool           # True → widen the band, say so in the UI
    crr: float
    durability_fade: Callable[[float], float]   # kJ → fraction of CP still available
```

Concrete defaults, so the implementer does not have to invent them:

| Quantity | Default | Source |
|---|---|---|
| Bike mass | 8.5 kg | road-bike convention; add to profile later, not in v1 |
| CdA fallback | 0.32 m² | hoods position, average rider; only when `cda_estimate` returns None |
| Crr | 0.005 | matches `cda_estimate`'s own default — keep the two in agreement |
| Air density | from forecast temperature/elevation when weather is on, else 1.225 | `cda_estimate` default |
| Drivetrain efficiency | 0.97 | matches `cda_estimate` |

### 4.3a `Assumptions`

The athlete-settable inputs, and the only thing `PATCH /rehearsals/{id}` changes.

```python
Draft = Literal["solo", "small_group", "bunch"]

@dataclass(frozen=True)
class Assumptions:
    draft: Draft = "solo"
    use_weather: bool = True
    # Aero multipliers on CdA. Literature approximations, NOT measurements —
    # the UI must label them as assumptions (§6).
    #   solo 1.00 · small_group 0.75 · bunch 0.65
```

Weather comes from the Open-Meteo integration already used for ride weather
(`ActivityStream.weather`, `api/apple_health.py`-adjacent fetch path): hourly wind speed,
wind direction and temperature at the route's start location for `ride_date`. Applied only
when `ride_date` is set and inside the forecast horizon (§6).

### 4.4 `simulator.py`
Marches the route segment by segment. Pure function of `(RehearsalRoute, list[Segment],
RiderModel, Assumptions)`.

Per segment:

1. **Target watts** from gradient via `climb_companion.pace_factor` × `duration_scale`,
   anchored on *currently available* CP.
2. **Speed** by solving the power balance forward — the same equation `cda_estimate`
   inverts:

   ```
   P·η = m·g·sin(θ)·v  +  Crr·m·g·cos(θ)·v  +  ½·ρ·(CdA·draft)·(v + w)²·v
   ```

   where `w` is the headwind component (wind vector projected on segment bearing) and
   `draft` is the drafting factor. The right-hand side is monotonically increasing in `v`,
   so a bisection solve is sufficient and dependency-free — no solver library.
3. **Durability**: available CP = `cp_watts × durability_fade(kJ_so_far)`. This is why the
   same climb ridden late is predicted slower than ridden early — the effect competitors
   cannot model.
4. **W′bal**: integrate across the whole route via `w_prime_balance`. When it reaches zero
   the rider *cannot* hold target — the simulator caps power at available CP, continues,
   and records a `BlowUp(distance_m, time_cost_s, climb_id)`. The verdict sentence is
   generated from this event.

Output: per-segment power / speed / elapsed / W′bal, the blow-up events, totals, and the
kJ figure that drives the fuelling requirement.

### 4.5 `uncertainty.py`
The full model was chosen, so this module carries the honesty. ~200 seeded Monte Carlo
draws over CP confidence, CdA error, Crr (surface unknown), wind forecast spread and the
drafting factor → `p10 / p50 / p90`. The displayed range *is* the model's honesty.

Band width is **calibrated from measured backtest error** (§6), not guessed.

### 4.6 API
- `POST /rehearsals` — create from a source + assumptions; returns the computed rehearsal.
- `GET /rehearsals/{id}` — revisit.
- `GET /rehearsals` — list.
- `PATCH /rehearsals/{id}` — new assumptions, re-run.

### 4.7 Frontend
- `pages/RouteRehearsalView.tsx` — the surface.
- `components/rehearsal/RehearsalProfile.tsx` — scrubbable SVG, reusing the existing
  HoverBars pointer pattern.
- `components/rehearsal/VerdictBlock.tsx`, `ClimbCards.tsx`, `AssumptionsRow.tsx`.
- `api/rehearsal.ts` — types mirroring the Python schema exactly.

---

## 5. Data flow

```
source (GPX | crew tour | past ride | target event)
   → RehearsalRoute            [route_source]
   → list[Segment]             [route_profile]
   → + RiderModel              [rider_model]
   → + Assumptions (draft, weather)
   → SimulationResult          [simulator]
   → + p10/p50/p90             [uncertainty]
   → persisted row             [route_rehearsals]
   → GET /rehearsals/{id}      → RouteRehearsalView
```

---

## 6. Honesty, failure, and proof

**Refusals** — the rule from project memory holds: an honest gap beats a confident guess.

| Missing | Behaviour |
|---|---|
| CP | No time predicted at all. Profile + climbs render; the surface states what is missing and how to get it. |
| Body weight | No physics. Same treatment. |
| CdA (too few clean samples) | 0.32 m² default, `cda_is_default = True`, band widened, stated in the UI. |
| Elevation in the GPX | Refuse the route — many exported GPX files carry no `<ele>`. No DEM lookup, no invented terrain. |
| Wind outside forecast horizon (>10 days, or no `ride_date`) | Omitted and labelled. Never silently swapped for climate averages. |

**Never a bare number.** The range is the answer. Enabling weather or drafting visibly
widens it — the interface teaches that assumptions cost certainty.

**Predicted vs actual.** Rehearsing an already-ridden route shows the prediction against
what actually happened. It earns trust when close, and surfaces model error in front of
the athlete when not — which is the honest trade. The same mechanism is our backtest:
running the simulator over past rides with known outcomes calibrates the band width from
measured error.

**Error handling.** Malformed GPX → a clear parse error, not a partial route. Routes under
~2 km or with no gradient variation → simulate but state that the model has little to say.
Simulation is bounded work (segment count is capped by route length), so no timeouts.

---

## 7. Migration

One new table `route_rehearsals` (source ref, parsed route JSON, assumptions, result JSON,
`created_at`, `user_id` + RLS to match the rest of the schema), and one new nullable
column for the target-event route on the athlete profile. Both additive; no backfill.

---

## 8. Testing

Pure functions, so the physics is directly assertable:

- flat vs. climb speeds at equal watts
- headwind slower than tailwind at equal watts
- a late climb predicted slower than the identical climb early (durability monotonicity)
- blow-up fires when W′ is exhausted, and its recorded time cost is positive
- `p10 < p50 < p90`; seeded Monte Carlo is deterministic
- one adapter test per route source, including the refusal cases in §6
- backtest calibration over fixture rides with known outcomes
- component tests for the scrub readout and the refusal states

---

## 9. Constraints

- Mobile-first, verified at 390×844; desktop is a sanity check.
- German and English for every user-facing string.
- Existing glass cards, sheet primitives and CSS vars only — no new colour literals.
- Bike-only; no sport branches.
- Rendered and looked at before it is called done — the Today's Road lesson.
- Frontend gates: `npx tsc -b --noEmit`, `npx vitest run`, `npx eslint <changed>`,
  `npm run build`. Backend: `python -m pytest`.

---

## 10. Build order

1. `route_source` + `route_profile` (+ the GPX and crew-event adapters) — provable alone.
2. `rider_model` + `simulator` without weather or drafting — the physics core.
3. `uncertainty` + backtest calibration.
4. Weather/wind and drafting as assumption inputs.
5. API + persistence.
6. The surface, then the remaining two adapters (past ride, target event).

Each step is independently testable, and steps 1–3 have user-visible value even if 4
slips.
