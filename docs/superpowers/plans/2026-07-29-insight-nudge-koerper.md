# Insight Nudge — Körper Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a genuine, earned "opportunity" (good-news) verdict to the existing morning-health detector, and extract a shared `InsightNudge` frontend shell so the same visual pattern is ready for the next three chapters.

**Architecture:** `morning_health_detector.py` already has the exact discipline this needs (individual-baseline, cluster-and-corroborator, honest `'none'`) — this plan mirrors it in the positive direction rather than inventing a new mechanism. The frontend split follows the `CoachRead`/`MomentCard` pattern already used twice this session: extract a shared, tested shell; keep the chapter-specific wrapper thin.

**Tech Stack:** FastAPI + Pydantic + pytest (backend); React 19 + TypeScript + vitest + jsdom + @testing-library/react (frontend).

## Global Constraints

- **Individual baseline only, never population norms.** Every threshold compares an athlete's reading against their own rolling history.
- **Conservative by construction.** A verdict must be earned by a real cluster (≥2 core markers) or one strong core marker plus a corroborator — never a single mild, isolated signal. This is the exact rule that Phase 2b's final review found missing from Körper's "Moment" card (a noise-level deviation rendered a literal `"−0"` as evidence); it is not optional here.
- **A single good night is not a story.** The opportunity verdict requires the improvement to hold for the last 2 days, not just today — mirroring "a single bad night is not illness" on the warning side.
- **Honest `'none'`.** Missing or too-thin baseline → `'none'`, never a guess. `signals` is `[]` and `headline`/`recommendation` are `None` whenever `level == 'none'`.
- **Bike-only. German + English on every string** — `headline_de`/`headline_en` pairs, no untranslated copy.
- **No new colour tokens.** Opportunity uses `--color-recovery` (already the app's "good" token); warning keeps its existing `--color-stand`/`--color-amber`/`--color-move` escalation.
- **Mobile-only**, 390×844 target.
- **Scope correction from the spec, recorded here rather than silently applied:** the design spec describes widening `MorningHealthCheck` into a renamed, fully generic `InsightNudge` Pydantic/TypeScript type. This plan does NOT rename that type. Renaming it now would be speculative — no second chapter's detector exists yet to consume a generic type, and this session's own pattern (`CoachRead`, `MomentCard`) has been to keep shared *components* generic while keeping *data types* concrete until a second real consumer exists. `MorningHealthCheck` gains one new field, `polarity`, and keeps its name. The shared piece extracted in this plan is the **frontend shell component**, named `InsightNudge.tsx` — that part of the spec is implemented as designed.
- Pre-existing lint/typecheck findings are not yours to fix: `frontend/src/auraprobe.tsx` and `frontend/aura.html` are untracked scratch files; other pre-existing findings noted in earlier plans stand.

---

## File Structure

**Backend, modify:**
- `backend/app/services/morning_health_detector.py` — add opportunity signal helpers, an opportunity verdict function, opportunity copy, and a `polarity` field on every returned dict.
- `backend/app/schemas/morning_health.py` — add `polarity: Literal["warning", "opportunity"] | None = None` to `MorningHealthCheck`.
- `backend/app/api/health.py` — thread `polarity` through the endpoint's three `MorningHealthCheck(...)` construction sites.
- `backend/tests/services/test_morning_health_detector.py` — new tests for the opportunity path; existing tests are field-level assertions (no exact-dict comparisons), so they are unaffected by the new field.

**Frontend, create:**
- `frontend/src/components/narrative/InsightNudge.tsx` — the shared shell.
- `frontend/src/components/narrative/__tests__/InsightNudge.test.tsx`

**Frontend, modify:**
- `frontend/src/api/health.ts` — widen `MorningHealthCheck` and `MorningHealthSignal` interfaces.
- `frontend/src/components/dashboard/MorningHealthCard.tsx` — becomes a thin wrapper around `InsightNudge`.

---

### Task 1: Backend — the opportunity verdict

**Files:**
- Modify: `backend/app/services/morning_health_detector.py`
- Test: `backend/tests/services/test_morning_health_detector.py`

**Interfaces:**
- Consumes: nothing new — same `daily: list[dict]` input shape already documented on `detect_morning_health`.
- Produces: `detect_morning_health()` now always includes a `"polarity"` key in its return dict: `"warning"` when the existing illness path fires, `"opportunity"` when the new path fires, `None` when `level == "none"`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/test_morning_health_detector.py` (the file already imports `date`, `timedelta`, `detect_morning_health`, and has `_series`/`_today` helpers — reuse them):

```python
def _opp_series(n: int, *, end_days_ago: int = 0, **over):
    """Like `_series`, but lets the caller override the LAST `end_days_ago`
    entries — used to build a sustained-improvement window at the tail."""
    base = _series(n)
    return base


class TestOpportunityInsufficientData:
    def test_single_good_day_is_not_a_story(self):
        # Today's RHR is well below baseline, but YESTERDAY was ordinary —
        # the improvement has not been sustained, so this must not fire.
        daily = _series(20) + [_today(rhr=40)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"
        assert out["polarity"] is None

    def test_too_few_days_for_the_sustain_window_is_none(self):
        daily = _series(1) + [_today(rhr=40)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"
        assert out["polarity"] is None


class TestOpportunityCluster:
    def test_sustained_rhr_and_hrv_improvement_is_high(self):
        # Two days running: RHR clearly below baseline (48 -> 40) AND HRV
        # clearly above baseline (65 -> 85) — both core markers, both strong.
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 40, "hrv": 85, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=40, hrv=85),
        ]
        out = detect_morning_health(daily)
        assert out["level"] == "high"
        assert out["polarity"] == "opportunity"
        metrics = {s["metric"] for s in out["signals"]}
        assert {"resting_hr", "hrv"} <= metrics

    def test_sustained_mild_two_marker_improvement_is_elevated(self):
        # RHR 48->43 (mild improvement, ~5 below) and HRV 65->72 (mild, ~11%
        # above) held for two days.
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 43, "hrv": 72, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=43, hrv=72),
        ]
        out = detect_morning_health(daily)
        assert out["level"] == "elevated"
        assert out["polarity"] == "opportunity"

    def test_single_marker_alone_is_watch_not_elevated(self):
        # Only RHR improves (sustained, strong); HRV stays at baseline.
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 39, "hrv": 65, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=39, hrv=65),
        ]
        out = detect_morning_health(daily)
        assert out["level"] == "watch"
        assert out["polarity"] == "opportunity"

    def test_a_recent_illness_signal_still_takes_priority_over_any_improvement(self):
        # RHR is up (illness direction) — even if some other metric looked
        # good, the warning path must win; the two are checked in order and
        # the warning is never silently downgraded to good news.
        daily = _series(20) + [_today(rhr=56)]
        out = detect_morning_health(daily)
        assert out["level"] == "watch"
        assert out["polarity"] == "warning"


