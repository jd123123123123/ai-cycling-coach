# Dashboard 2026 Rebuild — Design

Date: 2026-05-12
Status: Approved (direction), ready for implementation planning

## Problem

The dashboard is a long scrollable essay, not an instrument. The most decision-relevant chart in cycling (PMC: fitness/fatigue/form) is buried below ~3 paragraphs of coach prose in a Deep-dive accordion. The prescribed-workout card ("Chill ride") renders as a flat empty bar with no interval profile. The polarized-distribution "D" grade appears identically on both the Today and This-week tabs. The "Recent training" list is plain text rows with oversized colored platform pills and no training data (no power/TSS/decoupling). The This-week tab is near-empty until an accordion is expanded. Numbers are set in the body font, so nothing reads like a readout.

We also want net-new signals competitors don't surface well, and a 2026 "editorial instrument" visual language (Linear × Bloomberg terminal × Whoop).

## Goals

1. **Today = one viewport**: the verdict, the workout (with real interval ribbon), and the training state, above the fold. Everything else → progressive disclosure.
2. **Promote PMC** out of Deep-dive into Today, with a 28-day chart and a predictive "peaking day" marker.
3. **This-week tab earns its keep**: plan-vs-actual TSS, build-block progress, week-scoped intensity + polarized (removed from Today).
4. **Replace "Recent training" list** with a 90-day Training Log Strip (TSS height × intensity color × compliance ring).
5. **Four new signals**: Durability index (trended), Decoupling-over-time, HRV-adjusted TSB′, Autoregulated daily TSS band.
6. **Visual overhaul bundled with the rebuild**: mono numerics, hairline data grid, tri-color status system, grayscale platform glyphs, single motion idiom.

## Non-goals

- Crew / Bike / Run tab redesign (out of scope this milestone; they inherit the new visual primitives only).
- New data ingestion. Everything is computed from existing FIT streams, daily metrics, and the Garmin mapper.
- Mobile-specific reflow beyond the stacked single-column fallback described below.

## §1 Data feasibility (verified)

| Signal | Status | Gap to close |
|---|---|---|
| Durability index | Computed: `advanced_metrics.durability_index()`; rendered today in `BiometricsDetail.tsx`. | Per-activity only. Need a trended endpoint: rolling 8-week median over long rides (≥ split-half threshold). |
| Decoupling (Pw:HR) | Computed: `advanced_metrics.aerobic_decoupling()`; in `coach.py` schema; rendered in `BiometricsDetail.tsx`. | Per-ride only. Need weekly aggregate + 12-week trend. |
| HRV-adjusted TSB′ | Inputs exist: `hrv_trend()` + `ctl_atl_tsb_snapshot()`. Formula not implemented. | New computed field. Formula: `TSB' = TSB × (1 + clamp((hrv_7d − hrv_28d_baseline) / hrv_28d_baseline, −0.3, +0.3))`. |
| Autoregulated daily TSS band | Inputs exist: prescribed TSS (coach_service), HRV trend, sleep, readiness uncertainty. Band logic not implemented. | New service method. Midpoint = prescribed TSS; halfwidth scales with readiness uncertainty + sign of HRV/sleep deltas. |

No blockers.

## §2 Target screens

### Today — one viewport (desktop ≥ 1024px: hero row + two-column body row + log strip; mobile: single column, same order)

- **HERO**: readiness ring (existing) · verdict headline (serif) + one sub-line · readiness contributor chips (HRV / sleep / soreness / mood) · freshness pill ("51m ago") promoted to top-right.
- **WORKOUT tile** (left of body row): workout name · duration · primary zone · **interval ribbon rendered** (duration × zone-intensity profile, not a flat bar) · target line showing `Target: N TSS (band lo–hi)` (the new autoregulated band) · one "Why:" line tied to the periodization phase · `[Start ride]` `[Switch]` actions.
- **TRAINING STATE tile** (right of body row): FITNESS / FATIGUE / FORM with mono numerics · 28-day PMC sparkline-chart · "Peaking: <date>" predictive marker derived from CTL/ATL crossover projection · FORM value shows TSB′ (HRV-adjusted) with raw TSB available on hover.
- **TRAINING LOG STRIP** (full width, below body row): 90 days, each day = a vertical bar (height ∝ TSS) · color = intensity band (tri-color) · a thin ring/underline = planned-vs-completed compliance · hover → day detail · click → the old detailed list (now a drilldown, not the default).
- **DEEP DIVE accordion** (collapsed by default): polarized distribution, the long coach narrative blocks, the workout-export list, recent-activities detail table, durability + decoupling trend charts (see §4).

### This week — four tiles, no scroll

