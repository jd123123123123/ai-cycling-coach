# Period Report v2 — Depth & Engagement Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the Period Report up to the engagement bar of the Today readiness hero and the Coach brief: a rich multi-sentence coach narrative with evidence chips, a "Why this grade?" axis breakdown, dynamic weakness causes (live numbers via `why_am_i_tired`), a forward-looking next-step, plus premium visuals (animated grade ring, tier gradient, percentile-vs-own-history chip, composite-score sparkline).

**Architecture:** Extend the existing `period_report.py` service + schema with new pure helpers (`build_evidence`, `build_next_step`, `_percentile`) and a richer `build_report` that also computes a short historical composite series (for the percentile + sparkline), pulls `why_am_i_tired` causes, and feeds far more context to the Claude verdict. The frontend rebuilds `GradeHero` (SVG count-up ring, gradient, chips, sparkline) and adds `WhyThisGrade`, `CausesPanel`, and `NextStepCard`, wired into `ReportTab`.

**Tech Stack:** FastAPI + SQLAlchemy async + Pydantic; React 19 + TanStack Query + ECharts + existing `Sparkline`; Anthropic SDK (graceful fallback).

**Builds on:** `docs/superpowers/plans/2026-06-03-period-report.md` (v1, shipped on this branch).

---

## Conventions
- Pure helpers stay DB-free and unit-tested. `build_report` (async) orchestrates.
- Reuse existing helpers; do not reimplement metric math.
- Backend tests: `cd backend && uv run pytest`. Frontend: `cd frontend && npx tsc -b --noEmit 2>&1 | grep <file>` (project has ~22 PRE-EXISTING unrelated tsc errors — filter to touched files only).
- Respect language: keep copy plain; numbers in `detail`.

---

### Task 1: Schema additions

**Files:** Modify `backend/app/schemas/period_report.py`

- [ ] **Step 1: Add new models + fields**

Add these model classes (after `Milestone`):

```python
class EvidenceChip(BaseModel):
    """A compact metric chip shown under the verdict, e.g. CTL 58 / HRV -8%."""
    label: str
    value: str
    tone: str = Field(default="neutral", description="'good' | 'bad' | 'neutral'")


class Cause(BaseModel):
    """A ranked reason something is dragging, with live evidence numbers."""
    label: str
    severity: str = Field(description="'low' | 'med' | 'high'")
    evidence: str


class NextStep(BaseModel):
    """Forward-looking recommendation for the coming period."""
    headline: str
    detail: str
    tone: str = Field(default="neutral", description="'good' | 'caution' | 'bad' | 'neutral'")
```

Then add these fields to `PeriodReport` (after `grade_score`):

```python
    grade_delta: float | None = Field(default=None, description="composite vs previous window")
    grade_percentile: int | None = Field(default=None, description="0-100 rank vs recent history")
    composite_trend: list[float] = Field(default_factory=list, description="historical composite scores oldest→newest for a sparkline")
    evidence: list[EvidenceChip] = Field(default_factory=list)
    causes: list[Cause] = Field(default_factory=list)
    next_step: NextStep | None = None
```

- [ ] **Step 2: Verify import**

Run: `cd backend && uv run python -c "from app.schemas.period_report import PeriodReport, EvidenceChip, Cause, NextStep; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/period_report.py
git commit -m "feat(period-report): v2 schema — evidence, causes, next-step, trend, percentile"
```

---

### Task 2: Pure helpers — percentile, evidence chips, next-step

**Files:** Modify `backend/app/services/period_report.py`, `backend/tests/test_period_report.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_period_report.py`:

