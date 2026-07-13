import { useEffect, useMemo, useState } from 'react'
import { Swords, Medal, Trophy } from 'lucide-react'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import Confetti from '../ui/Confetti'
import { useCountUp } from '../../hooks/useCountUp'
import type { DuelResponse, DuelStats } from '../../api/crew'
import type { Locale } from '../../i18n/strings'

// DuelArena — gamified head-to-head, Apple-Fitness style, McKinsey-clean.
// Two lenses: "You vs Last Week" (all metrics) and "You vs Crew" (fair metrics
// only). Each metric is a dumbbell (two dots, the gap = the delta); an overall
// "you won N of M" scoreline crowns it. Losses are muted, never shamed; rest
// counts; crew is explicitly friendly, not physiology (research-grounded).

type Side = 'past' | 'crew'

interface Metric {
  key: keyof DuelStats
  en: string
  de: string
  unit: string
  fmt: (v: number) => string
  crewFair: boolean
}

const METRICS: Metric[] = [
  { key: 'ring_score', en: 'Ring points', de: 'Ring-Punkte', unit: 'PKT', fmt: (v) => `${Math.round(v)}`, crewFair: true },
  { key: 'tss', en: 'Training load', de: 'Trainingslast', unit: 'TSS', fmt: (v) => `${Math.round(v)}`, crewFair: true },
  { key: 'avg_if', en: 'Intensity', de: 'Intensität', unit: 'IF', fmt: (v) => v.toFixed(2), crewFair: true },
  { key: 'active_days', en: 'Consistency', de: 'Konsequenz', unit: '/7', fmt: (v) => `${Math.round(v)}`, crewFair: true },
  { key: 'hours', en: 'Moving time', de: 'Fahrzeit', unit: 'h', fmt: (v) => v.toFixed(1), crewFair: false },
  { key: 'distance_km', en: 'Distance', de: 'Distanz', unit: 'km', fmt: (v) => `${Math.round(v)}`, crewFair: false },
  { key: 'kj', en: 'Energy', de: 'Energie', unit: 'kJ', fmt: (v) => `${Math.round(v)}`, crewFair: false },
  { key: 'best_tss', en: 'Hardest ride', de: 'Härteste Fahrt', unit: 'TSS', fmt: (v) => `${Math.round(v)}`, crewFair: false },
]

const num = (s: DuelStats, k: keyof DuelStats) => (typeof s[k] === 'number' ? (s[k] as number) : 0)

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
}

// One metric row: a dumbbell (you-dot ↔ opp-dot, connector = the gap) + result chip.
function DuelRow({ m, you, opp, de, delay }: { m: Metric; you: number; opp: number; de: boolean; delay: number }) {
  const max = Math.max(you, opp, m.key === 'avg_if' ? 0.1 : 1)
  const yx = Math.max(3, Math.min(100, (you / max) * 100))
  const ox = Math.max(3, Math.min(100, (opp / max) * 100))
  const result: 'win' | 'tie' | 'loss' = you > opp ? 'win' : you < opp ? 'loss' : 'tie'
  const delta = Math.abs(you - opp)
  const youColor = 'var(--color-forest-2)'
  const oppColor = 'var(--color-ink-2)'
  const chip =
    result === 'win' ? { c: 'var(--color-forest-2)', s: `▲ ${m.fmt(delta)}` }
      : result === 'loss' ? { c: 'var(--color-muted)', s: `▼ ${m.fmt(delta)}` }
        : { c: 'var(--color-muted)', s: '=' }
  return (
    <div className="flex items-center gap-3" style={{ animation: `card-enter 420ms var(--ease-apple-default, ease) ${delay}ms both` }}>
      <span className="shrink-0" style={{ width: 112, fontSize: 14, color: 'var(--color-ink)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {de ? m.de : m.en}
      </span>
      {/* dumbbell track */}
      <div className="relative flex-1" style={{ height: 18 }}>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style={{ height: 2, background: 'var(--color-rule)' }} />
        <div className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: `${Math.min(yx, ox)}%`, width: `${Math.abs(yx - ox)}%`, height: 2, background: youColor, opacity: 0.5 }} />
        <span className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: `calc(${ox}% - 4px)`, width: 8, height: 8, background: oppColor, border: '1px solid var(--color-paper)' }} title={de ? 'Gegner' : 'Opponent'} />
        <span className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: `calc(${yx}% - 5px)`, width: 10, height: 10, background: youColor, boxShadow: `0 0 8px ${youColor}` }} title={de ? 'Du' : 'You'} />
      </div>
      <span className="num-mono shrink-0 text-right" style={{ width: 64, fontSize: 14, color: chip.c, fontWeight: 600 }}>{chip.s}</span>
    </div>
  )
}