class TestOpportunityRecommendationWording:
    def test_high_opportunity_recommendation_is_encouraging_not_alarmed(self):
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 40, "hrv": 85, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=40, hrv=85),
        ]
        out = detect_morning_health(daily)
        assert out["headline_de"] is not None
        assert "Ruhepuls" in out["recommendation_de"] or "HRV" in out["recommendation_de"]
        # Never medicalized wording on the good-news path.
        assert "Arzt" not in out["recommendation_de"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_morning_health_detector.py -k Opportunity -v`
Expected: FAIL — `KeyError: 'polarity'` or assertion failures, since the field and the opportunity path don't exist yet.

- [ ] **Step 3: Add the opportunity constants and signal helpers**

In `backend/app/services/morning_health_detector.py`, add near the other threshold constants (after the `_SLEEP_POOR_DROP` block):

```python
# ── Opportunity (good-news) side ─────────────────────────────────────────────
# Same evidence base as the illness thresholds above (Hedelin 2000; Buchheit
# 2014 for RHR; Plews 2013 for HRV) — a meaningful RHR drop or HRV rise below/
# above the athlete's own baseline is understood as the same underlying
# parasympathetic-recovery signal in reverse, so the magnitudes are mirrored
# rather than invented fresh. What differs from the illness side is TIMING:
# a single good night proves nothing (same reason a single bad night isn't
# illness), so this requires the improvement to hold for `_SUSTAIN_DAYS`
# consecutive mornings, not just today.
_SUSTAIN_DAYS = 2
_SLEEP_GOOD_RISE = 15.0  # mirrors _SLEEP_POOR_DROP


def _opportunity_rhr(daily: list[dict]) -> dict | None:
    """RHR held meaningfully BELOW baseline for the last `_SUSTAIN_DAYS` days."""
    if len(daily) < _SUSTAIN_DAYS:
        return None
    recent = daily[-_SUSTAIN_DAYS:]
    prior = daily[:-_SUSTAIN_DAYS][-_BASELINE_WINDOW:]
    hist = [x for d in prior if (x := _num(d.get("rhr"))) is not None]
    vals = [x for d in recent if (x := _num(d.get("rhr"))) is not None]
    if len(vals) < _SUSTAIN_DAYS or len(hist) < _MIN_BASELINE_N:
        return None
    base = statistics.median(hist)
    sd = statistics.stdev(hist) if len(hist) >= 2 else 0.0
    deltas = [v - base for v in vals]  # negative = improved (lower RHR)
    least_good = max(deltas)  # the least-impressive day in the window decides
    mild_ok = least_good <= -_RHR_MILD_BPM or (sd > 0 and least_good <= -_RHR_MILD_SD * sd)
    if not mild_ok:
        return None
    strong = least_good <= -_RHR_STRONG_BPM or (sd > 0 and least_good <= -_RHR_STRONG_SD * sd)
    today_delta = vals[-1] - base
    return {
        "metric": "resting_hr", "value": round(vals[-1], 1), "baseline": round(base, 1),
        "direction": "down", "delta": round(today_delta, 1), "unit": "bpm",
        "triggered": True, "severity": "strong" if strong else "mild",
    }


def _opportunity_hrv(daily: list[dict]) -> dict | None:
    """HRV held meaningfully ABOVE baseline for the last `_SUSTAIN_DAYS` days."""
    if len(daily) < _SUSTAIN_DAYS:
        return None
    recent = daily[-_SUSTAIN_DAYS:]
    prior = daily[:-_SUSTAIN_DAYS][-_BASELINE_WINDOW:]
    hist_ln = [x for d in prior if (x := _ln(d.get("hrv"))) is not None]
    hist_raw = [x for d in prior if (x := _num(d.get("hrv"))) is not None]
    recent_ln = [x for d in recent if (x := _ln(d.get("hrv"))) is not None]
    recent_raw = [x for d in recent if (x := _num(d.get("hrv"))) is not None]
    if len(recent_ln) < _SUSTAIN_DAYS or len(hist_ln) < _MIN_BASELINE_N or not hist_raw:
        return None
    mu = statistics.mean(hist_ln)
    sd = statistics.stdev(hist_ln) if len(hist_ln) >= 2 else 0.0
    base_raw = statistics.median(hist_raw)
    least_good_ln = min(recent_ln)
    least_good_pct = min(((v - base_raw) / base_raw * 100.0) for v in recent_raw) if base_raw else 0.0
    mild_ok = (sd > 0 and least_good_ln > mu + _HRV_MILD_SD * sd) or least_good_pct >= -_HRV_MILD_PCT
    if not mild_ok:
        return None
    strong = (sd > 0 and least_good_ln > mu + _HRV_STRONG_SD * sd) or least_good_pct >= -_HRV_STRONG_PCT
    today_v = recent_raw[-1]
    today_pct = (today_v - base_raw) / base_raw * 100.0 if base_raw else 0.0
    return {
        "metric": "hrv", "value": round(today_v, 1), "baseline": round(base_raw, 1),
        "direction": "up", "delta": round(today_pct, 1), "unit": "%",
        "triggered": True, "severity": "strong" if strong else "mild",
    }


def _sleep_opportunity_signal(today: dict, prior: list[dict]) -> dict | None:
    """Well-rested corroborator — single-day, same role sleep plays as a
    corroborator (never a lone trigger) on the illness side."""
    v = _num(today.get("sleep_score"))
    hist = [x for d in prior if (x := _num(d.get("sleep_score"))) is not None]
    if v is None:
        return None
    base = statistics.median(hist) if len(hist) >= _MIN_BASELINE_N else None
    triggered = base is not None and (v - base) >= _SLEEP_GOOD_RISE
    return {
        "metric": "sleep_score", "value": round(v),
        "baseline": round(base) if base is not None else None,
        "direction": "up", "delta": round(v - base) if base is not None else None,
        "unit": "", "triggered": bool(triggered), "severity": "mild",
    }
```

- [ ] **Step 4: Add the opportunity verdict and copy**

Add, after `_sleep_opportunity_signal`:

```python
def _opportunity_verdict(daily: list[dict], today: dict, prior: list[dict]) -> dict:
    rhr_opp = _opportunity_rhr(daily)
    hrv_opp = _opportunity_hrv(daily)
    sleep_opp = _sleep_opportunity_signal(today, prior)

    core = [s for s in (rhr_opp, hrv_opp) if s and s["triggered"]]
    n_core = len(core)
    strong_core = sum(1 for s in core if s["severity"] == "strong")
    corroborated = bool(sleep_opp and sleep_opp["triggered"])

    if n_core >= 2 and strong_core >= 1:
        level: Level = "high"
    elif n_core >= 2:
        level = "elevated"
    elif n_core >= 1 and strong_core >= 1 and corroborated:
        level = "elevated"
    elif n_core >= 1 and (strong_core >= 1 or corroborated):
        level = "watch"
    else:
        level = "none"

    if level == "none":
        return _none(None, None, signals=[])

    signals = [_public(s) for s in (rhr_opp, hrv_opp, sleep_opp) if s and s["triggered"]]
    reco_de, reco_en, head_de, head_en = _opportunity_copy(level, signals)
    return {
        "level": level,
        "polarity": "opportunity",
        "signals": signals,
        "headline_de": head_de,
        "headline_en": head_en,
        "recommendation_de": reco_de,
        "recommendation_en": reco_en,
    }


def _opportunity_copy(level: Level, signals: list[dict]) -> tuple[str, str, str, str]:
    order = {"resting_hr": 0, "hrv": 1, "sleep_score": 2}
    cited = sorted(signals, key=lambda s: order.get(s["metric"], 9))[:3]
    de_markers = ", ".join(_fmt(s, True) for s in cited)
    en_markers = ", ".join(_fmt(s, False) for s in cited)

    if level == "watch":
        head_de, head_en = "Gute Erholung", "Solid recovery"
        reco_de = (
            f"Deine Morgenwerte sehen gut aus ({de_markers}). Ein guter Tag, "
            "um Qualität abzurufen, wenn dein Plan es hergibt."
        )
        reco_en = (
            f"Your morning vitals look good ({en_markers}). A solid day to "
            "bring quality, if your plan calls for it."
        )
    elif level == "elevated":
        head_de, head_en = "Starke Erholung", "Strong recovery"
        reco_de = (
            f"Mehrere Tage in Folge deutlich über deiner Baseline ({de_markers}) "
            "— dein Körper erholt sich gut von der letzten Belastung."
        )
        reco_en = (
            f"Several days running clearly above your baseline ({en_markers}) "
            "— your body is recovering well from recent load."
        )
    else:  # high
        head_de, head_en = "Ausgezeichnete Form", "Excellent form"
        reco_de = (
            f"Deine Werte zeigen anhaltend starke Erholung ({de_markers}). "
            "Wenn dein Plan es zulässt, ist das ein guter Moment für eine "
            "harte Einheit."
        )
        reco_en = (
            f"Your data shows sustained, strong recovery ({en_markers}). "
            "If your plan allows it, this is a good moment for a hard session."
        )
    return reco_de, reco_en, head_de, head_en
```

- [ ] **Step 5: Wire it into `detect_morning_health` and `_none`**

In `detect_morning_health`, find the two early-exit lines and the final `if level == "none": return _none(None, None, signals=[])` (currently right after the verdict `if/elif` chain that sets `level`). Replace that one line:

```python
    if level == "none":
        return _none(None, None, signals=[])
```

with:

```python
    if level == "none":
        return _opportunity_verdict(daily, today, prior)
```

Leave the two EARLIER early-exits (`if not daily: return _none(...)` and `if rhr is None and hrv is None: return _none(...)`) exactly as they are — when there isn't even enough baseline to judge illness, there isn't enough to judge an opportunity either, since both read the same underlying series, so returning `_none` immediately in those cases (skipping the opportunity check entirely) is correct and avoids wasted computation.

Then find the illness path's own return statement (right after the `if level == "none"` line you just changed):

```python
    reco_de, reco_en, head_de, head_en = _copy(level, signals)
    return {
        "level": level,
        "signals": signals,
        "headline_de": head_de,
        "headline_en": head_en,
        "recommendation_de": reco_de,
        "recommendation_en": reco_en,
    }
```

Add `"polarity": "warning",` to that dict (any position, dict key order doesn't matter):

```python
    reco_de, reco_en, head_de, head_en = _copy(level, signals)
    return {
        "level": level,
        "polarity": "warning",
        "signals": signals,
        "headline_de": head_de,
        "headline_en": head_en,
        "recommendation_de": reco_de,
        "recommendation_en": reco_en,
    }
```

Finally, update `_none` (near the bottom of the file, in the "Small helpers" section) to always include `polarity`:

```python
def _none(reason_de: str | None, reason_en: str | None, *, signals: list | None = None) -> dict:
    return {
        "level": "none",
        "polarity": None,
        "signals": signals if signals is not None else [],
        "headline_de": None,
        "headline_en": None,
        "recommendation_de": reason_de,
        "recommendation_en": reason_en,
    }
```

- [ ] **Step 6: Delete the unused `_opp_series` test helper**

The `_opp_series` helper stubbed in Step 1 turned out not to be needed — the tests build their sustained-window data inline instead, which is clearer than a parameterized helper for only 3 call sites. Delete the `_opp_series` function from the test file before running the suite.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_morning_health_detector.py -v`
Expected: PASS — all existing tests plus the new `TestOpportunity*` classes (9 new tests).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/morning_health_detector.py backend/tests/services/test_morning_health_detector.py
git commit -m "feat(health): mirror the illness detector in the positive direction

Same discipline, opposite pole: a sustained (2+ day), individual-baseline
RHR-down/HRV-up cluster now returns polarity='opportunity' instead of
the health surface only ever being able to say something is wrong.
Thresholds mirror the illness side's magnitudes rather than inventing
new numbers — the same underlying parasympathetic-recovery signal, read
in reverse. A single good night still proves nothing, same reason a
single bad night isn't illness."
```

---

### Task 2: Backend — schema and endpoint

**Files:**
- Modify: `backend/app/schemas/morning_health.py`
- Modify: `backend/app/api/health.py`
- Test: `backend/tests/api/test_morning_health_endpoint.py`

**Interfaces:**
- Consumes: `detect_morning_health()`'s new `"polarity"` key from Task 1.
- Produces: `MorningHealthCheck.polarity: Literal["warning", "opportunity"] | None`.

- [ ] **Step 1: Read the existing endpoint test file first**

Run: `cat backend/tests/api/test_morning_health_endpoint.py` and note its fixture/mocking pattern before writing a new test — match its existing style exactly rather than introducing a second pattern.

- [ ] **Step 2: Write the failing test**

Add a test to `backend/tests/api/test_morning_health_endpoint.py` following the file's existing pattern for asserting on the endpoint's JSON response (read the file's existing tests to match exact fixture setup — most likely a mocked DB session and a request client). The test must assert the response body has a `"polarity"` key equal to `"none"`'s companion value `None` when no data exists, matching whatever the file's existing "no data" test already sets up — extend THAT existing test with one more assertion line:

```python
    assert body["polarity"] is None
```

rather than writing a whole new test, since the endpoint's "no data → none" path is presumably already covered.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && python -m pytest tests/api/test_morning_health_endpoint.py -v`
Expected: FAIL — `KeyError: 'polarity'` (the field doesn't exist on the response model yet).

- [ ] **Step 4: Update the schema**

In `backend/app/schemas/morning_health.py`, add the import and field:

```python
from typing import Literal

from pydantic import BaseModel


class MorningHealthSignal(BaseModel):
    """One deviating morning marker, cited with its value vs the athlete's baseline."""
    metric: str          # 'resting_hr' | 'hrv' | 'respiration' | 'spo2' | 'sleep_score'
    value: float         # today's reading
    baseline: float | None  # personal rolling-median baseline (None if unavailable)
    direction: str       # 'up' | 'down' — direction of the deviation
    delta: float | None  # signed deviation (bpm / % / brpm), None when no baseline
    unit: str            # 'bpm' | '%' | 'brpm' | ''
    severity: str        # 'mild' | 'strong'


class MorningHealthCheck(BaseModel):
    """Illness/downturn early-warning OR a genuine, earned recovery upswing.

    `level` is 'none' when vitals are normal, absent, or the baseline is too
    thin to judge — the frontend renders NOTHING in that case (honest empty).
    `polarity` is `None` exactly when `level == 'none'`; otherwise it says
    which direction fired. This is an early-signal nudge, never a diagnosis.
    """
    level: str                              # 'none' | 'watch' | 'elevated' | 'high'
    polarity: Literal["warning", "opportunity"] | None = None
    signals: list[MorningHealthSignal]
    headline: str | None      # short localized headline, None when level == 'none'
    recommendation: str | None  # localized recommendation, None when level == 'none'
```

- [ ] **Step 5: Update the endpoint**

In `backend/app/api/health.py`, there are three `MorningHealthCheck(...)` construction sites. Update the two early-return sites (the staleness gate and the exception handler) to be explicit:

```python
            return MorningHealthCheck(level="none", polarity=None, signals=[], headline=None, recommendation=None)
```

(there are two occurrences of this exact line — update both), and update the final return:

```python
    return MorningHealthCheck(
        level=verdict["level"],
        polarity=verdict.get("polarity"),
        signals=[MorningHealthSignal(**s) for s in verdict["signals"]],
        headline=verdict["headline_de" if de else "headline_en"],
        recommendation=verdict["recommendation_de" if de else "recommendation_en"],
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_morning_health_endpoint.py tests/services/test_morning_health_detector.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/morning_health.py backend/app/api/health.py backend/tests/api/test_morning_health_endpoint.py
git commit -m "feat(health): thread polarity through the morning-check endpoint

Explicit polarity=None at both early-return sites rather than relying on
the Pydantic field default, so the wire contract states plainly that
'none' means no verdict in either direction, not an omitted field."
```

---

### Task 3: Frontend — the shared `InsightNudge` shell

**Files:**
- Create: `frontend/src/components/narrative/InsightNudge.tsx`
- Test: `frontend/src/components/narrative/__tests__/InsightNudge.test.tsx`
- Modify: `frontend/src/api/health.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure frontend component); the widened API types it's built against are added in this same task.
- Produces:

```ts
export interface InsightNudgeSignal {
  metric: string
  value: number
  baseline: number | null
  direction: 'up' | 'down'
  delta: number | null
  unit: string
  severity: 'mild' | 'strong'
}

export interface InsightNudgeProps {
  polarity: 'warning' | 'opportunity'
  level: 'watch' | 'elevated' | 'high'
  eyebrow: string
  headline: string
  recommendation: string
  signals: InsightNudgeSignal[]
  metricLabel: (metric: string) => string
}

export default function InsightNudge(props: InsightNudgeProps): JSX.Element
```

- [ ] **Step 1: Widen the API types**

In `frontend/src/api/health.ts`, update both interfaces:

```ts
export interface MorningHealthSignal {
  metric: 'resting_hr' | 'hrv' | 'respiration' | 'spo2' | 'sleep_score'
  value: number
  baseline: number | null
  direction: 'up' | 'down'
  delta: number | null
  unit: string
  severity: 'mild' | 'strong'
}

export interface MorningHealthCheck {
  level: 'none' | 'watch' | 'elevated' | 'high'
  polarity: 'warning' | 'opportunity' | null
  signals: MorningHealthSignal[]
  headline: string | null
  recommendation: string | null
}
```

(only the added `polarity` line is new; everything else is unchanged.)

- [ ] **Step 2: Write the failing test**

Create `frontend/src/components/narrative/__tests__/InsightNudge.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import InsightNudge, { type InsightNudgeSignal } from '../InsightNudge'

afterEach(cleanup)

const sig = (over: Partial<InsightNudgeSignal> = {}): InsightNudgeSignal => ({
  metric: 'resting_hr', value: 40, baseline: 48, direction: 'down',
  delta: -8, unit: 'bpm', severity: 'strong', ...over,
})

const metricLabel = (m: string) => (m === 'resting_hr' ? 'Resting HR' : m === 'hrv' ? 'HRV' : m)

describe('InsightNudge', () => {
  it('renders the headline and recommendation for a warning', () => {
    render(
      <InsightNudge
        polarity="warning" level="high" eyebrow="HEALTH EARLY-WARNING"
        headline="Clear warning signal" recommendation="Rest today and listen to your body."
        signals={[sig({ direction: 'up', delta: 8, severity: 'strong' })]}
        metricLabel={metricLabel}
      />,
    )
    expect(screen.getByText('Clear warning signal')).toBeTruthy()
    expect(screen.getByText('Rest today and listen to your body.')).toBeTruthy()
    expect(screen.getByText('Resting HR')).toBeTruthy()
  })

  it('renders an opportunity in the recovery-green register, not the warning one', () => {
    const { container } = render(
      <InsightNudge
        polarity="opportunity" level="high" eyebrow="RECOVERY SIGNAL"
        headline="Excellent form" recommendation="A good moment for a hard session."
        signals={[sig()]}
        metricLabel={metricLabel}
      />,
    )
    // The card's accent must be the recovery token, not the warning tokens —
    // this is the one thing that must never invert (a good-news card that
    // LOOKS alarming would be worse than not building it).
    const html = container.innerHTML
    expect(html).toContain('--color-recovery')
    expect(html).not.toContain('--color-move')
  })

  it('escalates the warning register across the three levels', () => {
    const render1 = render(
      <InsightNudge polarity="warning" level="watch" eyebrow="E" headline="H" recommendation="R" signals={[]} metricLabel={metricLabel} />,
    )
    expect(render1.container.innerHTML).toContain('--color-stand')
    cleanup()
    const render2 = render(
      <InsightNudge polarity="warning" level="high" eyebrow="E" headline="H" recommendation="R" signals={[]} metricLabel={metricLabel} />,
    )
    expect(render2.container.innerHTML).toContain('--color-move')
  })

  it('cites each signal with its formatted delta', () => {
    render(
      <InsightNudge
        polarity="warning" level="elevated" eyebrow="E" headline="H" recommendation="R"
        signals={[sig({ metric: 'hrv', direction: 'up', delta: -14, unit: '%', value: 56, baseline: 65 })]}
        metricLabel={metricLabel}
      />,
    )
    expect(screen.getByText('HRV')).toBeTruthy()
    expect(screen.getByText(/−14/)).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/narrative/__tests__/InsightNudge.test.tsx`
Expected: FAIL — cannot resolve `../InsightNudge`.

- [ ] **Step 4: Write the component**

Create `frontend/src/components/narrative/InsightNudge.tsx`, generalizing `MorningHealthCard.tsx`'s existing JSX (its glass-card treatment, header row, signal-chip row and recommendation paragraph are all preserved unchanged for the warning path):

```tsx
/**
 * InsightNudge — one honest early-signal card, shared by every chapter.
 *
 * Extracted from MorningHealthCard, which built this shell for exactly one
 * direction (illness). The shell itself was never health-specific — it is
 * "a cluster of named deviations from your own baseline, with a verdict" —
 * so this generalizes it to also carry `polarity: 'opportunity'` for a
 * genuine, earned recovery upswing, using the app's existing recovery-green
 * token rather than inventing a new color scale.
 *
 * Self-hiding is the CALLER's job, not this component's: a chapter only
 * mounts this when its own detector's `level !== 'none'`. This component
 * always renders something — it has no honest-empty branch of its own,
 * because "nothing to show" is a decision made before this component exists,
 * not inside it.
 */
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Activity, Thermometer, TrendingUp, Sparkles } from 'lucide-react'
import { GLASS_CARD_MARKER, GLASS_PAPER_2, GLASS_BLUR } from '../dashboard/glassCard'

export type InsightPolarity = 'warning' | 'opportunity'
export type InsightLevel = 'watch' | 'elevated' | 'high'

export interface InsightNudgeSignal {
  metric: string
  value: number
  baseline: number | null
  direction: 'up' | 'down'
  delta: number | null
  unit: string
  severity: 'mild' | 'strong'
}

export interface InsightNudgeProps {
  polarity: InsightPolarity
  level: InsightLevel
  eyebrow: string
  headline: string
  recommendation: string
  signals: InsightNudgeSignal[]
  metricLabel: (metric: string) => string
}

function levelStyle(polarity: InsightPolarity, level: InsightLevel): { color: string; Icon: LucideIcon } {
  if (polarity === 'opportunity') {
    switch (level) {
      case 'high': return { color: 'var(--color-recovery)', Icon: Sparkles }
      case 'elevated': return { color: 'var(--color-recovery)', Icon: TrendingUp }
      default: return { color: 'color-mix(in srgb, var(--color-recovery) 65%, var(--color-ink-2))', Icon: Activity }
    }
  }
  switch (level) {
    case 'high': return { color: 'var(--color-move)', Icon: Thermometer }
    case 'elevated': return { color: 'var(--color-amber)', Icon: AlertTriangle }
    default: return { color: 'var(--color-stand)', Icon: Activity }
  }
}

function deltaText(sig: InsightNudgeSignal): string {
  if (sig.delta == null) return `${sig.value}${sig.unit}`
  const sign = sig.delta > 0 ? '+' : sig.delta < 0 ? '−' : ''
  const mag = Math.abs(sig.delta)
  const sep = sig.unit === '%' || sig.unit === '' ? '' : ' '
  return `${sign}${mag}${sep}${sig.unit}`.trim()
}

export default function InsightNudge({
  polarity, level, eyebrow, headline, recommendation, signals, metricLabel,
}: InsightNudgeProps) {
  const { color, Icon } = levelStyle(polarity, level)

  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-5 flex flex-col gap-4"
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${color} 16%, ${GLASS_PAPER_2}) 0%, ${GLASS_PAPER_2} 66%)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, var(--color-rule))`,
        boxShadow: `0 12px 34px -18px color-mix(in srgb, ${color} 70%, transparent)`,
        ...GLASS_BLUR,
      }}
      role={polarity === 'warning' ? 'alert' : 'status'}
      {...GLASS_CARD_MARKER}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="shrink-0 grid place-items-center rounded-full"
          style={{ width: 44, height: 44, background: `color-mix(in srgb, ${color} 22%, transparent)` }}
        >
          <Icon size={22} strokeWidth={2} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color }}>
            {eyebrow.toUpperCase()}
          </div>
          <div className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)', lineHeight: 1.15 }}>
            {headline}
          </div>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {signals.map((sig) => (
            <div
              key={sig.metric}
              className="flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                background: 'var(--color-surface-2)',
                border: `1px solid color-mix(in srgb, ${color} ${sig.severity === 'strong' ? 55 : 30}%, var(--color-rule))`,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                {metricLabel(sig.metric)}
              </span>
              <span className="num-display" style={{ fontSize: 13, color }}>
                {deltaText(sig)}
              </span>
              {sig.baseline != null && (
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>vs {sig.baseline}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
        {recommendation}
      </p>
    </div>
  )
}
```

Note `role="status"` (not `"alert"`) for opportunity — an `alert` role interrupts a screen reader; good news does not need to interrupt anyone.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/narrative/__tests__/InsightNudge.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no new findings.

```bash
git add frontend/src/components/narrative/InsightNudge.tsx frontend/src/components/narrative/__tests__/InsightNudge.test.tsx frontend/src/api/health.ts
git commit -m "feat(narrative): InsightNudge, the shared shell behind MorningHealthCard

Extracted from MorningHealthCard's existing JSX with the warning path
byte-for-byte unchanged; the new axis is polarity, which uses the
existing recovery-green token for good news rather than a new color
scale. role=status (not alert) for opportunity — good news must not
interrupt a screen reader the way a real warning should."
```

---

### Task 4: Frontend — `MorningHealthCard` becomes a thin wrapper

**Files:**
- Modify: `frontend/src/components/dashboard/MorningHealthCard.tsx`

**Interfaces:**
- Consumes: `InsightNudge` (default export) and its props from `../narrative/InsightNudge`; `useMorningHealthCheck` (unchanged) from `../../hooks/useMorningHealthCheck`.

- [ ] **Step 1: Replace the component body**

Replace the whole of `MorningHealthCard.tsx` (keep the file's existing `metricLabel` function and its `_METRIC_DE`/`_METRIC_EN`-equivalent maps — the plan's earlier read of this file showed it inline as `metricLabel(metric, de)`; keep that function exactly as it is) with a version that renders through `InsightNudge`:

```tsx
/**
 * MorningHealthCard — Körper's early-signal surface. Renders ONLY when the
 * backend detector returns level != 'none'; a normal morning shows nothing
 * (honest empty). Every number is real Garmin data cited against the
 * athlete's own baseline — no fabrication, no diagnosis, either direction.
 *
 * Backed by GET /health/morning-check (services/morning_health_detector.py):
 * the verdict (warning OR a genuine, earned recovery opportunity) + localized
 * copy come from the server; this file only presents them, via the shared
 * InsightNudge shell. Bike-only, German-first.
 */
import InsightNudge from '../narrative/InsightNudge'
import { useMorningHealthCheck } from '../../hooks/useMorningHealthCheck'
import { useLocale } from '../../contexts/LocaleContext'

function metricLabel(metric: string, de: boolean): string {
  const en: Record<string, string> = {
    resting_hr: 'Resting HR', hrv: 'HRV', respiration: 'Respiration',
    spo2: 'SpO₂', sleep_score: 'Sleep',
  }
  const dede: Record<string, string> = {
    resting_hr: 'Ruhepuls', hrv: 'HRV', respiration: 'Atemfrequenz',
    spo2: 'SpO₂', sleep_score: 'Schlaf',
  }
  return (de ? dede : en)[metric] ?? metric
}

export default function MorningHealthCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useMorningHealthCheck()

  // Honest empty: nothing to say, in either direction, or data not (yet) available.
  if (!data || data.level === 'none' || !data.polarity || data.signals.length === 0) return null

  const eyebrow = data.polarity === 'warning'
    ? (de ? 'Gesundheits-Frühwarnung' : 'Health early-warning')
    : (de ? 'Erholungssignal' : 'Recovery signal')

  return (
    <InsightNudge
      polarity={data.polarity}
      level={data.level as 'watch' | 'elevated' | 'high'}
      eyebrow={eyebrow}
      headline={data.headline ?? ''}
      recommendation={data.recommendation ?? ''}
      signals={data.signals}
      metricLabel={(metric) => metricLabel(metric, de)}
    />
  )
}
```

Note the honest-empty guard now also checks `!data.polarity`, since `level !== 'none'` should never occur without a `polarity` on a correctly-behaving backend, but the frontend must not assume a backend invariant it cannot verify — a `null` polarity with a non-`'none'` level should render nothing rather than crash on `data.polarity` being passed where a non-null `InsightPolarity` is required.

- [ ] **Step 2: Typecheck and run the full frontend suite**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: clean typecheck, full suite green. There is no existing render test for `MorningHealthCard` (confirm with `grep -rn "MorningHealthCard" frontend/src --include="*.test.tsx"` — expect no matches), so a green suite here proves the file compiles and nothing else regressed; Task 5 does the visual verification of both polarities.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/MorningHealthCard.tsx
git commit -m "refactor(recovery): MorningHealthCard renders through InsightNudge

The card's own JSX (glass treatment, header, signal chips, recommendation)
now lives in the shared shell; this file is reduced to fetching its data,
choosing the eyebrow text for whichever polarity fired, and handing both
to InsightNudge. Behavior for the warning path is unchanged."
```

---

### Task 5: Verify both polarities at 390×844, and ship

- [ ] **Step 1: Full gates**

```bash
cd backend && python -m pytest tests/services/test_morning_health_detector.py tests/api/test_morning_health_endpoint.py -v
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint src/components/narrative src/components/dashboard/MorningHealthCard.tsx src/api/health.ts
```

Compare the eslint output against the same command with your changes stashed, so pre-existing findings are not attributed to this work.

- [ ] **Step 2: Render Körper with a real opportunity firing**

Dev servers: backend on `:8042`, frontend on `:5180` (CORS allowlists only 5173 and 5180). DB on `:5433`.

The warning path is already visible in production data (per this session's earlier verification). The opportunity path needs a test account whose last 2 days of `daily_metrics` show RHR meaningfully below and HRV meaningfully above that account's own rolling baseline — arrange this via local dev DB rows (never mutate anything that isn't the local dev database), matching the values in Task 1's `test_sustained_rhr_and_hrv_improvement_is_high` test to guarantee a `high`-level opportunity fires.

At 390×844, load `/dashboard?tab=body` and check by eye:

1. The card renders in the **recovery-green** register — not amber, not red. This is the one thing that must never invert.
2. The eyebrow reads "Erholungssignal" / "Recovery signal", not the health-early-warning text.
3. The headline and recommendation are legible and read as genuine encouragement, not a generic platitude — if the wording feels flat or the escalation between `watch`/`elevated`/`high` doesn't read as visually different (per Task 3's muted-vs-full `--color-recovery` treatment), note it and adjust the `levelStyle` mix percentages in `InsightNudge.tsx` before shipping. This is exactly the kind of thing this project's own house rule says a green test suite cannot verify — render before trusting a new visual register.
4. It still sits directly after the Hero and before the Moment card — unchanged position.
5. Restore the dev DB rows you changed once you're done, or note clearly in your report that you did not, so the next person doesn't mistake seeded test data for a real athlete's history.

Screenshot both the opportunity state and (if reachable without further data mutation) the existing warning state, for a side-by-side record.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

Report the result and STOP. Do not deploy — deploying happens after a final whole-branch review, matching every prior phase this session.

---

## Self-Review

**Spec coverage.** "Rule-based, not LLM" → Task 1 (pure function, no model call). "Both directions, same conservative discipline" → Task 1's cluster-and-corroborator verdict, mirrored magnitudes, sustained-window requirement. "Shared shell" → Tasks 3–4. "Placement rule (after Hero, before Moment)" → unchanged by this plan, verified in Task 5 (the mount position in `RecoveryTab.tsx` is not touched, so it is inherited correctly). "Zero behavior change during extraction" → Task 3's component is a direct lift of `MorningHealthCard`'s existing JSX for the warning path, verified by the escalation test asserting `--color-move`/`--color-stand` are still reachable.

**Documented deviation from the spec's literal text.** The spec describes renaming `MorningHealthCheck` to a generic `InsightNudge` type. This plan keeps the type name and only adds a field, while still extracting the shared *component* named `InsightNudge`. Recorded in Global Constraints, not silently applied — flagged to the user as part of the plan write-up.

**Placeholder scan.** No TBDs. Every code block is complete and copy-pasteable. The one self-correcting step (Task 1, Step 6 deleting the unneeded `_opp_series` helper) is itself an explicit instruction, not a hidden gap.

**Type consistency.** `InsightNudgeSignal`/`InsightNudgeProps` are defined once in Task 3 and consumed with exactly those fields in Task 4. The backend's `polarity: Literal["warning", "opportunity"] | None` (Task 2) matches the frontend's `'warning' | 'opportunity' | null` (Task 3, `api/health.ts`) and `InsightPolarity` (Task 3, component). `Level`/`InsightLevel` both restrict to `'watch' | 'elevated' | 'high'` for a fired verdict — `'none'` is filtered out before either side ever sees it as a "level" the component renders.
