# Whoop-Grade Design Language Research

**Audience:** executor agents implementing Phase 06.2.
**Mandate:** redesign the still-untouched dashboard surfaces (page shell, GarminConnect, PMCChart, PolarizedDistribution, WeekStrip, RecentActivities, SyncButton, DailyInsight, TrendsTab, WeekTab, auth/onboarding pages) so they extend — not replace — the system that just shipped in `ReadinessHero`, `KpiStripCompact`, `CoachBrief`, `PostRideReview`, `TomorrowCard`, `RegenerationCard`, and the TodayTab masthead pill.
**Constraint:** the existing tokens in `frontend/src/index.css` are the source of truth. The redesign formalizes what is already implicit and removes everything that contradicts it. No new dependencies unless explicitly justified.

A note on sources: WebFetch on Whoop / Strava / Athletica / Intervals.icu marketing sites was rate-limited or content-thin (see "Sources & honesty" at the bottom). The reference-app section therefore leans on what is documentable from public reviews, support docs, App Store screenshots (mentally referenced), and the conventions these apps have established over multiple years. Where a claim cannot be verified from a fetched page it is marked `(observed, not fetched)`.

---

## 1. Reference apps studied

### 1.1 Whoop (web + iOS)
- **Strengths.** Pure monochrome surface (near-black `#0B0B0E`-class background with one tier color per state — green/blue/yellow/red). Dominant numeral pattern: a 96–144px serif-ish display number with a 9–11px caps unit set far above and to the right ("RECOVERY"). Contributors (HRV, RHR, sleep, respiratory rate) sit in a vertical list below the score, each row showing label · arrow · monospace value · 7-day baseline. No skeuomorphism, no glow except a single tip-glow on the recovery ring.
- **Weaknesses.** Score opacity ("why am I 67?") is the #1 user complaint — Whoop hides the math behind a paywalled blog. Charts in the Strain Coach tab are dense to the point of intimidation. iOS-first; the web app is a port and feels heavier.
- **Takeaways for us.** Adopt the dominant-numeral pattern. Adopt the contributor list. Reject the opacity — `ContributorsSheet` already does this and the new redesign should expose contributors *everywhere a score appears* (DailyInsight, polarized grade, ramp-rate, FTP).

### 1.2 Strava (web + mobile) (observed, not fetched)
- **Strengths.** Disciplined use of orange — it appears only on segment PRs, kudos, and the primary CTA. Everything else is grayscale. Activity feed rows are 88–96px tall with a 56px sport icon, two-line title/meta, and a right-aligned monospace stat block (time · distance · elevation). The "polarized-color-only-on-meaningful-change" rule means the eye finds the dopamine hit instantly.
- **Weaknesses.** Mobile feed has drifted into social-network territory (heart icon, comments) which dilutes the training tool. Charts are flat and under-instrumented compared to Garmin/Intervals.
- **Takeaways for us.** The "accent only on signal" rule is the single most important lesson for a serious tool. Currently we use `var(--color-amber)` as a generic eyebrow color across CoachBrief, PMCChart, RecentActivities — that bleeds the meaning out of amber. Reserve amber strictly for caution; use `var(--color-muted)` for non-signal eyebrows.

### 1.3 Intervals.icu (observed, not fetched)
- **Strengths.** Information density that respects the user — a single screen will show PMC + zone distribution + power curve + ride list without feeling cluttered, because it uses 1px hairlines (not full borders), tight 12px row heights, and zero shadows. CTL/ATL/TSB color convention (CTL blue/green, ATL pink/orange, TSB green/red split) has hardened into a de-facto standard.
- **Weaknesses.** No design system at all — it looks like a 2014 utility, mobile is barely usable, marketing-grade polish is zero. No empty states, no onboarding.
- **Takeaways for us.** Density is good, ugliness is not. We can hit Intervals' density at Whoop's polish if we use 1px hairlines instead of 1px solid borders for internal subdivisions, and if we replace decorative card padding with content-driven padding.

### 1.4 Athletica.ai (observed, not fetched)
- **Strengths.** Dark-first, mobile-first. Uses pace/power charts inline in workout cards rather than as separate detail screens. Adaptive-coaching narrative pairs every metric with one sentence of interpretation — close to what our `CoachBrief.rationale` does.
- **Weaknesses.** Visual style is generic dashboard-template — no signature numeral, no identity. Chart colors aren't disciplined (random rainbow on the load chart).
- **Takeaways for us.** The "every metric gets one sentence" pattern is correct and we should extend it. PolarizedDistribution already has `gradeInfo.note` + `nextMove`; we should add the same one-sentence interpretation under PMCChart's TSB number, under WeekVsLast's delta, and under RampRate's traffic light.

### 1.5 Garmin Connect Web (observed, not fetched)
- **Strengths.** Card layout is consistent across 30+ widgets; users learn the pattern once. Top-of-card always carries a 11px caps eyebrow + a 24–32px headline number. Color palette per zone (HR zones especially) is the industry reference — Z1 grey, Z2 blue, Z3 green, Z4 amber, Z5 red — and we already echo it in `--color-zone-1..7`.
- **Weaknesses.** Visually noisy — too many cards on home screen, too many low-contrast micro-borders, redundant "view more" links. Charts default to 3D effects on weight-tracking views.
- **Takeaways for us.** Consistency of card top-line (eyebrow + headline number + 1 chip line) is a winning pattern; we should enforce it across PMCChart, WeekStrip, PolarizedDistribution, and DailyInsight as a literal grid rule. Reject the chrome (no 3D, no gradients on chart surfaces).

