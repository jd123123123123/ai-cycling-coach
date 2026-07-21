/**
 * BlockBars — the interval bar chart (Balkendiagramm) for a prescribed
 * session, shared by the SessionOfTheDay card on Today AND Train.
 *
 * Reuses the app's established block visualization language (zone-token
 * colors + %FTP-proportional heights from WorkoutDetailView's Interval
 * Profile / the old PlanTab hero) and adds the two things those renderers
 * approximated: duration-proportional widths and proper on/off rendering for
 * composite micro-interval sets ("30×30/30 micro set" expands into real
 * on/off stripes when the block data allows it). Pure expansion is exported
 * for vitest.
 */
import type { ResolvedBlock } from '../../api/coach'

export const zoneColor = (z: number) => `var(--color-zone-${Math.min(7, Math.max(1, z))})`

export interface BarSegment {
  duration_s: number
  /** effort fraction driving bar height (target %FTP, or zone-derived) */
  pct: number
  zone: number
}

/** LEGACY fallback only — "30×30/30 micro set" style composite names → reps.
 *  Old persisted rows predate the explicit reps/on_s/off_s fields; new data
 *  always carries real structure and never goes through name parsing. */
const MICRO_RE = /(\d+)\s*×\s*(\d+)\s*\/\s*(\d+)/

/** Coggan zone from a %FTP fraction — colors the OFF stripes honestly
 *  (a 95% "under" is Z4 work, a 50% recovery spin is Z1). */
export const zoneForPct = (pct: number): number => {
  if (pct <= 0.55) return 1
  if (pct <= 0.75) return 2
  if (pct <= 0.9) return 3
  if (pct <= 1.05) return 4
  if (pct <= 1.2) return 5
  if (pct <= 1.5) return 6
  return 7
}

/** Expand prescribed blocks into drawable segments. Blocks carrying explicit
 *  set structure (reps/on_s/off_s from the backend) become alternating on/off
 *  stripes at their real intensities; legacy rows without the fields fall back
 *  to name parsing (N×on/off whose rep math fits the duration); everything
 *  else maps 1:1. */
export function expandBlocks(blocks: ResolvedBlock[]): BarSegment[] {
  const out: BarSegment[] = []
  for (const b of blocks) {
    const pct = b.target_pct_ftp > 0 ? b.target_pct_ftp : b.zone / 7
    // Real structure first — the serialized truth, no guessing.
    if (b.reps != null && b.reps >= 2 && b.on_s != null && b.on_s > 0 && b.off_s != null && b.off_s > 0) {
      const offPct = b.off_pct_ftp ?? Math.min(0.5, pct * 0.45)
      const offZone = b.off_pct_ftp != null ? zoneForPct(b.off_pct_ftp) : 1
      for (let i = 0; i < b.reps; i++) {
        out.push({ duration_s: b.on_s, pct, zone: b.zone })
        out.push({ duration_s: b.off_s, pct: offPct, zone: offZone })
      }
      continue
    }
    const m = (b.name ?? '').match(MICRO_RE)
    if (m) {
      const reps = parseInt(m[1], 10)
      const onS = parseInt(m[2], 10)
      const offS = parseInt(m[3], 10)
      const repTotal = reps * (onS + offS)
      // Only expand when the rep math actually fits the block's duration
      // (±10%) — otherwise the name is prose, not structure. Honest data only.
      if (reps >= 2 && reps <= 60 && repTotal > 0 && Math.abs(repTotal - b.duration_s) / b.duration_s <= 0.1) {
        for (let i = 0; i < reps; i++) {
          out.push({ duration_s: onS, pct, zone: b.zone })
          out.push({ duration_s: offS, pct: Math.min(0.5, pct * 0.45), zone: 1 })
        }
        continue
      }
    }
    out.push({ duration_s: b.duration_s, pct, zone: b.zone })
  }
  return out
}

export default function BlockBars({ blocks, height = 96 }: {
  blocks: ResolvedBlock[]
  height?: number
}) {
  const segments = expandBlocks(blocks)
  const total = segments.reduce((a, s) => a + s.duration_s, 0)
  if (segments.length === 0 || total <= 0) return null
  return (
    <div className="flex items-end w-full" style={{ height, gap: 1 }}>
      {segments.map((s, i) => {
        // Height: %FTP scaled so 135% FTP tops out; zone fallback for no-watt
        // blocks. Same effort math as the detail page's terrain header.
        const frac = Math.min(1, s.pct / 1.35)
        return (
          <div
            key={i}
            className="rounded-t-[3px]"
            style={{
              width: `${(s.duration_s / total) * 100}%`,
              height: Math.max(6, Math.round(frac * height)),
              background: zoneColor(s.zone),
              minWidth: 1,
            }}
          />
        )
      })}
    </div>
  )
}
