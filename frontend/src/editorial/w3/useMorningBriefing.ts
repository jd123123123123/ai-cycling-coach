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

export interface MorningBriefing {
  greeting: string
  /**
   * The warm half of the greeting — one short, kind, TRUE line about how the
   * rider arrived at this morning.
   *
   * It is composed from what actually resolved, never picked from a bag of
   * pleasantries: "Schön, dass du wieder da bist" to someone who rode yesterday
   * is a stranger talking. When nothing stands out it stays null and the
   * greeting is simply a greeting, which is also kind.
   */
  welcome: string | null
  dateLabel: string | null
  /** The answer. "Schwellenintervalle", "Ruhetag", "Noch kein Plan". */
  headline: string
  /** The size of it — "75 min". Its own field because appending it to the
   *  headline let a wrap put "· 75 min" alone on the second line, which reads
   *  as a broken string rather than as a duration. */
  headlineMeta: string | null
  /**
   * ONLY WHEN THE RING CANNOT SPEAK.
   *
   * This used to carry a sentence on every morning — "Deine Bereitschaft liegt
   * bei 74 (+6 zu gestern). Deine Form ist frisch." — next to a ring showing 74
   * with +6 under it and a form figure two blocks down. Three statements of the
   * same two numbers. It survives for exactly the case the graphics CANNOT
   * cover: no score to draw, and a rider owed the reason why.
   */
  why: string | null
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
    hours: { hour: number; q: number | null; rideable: boolean; rain: number | null; wind: number | null; dir: string | null; temp: number | null }[]
    /** Null when the forecast had no scoreable hours to bracket — the strip
     *  still draws, nothing is highlighted, and no window is invented. */
    bestFrom: number | null
    bestTo: number | null
  } | null
  /** Today's readiness, for the ring. Null whenever the gate withholds it —
   *  the ring then draws empty rather than at an invented angle. */
  readiness: { score: number; delta: number | null } | null

  /**
   * HOW THE NIGHT WENT — the question a rider actually wakes up with, and the
   * one most apps answer with a single score. The stages are drawn as the
   * proportions they are; HRV and resting heart rate are placed against the
   * rider's OWN trailing band, because "high" only means anything against your
   * own nights.
   */
  night: {
    totalLabel: string
    /** Minutes per stage, in the order they are drawn. A stage the watch did
     *  not record is absent rather than zero — those are different nights. */
    stages: { key: string; label: string; minutes: number }[]
    hrv: { value: string; delta: number | null; position: 'below' | 'in' | 'above' | null } | null
    rhr: { value: string; delta: number | null; position: 'below' | 'in' | 'above' | null } | null
    /** Body battery at wake — how much of the night the body actually banked. */
    battery: number | null
  } | null

  /**
   * WHAT THE BODY DID WITH YESTERDAY AND THE WEEK.
   *
   * `fatigueDrop` is the insight almost nothing else shows: ATL is a rolling
   * average, so the difference between yesterday's and today's IS the load the
   * body shed overnight. A rider feels that number every morning and has never
   * been given it.
   */
  body: {
    yesterdayTss: number | null
    fatigueDrop: number | null
    form: number | null
    /** Mon-Sun, so the week reads as a shape. Null = no ride logged that day. */
    week: { letter: string; tss: number | null }[]
    weekSpent: number | null
    weekPlanned: number | null
  } | null
  /** Consecutive days, when the streak is worth a word. */
  streak: string | null
  /** True when nothing at all resolved — no plan, no wearable, no forecast. */
  bare: boolean
}