```python
class TestPercentile:
    def test_percentile_basic(self):
        from app.services.period_report import _percentile
        # value equal to the max of population -> 100; min -> low
        assert _percentile(90, [10, 50, 90]) == 100
        assert _percentile(10, [10, 50, 90]) == 33
        assert _percentile(50, [10, 50, 90]) == 67

    def test_percentile_empty_population_is_none(self):
        from app.services.period_report import _percentile
        assert _percentile(50, []) is None


class TestEvidence:
    def test_evidence_includes_ctl_and_tsb(self):
        from app.services.period_report import build_evidence
        chips = build_evidence(_full_window(), _full_window(avg_ctl=46.0))
        labels = {c.label for c in chips}
        assert "CTL" in labels and "TSB" in labels

    def test_hrv_chip_tone_good_when_rising(self):
        from app.services.period_report import build_evidence
        chips = build_evidence(_full_window(avg_hrv=66.0), _full_window(avg_hrv=60.0))
        hrv = next(c for c in chips if c.label == "HRV")
        assert hrv.tone == "good"

    def test_no_prev_still_emits_level_chips(self):
        from app.services.period_report import build_evidence
        chips = build_evidence(_full_window(), None)
        labels = {c.label for c in chips}
        assert "CTL" in labels  # level chips don't need a baseline


class TestNextStep:
    def test_high_severity_cause_means_back_off(self):
        from app.services.period_report import build_next_step
        from app.schemas.period_report import Cause
        step = build_next_step(
            grade_score=72.0, cur=_full_window(),
            causes=[Cause(label="HRV suppressed", severity="high", evidence="x")],
        )
        assert step.tone in ("caution", "bad")
        assert "back" in step.headline.lower() or "recover" in step.headline.lower()

    def test_strong_ramp_no_causes_means_build(self):
        from app.services.period_report import build_next_step
        step = build_next_step(
            grade_score=88.0, cur=_full_window(ctl_delta=5.0, avg_tsb=2.0), causes=[],
        )
        assert step.tone in ("good", "neutral")

    def test_low_consistency_flags_consistency(self):
        from app.services.period_report import build_next_step
        step = build_next_step(
            grade_score=60.0,
            cur=_full_window(training_days=1, days=7, ctl_delta=-1.0), causes=[],
        )
        assert "consisten" in (step.headline + step.detail).lower()
```

Run those classes — expect FAIL.

- [ ] **Step 2: Implement the helpers**

Append to `app/services/period_report.py`:

```python
def _percentile(value: float, population: list[float]) -> int | None:
    """Percent of `population` <= `value`, 0-100. None when population empty.
    Used for 'Top X% vs your recent history'."""
    if not population:
        return None
    n_le = sum(1 for p in population if p <= value)
    return round(n_le / len(population) * 100)


def build_evidence(cur: WindowMetrics, prev: WindowMetrics | None) -> list:
    """Compact metric chips for under the verdict — CoachBrief style. Level
    chips (CTL/TSB) always show; trend chips (HRV/RHR) only with a baseline."""
    from app.schemas.period_report import EvidenceChip
    chips: list[EvidenceChip] = []

    if cur.avg_ctl is not None:
        chips.append(EvidenceChip(label="CTL", value=str(round(cur.avg_ctl)), tone="neutral"))
    if cur.avg_tsb is not None:
        tsb = round(cur.avg_tsb)
        tone = "good" if tsb > 5 else "bad" if tsb < -20 else "neutral"
        chips.append(EvidenceChip(label="TSB", value=f"{tsb:+d}", tone=tone))
    if cur.total_tss:
        chips.append(EvidenceChip(label="TSS", value=str(round(cur.total_tss)), tone="neutral"))

    hrv_pct = _pct_change(cur.avg_hrv, prev.avg_hrv) if prev else None
    if hrv_pct is not None:
        chips.append(EvidenceChip(label="HRV", value=f"{hrv_pct:+.0f}%",
                                  tone="good" if hrv_pct >= 0 else "bad"))
    if cur.sleep_debt_hours is not None and cur.sleep_debt_hours >= 0.5:
        chips.append(EvidenceChip(label="Sleep debt", value=f"{cur.sleep_debt_hours:.1f}h",
                                  tone="bad" if cur.sleep_debt_hours >= 4 else "neutral"))
    if cur.grey_pct is not None and cur.grey_pct >= 20:
        chips.append(EvidenceChip(label="Grey zone", value=f"{round(cur.grey_pct)}%", tone="bad"))
    return chips


def build_next_step(grade_score: float | None, cur: WindowMetrics, causes: list) -> object:
    """Rule-based forward recommendation, safety-leaning. A high-severity cause
    or deep-negative form always wins (back off); else build/hold/consistency."""
    from app.schemas.period_report import NextStep

    high = any(getattr(c, "severity", None) == "high" for c in causes)
    deep_neg_form = cur.avg_tsb is not None and cur.avg_tsb < -20
    ratio = cur.training_days / cur.days if cur.days else 0.0
    ramp = cur.ctl_delta if cur.ctl_delta is not None else 0.0

    if high or deep_neg_form:
        return NextStep(
            headline="Back off and recover",
            detail=("Your recovery signals are flashing. Take 2-3 easy days or a rest day "
                    "before any hard efforts — adaptation happens when you absorb load, not "
                    "when you pile more on."),
            tone="bad",
        )
    if ratio < 0.3:
        return NextStep(
            headline="Build the habit first",
            detail=(f"You trained {cur.training_days} of {cur.days} days. Consistency beats "
                    "intensity — aim for one more short session next week before chasing big days."),
            tone="caution",
        )
    if ramp >= 4.0:
        return NextStep(
            headline="Strong build — watch the ramp",
            detail=("Fitness is climbing fast. Keep the stimulus but hold the weekly load "
                    "increase under ~8% (Friel's cap) and bank a recovery week soon to lock it in."),
            tone="good",
        )
    if grade_score is not None and grade_score >= 80:
        return NextStep(
            headline="Keep doing what works",
            detail=("Balanced, productive window. Repeat the structure — maybe nudge one "
                    "session's quality up — and protect your sleep and easy days."),
            tone="good",
        )
    return NextStep(
        headline="Hold steady and sharpen",
        detail=("Solid base. Add a touch more polarized intensity (hard days hard, easy days "
                "easy) and keep the grey-zone tempo work in check to move the needle."),
        tone="neutral",
    )
```

