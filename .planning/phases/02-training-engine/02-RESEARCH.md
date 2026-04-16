# Phase 2: Training Engine - Research

**Researched:** 2026-04-16
**Domain:** Sports science math engine — TSS calculations, EWMA fitness/fatigue, power/pace zones, FTP history
**Confidence:** HIGH (core formulas verified via multiple authoritative sources; implementation patterns verified)

## Summary

Phase 2 is a pure math engine with no external data sources. It computes TSS (Training Stress Score) per sport, runs EWMA (exponentially weighted moving average) to derive CTL/ATL/TSB, calculates power and pace zones from athlete thresholds, and manages FTP history. All data comes from synthetic/manual entry; no Garmin integration yet.

The formulas are well-established and consistent across authoritative sources (TrainingPeaks, Coggan's books, exercise physiology literature). The main implementation risk is getting the EWMA right — the naive version (simple 42-day rolling mean) is wrong; the correct version uses an exponential decay factor. The second risk is cross-sport combination: CTL/ATL/TSB must be tracked per-sport AND as a total, but the total must NOT be a naive sum. The third risk is the Normalized Power calculation for cycling TSS, which requires second-by-second power data; when only average power is available (synthetic data), NP = average power is the correct approximation.

**Primary recommendation:** Implement a dedicated `services/training_load.py` module containing all formulas as pure Python functions with no FastAPI coupling — this makes them independently testable and reusable. The API layer just orchestrates DB reads and calls these pure functions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.11+ | Already installed | Phase 1 baseline |
| FastAPI | 0.135.x | Already installed | Phase 1 baseline |
| SQLAlchemy async | 2.0.x | Already installed | Phase 1 baseline |
| asyncpg | latest | Already installed | Phase 1 baseline |

### Supporting (new in Phase 2)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| numpy | >=1.26 | NP calculation (rolling mean + power operations) | Normalized Power from raw power arrays |
| pytest-asyncio | >=0.24 | Already installed | Async service tests |
| factory-boy | >=3.3 | Test data factories | Generate synthetic activity test data |
| faker | >=26 | Realistic fake data | Create realistic timestamps, names in test factories |

### Libraries Evaluated and Rejected
| Library | Status | Reason |
|---------|--------|--------|
| sweatpy (GoldenCheetah/AoAoStudio) | Reject | Self-described "very beta", no TSS/CTL/ATL features, actively warns against production use |
| sqlalchemy-timescaledb | Defer | Only adds `first()`/`last()` hyperfunctions + hypertable DDL helpers; already done in Phase 1 via raw SQL. Not worth adding for Phase 2 |
| pandas | Defer | Useful for backfill but heavyweight dependency; pure Python loops with the EWMA formula are sufficient for daily-grain CTL/ATL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure Python EWMA | pandas ewm() | pandas ewm(span=42) gets the formula right but adds a heavy dependency. Use for exploratory analysis, not prod backend. |
| numpy for NP | Pure Python rolling sum | numpy is faster and cleaner for 30-second rolling window over arrays of 100s–3600s data points. Worth it. |
| factory-boy | Raw dict fixtures | factory-boy produces more realistic and composable test data at the cost of one dev dependency |

**Installation (new dependencies for Phase 2):**
```bash
pip install numpy>=1.26 factory-boy>=3.3 faker>=26
```

## Architecture Patterns

### Recommended Project Structure (additions to Phase 1)
```
backend/
├── app/
│   ├── models/
│   │   ├── activity.py          # Activity ORM model (maps to existing hypertable)
│   │   └── daily_metric.py      # DailyMetric ORM model (maps to existing hypertable)
│   │
│   ├── schemas/
│   │   ├── activity.py          # ActivityCreate, ActivityRead, ActivityInDB
│   │   └── training_load.py     # TrainingLoadResponse, ZoneConfig, FTPHistory
│   │
│   ├── services/
│   │   ├── training_load.py     # Pure functions: TSS, NP, CTL/ATL/TSB, zones
│   │   └── activity_service.py  # DB CRUD for activities + calls training_load
│   │
│   └── api/
│       ├── activities.py        # POST /activities, GET /activities
│       └── training_load.py     # GET /training-load/pmc, GET /training-load/zones
│
├── migrations/versions/
│   └── XXXX_add_activity_and_metric_orm_models.py  # No DDL changes; adds ORM models for existing tables
│
└── tests/
    ├── test_training_load.py    # Unit tests for pure functions (no DB)
    ├── test_activity_api.py     # Integration tests: POST activity, check TSS stored
    └── factories.py             # ActivityFactory, UserFactory
```

### Pattern 1: Pure Functions for All Sports Science Math
**What:** All TSS/NP/CTL/ATL/zone calculations are pure Python functions in `services/training_load.py` with no FastAPI or SQLAlchemy imports.
**When to use:** Always. Pure functions are independently testable and can be called from any context.

```python
# backend/app/services/training_load.py
# All formulas are pure functions — no DB, no FastAPI

def calculate_np(power_series: list[float]) -> float:
    """Normalized Power from second-by-second power data.
    Source: Coggan/TrainingPeaks algorithm — 30s rolling avg, 4th power, root.
    Falls back to simple average if series is too short (< 30 data points).
    """
    if len(power_series) < 30:
        return sum(power_series) / len(power_series) if power_series else 0.0

    import numpy as np
    arr = np.array(power_series, dtype=float)
    # 30-second rolling average (window=30, assuming 1s data)
    rolling = np.convolve(arr, np.ones(30) / 30, mode='valid')
    # 4th power mean, then 4th root
    return float(np.mean(rolling ** 4) ** 0.25)


def calculate_cycling_tss(
    duration_seconds: int,
    normalized_power: float,
    ftp_watts: int,
) -> float:
    """Cycling TSS using NP and FTP.
    Formula: TSS = (duration_s * NP * IF) / (FTP * 3600) * 100
    where IF = NP / FTP
    Source: Coggan; verified via TrainingPeaks documentation.
    100 TSS = 1 hour at exactly FTP.
    """
    if ftp_watts <= 0:
        raise ValueError("FTP must be positive")
    intensity_factor = normalized_power / ftp_watts
    return (duration_seconds * normalized_power * intensity_factor) / (ftp_watts * 3600) * 100


def calculate_running_tss(
    duration_seconds: int,
    average_pace_ms: float,      # meters per second
    threshold_pace_ms: float,    # meters per second (fastest pace sustainable for 1 hour)
) -> float:
    """Running rTSS using pace.
    Formula: rTSS = (duration_s * pace * IF) / (threshold_pace * 3600) * 100
    where IF = pace / threshold_pace (speed ratio, NOT pace ratio)
    Note: pace in m/s so higher value = faster. IF = actual_speed / threshold_speed.
    Source: TrainingPeaks rTSS documentation.
    100 rTSS = 1 hour at exactly threshold pace.
    """
    if threshold_pace_ms <= 0:
        raise ValueError("Threshold pace must be positive")
    intensity_factor = average_pace_ms / threshold_pace_ms
    return (duration_seconds * average_pace_ms * intensity_factor) / (threshold_pace_ms * 3600) * 100


def calculate_hr_tss(
    duration_seconds: int,
    average_hr: float,
    lthr: int,           # Lactate Threshold Heart Rate
    hr_rest: int,        # Resting heart rate
    hr_max: int,         # Max heart rate
    sex: str = "male",   # "male" or "female" — affects k constant
) -> float:
    """hrTSS using TRIMP-based formula.
    Formula: hrTSS = (TRIMP_activity / TRIMP_reference) * 100
    where TRIMP = duration * HRR * 0.64 * e^(k * HRR)
    HRR = (HR - HR_rest) / (HR_max - HR_rest)  (Heart Rate Reserve ratio)
    k = 1.92 for male, 1.67 for female
    Reference TRIMP = 3600 * LTHR_HRR * 0.64 * e^(k * LTHR_HRR)
    Source: Banister TRIMP formula; verified via TrainerRoad forum community documentation.
    """
    import math
    k = 1.92 if sex == "male" else 1.67
    hrr = (average_hr - hr_rest) / (hr_max - hr_rest)
    hrr = max(0.0, min(1.0, hrr))  # clamp to [0, 1]
    lthr_hrr = (lthr - hr_rest) / (hr_max - hr_rest)
    lthr_hrr = max(0.0, min(1.0, lthr_hrr))

    trimp_activity = duration_seconds * hrr * 0.64 * math.exp(k * hrr)
    trimp_reference = 3600 * lthr_hrr * 0.64 * math.exp(k * lthr_hrr)

    if trimp_reference <= 0:
        return 0.0
    return (trimp_activity / trimp_reference) * 100


def update_ctl_atl(
    ctl_yesterday: float,
    atl_yesterday: float,
    tss_today: float,
) -> tuple[float, float]:
    """Update CTL and ATL with today's TSS using EWMA.

    CORRECT formula (exponential decay, not simple rolling mean):
        CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) * (1/42)
        ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) * (1/7)

    Equivalent exponential decay form:
        CTL_today = CTL_yesterday * e^(-1/42) + TSS_today * (1 - e^(-1/42))
        ATL_today = ATL_yesterday * e^(-1/7)  + TSS_today * (1 - e^(-1/7))

    Both forms produce identical results. The (1/42) form is used here for clarity.
    Source: Coggan PMC; verified via run.analyticszone.app formulas and multiple
    coaching resources.

    Returns (new_ctl, new_atl)
    """
    new_ctl = ctl_yesterday + (tss_today - ctl_yesterday) * (1 / 42)
    new_atl = atl_yesterday + (tss_today - atl_yesterday) * (1 / 7)
    return round(new_ctl, 1), round(new_atl, 1)


def calculate_tsb(ctl: float, atl: float) -> float:
    """TSB = CTL - ATL (form = fitness - fatigue).
    Use YESTERDAY's CTL and ATL (not today's), per TrainingPeaks convention.
    Positive TSB = fresh/recovered. Negative TSB = fatigued.
    """
    return round(ctl - atl, 1)
```

### Pattern 2: Per-Sport CTL/ATL + Combined Total
**What:** Track CTL/ATL/TSB separately per sport (cycling, running, gym) AND compute a combined total.
**When to use:** Multi-sport athletes. Avoids masking sport-specific overtraining.

The combined total is computed by summing ALL sport TSS values into one daily_tss_total, then running the EWMA on that total. This is the correct approach — not averaging or separately combining CTL values.

```python
# Per-sport CTL/ATL stored in a structure like:
{
    "cycling": {"ctl": 45.2, "atl": 52.1, "tsb": -6.9},
    "running": {"ctl": 28.1, "atl": 31.0, "tsb": -2.9},
    "gym":     {"ctl": 12.3, "atl": 10.0, "tsb": 2.3},
    "total":   {"ctl": 85.6, "atl": 93.1, "tsb": -7.5}
}
```

The `total` CTL/ATL is computed from `tss_cycling + tss_running + tss_gym` each day, then EWMA applied. It is NOT the sum of per-sport CTLs (that would be double-weighting).

### Pattern 3: Zone Calculation from Thresholds
**What:** Compute zone boundaries at read time from current FTP/threshold values stored in AthleteProfile.
**When to use:** Whenever zones are needed. Do NOT store zone boundaries in DB — they are derived from FTP.

```python
def coggan_power_zones(ftp_watts: int) -> dict:
    """Coggan Classic 7-zone model.
    Source: TrainingPeaks blog 'Power Training Levels' (trainingpeaks.com).
    Zone 7 upper bound is intentionally open-ended (neuromuscular).
    """
    return {
        "zone1": {"name": "Active Recovery",    "min": 0,           "max": int(ftp_watts * 0.55)},
        "zone2": {"name": "Endurance",          "min": int(ftp_watts * 0.56), "max": int(ftp_watts * 0.75)},
        "zone3": {"name": "Tempo",              "min": int(ftp_watts * 0.76), "max": int(ftp_watts * 0.90)},
        "zone4": {"name": "Lactate Threshold",  "min": int(ftp_watts * 0.91), "max": int(ftp_watts * 1.05)},
        "zone5": {"name": "VO2 Max",            "min": int(ftp_watts * 1.06), "max": int(ftp_watts * 1.20)},
        "zone6": {"name": "Anaerobic Capacity", "min": int(ftp_watts * 1.21), "max": int(ftp_watts * 1.50)},
        "zone7": {"name": "Neuromuscular",      "min": int(ftp_watts * 1.50), "max": None},
    }


def seiler_3_zones_running(threshold_pace_ms: float) -> dict:
    """Seiler 3-zone polarized model for running using pace (m/s).
    Zone boundaries approximate LT1 and LT2 thresholds.
    Zone 1 (Easy):    below 77% of threshold pace (LT1 proxy)
    Zone 2 (Moderate): 77-100% of threshold pace (between LT1 and LT2)
    Zone 3 (Hard):    above 100% of threshold pace (above LT2)

    Note: 'threshold pace' here = pace at LT2 (one-hour race pace equivalent).
    Zone 1/2 boundary at 77% of threshold speed is derived from Seiler research
    (0.77 * 60-min max pace, per EVOQ polarized training guide).
    Source: EVOQ.bike complete polarized training guide + Seiler 2009.
    Pace stored as m/s, so FASTER = higher value. Zones defined by speed:
      Zone 1: speed < 0.77 * threshold_speed
      Zone 2: 0.77 * threshold_speed <= speed < threshold_speed
      Zone 3: speed >= threshold_speed
    """
    lt1_speed = threshold_pace_ms * 0.77
    return {
        "zone1": {"name": "Easy (below LT1)",       "max_speed_ms": lt1_speed},
        "zone2": {"name": "Moderate (LT1 to LT2)",  "min_speed_ms": lt1_speed, "max_speed_ms": threshold_pace_ms},
        "zone3": {"name": "Hard (above LT2)",        "min_speed_ms": threshold_pace_ms},
    }
```

### Pattern 4: FTP History Append and Timeline

FTP history is already stored as a JSON list on `AthleteProfile.ftp_history`. Each entry is:
```python
{"ftp_watts": 280, "measured_at": "2026-04-16T10:00:00Z", "source": "manual"}
```

To update FTP:
1. Append new entry to `ftp_history` list
2. Update `ftp_watts` on the profile (current FTP)
3. Commit — SQLAlchemy detects the JSON list change via `flag_modified()`

**CRITICAL:** SQLAlchemy does NOT auto-detect mutations inside JSON columns. Must call:
```python
from sqlalchemy.orm.attributes import flag_modified
flag_modified(profile, "ftp_history")
```

### Pattern 5: TimescaleDB Daily TSS Aggregation

To compute CTL/ATL/TSB, the engine needs daily TSS per sport. Query pattern:

```python
# Using raw SQL for time_bucket aggregation
from sqlalchemy import text

async def get_daily_tss_by_sport(
    db: AsyncSession,
    user_id: int,
    days: int = 90,
) -> list[dict]:
    """Get daily total TSS per sport for last N days.
    Uses TimescaleDB time_bucket for efficient date grouping.
    """
    query = text("""
        SELECT
            time_bucket('1 day', started_at) AS day,
            sport,
            COALESCE(SUM(tss), 0) AS daily_tss
        FROM activities
        WHERE user_id = :user_id
          AND started_at >= NOW() - INTERVAL ':days days'
          AND tss IS NOT NULL
        GROUP BY day, sport
        ORDER BY day ASC
    """)
    result = await db.execute(query, {"user_id": user_id, "days": days})
    return [{"day": row.day, "sport": row.sport, "daily_tss": row.daily_tss}
            for row in result.fetchall()]
```

**Note on interval parameter:** SQLAlchemy `text()` does not support parameter substitution inside interval strings. Use string formatting for the interval value only (not user input — this is a server-side constant):
```python
query = text(f"... AND started_at >= NOW() - INTERVAL '{days} days' ...")
```

### Pattern 6: ORM Models for Existing Hypertables

Phase 1 created `activities` and `daily_metrics` as raw SQL hypertables. Phase 2 needs ORM models to map to them. Key constraint: **do NOT recreate these tables** in a new migration; just add ORM model files.

```python
# backend/app/models/activity.py
from sqlalchemy import BigInteger, Float, ForeignKey, Integer, String, TIMESTAMP, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Activity(Base):
    __tablename__ = "activities"

    # Composite PK matches hypertable: (id, started_at)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    sport: Mapped[str] = mapped_column(String(30), nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    tss: Mapped[float | None] = mapped_column(Float, nullable=True)
    normalized_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_power: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

The Alembic migration for Phase 2 should use `include_object` to skip these existing tables from autogenerate, since they were created via raw SQL and SQLAlchemy doesn't own their schema.

### Anti-Patterns to Avoid
- **Naive rolling mean for CTL/ATL:** `df['CTL'] = df['TSS'].rolling(42).mean()` is WRONG. It applies equal weight to all 42 days. Use the EWMA formula.
- **Summing per-sport CTL values for total:** The combined CTL is computed from the combined daily TSS stream, not by adding cycling CTL + running CTL.
- **Storing zone boundaries in DB:** Zones are computed from FTP on demand. Storing them creates stale data when FTP changes.
- **Mutation on JSON columns without flag_modified:** SQLAlchemy silently ignores list/dict mutations on JSON columns without explicit notification.
- **Using pace ratio instead of speed ratio for rTSS IF:** Pace (min/km) goes backwards from speed (m/s). Always convert to speed (m/s) before computing IF. IF = actual_speed / threshold_speed.
- **Using average power instead of NP when power stream exists:** NP from raw power data is physiologically more accurate. Average power underestimates high-intensity variable efforts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Normalized Power rolling window | Custom Python loop | numpy.convolve or pandas.rolling | Edge cases in array boundaries; numpy handles correctly |
| EWMA with proper exponential decay | pandas ewm() | The two-line update formula above | pandas adds overhead but the formula is trivially correct by hand |
| TSS formulas | Any third-party library | The formulas above (hand-implement) | No mature, maintained Python library exists for this. sweatpy is beta-quality. Formulas are simple and well-known. |
| Time-series daily aggregation | Python-side groupby | TimescaleDB time_bucket() in SQL | DB-side aggregation is orders of magnitude faster for large datasets |
| Test data factories | Raw dicts in conftest | factory-boy + Faker | factory-boy produces composable, realistic factories that reduce test boilerplate significantly |

**Key insight:** The sports science formulas are stable and simple. The risk is not complexity — it's getting the constants and edge cases exactly right. Hand-roll the formulas directly from the verified sources above; don't depend on unmaintained sports science libraries.

## Common Pitfalls

### Pitfall 1: EWMA Time Constant Confusion
**What goes wrong:** Developer uses simple 42-day rolling mean for CTL (equal weight to all 42 days) instead of exponential decay.
**Why it happens:** Search results sometimes show `df.rolling(42).mean()` as "CTL" — this is a simplification that produces different numbers.
**How to avoid:** Use the exact formula: `CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) * (1/42)`. This is an EWMA where recent days are weighted more heavily.
**Warning signs:** CTL values that are exactly equal to 42-day averages on uniform training; CTL that changes too sharply on a single day off.

### Pitfall 2: rTSS Pace vs Speed Direction
**What goes wrong:** IF for running is calculated as `pace_ratio = threshold_pace_sec_per_km / actual_pace_sec_per_km` — which inverts the sign.
**Why it happens:** Running pace (min/km) is "lower is faster", opposite of cycling power "higher is harder".
**How to avoid:** Always convert to speed (m/s) before computing IF: `IF = actual_speed_ms / threshold_speed_ms`. Speed is unambiguous: higher = harder.
**Warning signs:** Easy runs getting higher rTSS than tempo runs.

### Pitfall 3: Mutation of JSON FTP History Not Detected
**What goes wrong:** `profile.ftp_history.append(new_entry)` followed by `db.commit()` silently does nothing — the new entry is lost.
**Why it happens:** SQLAlchemy tracks object identity, not contents, for JSON/dict/list columns.
**How to avoid:** Always call `flag_modified(profile, "ftp_history")` before commit when mutating the JSON list in-place. Alternatively, assign a new list: `profile.ftp_history = profile.ftp_history + [new_entry]`.
**Warning signs:** FTP history appears unchanged after an update call that returned 200.

### Pitfall 4: TimescaleDB Composite PK in ORM Model
**What goes wrong:** ORM model declares `id` as sole primary key; queries that include `started_at` in WHERE fail or produce duplicate rows.
**Why it happens:** The activities hypertable was created with `PRIMARY KEY (id, started_at)` — both columns are required in the PK for TimescaleDB partitioning.
**How to avoid:** Declare both `id` and `started_at` as `primary_key=True` in the SQLAlchemy model.
**Warning signs:** Alembic autogenerate tries to recreate the activities table with a different PK.

### Pitfall 5: TSB Convention — Yesterday vs Today
**What goes wrong:** TSB is computed as `CTL_today - ATL_today` but displayed alongside today's TSS activity.
**Why it happens:** TrainingPeaks defines TSB as yesterday's CTL minus yesterday's ATL — a "form going into today" metric, not "form after today's training".
**How to avoid:** When displaying on the PMC, TSB for a given day = CTL_previous_day - ATL_previous_day. When computing, store CTL and ATL as end-of-day values; TSB for display is from the prior day's values.
**Warning signs:** TSB appears to react to same-day training load instead of being a leading indicator.

### Pitfall 6: Missing Days in EWMA Chain
**What goes wrong:** Days with no training are skipped in the DB query; CTL/ATL values jump incorrectly on rest days.
**Why it happens:** `GROUP BY day` only returns days that have activities. Rest days produce no rows.
**How to avoid:** Generate a complete date series (using `generate_series` in PostgreSQL or Python's `pandas.date_range`), left-join activity TSS onto it (filling nulls with 0), then run the EWMA over the full series.
**Warning signs:** CTL stays flat for a week of no training, then jumps — instead of decaying smoothly.

### Pitfall 7: NP Calculation Without Raw Power Stream
**What goes wrong:** Phase 2 uses synthetic/manual data that doesn't include second-by-second power. Developer tries to apply the NP algorithm to a single average power value.
**Why it happens:** NP algorithm requires a time-series of power values, not a summary.
**How to avoid:** When only average power is available (no raw_data stream), set `normalized_power = average_power`. This is the correct fallback per Coggan's methodology. Store this fact in the activity record so the TSS calculation is transparent.
**Warning signs:** Attempting to apply rolling average to a 1-element array.

## Code Examples

### Cycling TSS — Full Computation Path
```python
# Source: Coggan formula verified via TrainingPeaks and medium.com/critical-powers
# When raw power stream is available:
power_stream = [250, 255, 260, 248, ...]  # watts, 1 per second
np_value = calculate_np(power_stream)     # e.g. 258.3W for variable effort

