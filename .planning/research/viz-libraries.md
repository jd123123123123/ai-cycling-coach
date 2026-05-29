# Visualization Library Research

**Domain:** AI Cycling Coach — athletic/training dashboard
**Researched:** 2026-04-19
**Current stack:** Recharts 2.x (baseline, per STACK.md)

---

## Executive Recommendation

**Standardize on a three-library hybrid: Recharts 3 + uPlot + ECharts.**

The case in brief:

1. **Recharts 3.x** — keep for general declarative charts: sparklines, stacked bars, HR zone distributions, sleep ribbons, body-metric strip. Its declarative JSX model integrates cleanly with Tailwind and React state. v3.x shipped in late 2024 with React 19 compatibility and improved composability. Bundle cost is ~130 KB min+gzip but already in the project.

2. **uPlot** — add specifically for the PMC and MMP (mean-maximal power curve). It is by far the fastest library for dense time-series at 2k–10k points; renders the entire chart in < 3 ms on real hardware. Its plugin system supports custom canvas overlays for CTL/ATL/TSB zone bands. The learning curve is real but the payoff is a chart that feels instant while Recharts or ECharts would stutter at 365-day daily resolution.

3. **Apache ECharts (echarts-for-react)** — add for the polar/radar chart, the power-duration heatmap, and the calendar heatmap. ECharts ships radar, heatmap, and calendar as first-class series types; implementing these in Recharts requires substantial workarounds or custom SVG. Bundle cost is higher (~230 KB min+gzip) but tree-shakeable since ECharts 5.4.

**Do not adopt:** Visx (high effort, low marginal gain over direct D3), Plotly (enormous bundle ~1.3 MB, overkill for a mobile-first app), Tremor (locks you into their aesthetic, limited athletic data chart types), Highcharts (paid license), TanStack charts (too early), Motion Canvas (animation-only, not data-driven).

**Total added bundle cost of the hybrid stack:** ~390 KB min+gzip (Recharts ~130 + uPlot ~45 + ECharts tree-shaken to ~230). This is aggressive but acceptable for a dashboard app. Lazy-load uPlot and ECharts via React.lazy() so the initial landing/auth bundle stays clean.

---

## Library-by-Library Table

| Library | Last Release (as of Apr 2026) | Stars | Bundle (min+gz) | React 19 | TypeScript | Rendering | License | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Recharts 3.x** | v3.5 (Feb 2026) | ~24k | ~130 KB | Yes | Good (built-in) | SVG | MIT | Keep — general charts |
| **uPlot** | v1.6.31 (Jan 2026) | ~8.5k | ~45 KB | Wrapper needed (react-uplot) | Community types | Canvas | MIT | Add — PMC / MMP |
| **ECharts 5.x** (echarts-for-react) | v5.6 (Mar 2026) | ~61k | ~230 KB tree-shaken | Yes (5.6+) | Excellent | Canvas + SVG | Apache 2.0 | Add — radar / heatmap / calendar |
| **Visx** | v3.12 (Nov 2025) | ~19k | ~90 KB (per module) | Yes | Excellent | SVG | MIT | Skip — too low-level for ROI |
| **Nivo** | v0.87 (Mar 2026) | ~13.5k | ~280 KB for core | Yes | Good | SVG + Canvas | MIT | Skip — large bundle, niche chart types available in ECharts |
| **Tremor** | v4.1 (Feb 2026) | ~18k | ~95 KB | Yes | Good | SVG (Recharts inside) | MIT | Skip — locked aesthetics, wraps Recharts anyway |
| **Plotly / react-plotly.js** | v2.35 (Jan 2026) | ~17k | ~1.3 MB | Yes | Good | SVG + WebGL | MIT (OSS) | Skip — bundle size disqualifying |
| **Chart.js 4 + react-chartjs-2** | v4.4 (Oct 2025) | ~65k | ~70 KB | Yes | Good | Canvas | MIT | Viable alternative to Recharts for simple charts; no built-in radar/heatmap |
| **Lightweight-charts (TradingView)** | v5.0 (Feb 2026) | ~13k | ~55 KB | Manual wrapper | Excellent | Canvas | Apache 2.0 | Niche pick for PMC if uPlot too barebones; financial-first API is awkward for athletic data |
| **AG Charts** | v12.x (Mar 2026) | ~4.5k | ~180 KB | Yes | Excellent | Canvas + SVG | MIT (community) | Decent, but ECharts covers all the same types with larger ecosystem |
| **Highcharts** | v12.x (Mar 2026) | ~12k | ~200 KB | Yes | Excellent | SVG + Canvas | Commercial | Skip — license cost unjustified given ECharts parity |
| **Observable Plot** | v0.6.16 (Dec 2025) | ~4.2k | ~80 KB | Manual wrapper | Good | SVG | ISC | Interesting for bespoke static charts but needs custom React integration |
| **Victory** | v37.x (Sep 2025) | ~11k | ~160 KB | Lagging | Good | SVG | MIT | Skip — stalled React Native focus, no meaningful canvas story |
| **ApexCharts (react-apexcharts)** | v4.1 (Jan 2026) | ~14k | ~420 KB | Yes | Good | SVG | MIT | Skip — bundle bloat, worse than ECharts for comparable types |
| **d3 directly** | v7.9 (Oct 2025) | ~108k | ~90 KB | Manual wrappers | Good (types pkg) | SVG | ISC | Use for one-off unique charts (MMP CP fit overlay) not for general charts |
| **Motion Canvas / lottie-web** | n/a | n/a | varies | Yes | Good | Canvas/SVG | MIT | Not a data viz library — skip for charts |

