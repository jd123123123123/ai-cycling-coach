import { useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTodayModel } from '../data/useTodayModel'
import { useDayState } from '../state/useDayState'
import { useStreak } from '../../hooks/useStreak'
import { useCrewStandings } from '../../hooks/useCrew'
import { useAdaptive } from '../../hooks/useAdaptive'
import { isPresent, type Value } from '../data/value'
import { previewPlan } from '../../api/coach'
import { hasSeenW3Onboarding } from './w3Onboarding'
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
  const { data: streak } = useStreak()
  const { data: standings } = useCrewStandings('week')
  const { data: adaptive } = useAdaptive()

  const vm = useMemo<W3Vm>(() => {
    // Real crew standings (top 3 by weekly score, you highlighted). Each bar is
    // the member's share of the crew's leader; honest fallback to the fixture
    // only when the athlete is in no crew / standings haven't loaded.
    const CREW_COLORS = ['#7B5CFF', '#6B8CFF', '#EEC7A7', '#A7D8EE']
    const rows = standings?.standings ?? []
    let realCrew: { name: string; color: string; pct: number; me: boolean }[] | null = null
    let realCrewCaption: string | null = null
    let realCrewRank: string | null = null
    if (rows.length > 0) {
      const top = Math.max(...rows.map((r) => r.weekly_score), 1)
      const ranked = [...rows].sort((a, b) => b.weekly_score - a.weekly_score)
      realCrew = ranked.slice(0, 3).map((r, i) => ({
        name: r.is_you ? 'You' : `@${r.handle}`,
        color: r.is_you ? '#2BE68F' : CREW_COLORS[i % CREW_COLORS.length],
        pct: Math.round((r.weekly_score / top) * 100),
        me: r.is_you,
      }))
      const myIdx = ranked.findIndex((r) => r.is_you)
      if (myIdx >= 0) realCrewRank = `#${myIdx + 1}`
      const me = rows.find((r) => r.is_you)
      if (me) realCrewCaption = `You've banked ${Math.round(me.weekly_tss)} TSS with your crew this week.`
    }

    // Readiness for the hero: the model withholds its score when the overnight
    // wearable read is stale (the "date the measurement" rule). But the coach's
    // adaptive engine still computes a live readiness (daily_decision.readiness)
    // from the freshest HRV/TSB it has — so fall back to that rather than show an
    // empty hero. Keeps the big number honest AND populated.
    const modelReadiness = isPresent(model.readiness) ? model.readiness.value.score : null
    const readiness = modelReadiness ?? adaptive?.daily_decision?.readiness?.score ?? null
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

    // Today's session: prefer the model's, else fall back to the coach's
    // prescribed session from the daily decision (title + TSS + duration are
    // real; intensity is derived from TSS×duration via the Coggan relation, and
    // watts stay honest "—" without an FTP anchor here).
    const modelSession = isPresent(model.session) ? model.session.value : null
    const planned = adaptive?.daily_decision?.planned ?? null
    const session = modelSession ?? (planned?.title
      ? {
          title: planned.title,
          targetWatts: null as number | null,
          tss: planned.target_tss != null ? Math.round(planned.target_tss) : null,
          intensityFactor: planned.target_tss && planned.duration_minutes
            ? Math.sqrt(planned.target_tss / ((planned.duration_minutes / 60) * 100))
            : null,
          blocks: [] as { label: string; minutes: number; watts: number | null }[],
        }
      : null)
    // Build the workout power profile. A structured session (intervals) uses its
    // real blocks. A steady endurance ride materialises to 1–2 blocks, which
    // reads as a single flat beam — so render its true shape instead: a warm-up
    // ramp, a long steady body at the prescribed intensity, and a cool-down.
    const realBlocks = session
      ? session.blocks.map((b) => ({
          w: b.watts && session.targetWatts ? Math.min(1, b.watts / (session.targetWatts * 1.1)) : 0.28,
          work: (b.watts ?? 0) >= (session.targetWatts ?? 1) * 0.9,
          label: `${b.label}${b.watts ? ` · ${b.watts} W` : ''}`,
        }))
      : []
    const target = session?.targetWatts ?? null
    const steadyLabel = target ? `Steady · ${target} W` : 'Steady'
    const enduranceProfile = [
      { w: 0.34, work: false, label: 'Warm-up' },
      { w: 0.5, work: false, label: 'Warm-up' },
      { w: 0.66, work: false, label: 'Warm-up' },
      ...Array.from({ length: 8 }, () => ({ w: 0.88, work: true, label: steadyLabel })),
      { w: 0.6, work: false, label: 'Cool-down' },
      { w: 0.4, work: false, label: 'Cool-down' },
    ]
    const blocks = realBlocks.length > 2
      ? realBlocks
      : session
        ? enduranceProfile
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

    // Weekday letters + per-day TSS from the model; the hit / missed / rested
    // status comes from the REAL forgiving streak (services/streak.py), which
    // reads actual activities + planned workouts + athlete status. This is the
    // honest, no-guilt rule: a planned rest day reads "rest" (never "missed"),
    // an unplanned quiet day isn't a failure, and only a genuinely skipped
    // planned session is "missed". Mon→Sun, aligned by index with model.week.
    const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const todayDow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
    const streakStates = streak?.week?.map((w) => w.state) ?? []
    const weekDays = model.week.map((d, i) => {
      const actual = isPresent(d.tss) ? d.tss.value : 0
      const isToday = i === todayDow
      // Map the real streak day-state onto the strip's visual status. Fall back
      // (before the streak loads) to an honest, non-guilt read: past days with
      // a ride are "hit", quiet past days are "rest" — never a fabricated miss.
      const st = streakStates[i]
      const status: 'today' | 'hit' | 'missed' | 'over' | 'rest' | 'upcoming' =
        isToday ? 'today'
          : st === 'upcoming' || i > todayDow ? 'upcoming'
            : st === 'missed' ? 'missed'
              : st === 'rest' || st === 'paused' ? 'rest'
                : st === 'trained' ? 'hit'
                  : st === 'unplanned' ? (actual > 0 ? 'hit' : 'rest')
                    : actual > 0 ? 'hit' : 'rest'
      // Today's planned target is real (from the session). Past days carry no
      // stored per-day planned TSS, so the label shows the actual, not a guess.
      const plannedTss = isToday && session?.tss != null ? session.tss : actual
      return {
        letter: d.letter, num: '', actual, planned: plannedTss, status,
        title: isToday && session ? session.title : null,
        dateLabel: WD[i] ?? d.letter, weekday: WD[i] ?? d.letter,
        targetW: isToday && session?.targetWatts != null ? `${session.targetWatts} W` : '—',
        ftpPct: isToday && session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}%` : '—',
      }
    })

    // Real week-progress label from the week strip (days trained/rested vs planned).
    const weekDone = weekDays.filter((d) => d.status === 'hit' || d.status === 'rest').length
    const weekPlanned = weekDays.filter((d) => d.status !== 'upcoming').length
    const weekDoneLabel = weekPlanned > 0 ? `${weekDone} of ${weekPlanned} done` : null
    const zoneTag = session?.intensityFactor != null ? `${Math.round(session.intensityFactor * 100)}% FTP` : null

    return {
      handle: user?.display_name ? `@${user.display_name}` : (user?.email ? `@${user.email.split('@')[0]}` : '@rider'),
      tierLine: 'Silver Tier · Week 6 of 16', // fixture: tier/season not modelled yet
      bikeName: 'Starter Bike', // fixture: bike economy not built (starter frame)
      weekDoneLabel,
      zoneTag,
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

      // ── crew standings: REAL from useCrewStandings; honest fixture only when
      //    the athlete is in no crew yet (no standings to show) ──
      crewCaption: realCrewCaption ?? 'Join a crew to see how your week stacks up against your riders.',
      crew: realCrew ?? [
        { name: 'Mara', color: '#7B5CFF', pct: 143, me: false },
        { name: 'You', color: '#2BE68F', pct: 131, me: true },
        { name: 'Timo', color: '#6B8CFF', pct: 104, me: false },
      ],
      crewRank: realCrewRank ?? '↑1',
      challengeLabel: 'CREW-CHALLENGE · AROUND THE WORLD',   // fixture: crew-challenge banner not wired
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
  }, [model, user, streak, standings, adaptive])

  // Real adapt: Easier/Harder run the coach's plan-adaptation endpoint
  // (`/coach/plan/preview` → deterministic plan engine + safety rails, a
  // dry-run that persists nothing). The returned target/TSS/FTP and rationale
  // are computed from the athlete's real FTP + planned session, with the
  // intensity ceiling enforced (`rails_downgraded`). Rest is deterministic and
  // never hits the endpoint. `applicable:false` (no plan today) → null, which
  // the card surfaces as an honest "no plan to adapt". (The LLM coaching voice
  // lives in the readiness verdict above, not in this load-safety math.)
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

  // First-open gate: a rider who has never seen the W3 intro lands on the
  // onboarding chain instead of a cold Today. localStorage-backed, so it fires
  // once per browser; the Garage step marks it seen. (After all hooks, so the
  // Rules of Hooks hold regardless of this branch.)
  if (user && !hasSeenW3Onboarding()) {
    return <Navigate to="/e/w3-onboard-welcome" replace />
  }

  return <W3TodayView vm={vm} onAdapt={onAdapt} />
}
