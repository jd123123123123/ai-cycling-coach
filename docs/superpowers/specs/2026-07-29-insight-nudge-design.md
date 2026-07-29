# Insight Nudge — one honest early-signal pattern, four chapters

**Date:** 2026-07-29
**Status:** approved (design), implementation not started
**Depends on:** the four-chapter dashboard storyline (Phases 1–2b, shipped) — `ChapterBar`, the narrative kit (`CoachRead`, `MomentCard`, `ChapterHero`, `NextChapter`), and the "one honest signal per fact" discipline established there.

## The problem

The app already has a genuinely good early-warning surface — `MorningHealthCard` on Körper — but it exists on exactly one of the four chapters, and it only watches one direction (illness/downturn). It never says "you're recovering exceptionally well." Heute, Plan, and Verlauf have nothing like it at all.

Feedback (2026-07-29): the user explicitly liked `MorningHealthCard`'s low-SpO₂ warning — calm, evidence-cited, and silent on a normal day — and asked for that same thing on every page, and for it to also catch good news, not just warnings.

## What "the same thing" actually is

`MorningHealthCard`'s wire contract is already almost generic:

```
MorningHealthCheck {
  level: 'none' | 'watch' | 'elevated' | 'high'
  signals: [{ metric, value, baseline, direction, delta, unit, severity }]
  headline, recommendation   // localized, present only when level != 'none'
}
```

Nothing in that shape is specific to health. It's "a cluster of named deviations from your own baseline, with a verdict." The detector behind it (`backend/app/services/morning_health_detector.py`) is pure, deterministic, no LLM: individual-baseline only (never population norms), conservative by construction (a real cluster of ≥2 signals, or one strong signal plus a corroborator — never a single noisy metric), and honestly returns `'none'` when the baseline is too thin to judge. That discipline — not the health-specific thresholds — is the thing to replicate.

It is also, not coincidentally, the exact lesson from this session's own Körper work: the final review of the dashboard-storyline Phase 2b branch found that the chapter's "Moment" card had no magnitude floor and could name a signal as "limiting" off pure noise, occasionally rendering a literal `"−0"` as its evidence, directly contradicting the card below it. `morning_health_detector.py` never had that bug, because its cluster-and-corroborator design was conservative from the start. This spec makes that design the house standard, not a one-off.

## Decisions taken

1. **Generalize `MorningHealthCard`'s exact mechanism**, not a new unified cross-chapter feed and not four bespoke card designs. Same shell, same honesty contract, one instance per chapter, each watching that chapter's own domain.
2. **Rule-based detectors, not LLM-generated.** Fast, deterministic, no hallucination risk, consistent with the existing detector. A future phase could hand a *confirmed* trigger to the coach model to phrase more richly, but that is out of scope here — see "Out of scope."
3. **Both directions.** Not just warnings — a real, earned positive cluster (an opportunity) gets the same visual seriousness a warning gets, using the same cluster-and-corroborator discipline, not a lower bar.
4. **Build order:** Körper first (extend what already works and is trusted), then Heute, then Plan, then Verlauf. Only Körper is designed in this spec; the other three get one directional paragraph each so later specs have an anchor, not a full design.

## The shared contract

Widen the existing shape by adding `polarity`, keeping `level` as a pure magnitude scale that now applies to either direction:

```python
# backend — every chapter's detector returns this
class InsightSignal(BaseModel):
    metric: str
    value: float
    baseline: float | None
    direction: str        # 'up' | 'down'
    delta: float | None
    unit: str
    severity: str          # 'mild' | 'strong'

class InsightNudge(BaseModel):
    polarity: str | None   # 'warning' | 'opportunity' | None when level == 'none'
    level: str             # 'none' | 'watch' | 'elevated' | 'high'
    signals: list[InsightSignal]
    headline: str | None
    recommendation: str | None
```

`MorningHealthCheck` becomes `InsightNudge` with `polarity` always `'warning'` when non-`'none'` (until the Körper extension adds the opportunity side). No other consumer of the old schema exists outside `MorningHealthCard`/`useMorningHealthCheck`, so this is a rename-and-widen, not a breaking change requiring a compatibility shim. The hook name (`useMorningHealthCheck`), its endpoint (`GET /health/morning-check`), and its query key are unchanged — only the TypeScript/Pydantic type it returns is renamed and widened. Heute/Plan/Verlauf get their own detectors, endpoints, and hooks later; nothing here makes this one hook generic across chapters.

## The shared frontend shell

Extract `frontend/src/components/narrative/InsightNudge.tsx` from `MorningHealthCard.tsx`'s existing JSX — same glass-card treatment (`GLASS_PAPER_2`, `GLASS_BLUR`, `GLASS_CARD_MARKER` from `glassCard.ts`), same escalating icon/colour-by-`level` behaviour, same signal-chip row, same honest-empty `null` return when `level === 'none'`. The only new axis is `polarity`: warning keeps the existing `--color-stand` → `--color-amber` → `--color-move` escalation; opportunity uses `--color-recovery` at increasing intensity. No new colour tokens.

`MorningHealthCard.tsx` becomes a thin wrapper: it calls `useMorningHealthCheck()` and hands the result to `<InsightNudge data={...} eyebrow={...} />`. Behaviour must not change during the extraction — this is the same "move, not invent" discipline used for `CoachRead` and the `driverRows` array earlier in this project, and it is verified the same way: byte-for-byte comparison of the rendered output before and after.