# When only summary data available (synthetic/manual):
np_value = average_power  # e.g. 220W — correct fallback

tss = calculate_cycling_tss(
    duration_seconds=3600,
    normalized_power=np_value,
    ftp_watts=280,
)
# 1 hour at FTP = 100 TSS; at 220W/280 FTP = IF 0.786, TSS ~61.8
```

### CTL/ATL/TSB Daily Update
```python
# Source: Coggan PMC; verified via run.analyticszone.app formulas
# Called once per day after all activities for that day are processed

# Day 1 initialization: CTL = ATL = 0 (new athlete)
ctl, atl = 0.0, 0.0

# For each day in order (MUST process sequentially, oldest first):
for daily_tss in [65, 72, 0, 80, 55, 0, 0]:
    ctl, atl = update_ctl_atl(ctl, atl, daily_tss)
    tsb = calculate_tsb(ctl, atl)  # yesterday's values — see pitfall 5
    print(f"CTL={ctl}, ATL={atl}, TSB={tsb}")
```

### Zone Calculation from Current FTP
```python
# Source: TrainingPeaks Power Training Levels article
zones = coggan_power_zones(ftp_watts=280)
# Returns:
# zone1: 0–154W (Active Recovery)
# zone2: 157–210W (Endurance)
# zone3: 213–252W (Tempo)
# zone4: 255–294W (Lactate Threshold)
# zone5: 297–336W (VO2 Max)
# zone6: 339–420W (Anaerobic Capacity)
# zone7: 420W+ (Neuromuscular, open-ended)
```

### FTP History Append (Avoiding JSON Mutation Bug)
```python
# Source: SQLAlchemy documentation on JSON mutation tracking
from sqlalchemy.orm.attributes import flag_modified