Run the new classes — expect PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report.py
git commit -m "feat(period-report): percentile, evidence chips, next-step helpers"
```

---

### Task 3: Enrich build_report (delta, percentile, trend, causes, evidence, richer verdict)

**Files:** Modify `backend/app/services/period_report.py`

- [ ] **Step 1: Add a small async helper for historical composites**

Add the import at the top imports block (with the other `from app.services...` imports):
```python
import asyncio

from app.services.advanced_metrics import why_am_i_tired
```

Append this helper to the module:

```python
async def _historical_composites(
    db: AsyncSession, user_id: int, days: int, ftp: int | None,
    n_samples: int = 8, step_days: int = 7,
) -> list[float]:
    """Composite grade for `n_samples` trailing windows stepped back weekly,
    oldest→newest. Powers the percentile rank and the hero sparkline. Windows
    are fetched concurrently to bound latency."""
    today = date.today()
    starts_ends = []
    for i in range(n_samples - 1, -1, -1):  # oldest first
        end = today - timedelta(days=i * step_days)
        start = end - timedelta(days=days - 1)
        starts_ends.append((start, end))

    metrics = await asyncio.gather(
        *[_fetch_window_metrics(db, user_id, s, e, ftp) for s, e in starts_ends]
    )
    scores: list[float] = []
    for wm in metrics:
        score, _ = composite_grade(build_radar(wm, None))
        if score is not None:
            scores.append(round(score, 1))
    return scores
```

- [ ] **Step 2: Rewrite build_report to populate the new fields**

Replace the existing `build_report` body with:

```python
async def build_report(db: AsyncSession, user_id: int, days: int):
    """Assemble the full PeriodReport for the last `days` days vs the previous
    equal window, enriched with evidence, causes, a forward next-step, a
    historical composite trend, and a richer coach verdict."""
    from app.schemas.period_report import PeriodReport

    days = max(3, min(int(days), 365))
    today = date.today()
    end = today
    start = today - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)

    ftp = await _fetch_athlete_ftp(db, user_id)
    cur = await _fetch_window_metrics(db, user_id, start, end, ftp)
    prev = await _fetch_window_metrics(db, user_id, prev_start, prev_end, ftp)
    has_baseline = (prev.activity_count > 0 or prev.pmc_days > 0
                    or prev.biometric_days > 0)
    prev_for_calc = prev if has_baseline else None

    radar = build_radar(cur, prev_for_calc)
    grade_score, grade_letter = composite_grade(radar)

    # Grade delta vs previous equal window
    grade_delta = None
    if has_baseline and grade_score is not None:
        prev_score, _ = composite_grade(build_radar(prev, None))
        if prev_score is not None:
            grade_delta = round(grade_score - prev_score, 1)

    # Historical composite series → percentile + sparkline
    trend = await _historical_composites(db, user_id, days, ftp)
    grade_percentile = (
        _percentile(grade_score, trend) if grade_score is not None and trend else None
    )

    improvements, weaknesses = build_deltas(cur, prev_for_calc)
    milestones = build_milestones(cur)
    evidence = build_evidence(cur, prev_for_calc)

    # Causes (why am I dragging) — reuse the today-anchored synthesizer.
    causes: list = []
    try:
        from app.schemas.period_report import Cause
        wt = await why_am_i_tired(db, user_id)
        for c in (wt.get("causes") or [])[:4]:
            causes.append(Cause(label=c["label"], severity=c["severity"], evidence=c["evidence"]))
    except Exception:  # noqa: BLE001
        logger.exception("why_am_i_tired failed in period report")

    next_step = build_next_step(grade_score, cur, causes)

    verdict, model = await _ai_verdict(
        days, grade_letter, grade_score, improvements, weaknesses,
        evidence=evidence, next_step=next_step,
    )

    return PeriodReport(
        days=days,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        prev_start_date=prev_start.isoformat(),
        prev_end_date=prev_end.isoformat(),
        has_baseline=has_baseline,
        grade_letter=grade_letter,
        grade_score=grade_score,
        grade_delta=grade_delta,
        grade_percentile=grade_percentile,
        composite_trend=trend,
        radar=radar,
        improvements=improvements,
        weaknesses=weaknesses,
        milestones=milestones,
        evidence=evidence,
        causes=causes,
        next_step=next_step,
        ai_verdict=verdict,
        ai_model=model,
    )