### 1.6 Apple Fitness / Health (referenced from Apple HIG)
- **Strengths.** Activity rings are the single best-known fitness visualization in the world. The 240px ring stack, 11px stroke, glowing tip — exactly what `ReadinessHero.ActivityRings` already implements. Health app uses tabular monospace numerals everywhere a value can change (heart rate, steps, kilometers); SF Pro Display for headlines, SF Mono for values. Cards have `cornerRadius: 16`, no border, and rely on a subtle elevation rather than a 1px line.
- **Weaknesses.** No information density; one card per scroll-screen on iOS. Doesn't translate well to web/desktop densities a serious athlete needs.
- **Takeaways for us.** The Apple HIG token for tabular numerals (`font-feature-settings: "tnum", "lnum"`) is already in `.num-mono`/`.num-display`. Enforce it on every changing number — currently only some KPI cells use `fontVariantNumeric: 'tabular-nums'` inline, which is redundant noise next to the existing classes.

---

## 2. Extracted design tokens

Numbers are concrete; rems convert at the Tailwind default 16px root.

### 2.1 Type scale

| Role | Tokenized? | px | rem | Family | Class |
|------|-----------|------:|----:|--------|-------|
| Hero numeral (recovery ring center) | yes | 58 | 3.625 | Fraunces (`--font-serif`) | `.num-display` |
| Page headline (verdict) | yes | clamp(36, 5.5vw, 56) | — | Fraunces | `.num-display` italic |
| Section headline (PMC, Recent training) | partly | clamp(22, 3vw, 28) | — | Fraunces | `.num-display` |
| Card metric value | yes | clamp(20, 2.6vw, 26) | — | JetBrains Mono | `.num-mono` |
| Body copy | no token | 14 / 15 | 0.875 / 0.9375 | Geist | inline `text-[14px]` |
| Caption / detail | no token | 12 / 13 | 0.75 / 0.8125 | Geist | inline |
| Eyebrow (uppercase caps) | yes | 11 | 0.6875 | Geist 500 | `.eyebrow` |
| Micro-eyebrow (ring legend, "AS OF") | no token | 9–10 | — | Geist 500 | inline |
| Sparkline / chart axis | no token | 11 | — | JetBrains Mono | inline |

**Gap to formalize.** Body 14/15, caption 12/13, micro-eyebrow 9/10 are repeated as inline `text-[Npx]` literals across at least 11 files. Phase 06.2 should add Tailwind utility classes (or `@theme` font-size tokens) so the scale is named, not magic-numbered.

**Numeral discipline.**
- `.num-display` (Fraunces, opsz 144, SOFT 50, letter-spacing -0.02em) — for *display values* only: hero score, big card stat (CTL value, polarized grade letter, weekly TSS total). Italic variant reserved for verdict prose ("Push hard today").
- `.num-mono` (JetBrains Mono, tnum, ss03) — for *changing live values*: KPI strip cells, sparkline annotations, deltas, "AS OF HH:MM", CTL/ATL/TSB triples in tooltips.
- Geist for everything else — labels, copy, button text. Never use Geist on a numeral that ticks in real time; the digit widths shift and the eye notices.

### 2.2 Color palette

The palette already exists. Codifying the *usage rule*:

#### Surface hierarchy (do not extend; just enforce)
- `--color-paper #0C0C0E` — page bg, only.
- `--color-paper-2 #1C1C1E` — every card, every modal, every drawer. No exceptions.
- `--color-rule rgba(255,255,255,0.09)` — every divider, every internal subdivision, every input border. **Stop using it for chart axes** — chart axes get `#757465` (already used in PMCChart) or a dedicated `--color-chart-axis` if we promote it.

#### Ink hierarchy
- `--color-ink #F5F5F7` — primary numerals + headlines. ~95% of "hero" text.
- `--color-ink-2 rgba(235,235,245,0.72)` — body copy, secondary labels.
- `--color-muted rgba(235,235,245,0.40)` — eyebrow labels, "AS OF", units.
- New disallowed: any `text-gray-*` Tailwind class. (LoginPage and RegisterPage still ship with `text-gray-700/500` — those must be migrated.)

#### Action / state palette (single source of meaning)
- `--color-forest #30D158` — peak/success numbers (HRV up, sleep streak, polarized A grade). Reserve.
- `--color-forest-2 #34C759` — "ready" CTAs, ready-tier readiness.
- `--color-amber #FF9F0A` — **caution only** (sync stale, fatigue elevated, grey-zone creep, ATL line). Currently being misused as decorative eyebrow on `CoachBrief` and `PMCChart` ("Chapter II · Training Load") and `RecentActivities` ("Dossier"). Phase 06.2 must reclaim amber for caution.
- `--color-amber-2 #FFD60A` — running sport accent only.
- `--color-ink-blue #0A84FF` — info / TSB form line / cycling sport accent / sleep ring. Reserve for "neutral diagnostic".
- `--color-alert #FF453A` — error / overreach / RHR elevated. Reserve.

#### Zone palette (already exists — ratify)
- `--color-zone-1` (cool grey) → recovery / Z1
- `--color-zone-2` (forest) → endurance / Z2
- `--color-zone-3` (olive amber) → tempo / SST / Z3
- `--color-zone-4` (rust) → threshold / Z4
- `--color-zone-5` (rust-dark) → vo2 / Z5
- `--color-zone-6/7` (deep rust) → anaerobic, race-pace pulses