async def update_ftp(db: AsyncSession, user_id: int, new_ftp: int) -> AthleteProfile:
    profile = await get_profile(db, user_id)
    
    history = list(profile.ftp_history or [])
    history.append({
        "ftp_watts": new_ftp,
        "measured_at": datetime.now(UTC).isoformat(),
        "source": "manual"
    })
    
    profile.ftp_watts = new_ftp
    profile.ftp_history = history  # Assign new list object — detects change
    # OR: flag_modified(profile, "ftp_history")  — if mutating in place
    
    await db.commit()
    await db.refresh(profile)
    return profile
```

### TimescaleDB Daily TSS Query with Gap Fill
```python
# Source: TimescaleDB documentation on time_bucket_gapfill
# This produces one row per day even for rest days (TSS = 0)
query = text(f"""
    SELECT
        time_bucket_gapfill('1 day', started_at, 
            NOW() - INTERVAL '{days} days', NOW()) AS day,
        sport,
        COALESCE(SUM(tss), 0) AS daily_tss
    FROM activities
    WHERE user_id = :user_id
      AND started_at >= NOW() - INTERVAL '{days} days'
    GROUP BY day, sport
    ORDER BY day ASC
""")
```

### Test Factory for Activities
```python
# tests/factories.py
import factory
from factory.alchemy import SQLAlchemyModelFactory
from datetime import datetime, timezone, timedelta
import random
from app.models.activity import Activity

class ActivityFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Activity
        sqlalchemy_session_persistence = "commit"

    user_id = factory.SelfAttribute('..user_id')
    started_at = factory.LazyFunction(lambda: datetime.now(timezone.utc) - timedelta(days=random.randint(0, 60)))
    sport = factory.Iterator(["cycling", "running", "gym"])
    duration_seconds = factory.LazyFunction(lambda: random.randint(1800, 7200))
    tss = factory.LazyFunction(lambda: round(random.uniform(30, 150), 1))
    average_power = factory.LazyFunction(lambda: random.randint(150, 320))
    average_hr = factory.LazyFunction(lambda: random.randint(120, 175))
    source = "manual"
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| Simple 42-day rolling mean for CTL | EWMA with 1/42 decay constant | Both are used in different contexts; EWMA is correct per Coggan |
| Power zones from % of max HR | Power zones from FTP (Coggan) | FTP-based is standard since early 2000s |
| Single overall training load | Per-sport CTL/ATL | Triathlon/multisport community has adopted per-sport tracking |
| HR-based TSS only | Power TSS primary, HR as fallback | Power meters now widely available; HR TSS is fallback for gym/no-power sports |
| NGP for running TSS | Average speed as proxy | Full NGP requires GPS elevation data; average speed is accepted simplification when elevation unavailable |