```

- [ ] **Step 3: Upgrade `_ai_verdict` signature + prompt for richer output**

Replace `_ai_verdict` with this version (adds `evidence`/`next_step` context, raises the cap, richer system prompt; the rule-based fallback now appends the next-step headline):

```python
_VERDICT_SYSTEM = (
    "You are an elite endurance coach writing an athlete's training-window review. "
    "Write 3-4 sentences, plain and direct, second person. Open with the headline "
    "verdict, cite 2-3 REAL numbers from the data (CTL, TSB, HRV %, sleep, grey-zone), "
    "name the single biggest win and the single biggest risk, and end with the one "
    "thing to do next. No platitudes, no emoji, no hedging, no bullet lists. "
    "Keep it under 600 characters."
)


async def _ai_verdict(
    days: int,
    grade_letter: str | None,
    grade_score: float | None,
    improvements: list,
    weaknesses: list,
    evidence: list | None = None,
    next_step: object | None = None,
) -> tuple[str, str]:
    """Return (verdict_text, model_used). Falls back to a rule-based string when
    no API key is set or the call fails — mirrors /analytics/summarize."""
    top_imp = improvements[0].label if improvements else None
    top_weak = weaknesses[0].label if weaknesses else None
    fallback = _rule_based_verdict(days, grade_letter, grade_score, top_imp, top_weak)
    if next_step is not None:
        fallback = (fallback + f" Next: {next_step.headline.lower()}.")[:600]

    if not settings.ANTHROPIC_API_KEY:
        return fallback, "rule-based-fallback"

    ev = ", ".join(f"{c.label} {c.value}" for c in (evidence or [])) or "n/a"
    step = f"{next_step.headline} — {next_step.detail}" if next_step is not None else "n/a"
    user_msg = (
        f"Window: last {days} days\n"
        f"Grade: {grade_letter} ({grade_score}/100)\n"
        f"Evidence: {ev}\n"
        f"Improvements: {[i.detail for i in improvements[:4]]}\n"
        f"Weaknesses: {[w.detail for w in weaknesses[:4]]}\n"
        f"Recommended next step: {step}\n"
    )
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=320,
            system=[{"type": "text", "text": _VERDICT_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_msg}],
        )
        text = ""
        for block in getattr(response, "content", None) or []:
            block_text = getattr(block, "text", None)
            if block_text:
                text += block_text
        text = text.strip()
        if not text:
            raise RuntimeError("empty Claude response")
        return text[:600], settings.COACH_MODEL
    except Exception as exc:  # noqa: BLE001
        logger.exception("Period-report verdict failed: %s", exc)
        return fallback, "rule-based-fallback"
```

- [ ] **Step 4: Verify import + full backend suite**

Run: `cd backend && uv run python -c "from app.services.period_report import build_report; print('ok')"` → `ok`
Run: `cd backend && uv run pytest tests/test_period_report.py -q` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py
git commit -m "feat(period-report): enrich report — delta, percentile, trend, causes, evidence, richer verdict"
```