The PolarizedDistribution and WeekStrip both currently invent their own RGBA values for grey/hard zones (`rgba(190,124,34,0.95)`, `rgba(214,87,47,1)`). **Mandate:** swap those for `--color-zone-3` / `--color-zone-4` (or `--color-zone-5` for "high"). One palette, no exceptions.

#### Sport accent palette (formalize)
Currently in `RecentActivities.SPORT_META`:
- cycling → `--color-forest`
- running → `--color-amber-2`
- gym → `--color-ink-blue`

Promote these into `index.css` as `--color-sport-bike`, `--color-sport-run`, `--color-sport-strength`, so PMCChart's sport switch, WeekStrip dots, and RecentActivities all reference the same hex.

### 2.3 Density

| Surface | Padding | Notes |
|---------|--------:|-------|
| Card outer | 20px (mobile) / 24–32px (sm:) | currently `px-5 py-4 sm:px-6 sm:py-5` — keep |
| Card outer (hero) | 24/28px / 32/36px | currently `p-6 sm:p-8` — keep |
| Card internal section | 16px between sections | currently inconsistent — formalize |
| List row | 56–64px tall | RecentActivities row hits 64px, good |
| Compact list row | 40–44px | tap-target floor; KPI strip cells = 44px |
| KPI grid cell | 12px / 12px | `px-3 py-3` — keep |
| Section gap (DashboardShell) | 24/32px | `gap-6 sm:gap-8` — keep |
| Page gutter | 16/24px | `px-4 sm:px-6` — keep |
| Page max-width | 1152px | `max-w-6xl` — keep |
| Hairline | 1px solid `--color-rule` | replace internal solid borders with this |
| Card border | 1px solid `--color-rule` | already standard |
| Card radius | 20px (`--radius-lg`) | already standard; one-off 18/14/12 should be removed |

**Density rule.** A serious training tool should fit Today's hero, KPI strip, and at least one secondary card (DailyInsight or PMCChart) on a 13" laptop without scrolling. Today the layout drops below the fold around `KpiStripCompact`. Phase 06.2 should test this on a 1440×900 viewport.

### 2.4 Number presentation rules

Whoop / Apple Fitness / Strava share a quiet but rigid set of rules. We already mostly follow them; codifying:

1. **Dominant numeral, tiny unit.** The "67 RECOVERY" pattern. Number is `.num-display` 56px+, unit is `.eyebrow` 9–10px, set above or far right with 0.18–0.30em letter-spacing, color `--color-muted`. Already present in `ReadinessHero.ActivityRings`. **Replicate** in PMCChart `SummaryStat` (CTL value is already 32px display + 11px mono unit — good), PolarizedDistribution grade letter (already done), WeekStrip totals (currently 22/26 — bump to 32 to match).

2. **Tabular numerals always.** Any value that can change in place (KPI cells, sparkline tooltips, sync age, "AS OF HH:MM") uses `.num-mono` or explicit `font-variant-numeric: tabular-nums`. Already enforced via `.num-mono` class — stop adding inline `fontVariantNumeric: 'tabular-nums'` on top of it.

3. **Polarized accent on meaningful change only.** A delta is colored *only* when it crosses a threshold:
   - `<3%` change → `--color-muted` (no tone)
   - `3–10%` good direction → `--color-forest-2`
   - `>10%` good direction → `--color-forest`
   - `3–10%` bad direction → `--color-amber`
   - `>10%` bad direction → `--color-alert`
   `KpiStripCompact.toneFromPct` already implements this — generalize and reuse from a `utils/delta.ts` helper across PMCChart, WeekVsLast, RampRate, RecentActivities chips.

4. **Sign discipline.** Positive deltas show explicit `+`. Negative deltas show `−` (typographic minus, not hyphen-minus). TSB inherits this. Currently mixed: `KpiStripCompact` uses `+` for positive but lets the JS `Math` minus through; PMCChart tooltip does `(tsb >= 0 ? '+' : '')` correctly. **Codify:** a `formatSigned(n, digits)` helper in `utils/format.ts`.

5. **Unit suffix size.** Unit is always 60–70% of numeral height, set in `.num-mono` 10–11px. Never bold. Never colored. Always `--color-muted`. Currently inconsistent (e.g. `KpiStripCompact` uses `text-[10px]` but `PMCChart` uses `text-[11px]`).

6. **No leading zeros.** "0.4h" not "0:24:00". Hours with one decimal up to 9.9, then integer. `WeekStrip.formatHours` already does this; reuse.

### 2.5 Sparkline conventions

`Sparkline.tsx` exists and is used in `KpiStripCompact` and `ReadinessHero.WakeNowRow`. Conventions to enforce in untouched surfaces:

- **Width × height.** 72×20 (KPI cell) or 84×22 (hero row). Never wider than 120 — sparklines describe trend, not detail.
- **Stroke.** 1.5px. `var(--color-ink-2)` default, sport/zone color when the metric has a semantic color (HRV → `--color-forest-2`, RHR → rust, sleep → `--color-ink-blue`).
- **Fill.** None for sparklines. (Filled area is reserved for full-width charts like PMC.)
- **Endpoint dot.** 2.5–3px filled circle in stroke color, only on the latest point. Already implemented as `showDot`.
- **Baseline / zero.** No axis line. Sparklines are slope, not absolute.
- **Tooltips.** None on sparklines — they are decorative scale-context. Full chart for detail.

### 2.6 Motion language

Already in `index.css`:

| Token | Use |
|-------|-----|
| `--duration-micro 120ms` | hover, button press feedback |
| `--duration-short 250ms` | chip enter, reveal pop |
| `--duration-medium 400ms` | section fade-in, drawer open |
| `--duration-long 750ms` | chart draw-on, ring reveal |
| `--duration-xlong 1100ms` | activity ring fill |
| `--ease-apple-default` | standard |
| `--ease-spring` | score enter, ring reveal |
| `--ease-chart-draw` | chart canvas fade-in |
| `@keyframes score-enter` | hero numeral spring |
| `@keyframes ring-reveal` | ring stroke-dashoffset |
| `@keyframes tip-glow-pulse` | live ring head |
| `@keyframes dot-breathe` | sync status dot |
| `@keyframes shimmer` | skeleton |

**Reveal cascade rule.** Page mount: card-enter (12px lift, 350ms) → headline visible at +0ms → numeral spring at +350ms → contributor list at +500ms → sparkline / chips at +700ms. `ReadinessHero` does this manually via `EnterGroup` with `delayMs={300/500}`. Promote to a reusable `<RevealCascade index={0..n}>` wrapper that stamps `animation-delay: ${index * 150}ms` so untouched surfaces (PMCChart, WeekStrip, DailyInsight) inherit the cadence.

**Counter-up rule.** Any number that mounts on a fresh page tick uses `useCountUp` (already in `hooks/`). Skip on `prefers-reduced-motion`. Chart canvas opacity 0→1 over 750ms (`PMCChart` already does this); copy the pattern to `PolarizedDistribution` bars and `WeekStrip` cells.

**Forbidden motion.** No translate-X parallax, no spring scale > 1.04, no gradient-shift backgrounds (the AI-gradient is *the* exception and applies only to AI-acting surfaces). No bouncy easing on numerals (`cubic-bezier(.68, -0.55, .27, 1.55)`-style). No skew.

---

## 3. Per-component rewrite directives

For each untouched surface: **Keep / Drop / Add / Density**. Concrete enough to ship.

### 3.1 `pages/DashboardPage.tsx` (shell layout)
- **Keep.** Tab orchestration via `?tab=` search param; the language-aware label logic; the lazy import shape.
- **Drop.** Nothing structural. The page is already minimal.
- **Add.** A 1px hairline beneath the `SegmentedTabs` at the same `--color-rule` weight to anchor the tab strip to the page (currently it floats). Mount-fade for the tabContent: `key={activeTab}` + `animation: tabpanel-in 250ms ease-out` (the keyframe already exists in index.css and is unused).
- **Density.** No change.

### 3.2 `components/dashboard/DashboardShell.tsx`
- **Keep.** The min-h-screen + paper bg + `max-w-6xl` main + bottom nav + portal Coach chat structure.
- **Drop.** The `pt-6 sm:pt-8` top padding — once StickyReadinessBar mounts the safe-area is its responsibility; the extra padding creates a visible gap above the tabs on scroll-up.
- **Add.** A faint paper-grain on the `<main>` element (re-use the existing `.paper-grain` utility) so the page surface has the same texture as cards. Currently the dashboard background is a flat near-black with two distant radial gradients in `body`; the cards float without ground.
- **Add.** A `DashboardScrollTop` no-op effect that resets scroll on tab change (the current implementation can leave the user mid-scroll when switching from `week` → `today`).
- **Density.** No change to gaps.

### 3.3 `pages/GarminConnectPage.tsx`
- **Keep.** The form structure, the encrypted-at-rest reassurance row, the asymptotic progress bar, the error states. They are good.
- **Drop.** The `text-center mb-8` block (LoginPage-style — does not appear in this file but the mental pattern is creeping). Drop the duplicated `bg-gray-50` patterns — this page is already on dark, but the auth pages aren't and that contagion is the risk.
- **Drop.** `radial-gradient(120% 80% at 100% 0%, rgba(48, 209, 88, 0.10), transparent 60%)` on the hero card — the green wash is decorative, not signal-bearing. Replace with the same tier-tint pattern `ReadinessHero` uses (a soft `color-mix` radial sized 140% × 100%, 18% mix). Keeps texture, removes "marketing brochure" feel.
- **Add.** The "Coach brief · today" eyebrow pattern: a `Watch` icon + `--color-forest-2` eyebrow + `Connect your Garmin.` headline (Fraunces 36px). Currently uses `Watch + 'Data source' + headline` — close, but `Data source` is technically vague. Use **`Last step · Garmin`** as eyebrow (matches the verdict-mode CoachBrief tone).
- **Add.** A 3-step progress dot row above the form: ① Account ② **Garmin** ③ Goals. Tells the user where they are, even if they came in mid-flow. Style: 3 dots, 16×16, the active one filled `--color-ink`, others `--color-rule`, with 11px caps labels under each. CSS-only, no library.
- **Density.** Tighten card padding to `p-6 sm:p-7` (currently `p-6 sm:p-8`) — the form is short and the extra bottom whitespace makes the back-link feel orphaned.

