# Period Report — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Author:** brainstorming session

## Goal

A new, engaging "Period Report" surface that lets an athlete pick a window
(7 / 14 / 30 days, or a custom day count) and immediately see **what improved,
what got worse, and where they stand** — scientifically grounded but
plain-language first, with game-like hooks that make it rewarding to check.

This is distinct from the existing 90-day Trends instrument panel
(`TrendsTab`), which is an always-on multi-chart evidence view. The Period
Report is a *periodized verdict*: a graded, comparative digest.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Placement | New full-screen surface, implemented as a 5th dashboard **tab** (`report`) — idiomatic fit with existing `?tab=` system, still full-screen. |
| Engagement hooks | All four: **grade + delta cards**, **streaks & milestones**, **body-system radar**, **AI coach verdict**. |
| Rigor vs simplicity | **Plain-first, science on tap** — plain verdict leads; each card expands to the real metric + a one-line "why it matters". |
| Comparison baseline | **Previous equal window** (last N days vs the N days before that). |
| Data layer | **Backend endpoint + orchestrating service** (Approach A), not client-side composition — the scientific math is unit-tested and single-sourced. |

## Architecture

### Data flow

```
ReportTab (window = N days)
  → usePeriodReport(N)  [react-query]
    → GET /analytics/period-report?days=N
      → period_report.build_report(db, user_id, days=N)
          ├─ current window  [days ago .. today]
          ├─ previous window [2N days ago .. N days ago]
          ├─ reuses: pmc_window_summary, recovery_trend_summary,
          │           activity_summary, ftp_progression_summary,
          │           zone_distribution, hrv_trend, rhr_trend, sleep_debt,
          │           ctl_atl_tsb_snapshot
          └─ returns PeriodReport { grade, radar[], improvements[],
                                    weaknesses[], milestones[], ai_verdict }
```

The windowed analytics services already exist in
`app/services/analytical_aggregates.py` and `app/services/advanced_metrics.py`
but are currently only wired as **coach LLM tools** (`coach_tools.py`), not
exposed over REST. The new service composes them; the route exposes them.

### Backend components

**`app/services/period_report.py`** (new) — pure orchestration + scoring.

- `build_report(db, user_id, days) -> PeriodReport`
- Computes **current** and **previous-equal** windows, diffs them.
- **Overall grade**: composite 0–100 → letter band (A+ ≥93, A ≥90, A− ≥87,
  B+ ≥83, …, D <60). Composite = weighted blend of the five radar axes.
  Weights are module-level constants, documented inline, and the numeric
  score is always shown beside the letter (transparent, not a black box).
- **Body-system radar** — five axes, each normalized 0–100:
  1. **Aerobic Fitness** — CTL level (vs personal range) + CTL trend over window.
  2. **Recovery** — HRV trend + RHR trend + sleep debt (composite of the three).
  3. **Consistency** — training-day ratio over window + longest streak.
  4. **Intensity Balance** — polarization / zone-distribution health
     (penalize excessive tempo "grey zone", reward polarized or pyramidal).
  5. **Durability** — efficiency factor trend + aerobic decoupling
     (lower decoupling = better).
- **Improvements / Weaknesses**: each axis and each headline metric (CTL, ATL,
  TSB, HRV, RHR, sleep, EF, decoupling, training days, total TSS, FTP est.) is
  diffed current-vs-previous. A delta surfaces **only if it crosses a
  per-metric significance threshold** (defined as constants — e.g. CTL ±2,
  HRV ±5%, training days ±1). Positive significant deltas → improvements;
  negative → weaknesses. Each entry carries: `key`, `label` (plain verdict),
  `detail` (real numbers, e.g. "CTL 48 → 52, +4"), `why` (one line), `delta`,
  `direction`.
- **Streaks & milestones**: longest consistency streak in window, PRs/bests
  achieved this window (e.g. highest single-day TSS, biggest week in 90d),
  badge-style achievements. Each: `icon_key`, `label`, `detail`.