## Placement rule

`MorningHealthCard` already sits directly after the Hero and before the Moment on Körper, with the stated reason "placed high so a warning is the first thing seen." This becomes a named rule for all four chapters: **an Insight Nudge, when it fires, always renders first — after the Hero, before the Moment** — because a real early signal outranks whatever the chapter would otherwise feature as its Moment. When it doesn't fire (`level === 'none'`), it renders nothing and costs nothing.

## This spec's scope: Körper, extended

The only phase designed here. Two things happen, in order:

1. **Extract the shared shell** (`InsightNudge.tsx`) from `MorningHealthCard.tsx`, with zero behaviour change — the existing illness-warning path must render identically before and after.
2. **Add an opportunity side to `morning_health_detector.py`.** Mirror the existing cluster discipline in the positive direction: a genuine, sustained recovery upswing — e.g., HRV meaningfully above baseline *and* resting HR meaningfully below baseline, held for more than one morning (not a single good night, for the same reason a single bad night isn't a warning) — returns `polarity: 'opportunity'`, `level` scaled the same way (`watch`/`elevated`/`high` on magnitude), with a headline and recommendation that read as genuine, earned recognition, not generic positivity. The exact thresholds are the implementation plan's job, not this spec's; the discipline (≥2 corroborating signals, individual baseline, honest `'none'` when thin) is not negotiable.

### Not in this spec's scope

- **Heute** — direction only: a session-execution pattern (e.g., a real multi-session pattern of hitting or consistently missing prescribed power/HR targets), detected from the athlete's own ride file history, not a single ride. Full design deferred to its own spec.
- **Plan** — direction only: a plan-adherence pattern (e.g., sustained divergence from planned weekly volume/TSS in either direction — falling behind, or a genuine, sustainable positive streak worth calling out). Full design deferred.
- **Verlauf** — direction only: a fitness-trend pattern (e.g., FTP or CTL genuinely plateaued despite consistent training load, or a genuine breakthrough). Full design deferred.
- **LLM-phrased nudges.** The rule decides *whether* and *what*; a future phase could hand a confirmed trigger to the coach model to *phrase* it more richly, with the trigger itself staying deterministic so a phrasing model can't invent a false positive. Not needed now — the existing detector's hand-written bilingual copy is already good.
- **Any change to `readinessGate.ts`, the readiness score, or the daily decision.** This is a new, separate early-signal surface; it does not touch the stale-wearable withholding rule or the training-readiness dial.

## Amendment (2026-07-29, after Körper shipped): the signals get a shape

The shipped card cites each signal as text — `Ruhepuls −8,5 bpm vs 48`. That is
honest and precise, and it is also flat: it states a delta without showing the
*trend* the delta came from. Seeing a resting-HR curve actually bend downward
over a week is both more informative and more motivating than reading one
number, and it is the "more visualisation" half of what this surface is for.

**The data is already in hand and currently discarded.** `GET
/health/morning-check` loads ~30 days of `daily_metrics` rows
(`backend/app/api/health.py`, the `daily = [...]` comprehension) and hands the
whole series to the detector, which reduces each metric to one value plus a
baseline and throws the rest away. A sparkline therefore costs **zero**
additional queries, zero additional round-trips, and no new fetch — only a
field on the wire that is already computed.

### Decisions, taken from a rendered prototype rather than on paper

Three variants were built and rendered at 390px before any production code
(honoring the house rule that a new visual concept gets a real frame first —
Today's Road passed every static gate and still shipped as a bar chart):

1. **Area-filled curve wins.** A 1.8px stroke alone is legible only if the eye
   traces it; a gradient fill under the same curve reads as a shape instantly
   at chip size. This is the variant to build.
2. **The dashed baseline reference line is dropped.** All three prototypes drew
   one, and it was invisible in all three at 52×18px — too thin and too short
   to survive. The existing `vs <baseline>` text already carries the baseline
   reference, and the curve's own position carries the trend. Rendering an
   element that cannot be seen is not a neutral cost: it is dishonest chrome.
3. **A dot-per-day variant is rejected.** At this size the dots read as a
   loading indicator, not as data.
4. **Polarity inverts the colour, and it reads correctly.** The warning variant
   (red curve, rising resting HR) still reads as concern at a glance; the
   opportunity variant reads as good news. Confirmed in the render, not assumed.

### The honesty rule that comes with it

A sparkline drawn from too few points implies a trend that isn't established.
Below a minimum of **7 usable points** for that metric, the chip renders exactly
as it does today — text only, no sparkline. Same discipline as the detector
itself: no baseline, no claim.

## Verification

Matching this project's established discipline:

- `npx tsc -b --noEmit` clean; `pytest` clean on the backend.
- Full frontend and backend suites green. The shell extraction needs a byte-identity check (rendered `MorningHealthCard` output unchanged) the same way the `driverRows` array extraction was verified in Phase 2b.
- New backend tests for the opportunity path, mirroring the existing coverage matrix: normal vitals → none, a real recovery cluster → watch/elevated/high, a single good metric → none (not a lone-signal trigger), thin baseline → none, recommendation wording keyed to the actual signals.
- A rendered frame at 390×844 showing the opportunity state actually firing (not just unit-tested) — this is exactly the kind of thing a green test suite proved insufficient for in Phase 2b, where the bug was only caught by a whole-branch review reading the render, not by any test.