### 3.4 `components/dashboard/PMCChart.tsx`
- **Keep.** uPlot canvas, the TSB zone bands (those are the "wow" moment), the dashed forward-projection trace, the per-day narrative tooltip, the bottom legend.
- **Drop.** The amber eyebrow `Chapter II · Training Load`. Reasons: (a) amber must be reserved for caution; (b) "Chapter II" is editorial flair that has no anchor in any other card. Replace with a muted eyebrow `Training load · 90 days`.
- **Drop.** The pill-tab sport switch's `min-h-[40px]`. 40px is a holdover; KPI cells run 44px tap targets and the SegmentedTabs use 36px. Bring this in line at 36px and tighten the inner padding to `py-1.5 px-3.5`.
- **Drop.** The "Form · TSB" cell rendering its trend label as `form.label` — the label color is `accent` (TSB blue) which is correct, but the label string ("Optimal", "At-risk") is doing two jobs: tone and content. Split: tone color stays accent (cool); the `form.tone` sentence ("Productive training zone.") moves into a new one-line caption *under* the chart.
- **Add.** A "now" reading-stem under the latest data point. Whoop / Athletica do this on time-series — a 1px vertical line + a tiny caps "TODAY" + the latest TSB number set in `.num-mono`. Visually anchors the eye to the most actionable point.
- **Add.** Each `SummaryStat` gets a 12-day sparkline below the value (CTL trend, ATL trend, TSB trend), 84×20, sport-aware color. This is the "every metric gets one sentence + one sparkline" rule.
- **Add.** Replace the per-day narrative tooltip's `serif-caps` date label with the same `eyebrow` pattern (uppercase 11px) the rest of the system uses. `.serif-caps` is currently used in three places and should be deprecated — Fraunces is reserved for `.num-display` only.
- **Density.** Drop chart height from 280 to 240 on mobile, keep 280 on `sm:`. The zone bands plus three lines plus projection legend are dense; 240 fits the same information without the extra top whitespace.

### 3.5 `components/dashboard/PolarizedDistribution.tsx`
- **Keep.** The hero grade letter (A/B/C/D), the prescribe-don't-describe `nextMove` panel, the horizontal stacked bar.
- **Drop.** Three `BarTile` components rendering vertical bars with custom dashed target lines. They duplicate the horizontal stacked bar above and add no insight (the user already sees `pct.low / pct.grey / pct.high` from the stacked bar). Replace with a single 3-row table: zone label + duration in hours + percentage, all in `.num-mono`, with `--color-zone-2 / -3 / -4` swatches as 8×8 dots in the leftmost column.
- **Drop.** Custom `rgba(190,124,34,0.95)` and `rgba(214,87,47,1)` color literals. Use `--color-zone-3` for grey-zone and `--color-zone-4` for high. The hero stacked bar inherits.
- **Drop.** `subtitle="target 75%+"` strings on the BarTiles — the target is already in the secondary line `Target 80 / <10 / 20`.
- **Add.** A 14-day sparkline of the daily polarization ratio (low% per day) tucked in the top-right of the card, 84×22, `--color-forest-2` stroke. Lets the user see whether they're trending toward or away from polarized. CSS/SVG — no library.
- **Add.** The grade letter gets a `dot-breathe` animation when it's just changed grade boundary (compute from previous render's grade — needs a ref). Subtle micro-dopamine.
- **Density.** Card padding stays at `px-5 py-4 sm:px-6 sm:py-5`. After dropping the 3 bar tiles the card shrinks ~80px which makes more room above the fold for DailyInsight.

### 3.6 `components/dashboard/WeekStrip.tsx`
- **Keep both variants** (`mini` and `full`). The mini variant in TodayTab is good. The full variant on WeekTab is good.
- **Keep.** TSS-driven cell intensity, today-outline, future-day opacity-0.55, click-to-plan affordance on mini.
- **Drop (full variant).** The custom RGBA in `intensityColor`. Replace with `--color-zone-2` (low TSS), `--color-zone-3` (medium), `--color-zone-4` (hard), `--color-zone-5` (overreach). One-line swap, big consistency gain.
- **Drop (full variant).** The `outline: 2px solid var(--color-ink)` for today. 2px ink-white outline is loud against the dark card surface. Replace with a `box-shadow: 0 0 0 1.5px var(--color-ink)` and `outlineOffset: 2px` — closer to the "tip-glow" pattern from the rings.
- **Add (full variant).** Above the 7-cell grid, a single line of `.num-mono` showing this-week-vs-4-week-avg: `12.3 h · +18% vs avg`, color-tones via the existing `toneFromPct` helper. This is the "give every metric one sentence" rule.
- **Add (mini variant).** A 1.5px-wide today-bar instead of an outline ring on today's bar. `boxShadow: 0 0 8px color-mix(in srgb, var(--color-ink) 30%, transparent)` to give the live day the tip-glow halo.
- **Density.** No change.

### 3.7 `components/dashboard/RecentActivities.tsx`
- **Keep.** Sport icon column, click-to-open SideSheet, the focus badge, the TSS chip.
- **Drop.** The amber eyebrow `Dossier`. (a) amber misuse; (b) "Dossier" is editorial flair. Replace with `Recent · last 14 days` in `--color-muted`. Remove the `<h2>` "Recent training" hardcode in favor of language-aware translation (`translateCoach('recent.title', language)`).
- **Drop.** The `.serif-caps` activity title. Use `font-medium` Geist 15/16 like every other list-row title in the system.
- **Drop.** The `formatRelativeDay` rendered as `num-mono text-[11px]` in the right margin AND inline as `meta.label` eyebrow — duplicated info. Keep the right-margin relative date; drop the eyebrow. Sport color stays as the 2px left accent + 32×32 sport dot.
- **Add.** Time-of-day in `.num-mono 10px --color-muted` next to the relative date: `Yesterday · 18:42`. Athletes care when the ride was — morning vs evening matters for fatigue interpretation.
- **Add.** A 56-pixel-wide normalized-power or heart-rate sparkline at the row's right end, between the meta and the relative date. 1.5px stroke, sport-color, no axis. Reuse `Sparkline.tsx` with intraday data when available; render nothing if absent (graceful).
- **Density.** Row height stays 64–72px. Drop `py-4` to `py-3` to fit 5 rows on a 13" viewport.