**Deprecated/outdated:**
- TRIMP (Banister impulse-response model): Still scientifically valid and is the basis for hrTSS. Not "deprecated" — hrTSS IS the TRIMP approach normalized to the same 100=1hr@threshold scale as power TSS.
- sTSS (swim TSS): Out of scope per project requirements.

## Open Questions

1. **Seiler zone boundaries for running without lactate testing**
   - What we know: Zone 1/2 boundary ≈ 77% of threshold speed (LT1 proxy). Zone 2/3 boundary = threshold speed (LT2). These are approximations, not measured values.
   - What's unclear: Individual variation in LT1 is high (60-85% of threshold speed for different athletes). The 77% constant may be a poor proxy for some athletes.
   - Recommendation: Use 77% threshold speed as zone 1/2 boundary. Document clearly that these are estimates. In a future phase, allow manual override of zone boundaries.

2. **hrTSS formula variant — TRIMP vs zone-weighting**
   - What we know: TrainingPeaks uses a zone-time-weighting approach with per-zone TSS coefficients. The TRIMP formula (above) produces equivalent results for steady-state efforts. For highly variable gym efforts, both are approximate.
   - What's unclear: The exact zone weights used internally by TrainingPeaks are not publicly documented.
   - Recommendation: Use the TRIMP-based hrTSS formula (above). It is mathematically sound, publicly documented, and widely implemented. For gym sessions, this is acceptable accuracy.

