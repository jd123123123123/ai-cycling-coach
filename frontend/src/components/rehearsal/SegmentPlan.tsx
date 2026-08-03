import type { RehearsalChapter } from '../../api/rehearsal'
import { formatDecimal, formatHms } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'
import { eyebrow } from '../dashboard/surfaces'

const ZONE_COLORS = [
  'var(--color-zone-1)',
  'var(--color-zone-2)',
  'var(--color-zone-3)',
  'var(--color-zone-4)',
  'var(--color-zone-5)',
]

/**
 * SegmentPlan — the plan, km by km.
 *
 * The simulator emits hundreds of 150 m segments; nobody rides to those. The
 * backend merges them into the four to eight stretches a rider would name out
 * loud, split where the road changes CHARACTER rather than where a gradient
 * crosses a threshold — so a brief false-flat inside a col stays part of the
 * col, the way a rider describing the ride would have it.
 *
 * This is the card a rider screenshots and tapes to their stem. Every row
 * therefore carries the three things needed to execute it and nothing else:
 * where it is, what it costs, and how long it lasts.
 */
export default function SegmentPlan({
  chapters,
  de,
}: {
  chapters: RehearsalChapter[]
  de: boolean
}) {
  if (!chapters || chapters.length === 0) return null

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span
          className="eyebrow"
          style={eyebrow('var(--color-ink-2)')}
        >
          {de ? 'DER PLAN, KM FÜR KM' : 'THE PLAN, KM BY KM'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
          {de ? `${chapters.length} Abschnitte` : `${chapters.length} segments`}
        </span>
      </div>

      {chapters.map((c, i) => (
        <div key={`${c.start_m}-${c.end_m}`}>
          {i > 0 && <div style={{ height: 1, background: 'var(--color-rule)', margin: '4px 0 10px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 800,
                color: ZONE_COLORS[c.zone - 1] ?? ZONE_COLORS[1],
                background: `color-mix(in srgb, ${ZONE_COLORS[c.zone - 1] ?? ZONE_COLORS[1]} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${ZONE_COLORS[c.zone - 1] ?? ZONE_COLORS[1]} 40%, transparent)`,
              }}
            >
              Z{c.zone}
            </span>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                {chapterName(c, de)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {`${formatDecimal(c.length_m / 1000, de)} km`}
                {c.kind === 'climb' ? ` @ ${formatDecimal(c.avg_gradient_pct, de)} %` : ''}
                {' · '}
                {kmMark(c.start_m, de)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flex: '0 0 auto' }}>
              <span
                className="num-display"
                style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatHms(c.duration_s)}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--color-ink-2)' }}>
                @ {Math.round(c.avg_power_w)} W
              </span>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

/** A name a rider would recognise, from the shape of the road. */
function chapterName(c: RehearsalChapter, de: boolean): string {
  const steep = c.avg_gradient_pct >= 7
  if (c.kind === 'climb') {
    return steep ? (de ? 'Steiler Anstieg' : 'Steep climb') : de ? 'Anstieg' : 'The climb'
  }
  if (c.kind === 'descent') return de ? 'Abfahrt' : 'Descent'
  return de ? 'Flaches Stück' : 'Flat run'
}

function kmMark(m: number, de: boolean): string {
  return `${de ? 'ab km' : 'from km'} ${Math.round(m / 1000)}`
}