const HM = (s: number) => `${Math.round(s / 60)} min`
const DASHV = '—'

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
    const recovery = isPresent(model.recovery) ? model.recovery.value : null

    let why: string | null
    if (!planned) {
      why = 'Stell dir in wenigen Klicks einen Plan zusammen.'
    } else if (score) {
      // The ring already says it, with its own delta. Silence here is the
      // whole point: one fact, one place.
      why = null
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
          hours: w.hours.map((h) => ({
            hour: h.hour, q: h.q, rideable: h.rideable,
            rain: h.rain, wind: h.wind, dir: h.dir, temp: h.temp,
          })),
          bestFrom: w.bestFrom,
          bestTo: w.bestTo,
        }
      : null

    const days = isPresent(model.streakDays) ? model.streakDays.value : 0

    // ── the night ─────────────────────────────────────────────────────────
    const sleepV = isPresent(model.sleep) ? model.sleep.value : null
    const hrvV = isPresent(model.hrv) ? model.hrv.value : null
    const rhrV = isPresent(model.restingHr) ? model.restingHr.value : null
    let night: MorningBriefing['night'] = null
    if (sleepV || hrvV || rhrV) {
      const st: { key: string; label: string; minutes: number }[] = []
      const push = (key: string, label: string, secs: number | null | undefined) => {
        if (secs != null && secs > 0) st.push({ key, label, minutes: Math.round(secs / 60) })
      }
      if (sleepV) {
        push('deep', 'TIEF', sleepV.deepS)
        push('rem', 'REM', sleepV.remS)
        push('light', 'LEICHT', sleepV.lightS)
        push('awake', 'WACH', sleepV.awakeS)
      }
      // The sentence names the ONE thing that stood out, and says nothing when
      // nothing did — a night with no story does not get one invented for it.
      const parts: string[] = []
      if (sleepV && sleepV.deepS != null) {
        parts.push(`${Math.round(sleepV.deepS / 60)} min Tiefschlaf`)
      }
      if (hrvV?.band?.position === 'above') parts.push('deine HRV lag über deinem Bereich')
      else if (hrvV?.band?.position === 'below') parts.push('deine HRV lag darunter')
      if (rhrV?.band?.position === 'below') parts.push('dein Ruhepuls war niedriger als sonst')
      else if (rhrV?.band?.position === 'above') parts.push('dein Ruhepuls lag höher als sonst')
      night = {
        totalLabel: sleepV
          ? `${Math.floor(sleepV.totalS / 3600)}:${String(Math.round((sleepV.totalS % 3600) / 60)).padStart(2, '0')} h`
          : DASHV,
        stages: st,
        hrv: hrvV ? { value: `${Math.round(hrvV.value)} ${hrvV.unit}`, delta: hrvV.delta, position: hrvV.band?.position ?? null } : null,
        rhr: rhrV ? { value: `${Math.round(rhrV.value)} ${rhrV.unit}`, delta: rhrV.delta, position: rhrV.band?.position ?? null } : null,
        battery: isPresent(model.bodyBattery) ? Math.round(model.bodyBattery.value.wake) : null,
      }
    }

    // ── what the body did with it ─────────────────────────────────────────
    const pmc = isPresent(model.pmc) ? model.pmc.value : null
    const load = isPresent(model.weekLoad) ? model.weekLoad.value : null
    const weekDays = model.week.map((d) => ({ letter: d.letter, tss: isPresent(d.tss) ? d.tss.value : null }))
    let body: MorningBriefing['body'] = null
    if (pmc || load || weekDays.some((d) => d.tss != null)) {
      const series = pmc?.series ?? []
      const last = series[series.length - 1] ?? null
      const prev = series[series.length - 2] ?? null
      // ATL is a rolling average, so yesterday minus today IS what the body
      // shed overnight. Only meaningful when it actually fell.
      const drop = last && prev ? prev.atl - last.atl : null
      const yTss = prev?.tss ?? null
      const noteParts: string[] = []
      if (drop != null && drop > 0.5) noteParts.push(`Über Nacht hat dein Körper ${drop.toFixed(1)} Ermüdung abgebaut`)
      else if (drop != null && drop < -0.5) noteParts.push(`Deine Ermüdung ist über Nacht um ${Math.abs(drop).toFixed(1)} gestiegen`)
      if (yTss != null && yTss > 0) noteParts.push(`gestern hast du ${Math.round(yTss)} TSS eingefahren`)
      body = {
        yesterdayTss: yTss != null ? Math.round(yTss) : null,
        fatigueDrop: drop != null ? Math.round(drop * 10) / 10 : null,
        form: pmc ? Math.round(pmc.form) : null,
        week: weekDays,
        weekSpent: load ? Math.round(load.spent) : null,
        weekPlanned: load ? Math.round(load.planned) : null,
      }
    }

    const streak = days >= 2 ? `${days} Tage in Folge` : null

    // ── the warm line ─────────────────────────────────────────────────────
    // Composed, in the order a rider would care: a good night first, then a
    // long streak, then a hard day behind them. One line or none.
    const slept = sleepV ? sleepV.totalS / 3600 : null
    let welcome: string | null = null
    if (slept != null && slept >= 7.5 && (hrvV?.band?.position ?? 'in') !== 'below') {
      welcome = `${slept.toFixed(1).replace('.', ',')} Stunden Schlaf — damit lässt sich was anfangen.`
    } else if (hrvV?.band?.position === 'above') {
      welcome = 'Dein Körper hat die Nacht gut genutzt.'
    } else if (days >= 7) {
      welcome = `${days} Tage am Stück. Das ist die Sorte Form, die man sich nicht kauft.`
    } else if (body?.yesterdayTss != null && body.yesterdayTss >= 90) {
      welcome = 'Gestern war ein großer Tag. Heute zählt, was du daraus machst.'
    } else if (slept != null && slept < 6) {
      welcome = 'Kurze Nacht. Nimm dir den Tag entsprechend.'
    }

    return {
      greeting, welcome, dateLabel, headline, headlineMeta, why, tone, window,
      readiness: score ? { score: Math.round(score.score), delta: score.deltaVsYesterday } : null,
      night,
      body,
      streak,
      bare: !planned && !window && !night && !body,
    }
  }, [user, model, weather, week])
}
