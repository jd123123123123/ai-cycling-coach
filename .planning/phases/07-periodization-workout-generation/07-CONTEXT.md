# Phase 7: Periodization + Workout Generation — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning (research-anchored — user delegated all decisions to Claude)

<domain>
## Phase Boundary

Multi-week periodized training plans that adapt daily to athlete readiness, with structured workouts (power for cycling, pace for running, HR for gym), and a week-ahead view that shows *both* what to do *and why*. Builds on Phase 5.1's 12-template library + rules-based daily prescription, Phase 5.3's compliance grading, Phase 5.4's PMC narratives, and the today-runthrough's `coach_recommendations` table + `tomorrow_plan` brief output.

**In scope:**
- Backend periodization engine: mesocycle generation (4-week blocks), weekly load progression, taper math anchored on a goal/A-race date or maintenance mode
- Daily adaptation engine: readiness signals (HRV, sleep, body battery, RPE pattern) driving today's session swap/modify with explicit safety rails
- Frontend week-view surface: 7-day rolling view (or full mesocycle), per-day workout card with structured intervals, inline rationale ("why this day looks like this")
- Workout authoring authority extension: how the LLM/rules engine produces specific power/pace targets for cycling, running, gym
- Rationale generation: weekly preface ("this week is about X because…") + per-day reasoning anchored on PMC/HRV/recent sessions

**Out of scope (deferred to other phases):**
- Nutrition-aware fueling (Phase 8)
- Pack/social commitment to plan (Phase 9)
- Calendar-integration with external systems (post-v1)

</domain>

<decisions>
## Implementation Decisions

### Periodization framework
**Claude's discretion — research-anchored.** The 07-RESEARCH.md doc will recommend a default framework (likely a hybrid: polarized intensity distribution within a Friel-phased mesocycle, with optional block-periodization mode for athletes targeting a specific event peak). Planner should pick the recommendation in research §2 (Modern sports science: periodization frameworks) and §8 (Concrete implementation recommendations) unless those land non-committal — in which case default to: Friel phase boundaries (already in coach_service.py per Phase 5.1) + Seiler polarized (also already in) + Mujika tapering for race-window users.

### Adaptation cadence & triggers
**Claude's discretion — research-anchored.** Default unless research overrides: daily readiness check at brief-generation time (already runs every morning per Phase 5.1). Adaptation tiers:
1. **Soft swap** (template downgrade within same category) — triggered by HRV ≥1σ below baseline, sleep < 6h, body battery < 30
2. **Hard deload** (full week intensity reduced 30%) — triggered by 3+ consecutive "harder than expected" RPE flags OR injury_flag
3. **Plan re-baseline** — triggered by user marking a goal change or after a multi-day gap (>7 days no sync)
Research §3 (Daily adaptation) drives the exact thresholds.

### Plan horizon
**Locked: rolling 7-day visible + 4-week mesocycle persisted backend.** The week tab shows next 7 days (today + 6) with each day's prescription. Backend persists the full 4-week mesocycle for adaptation continuity (so a Tuesday VO2 can be moved to Thursday because Tuesday looks bad without losing the weekly intent). The user said "always for a week" — that's the visible surface. Mesocycle continuity stays backend-only per athletic-coaching norms (athletes shouldn't see week 4 yet; it'll change anyway).

### Rationale surface (the "why")
**Claude's discretion — research-anchored.** Default: **inline rationale per day card** (one short sentence) + **weekly preface paragraph** at the top of the week view (3-5 sentences explaining "this week is a build-week because your CTL ramp is healthy and HRV is back at baseline"). Use the existing language-aware Coach prompt infrastructure (Phase 5.2 simple/technical modes). Do NOT introduce a new transparency drawer — the existing ContributorsSheet from 06.1 is the right surface for deeper "why." Research §7 (UI surface) drives the final layout.

### Workout authoring authority
**Claude's discretion — research-anchored, but lean toward extending the template library.** Phase 5 explicitly forbade LLM authoring intervals from scratch. Default for Phase 7: extend the 12-template library to ~30 templates covering full Coggan power zones (Z1-Z7) and Seiler pace zones (Z1-Z3), with parametrized duration/repetitions. The LLM can pick + parametrize within rails; it cannot author new interval block primitives. Research §5 (Workout authoring authority) may propose LLM-assembles-from-blocks instead — if so, planner should weigh safety vs. flexibility. Hard rail: server-side watts authority (Phase 5.1 [05.1-01] decision) stays — LLM never owns the math.

