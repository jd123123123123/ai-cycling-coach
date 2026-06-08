# Period Report Redesign — "Verdict → Diagnosis → Prescription"

**Date:** 2026-06-08
**Branch:** feat/period-report
**Scope:** Full visual + structural redesign of the Report tab (`ReportTab` and its `components/report/*` children). Data model and API contract (`api/report.ts`, `usePeriodReport`) are unchanged.

## Goal

The Report tab currently renders as a flat vertical stack of near-identical `rounded-18px` dark cards, each topped by the same tiny mono eyebrow — no rhythm, one reading volume. Concrete problems:

1. The body-system **radar floats tiny in a large empty panel** (low payoff, wasted space) and is disconnected from the "Why this grade" accordion that actually explains it.
2. The **grade hero** is the strongest element but underpowered for what should be the centerpiece.
3. The **next-step** — the actionable payoff — is buried at the bottom as just another card.
4. No information hierarchy: everything is the same card at the same weight.

Redesign into three legible acts — **Verdict → Diagnosis → Prescription** — with intentional hierarchy, matching the depth/polish of the Today rating and Coach recommendation surfaces (see `[[engaging-surface-quality-bar]]`).

## Design System (carry-over, no new deps)

- **Fonts:** Geist (body), **Fraunces** for the verdict headline and the next-step headline (currently unused — gives editorial authority), JetBrains Mono for numbers/eyebrows only.
- **Tokens:** reuse existing — `--color-paper`, `--color-paper-2`, `--color-rule`, `--color-ink/ink-2/muted`, status `--color-good/caution/bad`, radius scale, `--shadow-glass-rim`/`--shadow-2`, easing/duration scales, `card-enter`/`slide-up` keyframes.
- **No new dependencies.** ECharts radar stays.

## Act 1 — Verdict Hero (elevated centerpiece)

`GradeHero` becomes the visual centerpiece.

- Larger glass-rim card: `--shadow-glass-rim` + `--shadow-2`, keep the existing grade-colored radial gradient wash.
- Grade ring (`GradeRing`) unchanged — keep the count-up animation and tip.
- **AI verdict rendered in Fraunces** at ~20–22px (today it is 14px Geist body), `--color-ink`, max ~60ch.
- A single **stat row** beneath the headline consolidating: grade delta (▲/▼ vs last window), percentile pill ("Top X% · your history"), and the composite-trend `Sparkline`. Today these are crammed into one wrapping line above the verdict; move them below as a tidy, evenly-spaced row.
- **Evidence chips** restyled as bordered pills (1px `--color-rule`, pill radius, mono value colored by tone) instead of loose mono text.
- **Window toggle moves into the hero top-right** as a compact segmented control (7 / 14 / 30 / custom), reading as "the lens on this verdict." `WindowToggle` is refactored into this inline segmented control; the standalone control above the report is retired.

## Act 2 — Diagnosis (the big fix)

**New `BodySystems` component merges `BodySystemRadar` + `WhyThisGrade` into one card.**

- Desktop: two columns. Radar left (sized up — `radius` ~72%, height ~340–360 — to fill the column). Per-axis breakdown right: each of the five axes shows label + score (mono) + a thin progress bar (reuse the `WhyThisGrade` bar styling) + the `detail` string, **always visible** (no accordion).
- Mobile: stack — radar on top, axis list below.
- Insufficient-data axes keep the muted treatment and the "Not enough data: …" note.
- This eliminates the empty panel and makes the radar self-explanatory.

**Improvements / Watch-outs** (`DeltaCard`) stay as a two-column block:

- Each collapsed `DeltaCard` surfaces its **delta magnitude as an inline mono chip** (e.g. `+0.3 W/kg`) on the right, before the chevron — so the magnitude is visible without expanding. Expansion still reveals `detail` + `why`.
- Empty/no-baseline copy preserved (DE/EN).

**Causes** (`CausesPanel`) sits in this act as the qualitative counterpart to the deltas. Styling unified with the act; renders nothing when empty (unchanged).

## Act 3 — Prescription (the payoff)

- **Milestones** (`MilestoneStrip`) become a celebratory chip strip positioned **above** the next-step — the "earned it" moment before the call to action. Renders nothing when empty (unchanged).
- **Next-step** (`NextStepCard`) elevated to a real CTA: full-width card with an accent-tinted background **wash** (`color-mix` of `step.tone` accent) rather than only a left border, Fraunces headline, `ArrowRight` affordance, detail in `--color-ink-2`.

## System-level

- **Section rhythm:** the three acts read as distinct groups. Larger vertical gap *between* acts than *within* an act. Optional lightweight act labels only if they add clarity — keep minimal; do not reintroduce eyebrow noise.
- **Card hierarchy by depth:** hero carries shadow + glass rim; Act-2/3 cards stay flat 1px-bordered. Depth signals importance.
- **Motion:** stagger-in the acts on load via `card-enter`/`slide-up` (respect `prefers-reduced-motion` if already handled in the app; otherwise keep subtle). Grade count-up retained.
- **States:** loading skeleton and error message preserved, restyled to match the new hierarchy.
- **i18n:** every existing DE/EN string preserved. Any new label ships with both locales via the existing `locale === 'de'` pattern.

## Component Changes

| Component | Change |
|---|---|
| `ReportTab` | Re-group children into three acts with rhythm; remove standalone `WindowToggle` (now in hero); pass `days`/`onChange` into `GradeHero`. |
| `GradeHero` | Absorb the window toggle (segmented control); Fraunces verdict; consolidated stat row; pill evidence chips; glass-rim elevation. |
| `BodySystems` (new) | Merge radar + per-axis breakdown into one two-column card. Replaces standalone `BodySystemRadar` + `WhyThisGrade` usage in the tab. |
| `BodySystemRadar` | Becomes an internal piece of `BodySystems` (or kept and composed). Radar sized up. |
| `WhyThisGrade` | Its always-visible axis-bar list folds into `BodySystems`; standalone accordion retired. |
| `DeltaCard` | Add inline delta-magnitude chip in the collapsed row. |
| `CausesPanel` | Style unification only. |
| `MilestoneStrip` | Repositioned above next-step; style unification. |
| `NextStepCard` | Background wash + Fraunces headline → CTA treatment. |
| `WindowToggle` | Refactored into the hero's inline segmented control (or retired in favor of one). |

## Verification

- Run frontend (`vite`) + backend, sign in to an account with history, open Analyze → Report; screenshot at desktop and mobile widths.
- Toggle 7 / 14 / 30 / custom — verify the hero re-fetches and re-animates.
- Check the no-baseline state (new account) and an account with insufficient radar data.
- Verify DE and EN render with no layout breakage.
- Visual diff against `report-v2.png` to confirm the empty radar panel and flat hierarchy are resolved.

## Out of Scope

- Backend / API / scoring changes.
- Other tabs (Today, Train, Trends, Charts).
- New data or new report sections.
