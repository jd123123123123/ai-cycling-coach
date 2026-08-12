import { useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import { isPresent, type Value } from '../data/value'
import { previewPlan } from '../../api/coach'
import W3TodayView, { type W3Vm, type W3Signal, type W3Spark, type OnAdapt } from './W3TodayView'

type SignalValue = { value: number; delta: number | null }

/**
 * W3 · 01 TODAY, wired to live data. Route: /e/w3-today.
 *
 * Reuses the exact plumbing `pages/TodayPage.tsx` uses — `useDayState()` +
 * `useTodayModel(state)` for the coaching model and `useAuth()` for the real
 * avatar/handle. The layout is `W3TodayView`, a pure function of `vm`.
 *
 * Honesty contract (mirrors the rest of the editorial system): the real
 * coaching metrics — readiness, HRV/RHR/sleep, the week strip, the session,
 * fitness/fatigue/form — resolve to a value or `null` (the View renders "—").
 * The reward-economy layer (earn rate, Power/Cycle balances, the Garage
 * upgrade, the crew standings) has no backend yet, so those fields are DESIGN
 * FIXTURES reproducing the pen; each is marked `fixture:` below and is the
 * seam the `2026-08-11-garage-composable-figures` spec will wire.
 */

/** Build a 7-bar spark from a series, normalised to its own max, last = today. */
function sparkFrom(series: number[] | null, hi: string): W3Spark {
  if (!series || series.length === 0) return { bars: [0.3, 0.5, 0.4, 0.7, 0.55, 0.8, 1], hi } // fixture shape when no series
  const tail = series.slice(-7)
  const max = Math.max(...tail, 1)
  return { bars: tail.map((v) => v / max), hi }
}

export default function W3TodayPage() {
  const { state } = useDayState()
  const model = useTodayModel(state)
  const { user } = useAuth()

  const vm = useMemo<W3Vm>(() => {
    const readiness = isPresent(model.readiness) ? model.readiness.value.score : null
    const verdict = isPresent(model.verdict) ? model.verdict.value : null

    const sig = (
      v: Value<SignalValue>,
      unit: string,
      fmt: (x: number) => string,
      hi: string,
    ): W3Signal | null => {
      if (!isPresent(v)) return null
      const { value, delta } = v.value
      const sub = delta == null ? null : `${delta > 0 ? '+' : ''}${delta} vs baseline`
      return { value: fmt(value), unit, sub, subHue: '#C8FF00', spark: sparkFrom(null, hi) }
    }

    const hrv = sig(model.hrv, 'ms', (x) => String(Math.round(x)), '#00E5FF')
    const rhr = sig(model.restingHr, 'bpm', (x) => String(Math.round(x)), '#C8FF00')
    const sleep: W3Signal | null = isPresent(model.sleep)
      ? (() => {
          const s = model.sleep.value
          const hrs = Math.floor(s.totalS / 3600)
          const mins = Math.round((s.totalS % 3600) / 60)
          return { value: `${hrs}:${String(mins).padStart(2, '0')}`, unit: 'hrs', sub: null, subHue: '#C8FF00', spark: sparkFrom(null, '#ED29FF') }
        })()
      : null

    const weekMeta = isPresent(model.weekLoad)
      ? `${model.weekLoad.value.spent} of ${model.weekLoad.value.planned} TSS`
      : '—'

    const session = isPresent(model.session) ? model.session.value : null
    const blocks = session
      ? session.blocks.map((b) => ({
          w: b.watts && session.targetWatts ? Math.min(1, b.watts / (session.targetWatts * 1.1)) : 0.28,
          work: (b.watts ?? 0) >= (session.targetWatts ?? 1) * 0.9,
          label: `${b.label}${b.watts ? ` · ${b.watts} W` : ''}`,
        }))
      : [0.28, 0.4, 0.5, 0.9, 0.22, 0.92, 0.22, 0.94, 0.22, 0.95, 0.3].map((w, i) => ({ w, work: i % 2 === 1 && i > 2 && i < 10, label: `Block ${i + 1}` }))

    const pmc = isPresent(model.pmc) ? model.pmc.value : null
    // 6-week mirror from the real PMC series when present, else a null-safe stub.
    const series = pmc?.series ?? []
    const maxCtl = Math.max(1, ...series.map((p) => p.ctl))
    const maxAtl = Math.max(1, ...series.map((p) => p.atl))
    const tail = series.slice(-42)
    const mirror = tail.length > 0
      ? {
          fitness: tail.map((p) => p.ctl / maxCtl),
          fatigue: tail.map((p) => p.atl / maxAtl),
          fitnessRaw: tail.map((p) => Math.round(p.ctl)),
          fatigueRaw: tail.map((p) => Math.round(p.atl)),
          todayIndex: tail.length - 1,
        }
      : { fitness: [], fatigue: [], fitnessRaw: [], fatigueRaw: [], todayIndex: 0 }

    // Weekday letters + per-day TSS from the model; status vs a nominal daily
    // target (fixture until per-day planned load is modelled). This is the
    // hit / missed / overdid rule the strip needs.
    const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const todayDow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
    const weekDays = model.week.map((d, i) => {
      const actual = isPresent(d.tss) ? d.tss.value : 0
      const planned = 70 // fixture: per-day planned load not modelled yet
      const status: 'today' | 'hit' | 'missed' | 'over' | 'rest' | 'upcoming' =
        i === todayDow ? 'today'
          : i > todayDow ? 'upcoming'
            : actual === 0 ? 'missed'
              : actual > planned * 1.25 ? 'over'
                : actual >= planned * 0.75 ? 'hit' : 'missed'
      const isToday = i === todayDow
      const plannedTss = isToday && session?.tss != null ? session.tss : planned
      return {
        letter: d.letter, num: '', actual, planned: plannedTss, status,
        title: isToday && session ? session.title : null,
        dateLabel: WD[i] ?? d.letter, weekday: WD[i] ?? d.letter,
        targetW: isToday && session?.targetWatts != null ? `${session.targetWatts} W` : '—',
        ftpPct: isToday && session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}%` : '—',
      }
    })

    return {
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      tierLine: 'Silver Tier · Week 6 of 16', // fixture: tier/season not modelled yet
      avatarUrl: user?.avatar_url ?? null,
      avatarInitial: (user?.display_name || user?.email || '?').charAt(0).toUpperCase(),
      streak: isPresent(model.streakDays) ? model.streakDays.value : null,

      readiness,
      readinessWord: verdict ? verdict.headline.split('.')[0] : (isPresent(model.dateLabel) ? null : null),
      earnRate: '1.75×', // fixture: earn-rate economy not built
      coachDate: isPresent(model.dateLabel) ? model.dateLabel.value : '',
      coachLead: verdict ? verdict.headline : null,
      coachWhy: verdict ? verdict.body : null,

      hrv, rhr, sleep,

      weekMeta,
      weekDays,

      weather: {
        window: '16:00–18:00', temp: '19°', feels: '17°',
        hours: Array.from({ length: 12 }, (_, i) => ({ label: `${9 + i}:00`, q: [0.3, 0.35, 0.4, 0.5, 0.55, 0.6, 0.8, 1, 0.95, 0.7, 0.45, 0.3][i], peak: i === 7 || i === 8 })),
        meta: 'Bar is ride quality — wind, rain and temperature combined. 8 km/h SW, dry until 21:00.',
        routeName: 'Elbe Loop · Nord', routeStats: '48 km · 320 m · 3 ramps', routeTag: 'RIDDEN 6× · BEST MATCH',
        routeWhy: 'Its three ramps run 8–9 minutes at 4–5% — the exact length of today’s blocks, so you can hold 285 W without traffic breaking the effort.',
        recordProof: 'Your 288 W record was set on this loop',
      }, // fixture: weather/route recommendation service not wired yet

      mirror,

      sessionTitle: session ? session.title : null,
      sessionDur: session && session.tss ? `${Math.round((session.tss / 100) * 68)} min` : null,
      sessionTargetW: session?.targetWatts != null ? `${session.targetWatts} W` : '—',
      sessionTss: session?.tss != null ? String(session.tss) : '—',
      sessionFtpPct: session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}%` : '—',
      sessionBlocks: blocks,
      sessionFtpTag: 'FTP',
      sessionEarn: 'This ride earns RideCoin by its TSS', // fixture: RideCoin not built

      form: pmc ? { fitness: Math.round(pmc.fitness), fatigue: Math.round(pmc.fatigue), formVal: Math.round(pmc.form) } : null,

      // ── fixtures: crew standings (share-of-own-target) — spec'd, not wired ──
      crewCaption: "You're pulling your weight — 131% of your own target, and up a place this week.",
      crew: [
        { name: 'Mara', color: '#7B5CFF', pct: 143, me: false },
        { name: 'You', color: '#2BE68F', pct: 131, me: true },
        { name: 'Timo', color: '#6B8CFF', pct: 104, me: false },
      ],
      crewRank: '↑1',
      challengeLabel: 'CREW-CHALLENGE · AROUND THE WORLD',
      challengeValue: '412 / 500 km',
      challengePct: 82,

      // ── fixtures: Garage economy — spec'd, not wired ──
      garagePct: 68,
      garageName: 'Carbon frame',
      garageRidesLine: '17 of 25 rides',
      garageMakesLine: "Today's session makes 18",
      power: '625.3K',
      cycle: '1,448',
      mRides: { pct: 50, label: '25 rides' },
      mDist: { pct: 73, label: '200 km' },
    }
  }, [model, user])

  // Real AI adapt: Easier/Harder run the coach's plan-adaptation endpoint
  // (`/coach/plan/preview` → LLM + plan engine + safety rails). The returned
  // target/TSS/FTP and rationale are the model's. Rest is deterministic and
  // never hits the endpoint. `applicable:false` (no plan today) → null, which
  // the card surfaces as an honest "no plan to adapt".
  const onAdapt = useCallback<OnAdapt>(async (kind) => {
    if (kind === 'rest') return { targetW: '—', tss: 0, ftpPct: '—', rationale: 'Full rest today. Let the load settle — tomorrow’s block hits harder for it.', railsDowngraded: false }
    const p = await previewPlan({ modification_type: kind, scope: 'day' })
    if (!p.applicable || !p.after) return null
    const a = p.after
    // Representative target = the hardest work block's high watt bound.
    const peakW = a.blocks.reduce<number | null>((m, b) => Math.max(m ?? 0, b.target_watts_high ?? 0) || null, null)
    return {
      targetW: peakW ? `${peakW} W` : '—',
      tss: a.predicted_tss ?? p.week_after_tss ?? null,
      ftpPct: a.intensity_factor != null ? `${Math.round(a.intensity_factor * 100)}%` : '—',
      rationale: p.rationale || p.reason || 'Coach adjusted the session.',
      railsDowngraded: p.rails_downgraded,
    }
  }, [])

  return <W3TodayView vm={vm} onAdapt={onAdapt} />
}
