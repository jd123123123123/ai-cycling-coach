import type { CSSProperties } from 'react'
import { isPresent, type Value } from '../data/value'
import type { DayState } from '../state/dayState'
import { scrimGradient, type ScrimStop } from './plateScrim'

/** Tomorrow Plate / Route Plate's Scrim shape is identical across all three
 *  states — only `--e-ground` (rebound per state) differs. Stops: 08→3%,
 *  33→20%, E0→88%, FF→100%. */
const PLATE_SCRIM: ScrimStop[] = [
  { pos: 0, alpha: 3 }, { pos: 42, alpha: 20 }, { pos: 78, alpha: 88 }, { pos: 100, alpha: 100 },
]

const layer: CSSProperties = { position: 'absolute', inset: 0, zIndex: -1 }
const kickerStyle: CSSProperties = { fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6 }
const captionStyle: CSSProperties = { fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }
const reasonStyle: CSSProperties = { fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0' }

export interface TomorrowPlateProps {
  state: DayState
  /** e.g. "TOMORROW · 05:00" (Rest/Trained) or "TODAY · 17:30" (Training's
   *  Route Plate) — assembled by the caller since TodayModel has no source
   *  for a session's own start time; almost always missing today. */
  kickerLeft: Value<string>
  /** e.g. "THRESHOLD" or "SUNSET 21:14". */
  kickerRight: Value<string>
  title: Value<string>
  /** e.g. "40 KM · 640 M" — route distance/elevation; TodayModel has no
   *  route data anywhere, so this is honestly missing on every screen today. */
  captionLeft: Value<string>
  /** e.g. "TODAY MAKES IT POSSIBLE" or, for Training's Route Plate, a real
   *  interval summary derived from the session's own blocks. */
  captionRight: Value<string>
  /** No TodayModel photo field — see Cover's own doc comment. */
  photoUrl?: string | null
}

/**
 * The photographic plate that closes Rest's and Trained's sections
 * ("Tomorrow Plate": `WUjdn` Rest, `hODVO` Trained) and Training's own
 * session-of-today variant ("Route Plate": `hQVuk`) — identical geometry,
 * different copy register (tomorrow's plan vs. today's own ride). 246 tall
 * in the pen, but — same correction as `Cover`/`QuotePlate` — that height
 * is the photo's own envelope; without one the plate collapses to its
 * content's height (coordinator visual review, defect 1). Every field is
 * independently a `Value`; missing fields dash in place, and every DISTINCT
 * reason across them collapses to ONE combined line below the plate
 * (coordinator visual review, defect 3 — two separate reason paragraphs
 * read as a stacked list inside this compact a plate; `InsightStrip` and
 * the absorption tiles fold multiple reasons into one line the same way).
 */
export default function TomorrowPlate({
  state, kickerLeft, kickerRight, title, captionLeft, captionRight, photoUrl,
}: TomorrowPlateProps) {
  const fields = [kickerLeft, kickerRight, title, captionLeft, captionRight]
  const reasons = [...new Set(fields.filter((f): f is { missing: string } => !isPresent(f)).map((f) => f.missing))]

  return (
    <div
      data-tomorrow-plate
      data-day-state={state}
      style={{
        width: '100%',
        height: photoUrl ? 246 : undefined,
        overflow: 'hidden',
        position: 'relative',
        padding: '0 24px 18px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: photoUrl ? `center / cover no-repeat url(${photoUrl}), var(--e-ground)` : 'var(--e-ground)',
      }}
    >
      {photoUrl && (
        <>
          <div data-photo-layer style={{ ...layer, background: 'var(--e-photo-sat-plate)', mixBlendMode: 'saturation' }} />
          <div data-photo-layer style={{ ...layer, background: 'var(--e-photo-tint-plate)', mixBlendMode: 'color' }} />
        </>
      )}
      <div data-scrim style={{ ...layer, background: scrimGradient(PLATE_SCRIM) }} />

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...kickerStyle, color: 'var(--st-active)' }}>{isPresent(kickerLeft) ? kickerLeft.value : '—'}</span>
          <span style={{ ...kickerStyle, color: 'var(--e-mid)' }}>{isPresent(kickerRight) ? kickerRight.value : '—'}</span>
        </div>

        <p
          style={{
            margin: 0, fontFamily: 'var(--e-display)', fontSize: 26, fontWeight: 800,
            letterSpacing: -1.1, lineHeight: 1.05, color: 'var(--e-ink)',
          }}
        >
          {isPresent(title) ? title.value : '—'}
        </p>

        <div style={{ width: '100%', height: 1, background: 'var(--e-rule-strong)' }} />

        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ ...captionStyle, color: 'var(--e-ink)' }}>{isPresent(captionLeft) ? captionLeft.value : '—'}</span>
          <span style={{ ...captionStyle, color: 'var(--st-active)' }}>{isPresent(captionRight) ? captionRight.value : '—'}</span>
        </div>

        {reasons.length > 0 && <p data-plate-reason style={reasonStyle}>{reasons.join(' ')}</p>}
      </div>
    </div>
  )
}