### Goal & event integration
**Locked: optional A-race date with maintenance fallback.** AthleteProfile already has `goals` JSONB. Phase 7 adds: optional `target_event_date`, `target_event_type` (race/fondo/audax/maintenance), `target_priority` (A/B/C). When `target_event_date` is set and within 14 days, taper logic engages (Mujika 8-14 day taper, 40-60% volume reduction, intensity preserved). When unset OR > 90 days out, "maintenance + base building" mode runs polarized 80/20 indefinitely.

### Multi-sport balance
**Claude's discretion — research-anchored.** Default unless research overrides: respect the existing per-sport TSS aggregation (Phase 2 decision: never naively sum TSS across sports). Periodization runs per primary sport (cycling primary athlete gets cycling mesocycle; runner gets running). Cross-modality sessions (gym, easy run for cyclist) treated as supplementary load with their own intensity ceiling. Research §6 (Multi-sport balance) drives concurrent-training interference recommendations (e.g., separate strength and endurance by ≥6 hours).

### Hard rails (locked)
- LLM cannot author interval block primitives (Phase 5 rule extends to Phase 7)
- Server-side watts authority — LLM `pct_ftp` is rewritten using current FTP at request time
- No deload triggered without compensating audit row (Phase 6.4 audit pattern extends)
- Injury flag overrides everything — never prescribe intensity through `injury_flag = true`
- Adaptation never "punishes" rest — a missed day reduces next-day recommendation, never increases it

### Claude's Discretion
- Exact periodization framework default (research §2 recommendation)
- Exact adaptation thresholds (research §3 recommendation)
- Exact rationale surface layout (research §7 recommendation)
- Workout authoring approach (research §5 recommendation: extend templates vs assemble from blocks)
- Multi-sport scheduling rules (research §6 recommendation)
- Frontend week-view component shape — must match existing 6.1/6.2 design system (paper/rule/forest/ink, Fraunces num-display, format/delta utils, Sparkline primitive)
- Backend service boundaries — where periodization engine lives, how it integrates with existing coach_service

</decisions>

<specifics>
## Specific Ideas

From the user's verbatim ask:
- "When I open today: instantly informed about my state, recent (7D Fitness, and other benefit increase or decrease)" — the Today tab already has ReadinessHero + KpiStripCompact (Phase 6.1/6.2). Phase 7 adds a 7D fitness delta chip ("CTL +3.2 over last 7 days, +12% efficiency factor") to the masthead. Use Phase 5.4's PMC narrative infrastructure.
- "Wanna know directly how my training should look like and why" — inline per-day rationale + weekly preface, anchored on the same brief-generation infrastructure already running daily.
- "Not just for today but always for a week" — rolling 7-day visible plan view as a first-class dashboard tab (extends WeekTab from 6.1).
- "Best training plan system in the world" — opinionated default framework, not a configuration panel. Athletes pick a goal; the system picks the framework.

References to draw from (research will detail):
- Athletica's weekly preview UI
- TrainingPeaks' calendar density (good information, bad chrome)
- Whoop's Strain Coach week view (excellent rationale per day)
- Intervals.icu's fitness/freshness model (clean PMC implementation)

</specifics>

<deferred>
## Deferred Ideas

- **Calendar-app integration** — pulling user's external calendar to schedule around meetings. Would be Phase 7.x or Phase 10.
- **AI-authored interval block primitives** — letting the LLM compose new templates. Research may recommend this; if so, ship behind a feature flag and gate on Phase 7's safety rails proving stable for 4+ weeks.
- **Pack-shareable weekly plan commitment** — Phase 9 territory.
- **Pre-workout fueling recommendations** — Phase 8 territory.
- **Multi-goal stacking** (e.g., A-race in 12 weeks AND maintenance fitness for B-races) — Phase 7.x if user demand surfaces.
- **Free-form workout editor** ("I want a 4×8 at 105% FTP") — Phase 7.2 or post-v1.

</deferred>

---

## Recommended Phase 7 split (planner should evaluate)

User said "build the best." Realistic scope is 3 sub-phases, not one. Research §10 will propose. Default if research is non-committal:

- **7.0 — Periodization engine + week-view shell** (3-4 plans, ~2 weeks)
  Mesocycle generator, target_event_date wiring, week tab redesign, per-day workout cards, weekly preface rationale.
- **7.1 — Daily adaptation + readiness-driven swaps** (2-3 plans, ~1 week)
  HRV/sleep/RPE → soft swap / hard deload tier system, audit trail extension, swap explanation in chat.
- **7.2 — Workout authoring extension + taper polish** (2-3 plans, ~1 week)
  Template library expansion (12 → ~30), Mujika taper math integration, race-week ritual, per-day power/pace target generation refinement.

---

*Phase: 07-periodization-workout-generation*
*Context gathered: 2026-05-04*
*User delegated decisions to Claude — research is the authoritative input.*
