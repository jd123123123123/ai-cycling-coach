/**
 * TheRoadCard — the forward-looking load corridor (roadmap P1.1).
 *
 * Gentler Streak's Activity Path, rebuilt on honest physics: the green
 * corridor is the safe-load envelope derived from fitness (CTL − 5 … CTL + 20,
 * i.e. TSB between +5 and −20), the line is rolling fatigue (ATL) — 21 days
 * behind you, today, and 10 days ahead under your actual plan (P0.3's
 * forward-PMC simulator). Bidirectional by design: the top edge warns against
 * overreaching, the bottom edge against drifting out of training.
 *
 * Tap a past day for its numbers; tap a future day to open that day's workout.
 * Single series + band → no legend; text wears ink tokens (dataviz rules).
 */
import { useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronRight, TrendingUp, TrendingDown, Route } from 'lucide-react'
import { usePMC } from '../../hooks/usePMC'
import { useRecoveryEta } from '../../hooks/useRecoveryEta'
import { useLocale } from '../../contexts/LocaleContext'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

// Corridor physics: ATL above CTL+20 ≙ TSB < −20 (overreach territory);
// ATL below CTL−5 ≙ TSB > +5 (freshness drifting toward detraining).
const BAND_TOP = 20
const BAND_BOTTOM = 5
const PAST_DAYS = 21


interface RoadDay {
  date: string
  ctl: number
  atl: number
  future: boolean
}

