/**
 * RideEffectCard — "what this ride did for you, and where it sits".
 *
 * The gap this fills. Both per-ride surfaces were exhaustively DESCRIPTIVE —
 * NP, IF, VI, zone tables, a power curve, pedal dynamics, a coach paragraph —
 * and neither told the athlete what the ride was FOR or what it changed. A
 * 151-TSS three-hour endurance ride and a 57-TSS VO₂ session read as "two
 * rides with different numbers" rather than as two different jobs with two
 * different payoffs, and nothing connected either one to the athlete's
 * trajectory. This card answers, in order:
 *
 *   1. What did it train?      (adaptation band, from where the time went)
 *   2. What did it cost/give?  (CTL gained, ATL cost, freshness after)
 *   3. How big was it for me?  (rank among this season's rides, by TSS)
 *   4. Was it the plan?        (planned vs actual TSS)
 *
 * Every row is independently nullable and simply absent when its input is
 * missing — the card never fabricates an adaptation, a fitness delta or a rank.
 * If nothing can be said, the card does not render at all.
 */
import { Sprout, HeartPulse, Flame, TrendingUp, Trophy, Target, ShieldCheck } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import {
  rideAdaptation, fitnessEffect, rideRank, planMatch, durabilityRead,
  type AdaptationBand, type DurabilityRead,
} from '../../utils/rideEffect'

const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

/** Colour + glyph + plain-language purpose per adaptation band. The purpose
 *  line is the part that turns a zone histogram into something a rider can act
 *  on: it names the physiological system the ride actually worked. */
const BAND_META: Record<AdaptationBand, {
  color: string; Icon: typeof Sprout; en: string; de: string; whyEn: string; whyDe: string
}> = {
  aerobic: {
    color: '#16E08A', Icon: Sprout,
    en: 'Aerobic base', de: 'Aerobe Grundlage',
    whyEn: 'Builds the engine that carries every other session — capillaries, mitochondria, fat burning. Slow to build, slow to lose.',
    whyDe: 'Baut den Motor, der alle anderen Einheiten trägt — Kapillaren, Mitochondrien, Fettverbrennung. Wächst langsam, hält lange.',
  },
  threshold: {
    color: '#FFB020', Icon: HeartPulse,
    en: 'Threshold', de: 'Schwelle',
    whyEn: 'Raises the hardest pace you can hold. This is the work that moves your FTP.',
    whyDe: 'Hebt das Tempo, das du am längsten halten kannst. Diese Arbeit bewegt deine FTP.',
  },
  vo2: {
    color: '#FA1E55', Icon: Flame,
    en: 'VO₂max', de: 'VO₂max',
    whyEn: 'Pushes the ceiling on how much oxygen you can use. Small doses, big effect — and expensive to recover from.',
    whyDe: 'Hebt die Decke, wie viel Sauerstoff du verwerten kannst. Kleine Dosen, große Wirkung — und teuer in der Erholung.',
  },
}

const DURABILITY_META: Record<DurabilityRead, { color: string; en: string; de: string }> = {
  strong: { color: '#16E08A', en: 'held together to the end', de: 'bis zum Ende zusammengehalten' },
  fair: { color: '#FFB020', en: 'drifted a little late on', de: 'spät leicht weggelaufen' },
  faded: { color: '#FF7A3C', en: 'outran your current base late on', de: 'lief deiner Grundlage spät davon' },
}

function Row({ Icon, color, label, children }: {
  Icon: typeof Sprout; color: string; label: string; children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 grid place-items-center rounded-[10px]" style={{ width: 32, height: 32, background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 34%, transparent)` }}>
        <Icon size={16} strokeWidth={2} style={{ color }} />
      </span>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{label}</span>
        {children}
      </div>
    </div>
  )
}

export interface RideEffectCardProps {
  activityId: number
  /** Athlete-local yyyy-MM-dd of the ride. */
  rideDayKey: string
  actualTss: number | null | undefined
  plannedTss: number | null | undefined
  zoneTimePct: Record<string, number> | null | undefined
  decouplingPct: number | null | undefined
  pmcEntries: { date: string; ctl: number; atl: number; tsb: number }[] | null | undefined
  /** Every activity in the comparison window (the season so far), for the rank.
   *  `sport` must be passed through — `rideRank` filters on it so runs and gym
   *  sessions don't pad the ride ranking. */
  seasonRides: { id: number; tss?: number | null; sport?: string | null }[] | null | undefined
}