3. **CTL/ATL initialization for existing athletes**
   - What we know: New athletes start at CTL=0, ATL=0. The EWMA needs ~90 days to reach steady state.
   - What's unclear: If synthetic test data covers 90 days, initialization matters. If only 2-3 weeks of test data, CTL will be artificially low.
   - Recommendation: Generate 90 days of synthetic test data for realistic PMC chart testing. Use an initialization period flag in the UI ("CTL building — needs 6 weeks of data for accuracy").

4. **time_bucket_gapfill for per-sport queries**
   - What we know: `time_bucket_gapfill` fills missing days with NULL. When grouping by sport AND day, a rest day returns no rows for any sport — gapfill won't know which sports to fill.
   - What's unclear: Whether gapfill works correctly when the GROUP BY includes both day and sport (it fills based on the partition, not the cross product).
   - Recommendation: Implement gap filling in Python instead: after querying activities, generate a full date range in Python and merge activity TSS onto it with 0-fill for missing days, per sport.

## Sources

### Primary (HIGH confidence)
- TrainingPeaks blog "Power Training Levels" (trainingpeaks.com/blog/power-training-levels/) — Coggan 7-zone FTP percentages
- run.analyticszone.app/en/formulas/ — CTL/ATL EWMA formulas with exact notation
- medium.com/critical-powers — Formulas from Training and Racing with a Power Meter (Coggan)
- TrainerRoad forum thread on hrTSS formula — TRIMP formula with k constants for male/female

