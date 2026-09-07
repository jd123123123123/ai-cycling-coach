import { motion, useReducedMotion } from 'motion/react'
import { TrendingUp } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import { lux, TNUM } from './w3surfaces'
import W3Eyebrow from './W3Eyebrow'

/**
 * W3 · THE PROFILE'S NEW BLOCKS — pen frame `pMYpt`.
 *
 * The season grid, the form curve and the active bike. Everything else the
 * frame shows — the portrait, the level meter, the power bests, the badge
 * shelf — the Biker screen already had; these three are what it did not.
 *
 * Each renders only from data the app really holds, and returns null rather
 * than a placeholder when it does not. That matters more here than on most
 * screens: a profile is the page a rider shows someone else, and a made-up
 * figure on it is a lie they would repeat out loud.
 */

const nf = new Intl.NumberFormat('de-DE')
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

// ── the season, in four numbers ─────────────────────────────────────────────

export interface W3SeasonStat {
  label: string
  value: string
  unit?: string
  /** "+18 % zum Vorjahr" — the comparison, or null when there is none to make. */
  note: string | null
}

/**
 * A 2×2 grid, because four numbers in a row at 390px are four numbers nobody
 * reads. The pen puts the comparison UNDER each figure rather than beside it,
 * which is what lets the note be a sentence ("Ø 620 hm / Fahrt") instead of a
 * chip that has to be a symbol.
 */
export function W3SeasonGrid({ title, stats, onAll }: {
  title: string
  stats: W3SeasonStat[]
  onAll?: () => void
}) {
  if (stats.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <W3Eyebrow>{title}</W3Eyebrow>
        {onAll && (
          <button type="button" onClick={onAll} style={{
            border: 0, background: 'transparent', cursor: 'pointer', fontFamily: FONT,
            fontSize: 12, fontWeight: 600, color: T.mid, padding: 0,
          }}>Alle Zahlen</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 22, columnGap: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <W3Eyebrow>{s.label}</W3Eyebrow>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
              <span style={{ ...TNUM, fontSize: 27, fontWeight: 700, letterSpacing: -1.1, lineHeight: 1, color: T.ink }}>
                {s.value}
              </span>
              {s.unit && <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>{s.unit}</span>}
            </span>
            {/* Null, not an em dash: a figure with no comparison simply has no
                second line, and a dash there would read as a missing number. */}
            {s.note && (
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>{s.note}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── the form curve ──────────────────────────────────────────────────────────

/**
 * FORMSTAND over twelve weeks — the rider's CTL, drawn.
 *
 * THE AXIS IS TRUNCATED AND THAT IS THE ONLY HONEST CHOICE. Fitness moves
 * between roughly 40 and 90 for a trained rider; zero-based, twelve weeks of
 * real progress draws as a flat line in the top half of the box. The floor
 * sits just under the lowest point in the window, and both the current value
 * and the change are printed in full beside it — which is what keeps a
 * truncated axis honest rather than flattering.
 *
 * The delta is the app's own `ctl_7d_delta`, not something derived from the
 * ends of this series: the series is what the window happens to show, the
 * delta is what the training engine actually computed.
 */
export function W3FormCurve({ value, delta, series, months }: {
  value: number
  delta: number | null
  /** CTL per day, oldest first. */
  series: number[]
  /** Axis ticks, already localised and evenly spaced across the series. */
  months: string[]
}) {
  const reduce = useReducedMotion()
  if (series.length < 4) return null

  const W = 318, H = 96
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const floor = lo - (hi - lo || 1) * 0.25
  const span = hi - floor || 1
  const x = (i: number) => (i / (series.length - 1)) * W
  const y = (v: number) => H - ((v - floor) / span) * (H - 8) - 4
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${W} ${H} L0 ${H} Z`
  const last = series[series.length - 1]

  return (
    <div style={{ ...lux(24), padding: '16px 16px 14px', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <W3Eyebrow tone={T.acid}>Formkurve · 12 Wochen</W3Eyebrow>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ ...TNUM, fontSize: 34, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1, color: T.ink }}>
              {nf.format(Math.round(value))}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>Formstand</span>
          </span>
        </div>
        {delta != null && (
          <span style={{
            flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 11px', borderRadius: 100,
            background: delta >= 0 ? T.acidDim : T.d1,
            color: delta >= 0 ? T.acid : T.mid,
            ...TNUM, fontSize: 12, fontWeight: 700,
          }}>
            <TrendingUp size={12} color={delta >= 0 ? T.acid : T.mid}
              style={{ transform: delta >= 0 ? 'none' : 'scaleY(-1)' }} />
            {delta >= 0 ? '+' : '−'}{nf.format(Math.abs(Math.round(delta)))}
          </span>
        )}
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img" aria-label={`Formstand ${Math.round(value)}, zwölf Wochen`}
        style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="w3-form" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.acid} stopOpacity={0.34} />
            <stop offset="100%" stopColor={T.acid} stopOpacity={0} />
          </linearGradient>
        </defs>
        <motion.path d={area} fill="url(#w3-form)" stroke="none"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }} />
        <motion.path d={line} fill="none" stroke={T.acid} strokeWidth={2.2}
          strokeLinecap="round" strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }} />
        {/* Today, as a dot. The curve's whole point is where it ends. */}
        <circle cx={W} cy={y(last)} r={4.5} fill={T.acid} />
      </svg>

      {months.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {months.map((m, i) => (
            <span key={`${m}-${i}`} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── the bike in the garage ──────────────────────────────────────────────────

/**
 * The rider's active machine.
 *
 * The image is the rider's OWN render, never the stock starter bike — a
 * profile showing somebody else's bicycle as yours is worse than showing none,
 * so with no render this draws the frame and the facts without a picture.
 */
export function W3ActiveBike({ name, imageUrl, weightKg, km, count, onCustomise }: {
  name: string
  imageUrl: string | null
  weightKg: number | null
  km: number | null
  count: number | null
  onCustomise?: () => void
}) {
  const facts = [
    weightKg != null ? `${nf1.format(weightKg)} kg` : null,
    // "km gefahren" under a bike's name claimed the RIDER's season for the
    // machine (and silently reset every January). Named honestly until
    // per-bike distance is modelled.
    km != null ? `deine Saison: ${nf.format(Math.round(km))} km` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <W3Eyebrow>Garage · Aktives Rad</W3Eyebrow>
        {count != null && (
          <span style={{ ...TNUM, fontSize: 12, fontWeight: 600, color: T.mid }}>
            {count === 1 ? '1 Rad' : `${count} Räder`}
          </span>
        )}
      </div>

      <div style={{ ...lux(24), padding: 0, overflow: 'hidden' }}>
        {imageUrl && (
          <img src={imageUrl} alt="" style={{
            display: 'block', width: '100%', height: 196, objectFit: 'cover',
            background: T.heroDock,
          }} />
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px 15px', minWidth: 0,
        }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 15.5, fontWeight: 700, letterSpacing: -0.3, color: T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{name}</span>
            <span style={{ ...TNUM, fontSize: 11.5, fontWeight: 500, color: T.quiet }}>
              {facts || DASH}
            </span>
          </span>
          {onCustomise && (
            <button type="button" onClick={onCustomise} style={{
              flex: 'none', border: 0, borderRadius: 100, padding: '10px 16px',
              background: T.surface2, color: T.ink, fontFamily: FONT,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}>Anpassen</button>
          )}
        </div>
      </div>
    </div>
  )
}
