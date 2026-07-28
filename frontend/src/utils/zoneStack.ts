/**
 * Pure geometry for ZoneStack (components/debrief/ZoneStack.tsx). Split out so
 * the component file exports only a component — the repo's react-refresh rule —
 * while the arithmetic stays unit-testable.
 */
/** Minimum rendered width for a zone that has real time in it, so a 30-second
 *  effort in Z5 doesn't vanish to a sub-pixel sliver. */
const MIN_SEGMENT_PCT = 1.5

export function fmtZoneClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

/** Segment widths in %, with tiny-but-real zones floored to MIN_SEGMENT_PCT and
 *  the surplus taken back proportionally from the larger ones so the row still
 *  sums to 100. Exported for tests. */
export function zoneSegmentWidths(seconds: number[]): number[] {
  const total = seconds.reduce((a, s) => a + Math.max(0, s), 0)
  if (total <= 0) return seconds.map(() => 0)
  const raw = seconds.map((s) => (Math.max(0, s) / total) * 100)
  const floored = raw.map((p, i) => (seconds[i] > 0 ? Math.max(MIN_SEGMENT_PCT, p) : 0))
  const overshoot = floored.reduce((a, p) => a + p, 0) - 100
  if (overshoot <= 0) return floored
  // Give the surplus back only from segments that are above the floor, in
  // proportion to how much headroom each has.
  const headroom = floored.map((p) => Math.max(0, p - MIN_SEGMENT_PCT))
  const headroomTotal = headroom.reduce((a, h) => a + h, 0)
  if (headroomTotal <= 0) return floored
  return floored.map((p, i) => p - overshoot * (headroom[i] / headroomTotal))
}
