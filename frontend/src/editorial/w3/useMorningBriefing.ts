import { useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDayState } from '../state/useDayState'
import { useTodayModel } from '../data/useTodayModel'
import { useTodayWeather } from '../../hooks/useTodayWeather'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { hasPlanFromWeek } from './w3hasPlan'
import { isPresent } from '../data/value'
import { buildWeather } from './w3weatherWindow'

/**
 * THE MORNING BRIEFING — the day in one page, and why.
 *
 * Answer-first, the way `/e/morning` is: what today is, then the reason, then
 * the two or three readings the reason rests on. A rider should be able to read
 * the first line and close it.
 *
 * IT REUSES TODAY'S OWN MODEL. Every number here comes from `useTodayModel`,
 * `useTodayWeather` and `useCurrentWeek` — the same three the Today screen is
 * built from — so the briefing cannot tell a rider something the screen behind
 * it contradicts. That is also why the ride window moved into
 * `w3weatherWindow`: two scorers would have named two different hours from one
 * forecast, and nothing on screen would say which was wrong.
 *
 * THE READINESS GATE IS OBEYED, NOT RE-ASKED. `readinessGate` already decides
 * whether a score may be shown at all; a morning popup is exactly the surface
 * that would be tempted to print yesterday's number as today's, because it is
 * the one that opens before the watch has synced. When the gate withholds, the
 * briefing says what it does not know and still gives the rider their day —
 * the plan does not depend on the wearable.
 */

export type BriefingTone = 'go' | 'easy' | 'rest' | 'unknown'

export interface BriefingReading {
  key: string
  label: string
  value: string
  /** What it means, in a clause. Absent when the number speaks for itself. */
  note?: string | null
}

export interface MorningBriefing {
  greeting: string
  dateLabel: string | null
  /** The answer. "Schwellenintervalle", "Ruhetag", "Noch kein Plan". */
  headline: string
  /** The size of it — "75 min". Its own field because appending it to the
   *  headline let a wrap put "· 75 min" alone on the second line, which reads
   *  as a broken string rather than as a duration. */
  headlineMeta: string | null
  /** Why that is the answer — one sentence, built from what resolved. */
  why: string
  tone: BriefingTone
  /**
   * The ride window, plus the whole day behind it so the sheet can DRAW it.
   * `hours` is every hour the forecast returned with its 0-1 ride quality;
   * `bestFrom`/`bestTo` bracket the two the window names. A rider can see the
   * shape of their day and where the good part sits, which is a different
   * (and more convincing) statement than a time range on its own.
   */
  window: {
    label: string
    detail: string
    verdict: string | null
    hours: { hour: number; q: number | null; rideable: boolean }[]
    /** Null when the forecast had no scoreable hours to bracket — the strip
     *  still draws, nothing is highlighted, and no window is invented. */
    bestFrom: number | null
    bestTo: number | null
  } | null
  /** Today's readiness, for the ring. Null whenever the gate withholds it —
   *  the ring then draws empty rather than at an invented angle. */
  readiness: { score: number; delta: number | null } | null
  readings: BriefingReading[]
  /** Consecutive days, when the streak is worth a word. */
  streak: string | null
  /** True when nothing at all resolved — no plan, no wearable, no forecast. */
  bare: boolean
}

const HM = (s: number) => `${Math.round(s / 60)} min`

