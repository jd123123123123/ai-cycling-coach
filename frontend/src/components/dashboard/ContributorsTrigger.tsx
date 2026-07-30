import { lazy, Suspense, useState } from 'react'
import { Activity, HeartPulse, Moon, Gauge, ChevronRight } from 'lucide-react'

// Lazily loaded: the sheet pulls the biometrics charts (and uplot) with it, and
// Today should not pay for that until the athlete actually asks what drove the
// number.
const ContributorsSheet = lazy(() => import('./ContributorsSheet'))

/**
 * ContributorsTrigger — the one-row answer to "what drove that number", sitting
 * directly under the readiness ring.
 *
 * Both this and the coach's read used to render roughly 1.7 screens below the
 * ring at 390 px: the athlete scrolled past the whole session to reach the
 * explanation of the number they had just looked at. This row names the two
 * strongest contributors and opens the full sheet.
 *
 * It renders NOTHING while readiness is withheld. A score the app is honestly
 * declining to state must not get an explanation of what drove it — that is the
 * same gate the ring's medallion state uses (utils/readinessGate).
 *
 * Styling is the drivers row's, verbatim: no new visual language for a row that
 * sits four elements above the row it borrows from.
 */

/** Chip styling lifted from TodayTab's drivers row — same glass, same border. */
const CHIP_STYLE: React.CSSProperties = {
  background: '#14181DCC',
  border: '1px solid #FFFFFF14',
  backdropFilter: 'blur(10px)',
}

type Contributor = {
  key: 'hrv' | 'rhr' | 'sleep' | 'tsb'
  icon: typeof Activity
  label: string
  value: string
  /** Ranking weight — bigger wins a chip slot. */
  weight: number
}

export default function ContributorsTrigger({
  hrv,
  rhr,
  sleep,
  tsb,
  score,
  pending,
  de,
}: {
  hrv: number | null
  rhr: number | null
  sleep: number | null
  tsb: number | null
  score: number | null
  pending: boolean
  de: boolean
}) {
  const [open, setOpen] = useState(false)

  // No score, or a withheld one → nothing to explain.
  if (pending || score == null) return null

  // "Strongest" without a baseline in props is a claim this component cannot
  // make honestly, so it ranks by what it CAN defend: how far each signal sits
  // from its own neutral point (sleep 100 = perfect, TSB 0 = neutral) and,
  // for HRV and RHR, simply that a reading exists. Never invent a baseline.
  const candidates: Contributor[] = [
    hrv != null && {
      key: 'hrv' as const, icon: Activity, label: 'HRV',
      value: `${Math.round(hrv)} ms`, weight: 1,
    },
    sleep != null && {
      key: 'sleep' as const, icon: Moon, label: de ? 'Schlaf' : 'Sleep',
      value: `${Math.round(sleep)}`, weight: Math.abs(100 - sleep) / 10,
    },
    tsb != null && {
      key: 'tsb' as const, icon: Gauge, label: de ? 'Form' : 'Form',
      value: `${tsb >= 0 ? '+' : ''}${Math.round(tsb)}`, weight: Math.abs(tsb) / 5,
    },
    rhr != null && {
      key: 'rhr' as const, icon: HeartPulse, label: de ? 'Ruhepuls' : 'Resting HR',
      value: `${Math.round(rhr)} bpm`, weight: 1,
    },
  ].filter(Boolean) as Contributor[]

  const shown = [...candidates].sort((a, b) => b.weight - a.weight).slice(0, 2)

  return (
    <>
      <div className="flex items-center gap-2">
        {shown.map((c) => {
          const Icon = c.icon
          return (
            <span
              key={c.key}
              className="flex items-center gap-1.5 rounded-[14px]"
              style={{ ...CHIP_STYLE, padding: '7px 10px' }}
            >
              <Icon size={13} strokeWidth={2.2} style={{ color: 'var(--color-muted)' }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-muted)' }}>{c.label}</span>
              <span className="num-display" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>{c.value}</span>
            </span>
          )
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-[14px] ml-auto"
          style={{ ...CHIP_STYLE, padding: '7px 10px', minHeight: 32 }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
            {de ? 'Was dahinter steckt' : "What's driving it"}
          </span>
          <ChevronRight size={14} style={{ color: 'var(--color-muted)' }} />
        </button>
      </div>
      {open && (
        <Suspense fallback={null}>
          <ContributorsSheet open onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