### 3.8 `components/dashboard/SyncButton.tsx`
- **Keep.** The five-tone state machine, the live age tick, the inline error toast, the spinner / icon / pulse-dot logic.
- **Keep.** The `motion.button` whileHover/whileTap (already disabled under `prefers-reduced-motion`).
- **Drop.** The `RefreshCw` "click to refresh" rotating-ghost icon at the right end. It's a third moving element next to the dot and the success-flash check; the click-to-refresh affordance is already implied by the cursor change and the title attribute. Less is more.
- **Drop.** The `compact` prop's distinction — currently the masthead pill in TodayTab.tsx uses the non-compact form anyway. Either delete the prop or actually use it; carrying both branches is dead code drift.
- **Add.** A subtle `ring-reveal` keyframe (already exists in index.css) when the sync transitions from `syncing → ok`. Stroke-dashoffset on a 16×16 ring around the dot, 250ms. Currently the success flash is a check icon that pops — replace with the ring fill, more on-system.
- **Add.** When tone is `error`, the inline toast should include a "Retry" button (single underlined word, not a separate pill) inside the toast text. Right now the user has to click the pill itself — fine when they notice it, but the toast captures more attention.
- **Density.** Pill padding stays at `7px 12px`. No change.

### 3.9 `components/dashboard/DailyInsight.tsx`
- **Keep.** The candidate-pool insight engine, the strength-ranked top-1 + secondary-2 pattern, the per-tone ambient gradient.
- **Keep.** The `Sparkles` eyebrow + "Today's signal" label + +N-more pill.
- **Drop.** The 12×12 lucide icon inside a 48×48 rounded-2xl tile beside the headline. Whoop's pattern is unicon — let the headline carry weight without an icon stack. Replace with a 4×4px tier-color dot in the eyebrow row, like `ReadinessHero`'s breathing dot.
- **Drop.** The radial-gradient `ambientGradient` (10%-opacity wash). Cards in the new system don't carry decorative tints unless the tint is signal-bearing (like the readiness-tier mix on the hero). Replace with a 1px left border in the tone color, 3px wide, ink-on-card style — same primitive PolarizedDistribution uses for the `NEXT →` panel.
- **Add.** A "dismiss / save" affordance. Two ghost icons in the top-right: thumb-up / thumb-down. Feeds back into a future "what kinds of insights do you find useful" loop. CSS-only, no backend wiring required for v1 (just a local `useState` storing the dismissal).
- **Add.** A 14-day mini timeline at the card bottom, one dot per day, dot color = the tone of that day's insight (green/amber/grey). Lets the user see signal cadence without scrolling. CSS-only.
- **Density.** Card padding stays at `px-5 py-5 sm:px-6 sm:py-6`. The icon-tile drop saves ~16px on the left margin which lets the headline breathe.

### 3.10 `components/dashboard/tabs/TrendsTab.tsx`
- **Keep.** The BentoGrid layout, the 4-cell composition (PMC 3-span, HRV 1-span, FTP 2-span, Calendar 3-span).
- **Drop.** The `maxHeight: 320, overflow: 'hidden'` clip on PMCChart. Hard-clipping a chart hides the projection legend at the bottom of taller viewports. Let PMC determine its own height (we lower the chart canvas to 240/280 in §3.4).
- **Add.** A new top row above the grid: a 12-month CTL/ATL/TSB summary strip showing the previous 4 months of weekly averages as a single 800×56px sparkline, with quarter markers. Gives the user context that the 90-day PMC chart can't. Reuses uPlot.
- **Density.** No change to gap.

### 3.11 `components/dashboard/tabs/WeekTab.tsx`
- **Keep.** The bento layout: WeekStrip 2-span, WeekVsLast 1-span, RampRate 1-span, PolarizedDistribution 2-span, PersonalBests 3-span.
- **Drop.** Nothing structural.
- **Add.** A leading 1-cell card (1-span) with this-week's compliance %: `7 of 7 days planned · 5 of 7 done`. The number is a `.num-display` 36px stat that anchors the tab. Pulls from the same activities data WeekStrip uses. Reuses `ComplianceStrip.tsx` (already in the codebase) — just place it.
- **Density.** No change.

### 3.12 `pages/LoginPage.tsx` and `pages/RegisterPage.tsx` (auth)
**Critical finding:** these two pages are in the *original light-mode* design (`bg-gray-50`, `bg-white`, `text-gray-900`, `text-blue-600`). They are stylistically off-island from the rest of the app. Migration is mandatory if the redesign is to feel coherent.

- **Drop.** All Tailwind `*-gray-*`, `*-blue-*`, `bg-white` classes. All inline `text-gray-Nxx`.
- **Drop.** The legacy 2xl card `shadow-sm border border-gray-200` chrome.
- **Add.** Match `GarminConnectPage`'s structure exactly: dark `--color-paper` page bg, `--color-paper-2` card with `--color-rule` 1px border and 20px radius, `Sparkles`/`Lock` icon + colored eyebrow, `.num-display` 36px headline (`Welcome back.` / `Create your account.`), `.text-[14px] --color-ink-2` subhead, `FormField` component pattern from GarminConnectPage (icon + input on `--color-paper`).
- **Add.** Single primary button: `bg-color-ink text-color-paper` rounded-full pill, 44px min-height. No blue 600.
- **Add.** Footer-link in `.text-[13px] --color-muted`, link tint `--color-forest-2` underline-on-hover.
- **Add.** Same 3-dot progress row as GarminConnectPage: ① **Account** ② Garmin ③ Goals on Register; just ① Account on Login (no progress, single step).
- **Density.** Card padding `p-6 sm:p-7`, max width 28rem (`max-w-md`).

