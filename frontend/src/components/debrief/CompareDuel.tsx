import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import { useRideCompare } from '../../hooks/useRideCompare'
import type { ClimbDuel, PacingDuel, PowerDuel, RideComparison, Winner } from '../../api/compare'

const WIN = 'var(--color-good)'
const LOSE = 'var(--color-ink-2)'

/** Animated count-up of an integer over ~800ms (ease-out cubic). */
function useCountUp(target: number, duration = 800): number {
  const [val, setVal] = useState(0)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    let raf = 0
    const tick = (t: number) => {
      if (startRef.current == null) startRef.current = t
      const p = Math.min(1, (t - startRef.current) / duration)
      setVal(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); startRef.current = null }
  }, [target, duration])
  return val
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const fmtDur = (s: number) => (s < 60 ? `${s}s` : `${s / 60}min`)
/** True when `winner` is the side we're rendering (mine = self column). */
const isWinnerSide = (winner: Winner, mine: boolean) => winner !== 'tie' && (winner === 'self') === mine
const sideColor = (winner: Winner, mine: boolean) => (isWinnerSide(winner, mine) ? WIN : LOSE)

export default function CompareDuel({ activityId }: { activityId: number }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useRideCompare(activityId)
  if (!data) return null

  const meWon = data.overall_winner === 'self'
  const tie = data.overall_winner === 'tie'
  const meName = de ? 'Du' : 'You'
  const rivalName = data.rival.display_name

  // Locale-correct headline that agrees with the "You" label in the scoreboard.
  const headline = tie
    ? (de ? 'Kopf-an-Kopf — kein Sieger heute.' : 'Dead heat — no winner today.')
    : meWon
      ? (de ? 'Du gewinnst den Tag.' : 'You won the day.')
      : (de ? `${rivalName} gewinnt den Tag.` : `${rivalName} won the day.`)

  // Per-category win tally for the scoreboard story line.
  const tally = (rows: { winner: Winner }[]) => ({
    s: rows.filter(r => r.winner === 'self').length,
    r: rows.filter(r => r.winner === 'rival').length,
  })
  const cats = [
    { label: de ? 'Anstiege' : 'Climbs', ...tally(data.climb_duels) },
    { label: de ? 'Leistung' : 'Power', ...tally(data.power_duels) },
    { label: de ? 'Pacing' : 'Pacing', ...tally(data.pacing_duels) },
  ].filter(c => c.s + c.r > 0)

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 500, letterSpacing: '-0.01em' }}>
          {de ? 'Kopf an Kopf' : 'Head to head'}
        </h2>
        <span style={{ color: 'var(--color-ink-2)', fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {de ? 'Dieselbe Fahrt' : 'Same ride'}
        </span>
      </div>

      <Scoreboard data={data} meName={meName} rivalName={rivalName} meWon={meWon} tie={tie} headline={headline} cats={cats} />

      {data.climb_duels.length > 0 && (
        <Panel label={de ? 'Anstiegs-Duell' : 'Climb battle'} meName={meName} rivalName={rivalName}>
          {data.climb_duels.map((c, i) => <ClimbRow key={i} c={c} de={de} />)}
        </Panel>
      )}

      {data.power_duels.length > 0 && (
        <Panel label={de ? 'Leistungs-Duell' : 'Power duel'} meName={meName} rivalName={rivalName}>
          {data.power_duels.map((p, i) => <PowerRow key={i} p={p} />)}
        </Panel>
      )}

      {data.pacing_duels.length > 0 && (
        <Panel label={de ? 'Pacing & Einsatz' : 'Pacing & effort'} meName={meName} rivalName={rivalName}>
          {data.pacing_duels.map((p, i) => <PacingRow key={i} p={p} de={de} />)}
        </Panel>
      )}
    </div>
  )
}

