---
phase: 02-training-engine
plan: 01
subsystem: testing
tags: [sports-science, tss, numpy, ewma, coggan, trimp, pmc, tdd]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: Python/FastAPI backend structure (app/ layout, pyproject.toml, .venv)
provides:
  - Pure Python sports science calculation module (training_load.py)
  - 9 tested functions: calculate_np, calculate_cycling_tss, calculate_running_tss,
    calculate_hr_tss, update_ctl_atl, calculate_tsb, coggan_power_zones,
    seiler_3_zones_running, compute_pmc_series
  - 55 unit tests covering all formulas and edge cases
  - Module-level constants for all sports science parameters
affects:
  - 02-02 (activity ingestion API will call these functions to compute TSS)
  - 02-03 (training load endpoints will call compute_pmc_series and zone functions)
  - Future phases using CTL/ATL/TSB in AI coaching recommendations

# Tech tracking
tech-stack:
  added:
    - numpy>=1.26 (NP rolling window convolution; added to pyproject.toml)
  patterns:
    - Pure functions pattern: all sports science math in one module, no FastAPI/SQLAlchemy imports
    - EWMA pattern: CTL/ATL via 1/42 and 1/7 decay (not rolling mean)
    - Module constants pattern: all magic numbers extracted to named constants at module level
    - TDD cycle: RED (import failure) -> GREEN (implementation) -> REFACTOR (constants)

key-files:
  created:
    - backend/app/services/training_load.py
    - backend/tests/test_training_load.py
    - backend/tests/__init__.py
  modified:
    - backend/pyproject.toml (added numpy>=1.26 dependency)

key-decisions:
  - "Lazy numpy import inside calculate_np() body keeps module importable with zero FastAPI/SQLAlchemy deps"
  - "NP test uses 60-second power blocks (not 1-second alternation) — 30s rolling window smooths sub-30s variation to mean"
  - "Cycling TSS expected value corrected to 61.73 (not 61.2) — verified against exact formula"

patterns-established:
  - "Pure functions pattern: app/services/training_load.py has zero DB/FastAPI imports — callable from any context"
  - "Constants at module top: CTL_TIME_CONSTANT, ATL_TIME_CONSTANT, TRIMP_K_MALE/FEMALE, SEILER_LT1_FRACTION, _COGGAN_ZONES"
  - "EWMA formula: CTL = prev + (TSS - prev) * (1/42) — NOT rolling mean"

# Metrics
duration: 4min
completed: 2026-04-16
---

# Phase 02 Plan 01: Sports Science Pure Functions Summary

**Coggan TSS, TRIMP hrTSS, EWMA CTL/ATL, Coggan 7-zone, and Seiler 3-zone pure functions — 55 tests passing via TDD RED-GREEN-REFACTOR**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-16T15:20:03Z
- **Completed:** 2026-04-16T15:24:36Z
- **Tasks:** 1 TDD feature (3 phases: RED, GREEN, REFACTOR)
- **Files modified:** 4

## Accomplishments

- 9 pure Python sports science functions with no FastAPI/SQLAlchemy dependencies
- 55 unit tests covering all formulas, boundary conditions, and edge cases
- All must-have truths verified: 100 TSS = 1hr@FTP/threshold/LTHR, EWMA decay confirmed, zones computed from FTP, rest-day decay proven
- numpy added as production dependency for Normalized Power rolling convolution

## Task Commits

Each TDD phase committed atomically:

1. **RED — Failing tests** - `2ee7711` (test: add failing tests for sports science pure functions)
2. **GREEN — Implementation** - `b08b9cb` (feat: implement sports science pure functions)
3. **REFACTOR — Extract constants** - `37345eb` (refactor: extract sports science constants to module level)

## Files Created/Modified

- `backend/app/services/training_load.py` - All 9 sports science pure functions (323 lines)
- `backend/tests/test_training_load.py` - 55 unit tests covering all functions (408 lines)
- `backend/tests/__init__.py` - Empty init making tests a package
- `backend/pyproject.toml` - Added numpy>=1.26 dependency

## Decisions Made

- **Lazy numpy import**: `import numpy as np` is placed inside `calculate_np()` body rather than module top. This keeps the module importable in contexts where numpy might not be available, and avoids coupling the entire module to numpy for non-NP operations.
- **NP test fix**: Initial test used 1-second alternating 100W/300W power. The 30-second rolling window averages these to exactly 200W per window, making NP = avg. Fixed to 60-second blocks — the rolling window then has genuine variation and NP > average.
- **Cycling TSS expected value**: Initial comment said ~61.2 TSS for 220W/280 FTP, but the formula produces 61.73. Corrected test tolerance to match the actual verified value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NP variable effort test used wrong power variation pattern**
- **Found during:** GREEN phase (test run)
- **Issue:** Test used 1-second alternating 100W/300W. The 30s rolling average of this pattern is exactly 200W every window — NP equals the simple average. The test expected NP > average but it was equal.
- **Fix:** Changed power pattern to 60-second blocks (100W for 60s, then 300W for 60s). The rolling window now captures genuine within-window variation, producing NP ~239W vs avg 200W.
- **Files modified:** backend/tests/test_training_load.py
- **Verification:** NP variable effort test now passes (239 > 200)
- **Committed in:** b08b9cb (GREEN phase commit)

**2. [Rule 1 - Bug] Cycling TSS expected value in test was wrong**
- **Found during:** GREEN phase (test run)
- **Issue:** Test comment said ~61.2 TSS for 220W/280 FTP, but the exact Coggan formula gives 61.73. Test tolerance was 0.2 which caused failure.
- **Fix:** Corrected expected value to 61.73 and tightened tolerance to 0.1 for precision.
- **Files modified:** backend/tests/test_training_load.py
- **Verification:** Formula manually verified: (3600 * 220 * (220/280)) / (280 * 3600) * 100 = 61.7347
- **Committed in:** b08b9cb (GREEN phase commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — incorrect test values)
**Impact on plan:** Both fixes improved test accuracy, not scope changes. Formula implementation was correct throughout.

## Issues Encountered

- numpy not in venv on first check — installed via `.venv/bin/pip install numpy` (Rule 3 - blocking, handled immediately)
- python3.14 system binary broken (libexpat ABI mismatch) — used `.venv/bin/python` throughout (Python 3.13.7 in venv)

## User Setup Required

None - no external service configuration required. numpy installed to existing .venv.

## Next Phase Readiness

- `training_load.py` is ready for import by activity API (02-02) and training load endpoints (02-03)
- All 9 functions tested and verified against authoritative sports science formulas
- Import pattern: `from app.services.training_load import calculate_cycling_tss, compute_pmc_series, ...`
- Potential concern: `compute_pmc_series` fills rest days via Python date iteration — fine for daily grain; TimescaleDB gap-fill query pattern should be used for raw activity aggregation in 02-02/02-03

---
*Phase: 02-training-engine*
*Completed: 2026-04-16*