---

## Chart-by-Chart Library Recommendations

### 1. Performance Management Chart (PMC)
**90-day multi-line: CTL / ATL / TSB, reference zone bands, fill gradients, interactive hover**

**Recommendation: uPlot**

uPlot renders 365-day daily data (365 points × 3 series) in under 2 ms on a mid-range phone. The plugin system handles zone bands as canvas fill passes before the main series draw. Cross-hair sync and tooltip construction are manual but well-documented (see the uPlot examples/demos repo). The log of uPlot production usage by Grafana (who ships uPlot in their OSS product) confirms reliability at scale.

Recharts alternative is workable but lags noticeably when the user drags the date-range slider — SVG reflows are expensive at 90–365 points with three series plus bands. Lightweight-charts is second choice if you want a higher-level API: it has built-in baseline series and area fills, but the financial-time-axis semantics require mapping athletic date ranges manually.

**Key implementation note:** uPlot requires a raw DOM node, so use `useRef` + `useEffect` pattern, not JSX. Wrap in a `<UPlotChart>` component that handles resize via ResizeObserver.

### 2. Mean Maximal Power Curve (MMP)
**Log-x axis 1s → 4hr, multi-date comparison, CP fit overlay**

**Recommendation: uPlot + custom D3 scale for x-axis**

MMP has ~80–120 discrete duration points and renders instantly even in SVG, so performance is not the driver here. The driver is the **log x-axis** (1s to 14,400s) and the **CP fit curve overlay** (a smooth parametric curve, not data points). uPlot's `scale` API supports custom logarithmic transforms. The CP fit overlay is best drawn as a separate canvas path plugin using D3's `d3-shape` curve interpolator for the Monod-Scherrer or 3-parameter model.

Observable Plot is an intriguing alternative here — its grammar-of-graphics API handles log scales naturally (`Plot.scaleX({type: "log"})`) and it can render both the empirical data and the parametric overlay in the same plot. The React integration is manual but the chart code becomes notably declarative. Worth considering if you want a distinctive editorial look — Observable Plot charts look like NYT/FiveThirtyEight style, not dashboard style.

### 3. Heart Rate Zone Distribution
**Stacked bar or heatmap, % time per zone per week, polarized training visualization**

**Recommendation: Recharts (BarChart with stacking)**

This is exactly the Recharts sweet spot: a small dataset (52 weeks × 5 zones = 260 cells), declarative stack composition, named colors per zone from CSS variables, tooltip out of the box. The polarized training visualization (zone 1 / zone 2 / zone 3 split) maps cleanly to three stacked segments with custom fill gradients per zone.

Use `<BarChart>`, `<Bar dataKey="z1" stackId="a" fill="var(--color-z1)">` pattern. Zone colors should reference CSS custom properties so you can theme light/dark without touching chart code.

### 4. Weekly Training Load Calendar Heatmap
**GitHub-style: 12 weeks × 7 days = 84 cells, color = TSS or load**

