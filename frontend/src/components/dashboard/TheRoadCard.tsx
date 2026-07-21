/**
 * TheRoadCard — the Today "Training Load" snapshot.
 *
 * Matches pencil-new.pen "V3 · Today" → Load Card (node mDpsp) 1:1: a
 * "TRAININGSLAST" header with a ramp pill, two horizontal Fitness/Fatigue
 * bars (CTL / ATL), a Form callout pill (TSB + a plain-words gloss) and a
 * one-line, real-data caption. Tapping the card opens the full load & form
 * detail (/load-form), where the forward-looking corridor lives.
 *
 * Renders whenever the athlete has real PMC — the numbers arrive as integers
 * from the shared latestLoad selector (props), so this card can never disagree
 * with the greeting's Form chip (displayed TSB = displayed CTL − ATL).
 */
import { Link } from 'react-router-dom'
import { BatteryCharging, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

export interface LoadNarrative {
  ramp: { label: string; color: string; dir: 'up' | 'down' | 'flat' } | null
  form: { value: string; color: string; note: string } | null
  caption: string | null
}

/**
 * Pure, testable copy for the load snapshot — the ramp pill, the Form callout
 * and the plain-words caption, all synthesized from REAL PMC numbers. A null
 * input simply drops its element; nothing is ever invented.
 */
export function loadSnapshotNarrative(
  ctl: number | null,
  atl: number | null,
  tsb: number | null,
  dCtl: number | null,
  de: boolean,
): LoadNarrative {
  const ramp: LoadNarrative['ramp'] =
    dCtl == null ? null
      : dCtl > 8 ? { label: de ? 'Steiler Aufbau' : 'Steep ramp', color: 'var(--color-amber)', dir: 'up' }
      : dCtl >= 1 ? { label: de ? 'Optimaler Aufbau' : 'Optimal ramp', color: 'var(--color-recovery)', dir: 'up' }
      : dCtl <= -1 ? { label: de ? 'Fitness lässt nach' : 'Fitness easing', color: 'var(--color-muted)', dir: 'down' }
      : { label: de ? 'Fitness hält' : 'Holding steady', color: 'var(--color-muted)', dir: 'flat' }

  const form: LoadNarrative['form'] =
    tsb == null ? null : {
      value: `Form ${tsb >= 0 ? '+' : ''}${tsb}`,
      color: tsb >= -10 ? 'var(--color-recovery)' : 'var(--color-amber)',
      note: tsb >= 10 ? (de ? 'frische Beine' : 'fresh legs')
        : tsb >= -10 ? (de ? 'gute Balance' : 'good balance')
        : (de ? 'Ermüdung baut sich auf' : 'fatigue building'),
    }

  const caption = (() => {
    if (ctl == null || atl == null) return null
    const fitness = dCtl == null || dCtl === 0
      ? (de ? 'Fitness hält' : 'Fitness holding')
      : dCtl > 0 ? (de ? 'Fitness steigt' : 'Fitness up')
      : (de ? 'Fitness lässt nach' : 'Fitness easing')
    const fatigue = tsb == null
      ? (de ? 'Ermüdung im Griff' : 'fatigue in check')
      : tsb >= 5 ? (de ? 'Ermüdung baut ab' : 'fatigue easing')
      : tsb <= -15 ? (de ? 'Ermüdung ist hoch' : 'fatigue running high')
      : (de ? 'Ermüdung im Griff' : 'fatigue in check')
    const tail = tsb != null && tsb <= -15
      ? (de ? ' — Zeit, etwas Last rauszunehmen.' : ' — time to ease off a touch.')
      : dCtl != null && dCtl < 0
        ? (de ? ' — die Form frischt auf.' : ' — form is freshening.')
        : (de ? ' — du baust auf, ohne dich einzugraben.' : " — you're building without digging a hole.")
    return `${fitness}, ${fatigue}${tail}`
  })()

  return { ramp, form, caption }
}

/** Bar fill fraction (0–1). Both bars share one scale so their lengths are
 *  directly comparable; the scale keeps ~25% headroom above the larger value,
 *  matching the pen's proportions (CTL 68 / ATL 54 → ~80% / ~64%). */
export function loadBarFraction(value: number | null, ctl: number | null, atl: number | null): number {
  if (value == null) return 0
  const scaleMax = Math.max(ctl ?? 0, atl ?? 0, 1) * 1.25
  return Math.max(0, Math.min(1, value / scaleMax))
}

export default function TheRoadCard({ ctlNow, atlNow, tsbNow, dCtl }: {
  ctlNow: number | null
  atlNow: number | null
  tsbNow: number | null
  dCtl: number | null
}) {
  const { locale } = useLocale()
  const de = locale === 'de'

  // Honest absence: with no PMC at all there is nothing to show. A single real
  // number (CTL or ATL) is enough to render — user 5's real CTL surfaces here.
  if (ctlNow == null && atlNow == null) return null

  const { ramp, form, caption } = loadSnapshotNarrative(ctlNow, atlNow, tsbNow, dCtl, de)
  const RampIcon = ramp?.dir === 'down' ? TrendingDown : ramp?.dir === 'flat' ? Minus : TrendingUp

  const rows: { name: string; code: string; value: number | null; color: string }[] = [
    { name: de ? 'Fitness' : 'Fitness', code: 'CTL', value: ctlNow, color: 'var(--color-strain)' },
    { name: de ? 'Ermüdung' : 'Fatigue', code: 'ATL', value: atlNow, color: 'var(--color-amber)' },
  ]

  return (
    <Link to="/load-form" className="hover-card rounded-[24px] p-5 flex flex-col gap-4" style={cardStyle}>
      {/* Head — TRAININGSLAST label + ramp pill + chevron (pen c6Ted) */}
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>
          {de ? 'TRAININGSLAST' : 'TRAINING LOAD'}
        </span>
        <div className="flex items-center gap-2">
          {ramp && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${ramp.color} 15%, transparent)` }}>
              <RampIcon size={13} style={{ color: ramp.color }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: ramp.color }}>{ramp.label}</span>
            </span>
          )}
          <ChevronRight size={18} className="hover-arrow" style={{ color: 'var(--color-muted)' }} />
        </div>
      </div>

      {/* PMC bars — Fitness / Fatigue on one shared scale (pen ndwna) */}
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.code} className="flex items-center gap-2.5">
            <div className="flex flex-col shrink-0" style={{ width: 62 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-2)', lineHeight: 1.1 }}>{r.name}</span>
              <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{r.code}</span>
            </div>
            <div className="flex-1 overflow-hidden rounded-full" style={{ height: 12, background: 'var(--color-surface-3)' }}>
              <div className="rounded-full" style={{ height: '100%', width: `${loadBarFraction(r.value, ctlNow, atlNow) * 100}%`, background: r.color }} />
            </div>
            <span className="num-display shrink-0 text-right" style={{ fontSize: 16, color: 'var(--color-ink)', width: 30 }}>{r.value != null ? Math.round(r.value) : '—'}</span>
          </div>
        ))}

        {/* Form callout — TSB pill + plain-words gloss (pen UHyU2) */}
        {form && (
          <div className="flex items-center gap-2" style={{ paddingTop: 2 }}>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${form.color} 15%, transparent)` }}>
              <BatteryCharging size={13} style={{ color: form.color }} />
              <span className="num-display" style={{ fontSize: 13, fontWeight: 700, color: form.color }}>{form.value}</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-muted)' }}>{form.note}</span>
          </div>
        )}
      </div>

      {/* Plain-words caption (pen a2b2K) */}
      {caption && (
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{caption}</p>
      )}
    </Link>
  )
}