export default function TheRoadCard({ ctlNow, atlNow, tsbNow, dCtl }: {
  ctlNow: number | null
  atlNow: number | null
  tsbNow: number | null
  dCtl: number | null
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const { data: pmc } = usePMC(90)
  const { data: eta } = useRecoveryEta()
  const [hi, setHi] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const days: RoadDay[] = useMemo(() => {
    const past = (pmc?.entries ?? []).slice(-PAST_DAYS).map((e) => ({
      date: e.date, ctl: e.ctl, atl: e.atl, future: false,
    }))
    const future = (eta?.days ?? []).map((d) => ({
      date: d.date, ctl: d.ctl, atl: d.atl, future: true,
    }))
    return [...past, ...future]
  }, [pmc, eta])

  const todayIdx = useMemo(() => {
    const n = days.filter((d) => !d.future).length
    return Math.max(0, n - 1)
  }, [days])

  const chart = useMemo(() => {
    if (days.length < 8) return null
    const W = 320, H = 116, pad = 8
    const upper = days.map((d) => d.ctl + BAND_TOP)
    const lower = days.map((d) => Math.max(0, d.ctl - BAND_BOTTOM))
    const vals = [...days.map((d) => d.atl), ...upper, ...lower]
    const min = Math.max(0, Math.min(...vals) - 6)
    const max = Math.max(...vals) + 6
    const x = (i: number) => pad + (i / (days.length - 1)) * (W - 2 * pad)
    const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (H - 2 * pad)
    const path = (get: (d: RoadDay, i: number) => number, idxs: number[]) =>
      idxs.map((i, k) => `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(get(days[i], i)).toFixed(1)}`).join(' ')
    const all = days.map((_, i) => i)
    const band = [
      ...all.map((i, k) => `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(upper[i]).toFixed(1)}`),
      ...[...all].reverse().map((i) => `L${x(i).toFixed(1)},${y(lower[i]).toFixed(1)}`),
      'Z',
    ].join(' ')
    const pastIdxs = all.slice(0, todayIdx + 1)
    const futureIdxs = all.slice(todayIdx)
    return {
      W, H, x, y, band,
      atlPast: path((d) => d.atl, pastIdxs),
      atlFuture: path((d) => d.atl, futureIdxs),
      todayX: x(todayIdx),
      todayY: y(days[todayIdx]?.atl ?? 0),
    }
  }, [days, todayIdx])

  // Position-in-band → the verbal state (bidirectional, self-relative).
  const state = useMemo(() => {
    if (ctlNow == null || atlNow == null) return null
    const top = ctlNow + BAND_TOP
    const bottom = ctlNow - BAND_BOTTOM
    const span = Math.max(1, top - bottom)
    const pos = (atlNow - bottom) / span // 0 = bottom edge, 1 = top edge
    if (atlNow > top) return { color: 'var(--color-amber)', text: de ? 'Über der Kante — Erholung verdient jetzt den nächsten Block.' : 'Over the edge — recovery earns the next block now.' }
    if (atlNow < bottom) return { color: 'var(--color-recovery)', text: de ? 'Sehr frisch — Zeit, wieder Last aufzunehmen.' : 'Very fresh — time to pick the load back up.' }
    if (pos > 0.72) return { color: 'var(--color-amber)', text: de ? 'Oben im Korridor — produktiv, aber nah an der Kante.' : 'High in the corridor — productive, but near the edge.' }
    if (pos < 0.25) return { color: 'var(--color-recovery)', text: de ? 'Unten im Korridor — Luft für mehr, wenn du willst.' : 'Low in the corridor — headroom to push if you want it.' }
    return { color: 'var(--color-recovery)', text: de ? 'Mitten im Korridor — genau die Balance, die Fitness baut.' : 'Middle of the corridor — exactly the balance that builds fitness.' }
  }, [ctlNow, atlNow, de])

  const idxAt = (clientX: number): number | null => {
    const el = ref.current
    if (!el || days.length < 2) return null
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return Math.round(f * (days.length - 1))
  }
  const pick = (clientX: number) => {
    const i = idxAt(clientX)
    if (i != null) setHi(i)
  }
  const sel = hi != null ? days[hi] : null

  // Navigate from the CLICK's own position — never from stale hover state
  // (a scroll-tap elsewhere must not teleport into a future workout).
  const onTap = (e: React.MouseEvent) => {
    const i = idxAt(e.clientX)
    if (i != null && days[i]?.future) navigate(`/workout/${days[i].date}`)
  }

  if (!chart) return null

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-3.5" style={cardStyle}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route size={16} style={{ color: 'var(--color-recovery)' }} />
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>
            {de ? 'DEINE STRASSE' : 'THE ROAD'}
          </span>
        </div>
        {dCtl != null && (() => {
          const chipColor = dCtl >= 0 ? 'var(--color-recovery)' : 'var(--color-amber)'
          return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${chipColor} 15%, transparent)` }}>
              {dCtl >= 0 ? <TrendingUp size={13} style={{ color: chipColor }} /> : <TrendingDown size={13} style={{ color: chipColor }} />}
              <span style={{ fontSize: 12, fontWeight: 600, color: chipColor }}>
                {dCtl >= 0 ? '+' : ''}{dCtl} {de ? 'Fitness/Wo.' : 'fitness/wk'}
              </span>
            </span>
          )
        })()}
      </div>

      {/* CTL/ATL/TSB stat row (absorbed from the Training Load card).
          P0-5: props arrive as integers from the shared latestLoad selector and
          are rendered VERBATIM — no re-rounding, so this row can never disagree
          with the Form chip upstream (displayed TSB = displayed CTL − ATL). */}
      <div className="flex">
        {([
          { v: ctlNow != null ? `${ctlNow}` : '—', n: de ? 'Fitness' : 'Fitness', c: 'CTL', color: 'var(--color-strain)' },
          { v: atlNow != null ? `${atlNow}` : '—', n: de ? 'Ermüdung' : 'Fatigue', c: 'ATL', color: 'var(--color-amber)' },
          { v: tsbNow != null ? `${tsbNow >= 0 ? '+' : ''}${tsbNow}` : '—', n: 'Form', c: 'TSB', color: 'var(--color-recovery)' },
        ]).map((s, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)' } : undefined}>
            <span className="num-display" style={{ fontSize: 24, color: s.color }}>{s.v}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{s.n}</span>
            <span className="eyebrow" style={{ fontSize: 9.5, letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{s.c}</span>
          </div>
        ))}
      </div>

      {/* The corridor: 21 days back → today → 10 days ahead */}
      <div className="flex flex-col gap-1">
        <div
          ref={ref}
          style={{ position: 'relative', width: '100%', height: chart.H, touchAction: 'none', cursor: 'pointer' }}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setHi(null)}
          onClick={onTap}
        >
          {sel && (
            <div className="num-mono" style={{ position: 'absolute', top: -2, left: 0, right: 0, textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--color-ink-2)', pointerEvents: 'none', zIndex: 1 }}>
              {format(parseISO(sel.date), de ? 'EE d.M.' : 'EEE M/d')} · {de ? 'Last' : 'Load'} {Math.round(sel.atl)}
              {sel.future && <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}> {de ? '→ Einheit ansehen' : '→ view session'}</span>}
            </div>
          )}
          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {/* safe-load corridor */}
            <path d={chart.band} fill="color-mix(in srgb, var(--color-recovery) 11%, transparent)" stroke="color-mix(in srgb, var(--color-recovery) 30%, transparent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {/* rolling load (ATL) — ridden (solid) and planned (dashed); amber
                to match the Fatigue stat above it */}
            <path d={chart.atlPast} fill="none" stroke="var(--color-amber)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <path d={chart.atlFuture} fill="none" stroke="var(--color-amber)" strokeWidth={2} strokeDasharray="4 5" opacity={0.75} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            {/* today */}
            <line x1={chart.todayX} x2={chart.todayX} y1={0} y2={chart.H} stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={chart.todayX} cy={chart.todayY} r={4.5} fill="var(--color-accent)" stroke="var(--color-paper-2)" strokeWidth={2} />
            {sel && hi != null && (
              <line x1={chart.x(hi)} x2={chart.x(hi)} y1={0} y2={chart.H} stroke="var(--color-ink-2)" strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        </div>
        <div style={{ position: 'relative', height: 14 }}>
          <span className="eyebrow" style={{ position: 'absolute', left: 0, fontSize: 10, color: 'var(--color-muted)' }}>{de ? `−${PAST_DAYS} TAGE` : `${PAST_DAYS}D BACK`}</span>
          {/* TODAY label pinned under the today marker, not screen-center */}
          <span className="eyebrow" style={{ position: 'absolute', left: `${(chart.todayX / chart.W) * 100}%`, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--color-ink-2)', fontWeight: 700 }}>{de ? 'HEUTE' : 'TODAY'}</span>
          <span className="eyebrow" style={{ position: 'absolute', right: 0, fontSize: 10, color: 'var(--color-muted)' }}>{de ? '+10T · PLAN' : '+10D · PLAN'}</span>
        </div>
      </div>

      {state && (
        <p style={{ fontSize: 12.5, fontWeight: 500, color: state.color, lineHeight: 1.4 }}>{state.text}</p>
      )}

      <Link to="/load-form" className="hover-card inline-flex items-center gap-1" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}>
        {de ? 'Last & Form im Detail' : 'Full load & form'} <ChevronRight size={14} />
      </Link>
    </div>
  )
}