**Recommendation: ECharts (calendar + heatmap series)**

ECharts has a built-in `calendar` coordinate system that renders exactly this pattern. The `heatmap` series mapped onto a `calendar` grid gives you the GitHub-style color-intensity cells with date labels, month separators, and hover tooltip with zero custom SVG work. No other library in the evaluated set ships this out of the box — Recharts would require a custom SVG grid, Visx has a Heatmap primitive but no calendar axis.

```ts
// ECharts option skeleton
{
  calendar: { range: ['2026-01-01', '2026-03-31'], cellSize: 16 },
  series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [...] }]
}
```

### 5. HRV / Readiness Sparkline with Baseline Band
**"Your normal range" shading like Whoop**

**Recommendation: Recharts (AreaChart + ReferenceArea)**

Recharts `<ReferenceArea>` draws a horizontal band between `y1` and `y2`. Combined with a thin `<Line>` for HRV and a `<ReferenceLine>` for the rolling baseline, this renders exactly the Whoop-style readiness strip. Keep the sparkline small (120 × 40 px) and disable most axis elements for the miniature version. A `<Tooltip>` with `cursor={false}` and a custom content render gives the tap-to-reveal interaction on mobile.

### 6. Power Duration Heatmap
**Color intensity over power × time-duration grid**

**Recommendation: ECharts (heatmap on cartesian grid)**

This chart is a 2D matrix: x = time duration buckets (1s, 5s, 10s, 30s, 1m, 5m, 20m, 60m), y = power buckets (50W–600W in steps), color = % of rides where the athlete held that power for that duration. ECharts heatmap on a cartesian grid handles this matrix natively. The x-axis can be categorical (duration labels) with log-like spacing. Recharts has no native heatmap type — you would hand-roll SVG rectangles, which is expensive to maintain.

### 7. Sleep Stage Ribbon Chart
**Stacked horizontal bars per night: Wake / REM / Light / Deep**

**Recommendation: Recharts (horizontal BarChart, `layout="vertical"`)**

Sleep stage data is 7–14 nights × 4 stages. A horizontal stacked bar per night is the clearest encoding. Recharts handles this natively with `<BarChart layout="vertical">`. The color palette should be hand-crafted (not default Recharts colors) to convey sleep quality semantics — deep blue for deep sleep, near-black for wake, etc. The editorial opportunity here is big: use subtle gradients inside each bar segment via SVG `linearGradient` fills referenced by the `fill` prop.

### 8. Body Metrics Sparkline Strip
**5–7 mini sparks: sleep, HRV, battery, stress, resting HR**

**Recommendation: Recharts (tiny LineCharts, shared data window)**

A row of micro-charts, each 80 × 32 px, showing 28-day rolling window. Recharts `<LineChart>` with all axes hidden and a single `<Line>` is the simplest implementation. Keep each micro-chart as a separate component with shared `width`/`height` props. The key UX decision: do they all share the same x-domain (date range) so the user can visually compare trends across metrics? Yes — sync via a shared `Zustand` store for the hovered date index and custom `<ActiveDot>` that highlights across all sparklines simultaneously.

### 9. Activity Polar / Radar Chart
**Balance across power / endurance / intervals / recovery dimensions**

**Recommendation: ECharts (radar series)**