- [ ] **Step 6: Restart backend if running without reload, then authenticated smoke is covered in Task 8.**

---

### Task 4: Frontend types

**Files:** Modify `frontend/src/api/report.ts`

- [ ] **Step 1: Add the new interfaces + fields**

Add these interfaces (before `PeriodReport`):

```typescript
export interface EvidenceChip {
  label: string
  value: string
  tone: string
}

export interface Cause {
  label: string
  severity: string
  evidence: string
}

export interface NextStep {
  headline: string
  detail: string
  tone: string
}
```

Add these fields to the `PeriodReport` interface (after `grade_score`):

```typescript
  grade_delta: number | null
  grade_percentile: number | null
  composite_trend: number[]
  evidence: EvidenceChip[]
  causes: Cause[]
  next_step: NextStep | null
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep "api/report"` → no output.
```bash
git add frontend/src/api/report.ts
git commit -m "feat(period-report): v2 frontend types"
```

---

### Task 5: GradeHero v2 — count-up ring, gradient, chips, sparkline

**Files:** Overwrite `frontend/src/components/report/GradeHero.tsx`

- [ ] **Step 1: Replace the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import Sparkline from '../dashboard/Sparkline'
import type { PeriodReport, EvidenceChip } from '../../api/report'

function gradeColor(letter: string | null): string {
  if (!letter) return 'var(--color-muted)'
  const c = letter[0]
  if (c === 'A') return 'var(--color-good)'
  if (c === 'B') return 'var(--color-ink)'
  if (c === 'C') return 'var(--color-caution)'
  return 'var(--color-bad)'
}

function chipColor(tone: string): string {
  if (tone === 'good') return 'var(--color-good)'
  if (tone === 'bad') return 'var(--color-bad)'
  return 'var(--color-ink-2)'
}

/** Animated count-up of a 0-100 score over ~900ms (ease-out). */
function useCountUp(target: number | null, duration = 900): number {
  const [val, setVal] = useState(0)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    if (target == null) { setVal(0); return }
    let raf = 0
    const tick = (t: number) => {
      if (startRef.current == null) startRef.current = t
      const p = Math.min(1, (t - startRef.current) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); startRef.current = null }
  }, [target, duration])
  return val
}

