/**
 * RoadReadout — the DOM half of Today's Road.
 *
 * The canvas is aria-hidden, so this is the accessible surface: it is what a
 * screen reader gets and what an athlete actually reads while scrubbing. It
 * shows the interval under the scrub position and how many matches are left.
 * When CP/W′ are unknown the matches slot renders "—" — never a fake battery.
 */
import { useMemo } from 'react'
import type { RoadProfile, RoadSample } from '../../../utils/roadProfile'
import type { ResolvedBlock } from '../../../api/coach'

export interface ReadoutData {
  blockName: string
  elapsedS: number
  watts: number
  zone: number
  rpe: number | null
  matches: number | null
}

/**
 * Binary search for the sample nearest `t` in a `t`-sorted array (samples are
 * built in increasing index order by `buildRoadProfile`, and thus in
 * increasing `t`). `readoutAt` runs on every scrub frame, so this trades the
 * brief's O(n) linear scan for O(log n) — cheap to add, and avoids up to 512
 * comparisons per pointermove-driven render at the far end of a long ride.
 */
function nearestSample(samples: RoadSample[], t: number): RoadSample {
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(samples[lo - 1].t - t) <= Math.abs(samples[lo].t - t)) {
    return samples[lo - 1]
  }
  return samples[lo]
}

/** The sample nearest `travel` (0..1), resolved back to its source block. */
// eslint-disable-next-line react-refresh/only-export-components
export function readoutAt(
  profile: RoadProfile,
  blocks: ResolvedBlock[],
  travel: number,
): ReadoutData | null {
  const n = profile.samples.length
  if (n === 0) return null
  const t = Math.min(1, Math.max(0, travel))
  const best = nearestSample(profile.samples, t)
  const src = blocks[best.blockIndex]
  return {
    blockName: src?.name ?? '',
    elapsedS: Math.round(best.t * profile.totalDurationS),
    watts: Math.round(best.watts),
    zone: best.zone,
    rpe: src?.rpe ?? null,
    matches: best.wbal != null && profile.wPrime ? Math.max(0, best.wbal / profile.wPrime) : null,
  }
}

const MATCH_PIPS = 7

function mmss(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RoadReadout({ profile, blocks, travel, de }: {
  profile: RoadProfile
  blocks: ResolvedBlock[]
  travel: number
  de: boolean
}) {
  const d = useMemo(() => readoutAt(profile, blocks, travel), [profile, blocks, travel])
  if (!d) return null

  const filled = d.matches != null ? Math.round(d.matches * MATCH_PIPS) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{mmss(d.elapsedS)}</span>
      <strong>{d.watts} W</strong>
      <span>{`Z${Math.min(d.zone, 7)}`}</span>
      {d.rpe != null && <span style={{ opacity: 0.7 }}>{`RPE ${d.rpe}`}</span>}
      {d.blockName && <span style={{ opacity: 0.7 }}>{d.blockName}</span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ opacity: 0.7 }}>{de ? 'Streichhölzer' : 'Matches'}</span>
        <span data-testid="road-matches" style={{ letterSpacing: 1 }}>
          {d.matches == null ? '—' : '▮'.repeat(filled) + '▯'.repeat(MATCH_PIPS - filled)}
        </span>
      </span>
    </div>
  )
}