export function useMorningBriefing(): MorningBriefing {
  const { user } = useAuth()
  const { state } = useDayState()
  const model = useTodayModel(state)
  const { data: weather } = useTodayWeather()
  const { data: week } = useCurrentWeek()

  return useMemo<MorningBriefing>(() => {
    const first = (user?.display_name ?? '').trim().split(/\s+/)[0] || null
    const greeting = first ? `Guten Morgen, ${first}` : 'Guten Morgen'
    const dateLabel = isPresent(model.dateLabel) ? model.dateLabel.value : null

    // ── the answer ────────────────────────────────────────────────────────
    const planned = hasPlanFromWeek(week)
    const session = isPresent(model.session) ? model.session.value : null
    let headline: string
    let headlineMeta: string | null = null
    let tone: BriefingTone
    if (!planned) {
      headline = 'Noch kein Plan'
      tone = 'unknown'
    } else if (session) {
      const mins = session.blocks.reduce((n, b) => n + b.minutes, 0)
      headline = session.title
      headlineMeta = mins > 0 ? HM(mins * 60) : null
      tone = (session.intensityFactor ?? 0) >= 0.85 ? 'go' : 'easy'
    } else {
      headline = 'Ruhetag'
      tone = 'rest'
    }

    // ── why ───────────────────────────────────────────────────────────────
    // The gate decides whether a score may be spoken for today at all. When it
    // withholds, the sentence says what is missing rather than borrowing
    // yesterday's number — and still hands over the plan, which does not depend
    // on a watch having synced.
    const gate = model.readinessGate
    const score = isPresent(model.readiness) ? model.readiness.value : null
    const form = isPresent(model.pmc) ? model.pmc.value.form : null
    const recovery = isPresent(model.recovery) ? model.recovery.value : null

    let why: string
    if (!planned) {
      why = 'Stell dir in ein paar Klicks einen Plan zusammen — oder bau dir heute eine Einheit nach Lust.'
    } else if (score) {
      const dir = score.deltaVsYesterday
      const move = dir == null || dir === 0
        ? ''
        : ` (${dir > 0 ? '+' : '−'}${Math.abs(Math.round(dir))} zu gestern)`
      const formNote = form == null
        ? ''
        : form > 5 ? ' Deine Form ist frisch.'
        : form < -15 ? ' Deine Form ist tief — das ist Absicht in einem Block, aber halte die Zügel kurz.'
        : ''
      why = `Deine Bereitschaft liegt bei ${Math.round(score.score)}${move}.${formNote}`
    } else if (gate === 'stale') {
      why = model.readinessGateHeadline
        ? `${model.readinessGateHeadline} — der Plan gilt trotzdem.`
        : 'Deine Uhr hat länger nicht synchronisiert — der Plan gilt trotzdem.'
    } else if (gate === 'pending') {
      why = 'Die Nacht-Werte stehen noch aus. Der Plan gilt trotzdem.'
    } else if (recovery && recovery.hoursRemaining > 0) {
      why = `Noch ${Math.round(recovery.hoursRemaining)} h Erholung bis ${recovery.clearAtLabel}.`
    } else {
      why = 'Keine Nacht-Werte — heute entscheidet der Plan.'
    }

    // ── the window ────────────────────────────────────────────────────────
    // Rest days get no ride window: a best two-hour slot on a day the plan says
    // not to ride is an invitation to ignore the plan.
    const w = tone === 'rest' ? null : buildWeather(weather)
    const window = w
      ? {
          label: w.window,
          detail: `${w.temp} · ${w.short}`,
          verdict: w.verdict,
          hours: w.hours.map((h) => ({ hour: h.hour, q: h.q, rideable: h.rideable })),
          bestFrom: w.bestFrom,
          bestTo: w.bestTo,
        }
      : null

    // ── what the reason rests on ──────────────────────────────────────────
    // Only what actually resolved, and never a score the gate is withholding.
    const readings: BriefingReading[] = []
    if (isPresent(model.sleep)) {
      const s = model.sleep.value
      readings.push({
        key: 'sleep', label: 'SCHLAF',
        value: `${Math.floor(s.totalS / 3600)}:${String(Math.round((s.totalS % 3600) / 60)).padStart(2, '0')} h`,
        note: s.deepS != null ? `${Math.round(s.deepS / 60)} min tief` : null,
      })
    }
    if (isPresent(model.hrv)) {
      const h = model.hrv.value
      readings.push({
        key: 'hrv', label: 'HRV', value: `${Math.round(h.value)} ${h.unit}`,
        note: h.delta != null && h.delta !== 0 ? `${h.delta > 0 ? '+' : '−'}${Math.abs(Math.round(h.delta))}` : null,
      })
    }
    if (isPresent(model.bodyBattery)) {
      readings.push({
        key: 'bb', label: 'AKKU', value: String(Math.round(model.bodyBattery.value.wake)),
        note: 'beim Aufwachen',
      })
    }

    const days = isPresent(model.streakDays) ? model.streakDays.value : 0
    const streak = days >= 2 ? `${days} Tage in Folge` : null

    return {
      greeting, dateLabel, headline, headlineMeta, why, tone, window,
      readiness: score ? { score: Math.round(score.score), delta: score.deltaVsYesterday } : null,
      readings: readings.slice(0, 3),
      streak,
      bare: !planned && !window && readings.length === 0,
    }
  }, [user, model, weather, week])
}