- **BUILD BLOCK PROGRESS**: "Build · W1/4" with a 4-segment bar showing position in the block (not just the week).
- **TSS PLAN vs ACTUAL**: planned weekly TSS vs completed, as a ring or stacked bar with the delta.
- **INTENSITY (this week only)**: Z1–Z4 distribution for the current week (not all-time).
- **POLARIZED · grade**: the polarized grade + "what to fix" line. This is the *only* place the polarized chart appears (removed from Today).
- Keep the existing 7-day strip at the top (it's fine), but each day chip gains an intensity dot using the tri-color system.

## §3 Visual system

- **Numeric face**: one tabular monospace (JetBrains Mono / IBM Plex Mono / Berkeley Mono — pick one at impl time) for every figure, delta, axis label. Body copy stays in the existing sans; verdict headlines stay in the existing serif — and serif is restricted to headlines only (no creep into labels/captions).
- **Metric labels**: 11px uppercase, generous letter-spacing.
- **Sparkline behind every standalone number**: ~24px tall, no axes, last 90 days where available.
- **Status color**: exactly three — green (good), amber (caution), red (alert). No other status hues. Readiness ring keeps its gradient (it's a gauge, not a status).
- **Platform tags**: 12px grayscale glyphs (Garmin / Strava / TrainerRoad / etc.), not colored pills.
- **Layout primitive**: hairline-rule data grid (1px dividers, tight padding) for instrument modules — Today hero, workout tile, training-state tile, This-week tiles. Rounded cards reserved for narrative/Deep-dive content.
- **Motion**: one idiom only — the readiness ring fills on page load, and numeric values roll/odometer on change. Remove the staggered reveal-cascade animations (they slow morning scan time). Optional: a subtle tick highlight on HRV/RHR when a fresh sync lands.

## §4 New signals — placement & math

1. **Durability index (trended)** — backend: new endpoint returning rolling 8-week median of `durability_index` over qualifying long rides + the latest value + a 12-month sparkline series. UI: a tile in the Deep-dive "ride science" group; surfaces a one-line callout in the training-state tile when it has moved ≥ 0.02 in 4 weeks.
2. **Decoupling-over-time** — backend: weekly mean decoupling over endurance rides + 12-week trend series. UI: line chart in the Deep-dive ride-science group; "improving / stable / regressing" label using a small linear-fit slope.
3. **HRV-adjusted TSB′** — backend: add `tsb_prime` to the PMC snapshot using the §1 formula; expose alongside raw `tsb`. UI: FORM number in the training-state tile shows `tsb_prime`; tooltip shows `raw TSB N · HRV adj ±M`.
4. **Autoregulated daily TSS band** — backend: new method on coach_service returning `{midpoint, lo, hi, drivers: [...]}` where midpoint = today's prescribed TSS, halfwidth grows with readiness uncertainty and shifts with HRV/sleep deltas (better-than-baseline → skew up; worse → skew down), clamped to ±35% of midpoint. UI: the workout tile's target line: `Target: 65 TSS (55–80)`; tap → the drivers list.

## §5 Implementation cuts (each independently shippable)

**Cut 1 — Visual system + Today hero rebuild**
- Introduce the mono numeric face, hairline-grid primitive, tri-color status tokens, grayscale platform glyphs, remove reveal-cascade.
- Rebuild Today into HERO + two-column body row.
- Render the interval ribbon in the workout tile (wire up the existing `IntervalRibbon` with the prescribed workout's segments).
- Promote PMC (`PMCChart` / a new compact variant) into the training-state tile with the peaking-day marker.
- Move polarized distribution + narrative blocks + workout-export list into the Deep-dive accordion. Remove the duplicate polarized chart from Today.

**Cut 2 — Training Log Strip + This-week tab**
- New `TrainingLogStrip` component (90-day TSS×intensity×compliance) replacing `RecentActivities` as the Today default; old list becomes the click-through drilldown.
- This-week tab: add build-block progress, TSS plan-vs-actual, week-scoped intensity, keep polarized here only; add intensity dots to the 7-day chips.
- Backend: any aggregate endpoints needed for the strip (daily TSS + intensity + planned-vs-actual for last 90 days) and the week tiles.

**Cut 3 — Four new signals**
- Backend: durability trend endpoint, decoupling trend endpoint, `tsb_prime` on PMC snapshot, autoregulated TSS band method.
- UI: TSB′ in the FORM readout + tooltip; autoregulated band in the workout target line + drivers drill; durability + decoupling trend tiles in the Deep-dive ride-science group; durability-moved callout in the training-state tile.

## §6 Testing

- Backend: unit tests for `tsb_prime` formula (clamp boundaries, zero/None HRV baseline), autoregulated band (clamp at ±35%, skew direction from deltas, missing-input fallback to point estimate), durability/decoupling trend aggregation (insufficient-rides → None, slope sign correctness). Follow existing `backend/tests/` patterns.
- Frontend: component tests for `TrainingLogStrip` (renders N days, compliance ring states, empty-data state), workout tile (ribbon renders from segments, band renders, "Why" line present), training-state tile (TSB′ vs raw in tooltip, peaking-marker present/absent). Visual regression / manual: screenshot Today + This-week at 1440 and 390 widths before/after each cut.
- Manual UAT via Playwright on `localhost:5173` after each cut: log in, screenshot Today + This week (collapsed + Deep-dive expanded), confirm no console errors, confirm above-the-fold contains hero + workout + training-state with no scroll at 1440×900.

## Open questions / risks

- **Peaking-day projection**: needs a simple forward model (assume planned TSS executes, project CTL/ATL, find TSB-in-range date). If the periodization plan doesn't expose future planned TSS per day, fall back to "no peak projected" rather than guessing. Confirm data availability during Cut 1 planning.
- **Mono font choice**: pick during Cut 1 (licensing — IBM Plex Mono is OFL and safe; Berkeley Mono is paid).
- **Compliance ring data**: requires planned-vs-completed per day for 90 days. If only available since plan adoption, the strip shows compliance only for the covered range.