export default function RideEffectCard({
  activityId, rideDayKey, actualTss, plannedTss, zoneTimePct, decouplingPct,
  pmcEntries, seasonRides,
}: RideEffectCardProps) {
  const { locale } = useLocale()
  const de = locale === 'de'

  const adaptation = rideAdaptation(zoneTimePct)
  const fitness = fitnessEffect(pmcEntries, rideDayKey)
  const rank = rideRank(seasonRides, activityId)
  const plan = planMatch(plannedTss, actualTss)
  const durability = durabilityRead(decouplingPct)

  // Nothing honest to say → no card. Better than a shell of em dashes.
  if (!adaptation && !fitness && !rank && !plan) return null

  const bandMeta = adaptation ? BAND_META[adaptation.band] : null

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-[18px]" style={cardStyle}>
      <div className="flex flex-col gap-0.5">
        <span className="eyebrow" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>
          {de ? 'WAS DIESE FAHRT GEBRACHT HAT' : 'WHAT THIS RIDE DID'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
          {de ? 'Wirkung, Kosten und Einordnung' : 'Effect, cost and where it sits'}
        </span>
      </div>

      {/* 1 · What it trained */}
      {adaptation && bandMeta && (
        <Row Icon={bandMeta.Icon} color={bandMeta.color} label={de ? 'TRAINIERT' : 'TRAINED'}>
          <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>
            {de ? bandMeta.de : bandMeta.en}
            {!adaptation.decisive && (
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-muted)' }}>
                {de ? ' · gemischt' : ' · mixed'}
              </span>
            )}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {/* "nach Leistungszonen" is load-bearing, not padding. The same
                page also shows HEART-RATE zones, and the two genuinely
                disagree on a rolling ride: this one is 46 % Z3-Z4 by power
                while sitting 83 % Z2 by heart rate. Both are true — punchy
                power over rolling terrain at an aerobic cardiac cost — but
                unlabelled it reads as the page contradicting itself. */}
            {adaptation.pctInBand}% {de ? 'der Zeit dort, nach Leistungszonen. ' : 'of your time there, by power zones. '}
            {de ? bandMeta.whyDe : bandMeta.whyEn}
          </span>
        </Row>
      )}

      {/* 2 · What it changed — the fitness ledger */}
      {fitness && (
        <Row Icon={TrendingUp} color="#38B6FF" label={de ? 'FITNESS' : 'FITNESS'}>
          <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>
            {Math.round(fitness.ctlBefore)} → {Math.round(fitness.ctlAfter)}
            <span style={{ fontSize: 14, fontWeight: 700, color: fitness.ctlDelta >= 0 ? '#16E08A' : 'var(--color-muted)', marginLeft: 8 }}>
              {fitness.ctlDelta >= 0 ? '+' : ''}{fitness.ctlDelta}
            </span>
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {fitness.ctlDelta > 0
              ? (de
                  ? `Diese Fahrt hat deine Fitness um ${fitness.ctlDelta} Punkte gehoben und ${fitness.atlDelta > 0 ? `${fitness.atlDelta} Punkte Ermüdung` : 'keine zusätzliche Ermüdung'} gekostet.`
                  : `This ride lifted your fitness by ${fitness.ctlDelta} points and cost ${fitness.atlDelta > 0 ? `${fitness.atlDelta} points of fatigue` : 'no extra fatigue'}.`)
              : (de
                  ? 'Zu locker, um die Fitness zu heben — sie hat den Beinen aber Erholung gebracht.'
                  : 'Too easy to lift fitness — but it gave the legs recovery.')}
            {' '}
            {de ? `Frische danach: ${fitness.tsbAfter >= 0 ? '+' : ''}${fitness.tsbAfter}.` : `Freshness after: ${fitness.tsbAfter >= 0 ? '+' : ''}${fitness.tsbAfter}.`}
          </span>
        </Row>
      )}

      {/* 3 · How it holds up against the rest of the season */}
      {rank && (
        <Row Icon={Trophy} color={rank.standout ? '#FFB020' : '#8FA0B4'} label={de ? 'EINORDNUNG' : 'WHERE IT SITS'}>
          <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>
            {de ? `${rank.rank}. von ${rank.outOf} Fahrten` : `#${rank.rank} of ${rank.outOf} rides`}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {rank.standout
              ? (de
                  ? `Eine deiner härtesten Fahrten dieser Saison — nach Belastung im obersten Zehntel.`
                  : `One of your hardest rides this season — top tenth by training load.`)
              : (de
                  ? `Nach Belastung stärker als ${rank.percentile}% deiner Fahrten dieser Saison.`
                  : `Harder than ${rank.percentile}% of your rides this season, by training load.`)}
          </span>
        </Row>
      )}

      {/* 4 · Did it match what the plan asked for */}
      {plan && (
        <Row
          Icon={Target}
          color={plan.verdict === 'on' ? '#16E08A' : '#FFB020'}
          label={de ? 'GEGEN DEN PLAN' : 'VS THE PLAN'}
        >
          <span className="num-display" style={{ fontSize: 17, color: 'var(--color-ink)' }}>
            {plan.actualTss} / {plan.plannedTss} TSS
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {plan.verdict === 'on'
              ? (de ? 'Genau die Einheit, die im Plan stand.' : 'Exactly the session the plan asked for.')
              : plan.verdict === 'over'
                ? (de ? `${plan.deltaTss} TSS mehr als geplant — schön, wenn die Erholung mitspielt.` : `${plan.deltaTss} TSS over plan — fine as long as recovery keeps up.`)
                : (de ? `${Math.abs(plan.deltaTss)} TSS unter Plan — kein Drama, der Plan rechnet damit.` : `${Math.abs(plan.deltaTss)} TSS under plan — no drama, the plan absorbs it.`)}
          </span>
        </Row>
      )}

      {/* Durability — only on rides long enough for decoupling to mean anything,
          which the caller decides by passing null otherwise. */}
      {durability && (
        <Row Icon={ShieldCheck} color={DURABILITY_META[durability].color} label={de ? 'HALTBARKEIT' : 'DURABILITY'}>
          <span style={{ fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.45 }}>
            {de ? 'Dein Aerob-System hat ' : 'Your aerobic system '}
            <strong style={{ color: DURABILITY_META[durability].color }}>{de ? DURABILITY_META[durability].de : DURABILITY_META[durability].en}</strong>
            {de ? ` (Entkopplung ${decouplingPct!.toFixed(1)}%).` : ` (decoupling ${decouplingPct!.toFixed(1)}%).`}
          </span>
        </Row>
      )}
    </div>
  )
}