function Scoreboard({ data, meName, rivalName, meWon, tie, headline, cats }: {
  data: RideComparison; meName: string; rivalName: string; meWon: boolean; tie: boolean
  headline: string; cats: { label: string; s: number; r: number }[]
}) {
  const selfPts = useCountUp(data.self_points)
  const rivalPts = useCountUp(data.rival_points)
  return (
    <div className="relative rounded-[20px] p-5 sm:p-6 mb-3 overflow-hidden"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      {/* soft wash toward the winner's side */}
      {!tie && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(120% 90% at ${meWon ? '0%' : '100%'} 0%, color-mix(in srgb, ${WIN} 10%, transparent), transparent 55%)`,
        }} />
      )}
      <div className="relative grid items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <RiderColumn name={meName} pts={Math.round(selfPts)} won={!tie && meWon} align="left" />
        <div className="px-2 sm:px-4 flex flex-col items-center gap-1">
          <span style={{ color: 'var(--color-ink-2)', fontFamily: 'var(--font-serif)', fontSize: 15, fontStyle: 'italic' }}>vs</span>
        </div>
        <RiderColumn name={rivalName} pts={Math.round(rivalPts)} won={!tie && !meWon} align="right" />
      </div>
      <p className="relative mt-4 text-center" style={{ color: 'var(--color-ink)', fontSize: 14.5 }}>{headline}</p>
      {/* per-category win tally — the story of how the points were won */}
      <div className="relative mt-4 flex items-center justify-center gap-2 flex-wrap">
        {cats.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ border: '1px solid var(--color-rule)', background: 'var(--color-paper)' }}>
            <span style={{ color: 'var(--color-ink-2)', fontSize: 10.5, letterSpacing: '0.06em' }}>{c.label}</span>
            <span className="num-mono" style={{ fontSize: 12, color: c.s >= c.r ? WIN : 'var(--color-ink)' }}>{c.s}</span>
            <span style={{ color: 'var(--color-ink-2)', fontSize: 10 }}>–</span>
            <span className="num-mono" style={{ fontSize: 12, color: c.r > c.s ? WIN : 'var(--color-ink)' }}>{c.r}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RiderColumn({ name, pts, won, align }: { name: string; pts: number; won: boolean; align: 'left' | 'right' }) {
  const right = align === 'right'
  return (
    <div className="flex flex-col" style={{ alignItems: right ? 'flex-end' : 'flex-start' }}>
      <div className="flex items-center gap-2" style={{ flexDirection: right ? 'row-reverse' : 'row' }}>
        <span className="grid place-items-center rounded-full" style={{
          width: 30, height: 30, fontSize: 13, fontWeight: 600,
          color: won ? WIN : 'var(--color-ink)',
          background: 'var(--color-paper)', border: `1.5px solid ${won ? WIN : 'var(--color-rule)'}`,
        }}>{name.slice(0, 1).toUpperCase()}</span>
        <span style={{ color: 'var(--color-ink)', fontSize: 14, fontWeight: 500 }}>{name}</span>
      </div>
      <span className="num-mono leading-none mt-2" style={{
        color: won ? WIN : 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 46, fontWeight: 500,
      }}>{pts}</span>
      {won && (
        <span className="mt-1 rounded-full px-2 py-0.5" style={{
          color: WIN, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.16em',
          border: `1px solid color-mix(in srgb, ${WIN} 40%, transparent)`,
          background: `color-mix(in srgb, ${WIN} 10%, transparent)`,
        }}>WON</span>
      )}
    </div>
  )
}

function Panel({ label, meName, rivalName, children }: {
  label: string; meName: string; rivalName: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-[16px] p-4 sm:p-5 mb-3" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="mb-3 flex items-center justify-between">
        <span style={{ color: 'var(--color-ink-2)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color: 'var(--color-ink-2)', fontSize: 11 }}>
          <span style={{ color: 'var(--color-ink)' }}>{meName}</span> · {rivalName}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  )
}

/** A centered diverging bar: self grows left, rival grows right; winner is filled. */
function DivergeRow({ label, sublabel, selfText, rivalText, selfFrac, rivalFrac, winner }: {
  label: string; sublabel?: string; selfText: string; rivalText: string
  selfFrac: number; rivalFrac: number; winner: Winner
}) {
  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: '84px 1fr 1fr 84px' }}>
      <span className="num-mono text-right" style={{ fontSize: 12.5, color: sideColor(winner, true), fontWeight: isWinnerSide(winner, true) ? 600 : 400 }}>
        {isWinnerSide(winner, true) ? '✓ ' : ''}{selfText}
      </span>
      <div className="flex justify-end">
        <div className="h-2 rounded-full" style={{ width: `${Math.max(6, selfFrac * 100)}%`, background: sideColor(winner, true), opacity: isWinnerSide(winner, true) ? 1 : 0.35 }} />
      </div>
      <div className="flex justify-start">
        <div className="h-2 rounded-full" style={{ width: `${Math.max(6, rivalFrac * 100)}%`, background: sideColor(winner, false), opacity: isWinnerSide(winner, false) ? 1 : 0.35 }} />
      </div>
      <div className="flex flex-col">
        <span className="num-mono" style={{ fontSize: 12.5, color: sideColor(winner, false), fontWeight: isWinnerSide(winner, false) ? 600 : 400 }}>
          {rivalText}{isWinnerSide(winner, false) ? ' ✓' : ''}
        </span>
      </div>
      <div className="col-span-4 -mt-1 flex justify-center">
        <span style={{ fontSize: 10, color: 'var(--color-ink-2)', letterSpacing: '0.06em' }}>
          {label}{sublabel ? ` · ${sublabel}` : ''}
        </span>
      </div>
    </div>
  )
}

function ClimbRow({ c, de }: { c: ClimbDuel; de: boolean }) {
  const s = c.self_wkg ?? 0, r = c.rival_wkg ?? 0
  const max = Math.max(s, r, 0.1)
  const selfTxt = c.self_wkg != null ? `${c.self_wkg.toFixed(1)} W/kg` : fmtTime(c.self_time_s)
  const rivalTxt = c.rival_wkg != null ? `${c.rival_wkg.toFixed(1)} W/kg` : fmtTime(c.rival_time_s)
  return <DivergeRow label={c.label} sublabel={`${Math.round(c.elev_gain_m)} ${de ? 'Hm' : 'm'}`}
    selfText={selfTxt} rivalText={rivalTxt} selfFrac={s / max} rivalFrac={r / max} winner={c.winner} />
}

function PowerRow({ p }: { p: PowerDuel }) {
  const max = Math.max(p.self_watts, p.rival_watts, 1)
  return <DivergeRow label={fmtDur(p.duration_s)} selfText={`${Math.round(p.self_watts)} W`} rivalText={`${Math.round(p.rival_watts)} W`}
    selfFrac={p.self_watts / max} rivalFrac={p.rival_watts / max} winner={p.winner} />
}

function PacingRow({ p, de }: { p: PacingDuel; de: boolean }) {
  const labels: Record<string, [string, string]> = {
    np: ['NP', 'NP'],
    split: [de ? 'Split-Disziplin' : 'Split discipline', ''],
    wprime_depth: [de ? 'Tiefster Einsatz (W′)' : 'Deepest dig (W′)', ''],
  }
  const label = labels[p.metric]?.[0] ?? p.metric
  const fmt = (v: number) => p.metric === 'wprime_depth' ? `${(v / 1000).toFixed(1)} kJ` : p.metric === 'split' ? `${v.toFixed(1)}%` : `${Math.round(v)} W`
  const max = Math.max(Math.abs(p.self_value), Math.abs(p.rival_value), 1)
  return <DivergeRow label={label} selfText={fmt(p.self_value)} rivalText={fmt(p.rival_value)}
    selfFrac={Math.abs(p.self_value) / max} rivalFrac={Math.abs(p.rival_value) / max} winner={p.winner} />
}