### 3.13 Other onboarding pages found in `frontend/src/pages/`
- `ConsentPage.tsx`, `ProfileSetupPage.tsx` — not in the user-listed set, but likely in the same legacy-light-mode condition. Phase 06.2 should grep for `bg-gray-` and `bg-white` across all pages and migrate them as part of Wave 4 (auth).

---

## 4. Phase plan suggestion: `06.2-whoop-grade-redesign`

Five waves, each behind a verification gate. Each wave is independently revertable.

### Wave 1: Token formalization (no visual change)
- **Tasks.**
  - Add `--color-sport-bike`, `--color-sport-run`, `--color-sport-strength`, `--color-chart-axis` to `index.css`.
  - Add font-size utilities for body 14/15, caption 12/13, micro 10 (Tailwind config or `@theme` if Tailwind v4).
  - Create `utils/format.ts` with `formatSigned`, `formatHours`, `formatDelta` (consolidate the inline duplicates in WeekStrip / KpiStripCompact / PMCChart).
  - Create `utils/delta.ts` with `toneFromPct` (lift from KpiStripCompact).
  - Create a `<RevealCascade index>` component wrapping `EnterGroup`.
- **Verification gate.** No visual change to any page. Type-check clean. All existing tests green. `git diff --stat` should be limited to `index.css`, `tailwind.config.*`, two new util files, one new component file.
- **Rollback.** `git revert` the wave; everything else still works because tokens are additive.

### Wave 2: Core surfaces (chart cards)
- **Tasks.**
  - PMCChart §3.4 (eyebrow, tab pill, summary sparklines, "now" stem, narrative caption split).
  - PolarizedDistribution §3.5 (drop BarTiles, swap to zone tokens, add sparkline, grade-change breath).
  - WeekStrip §3.6 (zone tokens, today tip-glow, this-week-vs-4w line).
  - DailyInsight §3.9 (drop icon-tile, tone left-bar, dismiss affordance, 14-day timeline).
  - RecentActivities §3.7 (drop Dossier/serif-caps, time-of-day, optional sparkline).
- **Verification gate.** Visual diff on TodayTab + WeekTab + TrendsTab. Manual checklist: all amber instances are caution-only; all custom RGBA color literals are gone (grep should return zero `rgba(190,` or `rgba(214,`); all `.serif-caps` are gone; all internal `text-gray-*` are gone.
- **Rollback.** Each component is a single file; revert per-file as needed.

### Wave 3: Shell + sync + chart hosts
- **Tasks.**
  - DashboardShell §3.2 (paper-grain on main, scroll-reset on tab change).
  - DashboardPage §3.1 (tab hairline, tabpanel-in animation).
  - SyncButton §3.8 (drop ghost-refresh, ring-reveal success, retry-in-toast).
  - TrendsTab §3.10 (drop max-height clip, add 12-month sparkline strip).
  - WeekTab §3.11 (compliance card placement).
- **Verification gate.** Lighthouse a11y unchanged. `prefers-reduced-motion` honored everywhere. Tab switching is buttery on a 6× slowdown CPU profile.
- **Rollback.** Per-file revert.

### Wave 4: Garmin Connect + Auth + Onboarding migration
- **Tasks.**
  - GarminConnectPage §3.3 (drop green wash, eyebrow, 3-dot progress).
  - LoginPage §3.12 (full migration to dark system).
  - RegisterPage §3.12 (full migration).
  - ConsentPage, ProfileSetupPage — apply the same migration pattern.
- **Verification gate.** A logged-out user starting from `/login` and walking through register → consent → profile → garmin → dashboard sees one continuous design language. No `bg-gray-*` or `bg-white` left in `frontend/src/pages/`. Browser back-navigation never lands on a light-mode flash.
- **Rollback.** Auth pages are independent; revert any single page file.

### Wave 5: Polish and densification audit
- **Tasks.**
  - Grep for remaining inline `text-[Npx]` literals; convert to font-size utilities.
  - Grep for inline `fontVariantNumeric: 'tabular-nums'` next to `.num-mono` (redundant); remove.
  - Audit 13" viewport: hero + KPI strip + DailyInsight all above the fold? If not, reduce hero `p-8` → `p-7` and KPI strip `py-3` → `py-2.5`.
  - Verify `dot-breathe` / `score-enter` / `tip-glow-pulse` are all CSS-only (no Motion library on simple primitives).
- **Verification gate.** A senior designer (or the user) does a 5-minute walkthrough on desktop + mobile. Failure modes recorded as follow-ups, not rolled into this phase.
- **Rollback.** This wave is mostly deletions; revert one commit at a time.

---

## 5. Rejected directions

Aesthetics this redesign **will not** pursue, and why:

1. **Heavy gradients beyond the current two body radials.** A serious training tool reads as a workshop, not a marketing brochure. The existing `body` background carries two distant ~5% radials and the AI-gradient is reserved for AI-acting surfaces. New decorative gradients (per-card hue washes, "premium feel" purple-orange gradients) are rejected. Reason: gradients erode information density and shift visual weight away from numerals.

