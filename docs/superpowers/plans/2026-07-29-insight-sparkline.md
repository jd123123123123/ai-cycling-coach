# Insight Sparkline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every cited signal on the Insight Nudge card the shape behind its number — an area-filled sparkline of that metric's recent history — using data the endpoint already loads and currently discards.

**Architecture:** Three small pieces: the detector attaches the trailing series it already has to each signal it emits; the schema and endpoint carry it; a new `Sparkline` component draws it inside the existing signal chip. No new queries, no new fetches, no change to any verdict logic — the detector's thresholds, clustering, and honest-`none` behaviour are untouched.

**Tech Stack:** FastAPI + Pydantic + pytest (backend); React 19 + TypeScript + inline SVG + vitest + @testing-library/react (frontend).

## Global Constraints

- **Zero new data cost.** The series must come from the `daily` list the detector already receives. If any task finds itself adding a query, a fetch, or a new endpoint, it has misread the plan — stop and report.
- **No verdict logic changes.** Thresholds, cluster rules, `polarity`, `level`, and the honest-`none` behaviour are all fixed. This plan only adds a field and draws it. A diff that alters `_opportunity_verdict`, the illness verdict chain, or any threshold constant is out of scope.
- **7-point minimum.** Below 7 usable (non-null, finite) points for a metric, no sparkline renders and the chip looks exactly as it does today. A sparkline from 3 points implies a trend that isn't established — same discipline as the detector's own "no baseline, no claim".
- **No dashed baseline reference line.** A rendered prototype proved it invisible at 52×18px. The chip's existing `vs <baseline>` text carries the baseline. Do not add one back.
- **No new colour tokens.** The sparkline inherits the card's already-computed accent colour via a prop. It introduces no colours of its own.
- **Mobile-only**, 390×844 target. The sparkline is 52×18 CSS px inside an existing chip.
- **German + English** on every user-visible string — this plan adds no new copy (a sparkline has no text), so the requirement is only "introduce none".
- Pre-existing findings are not yours to fix: `frontend/src/auraprobe.tsx` and `frontend/aura.html` are untracked scratch files; one accepted `react-refresh/only-export-components` finding exists on `ChapterBar.tsx`.

---

## File Structure

**Backend, modify:**
- `backend/app/services/morning_health_detector.py` — `_public()` gains a `series` key; each signal helper receives and passes the metric's trailing values.
- `backend/app/schemas/morning_health.py` — `MorningHealthSignal` gains `series: list[float] = []`.
- `backend/tests/services/test_morning_health_detector.py` — tests for the series on both polarities and the too-few-points case.

**Frontend, create:**
- `frontend/src/components/ui/Sparkline.tsx` — the drawing primitive. No app knowledge; takes numbers and a colour.
- `frontend/src/components/ui/__tests__/Sparkline.test.tsx`

**Frontend, modify:**
- `frontend/src/api/health.ts` — `MorningHealthSignal` gains `series: number[]`.
- `frontend/src/components/narrative/InsightNudge.tsx` — renders a `Sparkline` inside each chip when the signal has enough points.

---

### Task 1: Backend — attach the series each signal already has

**Files:**
- Modify: `backend/app/services/morning_health_detector.py`
- Modify: `backend/app/schemas/morning_health.py`
- Test: `backend/tests/services/test_morning_health_detector.py`