- **AI verdict**: short Claude narrative ("your window in one breath"),
  ≤280 chars, reusing the **exact** graceful-fallback pattern from
  `/analytics/summarize` (rule-based summary when `ANTHROPIC_API_KEY` is
  absent or the call fails). Uses `settings.COACH_MODEL` with prompt caching
  on the system block, mirroring the existing endpoint.

**`app/schemas/period_report.py`** (new) — Pydantic models:
`RadarAxis`, `DeltaItem`, `Milestone`, `PeriodReport`.

**`app/api/analytics.py`** (edit) — add:
`GET /analytics/period-report?days=N` (N validated, e.g. 3 ≤ N ≤ 365),
RLS-protected via `get_db_for_user`, `response_model=PeriodReport`.

**Tests** (`backend/tests/`) — TDD for the pure logic:
grade banding, axis normalization edge cases, significance-threshold gating,
graceful degradation on insufficient data (no activities / no HRV → axis
returns `null` score + `insufficient_data` flag, never a fabricated number).

### Frontend components

**Navigation wiring:**
- `DashboardPage.tsx`: add `report` to `TabId`, `resolveTab`, `tabs`, and the
  `tabContent` switch.
- `MobileBottomNav.tsx`: add a 5th item `report` (lucide `Award` or `Trophy`).
- i18n: add `tab_report` key to locale files.
- Five tabs on mobile bottom nav is within Strava/Garmin norms.

**`ReportTab.tsx`** (new) — layout top → bottom:
1. **Window toggle** — `[7] [14] [30] [Custom]`; custom reveals a small numeric
   input. Selected window persisted in `?window=` (or local component state).
2. **Grade hero** — large letter grade + composite score + AI verdict line +
   "vs previous N days" framing. Visual weight echoes `TrendsHero` styling.
3. **Body-system radar** — ECharts radar (echarts already a dependency).
4. **Improvements** (good color) / **Weaknesses** (caution color) — two columns
   of expandable `DeltaCard`s. Plain label collapsed; tap expands to
   `detail` + `why`.
5. **Streaks & milestones** strip — badge chips.

**`hooks/usePeriodReport.ts`** (new) — react-query hook, mirrors `usePMC`.
**`api/report.ts`** (new) — typed client call + TS types matching the schema.
**`components/report/`** (new) — `GradeHero`, `BodySystemRadar`,
`DeltaCard`, `MilestoneStrip`, `WindowToggle`. Reuse existing design tokens
(`--color-good/caution/bad/ink/muted`), `Sparkline`, card patterns.

## Error handling & edge cases

- **Insufficient data**: any axis lacking inputs returns `score: null` +
  `insufficient_data: true`; radar renders it muted/hollow, grade composite
  re-weights over available axes (and notes reduced confidence).
- **No previous window data**: deltas show "no baseline yet" instead of a
  misleading ±0; first-time users still get a meaningful current snapshot.
- **AI verdict failure / no key**: rule-based fallback string, never an error
  to the user (matches `/analytics/summarize`).
- **Custom days bounds**: clamp/validate server-side (3–365); reject out of
  range with 400.

## Testing strategy

- Backend unit tests (TDD, pytest, asyncio_mode=auto already configured):
  grade banding, axis normalization, significance gating, insufficient-data
  degradation, previous-window-absent handling.
- Frontend: type-check + lint; manual drive of the running app (backend :8000,
  frontend :5173) across 7/14/30/custom windows and an empty-data account.

## Out of scope (YAGNI)

- "Vs personal baseline / 90d avg" comparison mode (only previous-equal-window
  for v1; the schema leaves room to add a `baseline` mode later).
- Sharing/export of the report card.
- Per-sport breakdown (report is whole-athlete for v1).
- Historical archive of past period reports.

## Non-obvious integration notes

- Reuse the coach tool functions directly; do **not** reimplement windowed
  math. If a needed variant isn't there (e.g. previous-window fetch), add a
  thin parameter rather than a parallel implementation.
- The composite grade and significance thresholds are the only genuinely new
  "science"; everything else composes existing, already-validated metrics.
