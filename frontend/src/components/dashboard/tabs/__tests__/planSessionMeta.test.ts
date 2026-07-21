import { describe, expect, it } from 'vitest'
import { cyclingAvgWatts, cyclingPeakLine, definingZone, fmtWattRange, weekBlockCode } from '../PlanTab'
import type { IntervalBlockOut } from '../../../../api/weeks'

const iv = (duration_seconds: number, pct: number | null, zone: number): IntervalBlockOut => ({
  duration_seconds,
  power_target_pct_ftp: pct,
  zone,
})

// A classic 4×15' sweet-spot day: warm-up, 4 reps @ 92%, cool-down.
const sweetSpot4x15: IntervalBlockOut[] = [
  iv(600, 0.55, 1),
  iv(900, 0.92, 4),
  iv(900, 0.92, 4),
  iv(900, 0.92, 4),
  iv(900, 0.92, 4),
  iv(600, 0.5, 1),
]

describe('cyclingAvgWatts (audit P2-14 — session-level headline)', () => {
  it('duration-weights the average across all powered blocks', () => {
    // (2×600×0.525 + 4×900×0.92) / 4800 = 0.82125 → ×300 W FTP ≈ 246 W
    expect(cyclingAvgWatts(sweetSpot4x15, 300)).toBe(246)
  })

  it('never fabricates without FTP or powered intervals', () => {
    expect(cyclingAvgWatts(sweetSpot4x15, null)).toBeNull()
    expect(cyclingAvgWatts([], 300)).toBeNull()
    expect(cyclingAvgWatts([iv(3600, null, 2)], 300)).toBeNull()
  })
})

describe('cyclingPeakLine (textfit handoff — labeled peaks, never peak-W·session-TSS)', () => {
  it('renders the WorkoutDetailView peakChip grammar in both locales', () => {
    expect(cyclingPeakLine(sweetSpot4x15, 300, true)).toBe('Spitzen: 4×15 Min @ 276 W (92 % FTP)')
    expect(cyclingPeakLine(sweetSpot4x15, 300, false)).toBe('Peaks: 4×15 min @ 276 W (92% FTP)')
  })

  it('drops the rep multiplier for a single peak block', () => {
    const single = [iv(600, 0.6, 2), iv(1200, 1.0, 4), iv(600, 0.6, 2)]
    expect(cyclingPeakLine(single, 250, true)).toBe('Spitzen: 20 Min @ 250 W (100 % FTP)')
  })

  it('formats non-whole-minute peaks as m:ss', () => {
    const micro = [iv(600, 0.6, 2), iv(30, 1.2, 5), iv(30, 1.2, 5), iv(30, 1.2, 5)]
    expect(cyclingPeakLine(micro, 200, false)).toBe('Peaks: 3×0:30 min @ 240 W (120% FTP)')
  })

  it('is null for steady single-zone rides and for missing FTP — nothing to call out, nothing fabricated', () => {
    const steady = [iv(1800, 0.65, 2), iv(1800, 0.65, 2)]
    expect(cyclingPeakLine(steady, 300, true)).toBeNull()
    expect(cyclingPeakLine(sweetSpot4x15, null, true)).toBeNull()
  })
})

describe('definingZone (finding #5 — badge = the defining effort, never time-dominant)', () => {
  it('labels a 6×3min@115% VO₂ day Z5 even when warm-up/recovery Z1 dominates the clock', () => {
    const vo2: IntervalBlockOut[] = [
      iv(900, 0.55, 1),
      ...Array.from({ length: 6 }, () => [iv(180, 1.15, 5), iv(180, 0.5, 1)]).flat(),
      iv(900, 0.5, 1),
    ]
    // Z1 total = 2880s (dominant); Z5 total = 1080s — the defining effort wins.
    expect(definingZone(vo2)).toBe(5)
  })

  it('labels a sweet-spot day by its work blocks and a steady Z2 ride as Z2', () => {
    expect(definingZone(sweetSpot4x15)).toBe(4)
    expect(definingZone([iv(3600, 0.65, 2)])).toBe(2)
  })

  it('ignores a <90s spike that is not a sustained effort', () => {
    expect(definingZone([iv(3600, 0.65, 2), iv(20, 1.5, 7)])).toBe(2)
  })

  it('aggregates repeated micro-intervals (30/30s) into a sustained zone', () => {
    const micro = [iv(600, 0.55, 1), ...Array.from({ length: 10 }, () => iv(30, 1.2, 5))]
    expect(definingZone(micro)).toBe(5)
  })

  it('falls back to the category class without intervals, and null with nothing', () => {
    expect(definingZone([], 'vo2')).toBe(5)
    expect(definingZone([], 'endurance')).toBe(2)
    expect(definingZone([], null)).toBeNull()
  })
})

describe('fmtWattRange (finding #2 — "0–0W" never reaches the screen)', () => {
  it('renders a real range and drops zero/absent bounds', () => {
    expect(fmtWattRange(180, 220)).toBe('180–220W')
    expect(fmtWattRange(0, 0)).toBeNull()
    expect(fmtWattRange(null, 220)).toBeNull()
    expect(fmtWattRange(180, undefined)).toBeNull()
  })
})

describe('weekBlockCode (finding #2 — 409 ftp_required gate)', () => {
  const err = (status: number, code?: string, detail?: string) => ({
    response: { status, headers: code ? { 'x-error-code': code } : {}, data: detail ? { detail } : {} },
  })

  it('detects the X-Error-Code header on a 409', () => {
    expect(weekBlockCode(err(409, 'ftp_required'))).toBe('ftp_required')
    expect(weekBlockCode(err(409, 'profile_required'))).toBe('profile_required')
  })

  it('falls back to the detail text, defaulting a bare 409 to ftp_required', () => {
    expect(weekBlockCode(err(409, undefined, 'Profil unvollständig'))).toBe('profile_required')
    expect(weekBlockCode(err(409))).toBe('ftp_required')
  })

  it('is null for non-409s and absent errors', () => {
    expect(weekBlockCode(err(500))).toBeNull()
    expect(weekBlockCode(null)).toBeNull()
    expect(weekBlockCode(undefined)).toBeNull()
  })
})