**Interfaces:**
- Produces: every signal dict returned by `detect_morning_health()` gains `"series": list[float]` — the metric's chronologically-ascending recent values, oldest first, today's value last. Empty list when fewer than `_SPARK_MIN_POINTS` usable values exist.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/test_morning_health_detector.py`. The file already has `_series` and `_today` helpers and imports `date`/`timedelta`/`detect_morning_health` — reuse them:

```python
class TestSignalSeries:
    def test_warning_signals_carry_their_recent_series(self):
        daily = _series(20) + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        rhr = next(s for s in out["signals"] if s["metric"] == "resting_hr")
        # Enough history exists, so a series is attached, oldest first with
        # today's value last — that ordering is what the sparkline draws.
        assert len(rhr["series"]) >= 7
        assert rhr["series"][-1] == 55

    def test_opportunity_signals_carry_their_recent_series(self):
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 40, "hrv": 85,
             "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=40, hrv=85),
        ]
        out = detect_morning_health(daily)
        assert out["polarity"] == "opportunity"
        hrv = next(s for s in out["signals"] if s["metric"] == "hrv")
        assert len(hrv["series"]) >= 7
        assert hrv["series"][-1] == 85

    def test_series_is_empty_when_history_is_too_short_to_imply_a_trend(self):
        # 6 prior days + today = 7 rows, but the RHR baseline needs 5 priors and
        # the series needs 7 usable points; with exactly 7 total this is the
        # boundary — assert the rule holds rather than a specific count.
        daily = _series(6) + [_today(rhr=56)]
        out = detect_morning_health(daily)
        for sig in out["signals"]:
            assert sig["series"] == [] or len(sig["series"]) >= 7

    def test_series_skips_missing_readings_rather_than_emitting_nulls(self):
        prior = _series(20)
        prior[5]["rhr"] = None
        prior[9]["rhr"] = None
        daily = prior + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        rhr = next(s for s in out["signals"] if s["metric"] == "resting_hr")
        # A sparkline cannot draw a null; gaps are omitted, not zero-filled
        # (a zero would render as a cliff to the floor of the chart).
        assert all(isinstance(v, (int, float)) for v in rhr["series"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_morning_health_detector.py -k Series -v`
Expected: FAIL — `KeyError: 'series'`.

- [ ] **Step 3: Add the constant and the series extractor**

In `backend/app/services/morning_health_detector.py`, add next to the other threshold constants:

```python
# ── Sparkline series ─────────────────────────────────────────────────────────
# How many trailing days the UI may draw behind a cited signal, and the floor
# below which it may draw nothing at all. A curve through 3 points implies a
# trend that is not established — the same "no baseline, no claim" rule the
# verdict logic above already follows, applied to the picture instead of the
# number.
_SPARK_WINDOW = 14
_SPARK_MIN_POINTS = 7


def _series_for(key: str, daily: list[dict]) -> list[float]:
    """Trailing values for one metric, oldest first, today's value last.

    Missing readings are OMITTED, never zero-filled: a zero would draw as a
    cliff to the floor of the chart and read as a catastrophic reading rather
    than as absent data. Returns [] when too few usable points exist to imply
    a trend at all.
    """
    vals = [x for d in daily[-_SPARK_WINDOW:] if (x := _num(d.get(key))) is not None]
    return vals if len(vals) >= _SPARK_MIN_POINTS else []
```

- [ ] **Step 4: Thread the series into every signal**

Each signal helper currently returns a dict without a series. The cleanest change that touches no verdict logic: attach it in `_public()`, which is already the single choke point every signal passes through before leaving the service. `_public()` needs the metric's series, so give it a second parameter.

Change `_public`'s signature and body to:

```python
def _public(sig: dict, series: list[float] | None = None) -> dict:
    """Strip internal keys before the signal leaves the service."""
    return {
        "metric": sig["metric"],
        "value": sig["value"],
        "baseline": sig["baseline"],
        "direction": sig["direction"],
        "delta": sig.get("delta"),
        "unit": sig.get("unit") or "",
        "severity": sig["severity"],
        "series": series or [],
    }
```

Now find every `_public(...)` call site. There are two: one in the illness path inside `detect_morning_health` (a loop appending triggered signals), and one in `_opportunity_verdict`. The metric key on the signal dict maps to the `daily` dict key as follows — note `resting_hr`/`sleep_score` differ from their `daily` keys:

```python
_SERIES_KEY = {
    "resting_hr": "rhr",
    "hrv": "hrv",
    "respiration": "respiration",
    "spo2": "spo2",
    "sleep_score": "sleep_score",
}
```

Add that map next to `_SPARK_WINDOW`. Then in the illness path, change the append loop from:

```python
    for s in (rhr, hrv, resp, spo2, sleep):
        if s and s.get("triggered"):
            signals.append(_public(s))
```

to:

```python
    for s in (rhr, hrv, resp, spo2, sleep):
        if s and s.get("triggered"):
            signals.append(_public(s, _series_for(_SERIES_KEY[s["metric"]], daily)))
```

And in `_opportunity_verdict`, change:

```python
    signals = [_public(s) for s in (rhr_opp, hrv_opp, sleep_opp) if s and s["triggered"]]
```

to:

```python
    signals = [
        _public(s, _series_for(_SERIES_KEY[s["metric"]], daily))
        for s in (rhr_opp, hrv_opp, sleep_opp) if s and s["triggered"]
    ]
```

`_opportunity_verdict` already receives `daily` as its first parameter, so no signature change is needed there.

- [ ] **Step 5: Add the schema field**

In `backend/app/schemas/morning_health.py`, add to `MorningHealthSignal`:

```python
    series: list[float] = []   # trailing values for the sparkline; [] when too few to draw
```

Place it after `severity`. The default `[]` keeps the field additive — any caller constructing a signal without it still validates.

- [ ] **Step 6: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: 2641 existing + 4 new = 2645 passed. Every pre-existing test must still pass — if one fails, the series threading changed a verdict, which this plan forbids; fix the code, not the test.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/morning_health_detector.py backend/app/schemas/morning_health.py backend/tests/services/test_morning_health_detector.py
git commit -m "feat(health): cited signals carry the series behind their number

The endpoint already loads ~30 days of vitals and the detector reduced
each metric to one value and discarded the rest. Each emitted signal now
carries its trailing window so the UI can draw the trend the delta came
from — no new query, no new fetch, and no verdict logic touched: the
series is attached in _public(), the single choke point every signal
already passes through.

Gaps are omitted rather than zero-filled (a zero draws as a cliff to the
chart floor and reads as a catastrophic reading, not as absent data), and
below 7 usable points the series is empty so the UI draws nothing at all."
```

---

### Task 2: Frontend — the `Sparkline` primitive

**Files:**
- Create: `frontend/src/components/ui/Sparkline.tsx`
- Test: `frontend/src/components/ui/__tests__/Sparkline.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface SparklineProps {
  /** Chronological values, oldest first. Fewer than 2 renders nothing. */
  values: number[]
  /** Stroke and gradient-fill colour. Any CSS colour, including a var(). */
  color: string
  width?: number   // default 52
  height?: number  // default 18
  /** Accessible description. Omit to mark the graphic decorative. */
  label?: string
}
export default function Sparkline(props: SparklineProps): JSX.Element | null
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/__tests__/Sparkline.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Sparkline from '../Sparkline'

afterEach(cleanup)

describe('Sparkline', () => {
  it('draws a polyline and a filled area through the values', () => {
    const { container } = render(<Sparkline values={[10, 12, 11, 14, 18]} color="var(--color-recovery)" />)
    expect(container.querySelector('polyline')).toBeTruthy()
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('renders nothing at all below two points — one point is not a trend', () => {
    expect(render(<Sparkline values={[42]} color="red" />).container.querySelector('svg')).toBeNull()
    cleanup()
    expect(render(<Sparkline values={[]} color="red" />).container.querySelector('svg')).toBeNull()
  })

  it('survives a flat series without dividing by a zero range', () => {
    // All-equal values give range 0; a naive (v - min) / (max - min) would be
    // NaN and emit "NaN" into the points attribute, silently drawing nothing.
    const { container } = render(<Sparkline values={[50, 50, 50, 50]} color="red" />)
    const pts = container.querySelector('polyline')!.getAttribute('points')!
    expect(pts).not.toContain('NaN')
    expect(pts.length).toBeGreaterThan(0)
  })

  it('uses the colour it is given for both stroke and fill', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="var(--color-move)" />)
    expect(container.innerHTML).toContain('--color-move')
  })

  it('is decorative by default and described when given a label', () => {
    const { container: plain } = render(<Sparkline values={[1, 2, 3]} color="red" />)
    expect(plain.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    cleanup()
    const { container: labelled } = render(<Sparkline values={[1, 2, 3]} color="red" label="HRV trend" />)
    expect(labelled.querySelector('svg')!.getAttribute('aria-hidden')).toBeNull()
    expect(labelled.querySelector('title')!.textContent).toBe('HRV trend')
  })

  it('marks the most recent point so the eye lands on today', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="red" />)
    expect(container.querySelector('circle')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/Sparkline.test.tsx`
Expected: FAIL — cannot resolve `../Sparkline`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ui/Sparkline.tsx`:

```tsx
/**
 * Sparkline — the shape behind a number, at chip size.
 *
 * Deliberately dumb: it knows nothing about vitals, baselines or polarity. It
 * takes numbers and a colour, and the caller decides what those mean. That is
 * what lets the same primitive sit inside a green recovery chip and a red
 * warning chip without a branch.
 *
 * ── Two decisions taken from a rendered prototype, not on paper ──
 *  • The area under the curve is FILLED with a fading gradient. A 1.8px stroke
 *    alone is legible only if the eye traces it; the fill reads as a shape at a
 *    glance, which is the entire point at 52×18px.
 *  • There is NO dashed baseline reference line. Every prototype variant drew
 *    one and it was invisible at this size — too thin, too short. The caller's
 *    own "vs <baseline>" text carries that reference instead. An element nobody
 *    can see is not free; it is dishonest chrome.
 */
import { useId } from 'react'

export interface SparklineProps {
  /** Chronological values, oldest first. Fewer than 2 renders nothing. */
  values: number[]
  /** Stroke and gradient-fill colour. Any CSS colour, including a var(). */
  color: string
  width?: number
  height?: number
  /** Accessible description. Omit to mark the graphic decorative. */
  label?: string
}

export default function Sparkline({
  values, color, width = 52, height = 18, label,
}: SparklineProps) {
  // useId, not a module counter: two chips on one page each need their own
  // gradient id, and a counter would collide across a hot reload or an SSR pass.
  const gradientId = useId()

  const clean = values.filter((v) => Number.isFinite(v))
  // One point is a dot, not a trend. Render nothing rather than something
  // meaningless — the caller's chip still shows the number and the baseline.
  if (clean.length < 2) return null

  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const range = max - min
  // A flat series has range 0. Dividing by it yields NaN, which React happily
  // writes into `points` as the literal string "NaN" — an invisible failure.
  // A flat line drawn through the vertical middle is the honest picture.
  const pad = 2.5
  const usableH = height - pad * 2
  const y = (v: number) => (range === 0 ? height / 2 : pad + usableH * (1 - (v - min) / range))
  const x = (i: number) => (clean.length === 1 ? 0 : (width / (clean.length - 1)) * i)

  const pts = clean.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const lastX = x(clean.length - 1)
  const lastY = y(clean[clean.length - 1])

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible', flex: '0 0 auto' }}
      {...(label ? { role: 'img' } : { 'aria-hidden': 'true' })}
    >
      {label ? <title>{label}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.5" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${pts} L ${width},${height} L 0,${height} Z`} fill={`url(#${gradientId})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The eye should land on today, which is the only point that is a fact
          about right now rather than history. */}
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/Sparkline.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npx tsc -b --noEmit`

```bash
git add frontend/src/components/ui/Sparkline.tsx frontend/src/components/ui/__tests__/Sparkline.test.tsx
git commit -m "feat(ui): Sparkline — the shape behind a number, at chip size

Knows nothing about vitals or polarity: takes numbers and a colour, so
the same primitive sits in a green recovery chip and a red warning chip
without a branch. Area-filled because a 1.8px stroke at 52x18 is legible
only if the eye traces it; no dashed baseline line because a rendered
prototype proved it invisible at that size. Guards the flat-series case
explicitly — range 0 would otherwise write the literal string NaN into
the points attribute and draw nothing at all."
```

---

### Task 3: Frontend — draw it in the chip

**Files:**
- Modify: `frontend/src/api/health.ts`
- Modify: `frontend/src/components/narrative/InsightNudge.tsx`

**Interfaces:**
- Consumes: `Sparkline` (default export) from `../ui/Sparkline`, props `{ values, color, width?, height?, label? }` per Task 2.

- [ ] **Step 1: Widen the API type**

In `frontend/src/api/health.ts`, add to `MorningHealthSignal`:

```ts
  series: number[]
```

Place it after `severity`.

- [ ] **Step 2: Widen the component's own signal type and draw the sparkline**

In `frontend/src/components/narrative/InsightNudge.tsx`, add `series` to `InsightNudgeSignal`:

```ts
export interface InsightNudgeSignal {
  metric: string
  value: number
  baseline: number | null
  direction: 'up' | 'down'
  delta: number | null
  unit: string
  severity: 'mild' | 'strong'
  /** Trailing values for the sparkline. Empty when too few to imply a trend. */
  series?: number[]
}
```

`series` is optional here (not on the API type) so the component stays usable by a future chapter whose detector has no series to give — the chip simply falls back to text.

Add the import `import Sparkline from '../ui/Sparkline'`.

Then, inside the chip's JSX, between the metric label and the delta value, add:

```tsx
              {sig.series && sig.series.length >= 2 && (
                <Sparkline values={sig.series} color={color} label={`${metricLabel(sig.metric)} — ${sig.series.length} d`} />
              )}
```

The `color` variable is the card's already-computed accent from `levelStyle` — the sparkline inherits it, introducing no colour of its own. The `>= 2` check is belt-and-braces: the backend already returns `[]` below 7 points, and `Sparkline` itself returns null below 2, so this only avoids mounting a component that would render nothing.

The label is given (rather than leaving the graphic decorative) because inside a chip that already reads "Ruhepuls −8 bpm vs 48" to a screen reader, an unlabelled graphic is fine but a labelled one tells a screen-reader user the picture exists and what span it covers.

- [ ] **Step 3: Add a test for the chip integration**

Append to the existing `describe('InsightNudge', ...)` block in `frontend/src/components/narrative/__tests__/InsightNudge.test.tsx` (the file already has a `sig()` factory — extend the call, do not redefine the helper):

```tsx
  it('draws a sparkline in the chip when the signal carries a series', () => {
    const { container } = render(
      <InsightNudge
        polarity="opportunity" level="high" eyebrow="E" headline="H" recommendation="R"
        signals={[sig({ series: [50, 49, 48, 47, 45, 42, 40] })]}
        metricLabel={metricLabel}
      />,
    )
    expect(container.querySelector('svg polyline')).toBeTruthy()
  })

  it('omits the sparkline when the series is empty, keeping the chip text-only', () => {
    const { container } = render(
      <InsightNudge
        polarity="opportunity" level="high" eyebrow="E" headline="H" recommendation="R"
        signals={[sig({ series: [] })]}
        metricLabel={metricLabel}
      />,
    )
    expect(container.querySelector('svg polyline')).toBeNull()
  })
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: full suite green — 638 existing + 6 (Task 2) + 2 (this task) = 646 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/health.ts frontend/src/components/narrative/InsightNudge.tsx frontend/src/components/narrative/__tests__/InsightNudge.test.tsx
git commit -m "feat(narrative): the insight chips show the trend, not just the delta

Each cited signal now draws its own trailing window inside its chip, in
the card's existing accent colour. The series is optional on the
component's own type so a future chapter whose detector has none still
renders a text-only chip rather than breaking."
```

---

### Task 4: Verify at 390×844 and build

- [ ] **Step 1: Full gates**

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/ui/Sparkline.tsx src/components/narrative src/api/health.ts
```

Compare the eslint output against the same command with your changes stashed, so pre-existing findings are not attributed to this work.

- [ ] **Step 2: Render it against real data**

Dev servers: backend on `:8042`, frontend on `:5180` (`CORS_ORIGINS` allowlists only 5173 and 5180). DB on `:5433`.

**Restart the backend before rendering.** A long-running process started before this branch's code existed will serve the old response shape with no error and no series, which reads as "the sparkline doesn't work" when in fact it was never asked for. This exact trap cost real diagnosis time on the previous phase.

Manufacture a firing verdict in the local dev DB only (never any other database), record the original row values before changing them, and restore them afterward. The backend's own test fixture `test_sustained_rhr_and_hrv_improvement_is_high` has values proven to trigger a `high` opportunity; the newest reading must be dated to the athlete's local today or the endpoint's staleness gate returns no verdict.

At 390×844, load `/dashboard?tab=body` and judge by eye:

1. **The sparkline is legible as a shape** — not a smudge, not a hairline you have to hunt for. This is the one thing the whole plan is for, and no test can confirm it.
2. **It agrees with its own number.** A chip reading `−8 bpm` must show a curve that *descends* at the end. If the curve rises while the number says the value dropped, the series ordering is reversed — a real bug that every unit test above would still pass, since they only assert the last element and a non-NaN points string.
3. **It does not crowd the chip.** The chip must still read cleanly at 390px: label, sparkline, delta, `vs N`. If it wraps badly or the chips now overflow their row, reduce the sparkline width before shipping rather than after.
4. Screenshot it.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

Report the result and STOP — do not deploy. Deploy happens after the final whole-branch review.

---

## Self-Review

**Spec coverage.** "Area-filled curve" → Task 2's `path` with the gradient. "No dashed baseline line" → stated as a Global Constraint and in the component's own doc comment, so a future editor sees why. "7-point minimum" → Task 1's `_SPARK_MIN_POINTS`, tested. "Zero new data cost" → Task 1 reads only the `daily` list already passed in; asserted as a Global Constraint with an instruction to stop if a query appears. "Polarity inverts the colour" → Task 3 passes the card's existing `color`, so it inherits rather than deciding.

**The one thing tests cannot catch, called out explicitly.** Task 4 Step 2.2 checks that the curve's direction agrees with the delta's sign. Every unit test in this plan would pass with a reversed series, because they assert the last element's value and the absence of `NaN` — not the ordering. That check is deliberately a human-eye step, not a test, because the failure is visual and the fix (a `.reverse()`) is invisible in a green suite.

**Placeholder scan.** No TBDs; every code block is complete and copy-pasteable. `_SERIES_KEY` exists because two metric names (`resting_hr`→`rhr`, and the pass-throughs) differ between the signal dict and the `daily` dict — an easy silent `KeyError` if assumed identical.

**Type consistency.** `series` is `list[float]` in the Pydantic schema (default `[]`), `number[]` on the API type (required, since the backend always sends it), and `number[] | undefined` on `InsightNudgeSignal` (optional, so a future seriesless consumer still compiles). That asymmetry is deliberate and stated in Task 3 Step 2. `SparklineProps` is defined once in Task 2 and consumed with exactly those props in Task 3.