function GradeRing({ score, letter, color }: { score: number | null; letter: string | null; color: string }) {
  const animated = useCountUp(score)
  const R = 46
  const C = 2 * Math.PI * R
  const pct = score == null ? 0 : Math.min(1, animated / 100)
  return (
    <div className="relative shrink-0" style={{ width: 112, height: 112 }}>
      <svg width={112} height={112} viewBox="0 0 112 112">
        <circle cx={56} cy={56} r={R} fill="none" stroke="var(--color-rule)" strokeWidth={8} />
        <circle
          cx={56} cy={56} r={R} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 56 56)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="leading-none" style={{ color, fontSize: 34, fontWeight: 600 }}>
          {letter ?? '—'}
        </span>
        {score != null && (
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 11, marginTop: 2 }}>
            {Math.round(animated)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function GradeHero({ report }: { report: PeriodReport }) {
  const color = gradeColor(report.grade_letter)
  const delta = report.grade_delta
  return (
    <div
      className="relative rounded-[18px] p-5 sm:p-6 overflow-hidden"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        backgroundImage: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${color} 12%, transparent), transparent 60%)`,
      }}
    >
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          PERIOD REPORT · {report.days} DAYS
        </span>
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
          {report.has_baseline ? `vs previous ${report.days} days` : 'no baseline yet'}
        </span>
      </div>

      <div className="flex items-start gap-5">
        <GradeRing score={report.grade_score} letter={report.grade_letter} color={color} />

        <div className="flex-1 min-w-0">
          {/* delta + percentile chips */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {delta != null && delta !== 0 && (
              <span className="num-mono" style={{
                fontSize: 11, color: delta > 0 ? 'var(--color-good)' : 'var(--color-bad)',
              }}>
                {delta > 0 ? '▲' : '▼'}{Math.abs(delta)} vs last {report.days}d
              </span>
            )}
            {report.grade_percentile != null && (
              <span className="num-mono px-2 py-0.5 rounded-full" style={{
                fontSize: 10, color: 'var(--color-ink-2)',
                backgroundColor: 'color-mix(in srgb, var(--color-ink) 6%, transparent)',
              }}>
                Top {Math.max(1, 100 - report.grade_percentile)}% · your history
              </span>
            )}
            {report.composite_trend.length >= 3 && (
              <Sparkline values={report.composite_trend} width={90} height={22} stroke="var(--color-ink-2)" showDot={false} />
            )}
          </div>

          <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: 'var(--color-ink)', maxWidth: '60ch' }}>
            {report.ai_verdict}
          </p>

          {/* evidence chips */}
          {report.evidence.length > 0 && (
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-3">
              {report.evidence.map((c: EvidenceChip, i: number) => (
                <span key={i} className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                  {c.label} <span style={{ color: chipColor(c.tone) }}>{c.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "GradeHero|Sparkline"` → no output. (If `Sparkline` props differ, open `src/components/dashboard/Sparkline.tsx` and match its real prop names — it is used by `TrendsHero.tsx` as `<Sparkline values={...} width={180} height={36} stroke="..." showDot={false} />`.)
```bash
git add frontend/src/components/report/GradeHero.tsx
git commit -m "feat(period-report): GradeHero v2 — count-up ring, gradient, chips, sparkline"
```

---

### Task 6: WhyThisGrade, CausesPanel, NextStepCard

**Files:** Create three components under `frontend/src/components/report/`

- [ ] **Step 1: Create `WhyThisGrade.tsx`**

```tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { RadarAxis } from '../../api/report'

/** Collapsible per-axis breakdown — the report's "Why this score?" panel.
 * Renders each axis's score as a bar + the backend detail string. */
export default function WhyThisGrade({ axes }: { axes: RadarAxis[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[18px]" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4"
      >
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
          WHY THIS GRADE
        </span>
        <ChevronDown size={16} style={{ color: 'var(--color-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {axes.map((a) => (
            <div key={a.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span style={{ color: 'var(--color-ink)', fontSize: 13 }}>{a.label}</span>
                <span className="num-mono" style={{ color: a.insufficient_data ? 'var(--color-muted)' : 'var(--color-ink-2)', fontSize: 12 }}>
                  {a.score == null ? '—' : Math.round(a.score)}
                </span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 5, backgroundColor: 'var(--color-rule)' }}>
                <div style={{
                  height: '100%', width: `${a.score ?? 0}%`,
                  backgroundColor: a.insufficient_data ? 'var(--color-muted)' : 'var(--color-good)',
                  transition: 'width 600ms var(--ease-apple-default, ease)',
                }} />
              </div>
              {a.detail && (
                <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{a.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `CausesPanel.tsx`**

```tsx
import { AlertTriangle } from 'lucide-react'
import type { Cause } from '../../api/report'

const SEV_COLOR: Record<string, string> = {
  high: 'var(--color-bad)',
  med: 'var(--color-caution)',
  low: 'var(--color-muted)',
}

/** "What's holding you back" — severity-ranked causes with live evidence.
 * Renders nothing when there are no causes. */
export default function CausesPanel({ causes }: { causes: Cause[] }) {
  if (causes.length === 0) return null
  return (
    <div className="rounded-[18px] p-5 sm:p-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        WHAT'S HOLDING YOU BACK
      </span>
      <div className="flex flex-col gap-3 mt-3">
        {causes.map((c, i) => {
          const color = SEV_COLOR[c.severity] ?? 'var(--color-muted)'
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5" style={{ color }}>
                <AlertTriangle size={15} strokeWidth={2} />
              </span>
              <div className="flex flex-col">
                <span style={{ color: 'var(--color-ink)', fontSize: 13.5 }}>{c.label}</span>
                <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{c.evidence}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `NextStepCard.tsx`**

```tsx
import { ArrowRight } from 'lucide-react'
import type { NextStep } from '../../api/report'

const TONE_COLOR: Record<string, string> = {
  good: 'var(--color-good)',
  caution: 'var(--color-caution)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-ink)',
}

/** Forward-looking recommendation — the report's actionable payoff. */
export default function NextStepCard({ step }: { step: NextStep }) {
  const accent = TONE_COLOR[step.tone] ?? 'var(--color-ink)'
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        DO THIS NEXT
      </span>
      <div className="flex items-center gap-2 mt-2">
        <ArrowRight size={18} strokeWidth={2.2} style={{ color: accent }} />
        <span style={{ color: 'var(--color-ink)', fontSize: 16, fontWeight: 600 }}>{step.headline}</span>
      </div>
      <p className="mt-2 leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 14, maxWidth: '64ch' }}>
        {step.detail}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Type-check + commit**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "WhyThisGrade|CausesPanel|NextStepCard"` → no output.
```bash
git add frontend/src/components/report/WhyThisGrade.tsx frontend/src/components/report/CausesPanel.tsx frontend/src/components/report/NextStepCard.tsx
git commit -m "feat(period-report): WhyThisGrade, CausesPanel, NextStepCard"
```

---

### Task 7: Wire new sections into ReportTab

**Files:** Modify `frontend/src/components/dashboard/tabs/ReportTab.tsx`

- [ ] **Step 1: Add imports**

After the existing `MilestoneStrip` import, add:
```tsx
import WhyThisGrade from '../../report/WhyThisGrade'
import CausesPanel from '../../report/CausesPanel'
import NextStepCard from '../../report/NextStepCard'
```

- [ ] **Step 2: Place the new sections**

In the `{report && ( ... )}` block: keep `GradeHero` first. Immediately AFTER `<BodySystemRadar axes={report.radar} />`, add:
```tsx
          <WhyThisGrade axes={report.radar} />
```
AFTER the improvements/weaknesses grid `</div>` (the closing of the two-column grid) and BEFORE `<MilestoneStrip .../>`, add:
```tsx
          <CausesPanel causes={report.causes} />
```
AFTER `<MilestoneStrip milestones={report.milestones} />`, add:
```tsx
          {report.next_step && <NextStepCard step={report.next_step} />}
```

- [ ] **Step 3: Type-check + lint + commit**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "ReportTab"` → no output.
```bash
git add frontend/src/components/dashboard/tabs/ReportTab.tsx
git commit -m "feat(period-report): wire WhyThisGrade, Causes, NextStep into ReportTab"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1:** Ensure backend (`uv run uvicorn app.main:app --port 8000 --reload`) + frontend (`npm run dev`) are running and the DB is up.
- [ ] **Step 2:** Drive the app to `/dashboard?tab=report`, wait for "DO THIS NEXT" to appear, and screenshot. Verify: animated grade ring + score, delta/percentile chips, composite sparkline, evidence chips, a 3-4 sentence verdict, "Why this grade" expands to the 5 axis bars + detail strings, "What's holding you back" causes (if any), and the "Do this next" card. Switch 7/14/30/custom and confirm re-fetch. **Look at the screenshot** — confirm no overflow/blank panels and the ring is filled to the right proportion.
- [ ] **Step 3:** Run full backend suite: `cd backend && uv run pytest -q` → all pass.

---

## Self-Review

**Spec coverage:** Rich coach narrative → Task 3 (`_ai_verdict` upgrade + evidence/next_step context). "Why this grade?" breakdown → Task 6 `WhyThisGrade` (renders existing axis `detail`). Dynamic weakness causes → Task 3 (`why_am_i_tired` → `causes`) + Task 6 `CausesPanel`. Forward next-step → Task 2 `build_next_step` + Task 6 `NextStepCard`. Full visuals: animated ring + gradient → Task 5; percentile chip + delta → Tasks 3/5; composite sparkline → Tasks 3/5. ✓

**Placeholder scan:** none — all steps carry complete code. ✓

**Type consistency:** `EvidenceChip`/`Cause`/`NextStep` fields match between Pydantic (Task 1) and TS (Task 4). `composite_trend: list[float]` ↔ `number[]`. `_ai_verdict` new kwargs (`evidence`, `next_step`) are optional, so any other caller stays valid. `build_next_step` returns `NextStep`; `build_evidence` returns `list[EvidenceChip]`. `_percentile` returns `int | None`. ✓

**Notes for executor:** `why_am_i_tired(db, user_id)` is today-anchored (7/14/28d lookbacks) — appropriate because the current window always ends today. `_historical_composites` fetches 8 windows concurrently via `asyncio.gather`; if latency is a concern on large accounts, reduce `n_samples`. The percentile chip shows "Top X%" where `X = 100 - percentile` (higher score = better rank).