ECharts radar is the most mature React-ecosystem radar chart: supports `areaStyle`, `lineStyle`, custom indicator labels, responsive tooltips, and animates on load. Recharts has a `<RadarChart>` but it lacks fill gradients and the indicator label customization is limited. The editorial opportunity: use a dark background with neon accent colors (like Whoop's recovery score ring) — ECharts supports arbitrary canvas theming.

### 10. Fitness vs. Fatigue Scatter with Current Position Marker
**CTL (x) vs ATL (y) scatter, historical trace, current position marker**

**Recommendation: ECharts (scatter series + markPoint)**

The fitness-fatigue scatter (sometimes called the "form chart" in TrainingPeaks language) is: a scatter of past 90 days' (CTL, ATL) pairs connected by a line trace, with a custom marker showing today's position and the TSB-colored quadrant bands. ECharts handles this with `scatter` series + `markPoint` + `markArea` for quadrant shading. Recharts `<ScatterChart>` works but lacks `markArea` — you'd need `<ReferenceArea>` calls per quadrant (four of them) which is verbose but workable. ECharts wins on expressiveness here.

---

## Bundle-Size Impact: Hybrid Stack

| Library | Scenario | Min+Gzip |
|---|---|---|
| Recharts 3.x | Already in project | ~130 KB |
| uPlot | Added for PMC + MMP | ~45 KB |
| ECharts (tree-shaken) | Added for radar, heatmap, calendar, scatter | ~230 KB |
| d3-shape (CP fit only) | Minimal D3 import | ~15 KB |
| **Total new additions** | uPlot + ECharts + d3-shape | **~290 KB** |
| **Total viz bundle** | All three combined | **~420 KB** |

**Mitigation strategy:**
- Lazy-load uPlot and ECharts via `React.lazy()` + `Suspense` behind route-level code splitting. The initial auth/landing bundle sees zero cost.
- ECharts tree-shaking: import only the components you use (`import { LineChart, HeatmapChart, RadarChart, CalendarComponent } from 'echarts/charts'`). Saves ~80–100 KB vs the full import.
- uPlot's 45 KB is already one of the smallest time-series libraries available — nothing to optimize there.

---

## Migration Strategy

**Do not do a big-bang rewrite.** The progressive approach by chart type:

**Phase A — Add ECharts (1–2 days)**
Add `echarts-for-react` + `echarts` with tree-shaking config. Implement the three charts that Recharts cannot do natively: calendar heatmap, radar, power-duration heatmap. These are net-new charts, so no migration risk.

**Phase B — Add uPlot (2–3 days)**
Build a `<UPlotWrapper>` component that handles mount/unmount, ResizeObserver, and the plugin system. Implement PMC first (simplest data shape), then MMP (requires log scale + overlay). The PMC is the most used chart in the app — users will notice the performance improvement immediately.

**Phase C — Refine Recharts charts (ongoing)**
Keep Recharts for sparklines, stacked bars, and the sleep ribbon. Upgrade to Recharts 3.x if on 2.x (React 19 compat). Standardize theming via CSS custom properties (`--chart-color-1` etc.) so light/dark mode flips without chart-specific code.

**What NOT to migrate:**
- Do not replace Recharts sparklines with uPlot — overkill, the data is tiny.
- Do not replace ECharts radar with Recharts RadarChart — you'd lose gradient fills.
- Do not attempt to consolidate to a single library — no single library does PMC performance + radar + calendar heatmap + sparklines all well.

---

## Pitfalls from Real-World Production Usage

**Recharts**
- The `<ResponsiveContainer>` has a known layout-thrashing issue in some flex containers: set an explicit `height` on the parent div, not `100%` on the container.
- Recharts does not handle log-scale x-axis cleanly. Do not attempt the MMP chart in Recharts.
- Custom tooltip components re-render on every mouse move — memoize with `React.memo` and stable `formatter` functions.
- Recharts 2.x → 3.x has breaking changes in the `<XAxis>` tickFormatter signature. Review the migration guide before upgrading.

**uPlot**
- uPlot is imperative, not declarative. All config changes (data, scale, series) require calling `uplot.setData()` or `uplot.setScale()` — you cannot just re-render. This means React state changes must be translated to uPlot API calls in `useEffect`. Build a clean wrapper that handles this translation or you will have stale-closure bugs.
- The official TypeScript types are incomplete. The community `@types/uplot` package fills most gaps but you will encounter untyped plugin APIs.
- uPlot has no built-in legend. Build your own React legend that reads series visibility state from the uPlot instance.
- Touch pan/pinch on mobile requires the `touch-zoom` plugin (available in the uPlot examples repo, not on npm). Copy it into your codebase.

**ECharts**
- `echarts-for-react` (the standard React wrapper) has had slow release cycles. For React 19, prefer importing ECharts directly and managing the instance via `useRef` + `useEffect`, bypassing the wrapper. ~20 lines of boilerplate, much more control.
- ECharts tooltips are DOM-based (appended to document.body). In a React portal or dialog, the tooltip z-index will be wrong. Fix with `confine: true` on the tooltip option.
- ECharts `resize()` must be called manually on container resize. Use ResizeObserver, not window `resize` event.
- The calendar heatmap coordinate system does not support negative values. TSB can be negative — use a cartesian scatter or bar chart for TSB, not the calendar component.
- ECharts global theme registration (`echarts.registerTheme`) is a singleton. Register once at app init, not inside a component.

**Mobile touch interactions (cross-library)**
- SVG-based libraries (Recharts, Visx) handle pointer events naturally but long-press/tooltip-on-tap requires custom logic. On mobile, `mousemove` events do not fire — attach `touchstart`/`touchmove` handlers and synthesize pointer position.
- Canvas libraries (uPlot, ECharts) handle touch better out of the box but must declare `touch-action: none` on the canvas element to prevent page scroll during chart interactions.
- For the PMC date-range slider: implement it as a separate React component (not the chart library's built-in brush) so it works identically across Recharts and uPlot charts on the same page.

---

## Specific Libraries Ruled Out — Final Notes

**Visx (Airbnb):** The primitives (`@visx/shape`, `@visx/axis`, `@visx/scale`) are excellent quality and fully typed, but building a production PMC or radar chart from primitives takes 4–6x longer than using ECharts or uPlot. The payoff is complete rendering control — worthwhile only if your design requires something none of the higher-level libraries can express. For this app, ECharts + uPlot + Recharts cover all chart types without dropping to primitives.

**Nivo:** Active maintenance is real (v0.87 in Mar 2026), TypeScript is solid, and the radar/heatmap charts look good. The bundle is the killer: ~280 KB for the core package before you add any chart-specific sub-packages. ECharts tree-shaken to comparable chart coverage costs ~230 KB and has a vastly larger community, better mobile performance (canvas vs SVG), and more customization options.

**Tremor:** Ships Recharts internally. You get Recharts behavior with Tailwind-designed defaults that are hard to override. If your app design is intentionally distinctive (athletic, editorial, dark-mode-first), Tremor's opinionated defaults work against you. Skip.

**ApexCharts:** The 420 KB min+gzip bundle is simply indefensible when ECharts does more for 230 KB. Maintenance is slower than ECharts. No meaningful advantage.

**Victory:** Development slowed significantly in 2025. The React Native story is the main differentiator — if this app ever targets React Native, revisit. For a web-only dashboard, nothing Victory does justifies its cost over the recommended stack.

**Observable Plot:** Genuinely interesting for the MMP chart if you prioritize editorial aesthetics. The NYT/Observable notebook aesthetic is distinctive and non-generic. The integration cost is real (manual React wrapper, no SSR without setup), but if the app brand leans into data journalism–style presentation this is worth a prototype. Not recommended as a primary library, but worth experimenting with for the MMP and fitness-fatigue scatter.

---

## Sources

- Recharts v3 changelog and React 19 compat: https://github.com/recharts/recharts/releases
- uPlot production usage (Grafana): https://github.com/leeoniya/uPlot — Grafana OSS ships uPlot in their panel plugin system
- uPlot touch-zoom plugin: https://github.com/leeoniya/uPlot/tree/master/demos (touchZoomPlugin example)
- ECharts 5.6 release notes + tree-shaking guide: https://echarts.apache.org/en/changelog.html
- ECharts calendar coordinate system: https://echarts.apache.org/en/option.html#calendar
- echarts-for-react React 19 issues: https://github.com/hustcc/echarts-for-react/issues
- Nivo bundle size: https://bundlephobia.com/package/@nivo/core
- ApexCharts bundle size: https://bundlephobia.com/package/apexcharts
- Recharts bundle size: https://bundlephobia.com/package/recharts
- Observable Plot React integration: https://observablehq.com/@observablehq/plot-with-react
- TradingView lightweight-charts v5 changelog: https://github.com/tradingview/lightweight-charts/releases
- npm trends comparison (Recharts vs ECharts vs Nivo vs Visx): https://npmtrends.com/recharts-vs-echarts-vs-@nivo/core-vs-@visx/visx
- Visx architecture: https://airbnb.io/visx/docs/introduction
- uPlot perf benchmarks: https://github.com/leeoniya/uPlot#performance
- ECharts radar docs: https://echarts.apache.org/en/option.html#series-radar
- Grafana uPlot integration blog: https://grafana.com/blog/2020/06/23/how-we-improved-time-series-performance-in-grafana-7.0-with-uplot/

---

*Research for: AI Cycling Coach — visualization layer*
*Researched: 2026-04-19*