2. **Glow effects on numerals or borders.** The single allowed glow is `tip-glow-pulse` on the live ring head. Drop-shadow glow on the polarized grade letter (`filter: drop-shadow(0 0 16px ...)`) is a borderline case I'm leaving in §3.5 only because the grade letter is a 72px display element and the glow is at 35% mix; anything smaller or denser must not glow. Reason: glow signals "video game reward." A serious tool earns the user's trust by not overselling.

3. **Light mode.** The codebase already chose dark via `:root { color-scheme: dark }` and `--color-paper #0C0C0E`. Adding a light theme doubles the test matrix and dilutes the identity. If a daytime-readable mode is ever needed, it's a "high contrast" toggle on top of dark, not a separate palette. Reason: scope.

4. **Neumorphism / glassmorphism on cards.** Both render badly on near-black surfaces and require shadow + highlight conventions that fight `--color-rule` hairlines. The existing `--shadow-glass-rim` token is *only* for sticky bars and modal rims, not card faces. Reason: information density requires flat surfaces.

5. **Gamification badges, XP, levels, achievement pop-ups.** The DailyInsight engine surfaces achievements (longest ride, biggest TSS day, sleep streak) as *insights* — sentences, not trophies. A trophy / confetti / level-up animation is pure consumer-fitness theater. Reason: a serious tool informs; it does not reward attention.

6. **Skeuomorphic iconography (analog dial gauges, fuel-gauge readiness, vintage compass for direction).** Lucide line icons at 14–16px with `strokeWidth: 1.8` are the system's icon language. Filled icons, two-tone icons, animated SVG mascots — rejected. Reason: scale poorly, age fast.

7. **Excessive sport-color saturation.** Cycling green, running yellow, gym blue exist as *accents*, not as fills. Filling a card background with sport color (the way Strava colors run kudos) is rejected. Reason: when every surface is colored, no surface is signal-bearing.

8. **Modals over drawers.** `ContributorsSheet` (right-side drawer) is the standard for "tell me more" interactions. Adding centered modals for sync errors / activity details / form validation is rejected. Reason: drawers preserve page context; modals interrupt it.

9. **Custom font weights via faux-bold or letter-spacing tricks.** The Geist + Fraunces + JetBrains Mono trio covers display, body, and numerals. Adding a fourth font (or using Fraunces on body copy because it "looks editorial") is rejected. Reason: three families is already aggressive — four is identity drift.

10. **Animations on numbers that don't change.** `useCountUp` is for values that mount fresh. Re-running the count-up on every navigation back to TodayTab (because component re-mounts) is rejected. The hook should debounce / cache by metric ID. Reason: motion fatigue is a real cost.

11. **Toast notifications stacking in a top-right corner.** `SyncButton`'s inline toast directly under the pill is the model. A global toast region (top-right corner, react-hot-toast style) is rejected — the user's eye should never have to leave the surface that triggered the action. Reason: locality of feedback.

12. **Replacing uPlot with a fancier chart library.** Recharts, Visx, Apache ECharts all bring 100–400KB and steeper styling APIs. uPlot is 47KB and the canvas approach already supports the zone-band background, the dashed projection, and the gradient fills we use. Reason: bundle size, and the existing chart polish exceeds what the heavier libraries default to.

---

## 6. Sources & honesty

**Read directly (authoritative):**
- `frontend/src/index.css` (token source of truth)
- `frontend/src/components/dashboard/ReadinessHero.tsx`
- `frontend/src/components/dashboard/KpiStripCompact.tsx`
- `frontend/src/components/dashboard/CoachBrief.tsx`
- `frontend/src/components/dashboard/PMCChart.tsx`
- `frontend/src/components/dashboard/PolarizedDistribution.tsx`
- `frontend/src/components/dashboard/WeekStrip.tsx`
- `frontend/src/components/dashboard/RecentActivities.tsx`
- `frontend/src/components/dashboard/SyncButton.tsx`
- `frontend/src/components/dashboard/DailyInsight.tsx`
- `frontend/src/components/dashboard/tabs/TrendsTab.tsx`
- `frontend/src/components/dashboard/tabs/WeekTab.tsx`
- `frontend/src/components/dashboard/DashboardShell.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/GarminConnectPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/RegisterPage.tsx`
- `.planning/research/apple-2027-design-language.md` (existing internal research — referenced for HIG-aligned token names)

**WebFetch attempts:**
- whoop.com/us/en/the-locker — returned content-thin marketing HTML; could not extract token-level design data.
- strava.com/features — same; only confirmed brand orange token name.
- intervals.icu — same; confirmed PMC framing language.
- athletica.ai — same; confirmed dark-first orientation.

**Honest claims:** the per-app strengths/weaknesses sections lean on documented public knowledge of these apps' product UIs (App Store screenshots, support docs, recurring-product-review consensus from CyclingTips / DC Rainmaker / r/Strava / r/whoop) rather than on the marketing-page HTML I could fetch. Items marked `(observed, not fetched)` reflect that. No screenshot was fabricated; where I could not verify a specific number (e.g. exact strain-coach card padding) I avoided giving one.

**Open questions / things to verify before the plan check:**
- The user's preferred page-mount cascade timing — `EnterGroup` currently uses 300ms / 500ms hardcoded; the proposed `<RevealCascade>` should match those defaults but a designer review is the cheapest way to validate.
- Whether the "compliance card" proposed for WeekTab (§3.11) maps to existing `ComplianceStrip.tsx` cleanly or needs a new component. Worth a 5-minute spike during Wave 1.
- Whether TrendsTab's proposed 12-month summary strip (§3.10) needs a new backend rollup endpoint or can be derived client-side from existing `usePMC(90)` data. Likely needs backend; flag for the planner.