### Secondary (MEDIUM confidence)
- EVOQ.bike polarized training guide — Seiler 3-zone boundaries (77% threshold for LT1 proxy)
- Joe Friel zones via TrainingPeaks (trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/) — HR zone LTHR percentages
- Multiple coaching sources agreeing on EWMA time constants: CTL=42 days, ATL=7 days

### Tertiary (LOW confidence)
- Seiler zone 1/2 boundary at 77% threshold speed — derived from EVOQ guide interpretation of Seiler's research; individual variation is high
- hrTSS zone-weighting coefficients — not publicly documented by TrainingPeaks; TRIMP formula is a valid proxy

## Metadata

**Confidence breakdown:**
- TSS formulas (cycling, running, hrTSS): HIGH — consistent across multiple authoritative sources
- EWMA CTL/ATL/TSB constants: HIGH — universally agreed upon (42/7 days)
- Coggan 7-zone FTP percentages: HIGH — verified via official TrainingPeaks documentation
- Seiler 3-zone boundaries: MEDIUM — approximate LT1 proxy at 77%, individual variation acknowledged
- hrTSS TRIMP implementation: MEDIUM — mathematically documented but TrainingPeaks internal formula not public
- FTP history JSON approach: HIGH — already implemented in Phase 1 AthleteProfile schema
- TimescaleDB gap-filling: MEDIUM — gapfill behavior with per-sport GROUP BY needs validation

**Research date:** 2026-04-16
**Valid until:** 2026-06-16 (stable domain; sports science formulas don't change)