export default function DuelArena({ duel, locale, restMode }: { duel: DuelResponse | undefined; locale: Locale; restMode?: boolean }) {
  const de = locale === 'de'
  const [side, setSide] = useState<Side>('past')
  const [celebrated, setCelebrated] = useState<Set<Side>>(new Set())

  const you = duel?.you_this_week
  const hasCrew = (duel?.crew?.length ?? 0) > 0

  // Opponent stats for the active lens.
  const opp: DuelStats | null = useMemo(() => {
    if (!duel) return null
    if (side === 'past') return duel.you_last_week
    if (!duel.crew.length) return null
    const avg: Partial<DuelStats> = {}
    for (const m of METRICS) avg[m.key] = mean(duel.crew.map((c) => num(c, m.key))) as never
    return { ...(avg as DuelStats), handle: de ? 'Crew-Schnitt' : 'Crew avg' }
  }, [duel, side, de])

  const rows = useMemo(() => METRICS.filter((m) => (side === 'crew' ? m.crewFair : true)), [side])

  // Fresh week: no ride yet. Don't render 8 all-loss rows — a single slim
  // teaser reads far calmer and invites the first session.
  const freshWeek = !!you && num(you, 'tss') === 0 && num(you, 'ring_score') === 0

  const { wins, losses, ties } = useMemo(() => {
    let w = 0, l = 0, t = 0
    if (you && opp) for (const m of rows) {
      const a = num(you, m.key), b = num(opp, m.key)
      if (a > b) w++; else if (a < b) l++; else t++
    }
    return { wins: w, losses: l, ties: t }
  }, [you, opp, rows])

  const overallWin = wins > losses
  const headline = rows[0]
  const youHead = you && headline ? num(you, headline.key) : 0
  const oppHead = opp && headline ? num(opp, headline.key) : 0
  const headCount = useCountUp(Math.round(youHead), { durationMs: 900 })

  useEffect(() => {
    if (overallWin && you && opp && !celebrated.has(side)) setCelebrated((s) => new Set(s).add(side))
  }, [overallWin, side, you, opp, celebrated])

  const tabs = [
    { id: 'past' as const, label: de ? 'Letzte Woche' : 'Last week' },
    { id: 'crew' as const, label: de ? 'Crew' : 'Crew' },
  ]

  return (
    <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6 sm:py-6 relative overflow-hidden" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      {overallWin && celebrated.has(side) && <Confetti />}
      <div className="flex items-center gap-2 mb-4">
        <Swords size={14} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
        <span className="eyebrow num-mono" style={{ color: 'var(--color-ink)', letterSpacing: '0.22em', fontSize: 10, fontWeight: 600 }}>
          {de ? 'DUELL' : 'DUEL'}
        </span>
        <span className="num-mono ml-auto" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
          {de ? 'DU' : 'YOU'} <span style={{ color: 'var(--color-forest-2)' }}>●</span> · <span style={{ color: 'var(--color-ink-2)' }}>○</span> {side === 'past' ? (de ? 'Vorwoche' : 'Last wk') : (de ? 'Crew' : 'Crew')}
        </span>
      </div>

      <SegmentedTabs tabs={tabs} value={side} onChange={setSide} ariaLabel={de ? 'Duell-Gegner' : 'Duel opponent'} indicatorId="duel-side-indicator" />

      {side === 'crew' && !hasCrew ? (
        <p className="text-[13px] leading-relaxed mt-4" style={{ color: 'var(--color-muted)' }}>
          {de ? 'Lade eine Crew ein (oben), um dich Kopf an Kopf mit anderen zu messen.' : 'Invite a crew (above) to go head-to-head with others.'}
        </p>
      ) : side === 'past' && freshWeek ? (
        <p className="text-[13px] leading-relaxed mt-4" style={{ color: 'var(--color-muted)' }}>
          {de
            ? 'Noch keine Fahrt diese Woche — das Duell startet mit deiner ersten Einheit.'
            : 'No ride this week yet — the duel starts with your first session.'}
        </p>
      ) : !you || !opp ? (
        <p className="text-[13px] mt-4" style={{ color: 'var(--color-muted)' }}>{de ? 'Noch keine Daten für dieses Duell.' : 'No data for this duel yet.'}</p>
      ) : (
        <>
          {/* Scoreline + headline dumbbell */}
          <div className="mt-4 mb-4 flex flex-col items-center text-center gap-1">
            <span className="num-display leading-none" style={{ fontSize: 'clamp(26px, 7vw, 34px)', color: overallWin ? '#FFD60A' : 'var(--color-ink)' }}>
              {headCount}
            </span>
            <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: '0.14em' }}>
              {headline ? (de ? headline.de : headline.en).toUpperCase() : ''} · {de ? 'DU' : 'YOU'}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 500, color: 'var(--color-ink)', marginTop: 4 }}>
              {de ? `Du gewinnst ${wins} von ${rows.length}` : `You won ${wins} of ${rows.length}`}
              {ties > 0 && <span style={{ color: 'var(--color-muted)', fontSize: 12 }}> · {ties} {de ? 'unentschieden' : 'tied'}</span>}
            </span>
            {/* headline gap */}
            <span className="num-mono" style={{ fontSize: 11, color: youHead >= oppHead ? 'var(--color-forest-2)' : 'var(--color-muted)' }}>
              {headline ? `${youHead >= oppHead ? '▲' : '▼'} ${headline.fmt(Math.abs(youHead - oppHead))} ${youHead >= oppHead ? (de ? 'vor' : 'ahead') : (de ? 'hinter' : 'behind')} ${side === 'past' ? (de ? 'Vorwoche' : 'last wk') : (de ? 'Crew-Schnitt' : 'crew avg')}` : ''}
            </span>
          </div>

          {/* Scorecard rows */}
          <div className="flex flex-col gap-2.5">
            {rows.map((m, i) => (
              <DuelRow key={m.key} m={m} you={num(you, m.key)} opp={num(opp, m.key)} de={de} delay={i * 55} />
            ))}
          </div>

          {/* Medals + participation + ethics */}
          <div className="flex items-center gap-2 mt-4 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--color-rule)' }}>
            <span className="inline-flex items-center gap-1.5 num-mono px-2.5 py-1 rounded-full" style={{ fontSize: 10.5, color: overallWin ? '#FFD60A' : 'var(--color-ink-2)', border: `1px solid ${overallWin ? 'rgba(255,214,10,0.4)' : 'var(--color-rule)'}` }}>
              {overallWin ? <Trophy size={12} strokeWidth={2} /> : <Medal size={12} strokeWidth={2} />}
              {overallWin ? (de ? 'Woche gewonnen' : 'Week won') : (de ? 'Dabei gewesen' : 'Showed up')}
            </span>
            {restMode && (
              <span className="num-mono px-2.5 py-1 rounded-full" style={{ fontSize: 10.5, color: 'var(--color-forest-2)', border: '1px solid color-mix(in srgb, var(--color-forest-2) 35%, var(--color-rule))' }}>
                {de ? 'Kluge Erholung ✓' : 'Smart recovery ✓'}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-snug mt-2" style={{ color: 'var(--color-muted)' }}>
            {side === 'crew'
              ? (de ? 'Freundlich, nicht Physiologie: gleiche Trainingslast heißt gleiche relative Anstrengung, nicht gleiche Watt. Nur faire Werte werden verglichen.' : 'Friendly, not physiology: equal training load means equal relative effort, not equal watts. Only fair metrics are compared.')
              : (de ? 'Du gegen dein früheres Ich — der einzige Gegner, den du immer schlagen kannst. Ruhetage zählen.' : 'You vs your past self — the one opponent you can always beat. Rest days count.')}
          </p>
        </>
      )}
    </div>
  )
}
