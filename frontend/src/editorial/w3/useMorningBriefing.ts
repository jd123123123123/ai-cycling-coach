import { useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useDayState } from '../state/useDayState'
import { useTodayModel } from '../data/useTodayModel'
import { useTodayWeather } from '../../hooks/useTodayWeather'
import { useTodayStage } from '../../hooks/useGarage'
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

/**
 * ONE ROW OF THE CONTRIBUTOR LIST — a reading placed on a SPECTRUM.
 *
 * A fill bar answers "how much", which is the wrong question for a vital sign.
 * What a rider needs is two things at once: where the good range sits, and
 * where last night actually landed relative to it. 7 h 24 means nothing until
 * you know the band is 7–9; 46 bpm means nothing until you know it is under
 * your own.
 *
 * So every row draws the same three parts: the scale, the OPTIMAL BAND on it,
 * and a marker for the reading. `tone` still says whether landing there is good
 * news for THIS signal — that is not a property of the position, since low is
 * excellent for a resting pulse and poor for HRV.
 */
export interface Contributor {
  key: string
  label: string
  /**
   * WHAT THE POSITION MEANS, in a clause — the half a spectrum cannot say.
   *
   * "HRV · 68 ms" plus a marker leaves the rider to work out whether being
   * right of the band is the good side; for a resting pulse the answer flips.
   * The sentence carries the reading and the graph carries the amount, and
   * together they say the whole thing without either repeating the other.
   */
  sentence: string
  value: string
  /** Where the reading landed, 0..1 of the row's scale. Null → no marker. */
  at: number | null
  /** The optimal band on that same 0..1 scale. Null → no band to draw, and the
   *  row falls back to the marker alone rather than inventing a range. */
  band: { lo: number; hi: number } | null
  /** What the band's two edges are, in the rider's units — printed beside it so
   *  the spectrum is readable and not just decorative. */
  bandLabel: string | null
  tone: 'good' | 'warn' | 'flat'
  /**
   * Which way this reading moved, as a glyph rather than a number.
   *
   * Direction is the thing a rider checks first and the thing a figure answers
   * slowest. An arrow in a soft tinted disc is read at a glance and carries no
   * arithmetic — the mechanism the calmest health apps lean on hardest.
   */
  dir: 'up' | 'down' | 'flat'
}

/**
 * ONE READING, ITS OWN HISTORY, AND WHAT IT MEANS — kept for the load row.
 *
 * A number alone is unreadable on a morning: 46 bpm is excellent or alarming
 * depending on whose it is and what it was last week. The tile carries all
 * three parts, so nothing needs a sentence underneath explaining it — which is
 * how the briefing stopped being mostly prose.
 */
export interface StatTile {
  key: string
  label: string
  /** Already formatted, in the rider's locale. */
  value: string
  unit: string | null
  /** Trailing history, oldest first. Empty when there is no history — the tile
   *  then draws its number and no spark rather than a flat invented line. */
  spark: number[]
  /**
   * Which bar is TODAY, and therefore lit. Defaults to the last.
   *
   * It has to be a field because not every spark ends today: the week runs
   * Monday to Sunday, so on a Thursday the last bar is a Sunday nobody has
   * ridden yet. Lighting it claimed a value three days in the future.
   */
  todayIdx?: number
  /** The one clause: "+4 zu deinem Schnitt", "Bestwert", "unter deinem Band". */
  sub: string | null
  /** Whether that clause is good news, bad news, or neither. */
  tone: 'good' | 'warn' | 'flat'
}

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
   * TODAY'S SESSION AS ITS SHAPE — the interval profile, block by block.
   *
   * "Schwellenintervalle · 75 min" tells a rider the name and the cost and
   * nothing about the SESSION: four by eight at threshold and a two-hour
   * endurance ride are the same sentence with different numbers. The profile is
   * the one picture that answers "what am I actually in for", and it is the
   * thing every workout app draws because it works.
   */
  blocks: { label: string; minutes: number; watts: number | null }[]
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
  /** Today's readiness. Null whenever the gate withholds it — the arc then
   *  draws empty rather than at an invented angle. */
  readiness: { score: number; delta: number | null } | null

  /**
   * THE RIDER'S OWN BIKE, BEHIND THEIR SCORE.
   *
   * A number on a flat card is a dashboard; the same number over a photograph
   * is a poster, and a poster is the thing people screenshot. This is the
   * composed scene the room already holds — their machine, in a place — so it
   * costs nothing extra and it is unmistakably theirs.
   *
   * Null until the scene exists. The card then falls back to its own ground
   * rather than to a stock picture of somebody else's morning.
   */
  heroImage: string | null

  /**
   * WHAT THE APP SAYS BACK.
   *
   * The screens people post are the ones that REACTED to them. "Optimal" is a
   * label; "Put it in the Louvre" is an app noticing. The title is short enough
   * to be the thing you screenshot and the body earns it by staying about the
   * rider's own night.
   *
   * `crowned` is the top band only. An ornament that appears every morning is
   * decoration; one that appears rarely is a reward.
   */
  celebration: { title: string; body: string; crowned: boolean } | null

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
    /**
     * Form over the trailing weeks, so today's figure has somewhere to stand.
     * "−6" alone is unreadable: a rider cannot tell a body climbing out of a
     * block from one falling into one, and those call for opposite mornings.
     */
    formSeries: { date: string; tsb: number }[]
    /** Mon-Sun, so the week reads as a shape. Null = no ride logged that day. */
    week: { letter: string; tss: number | null }[]
    weekSpent: number | null
    weekPlanned: number | null
  } | null
  /**
   * THE VERDICT BESIDE THE NUMBER — "Grünes Licht", "Halt die Zügel kurz".
   *
   * Every readiness surface worth copying puts a plain-language verdict next to
   * the score, and so does this app's own Today dock. A rider reads the word
   * before the figure; the figure is what they check afterwards.
   */
  readinessVerdict: string | null
  /**
   * The contributors, as a LIST — label, value, and how far along its own
   * range it sits. Not a grid of chart tiles: six equal boxes have no hero and
   * read as a dashboard, which is the note this screen kept getting.
   */
  contributors: Contributor[]
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
  const { data: stage } = useTodayStage()
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
    let blocks: { label: string; minutes: number; watts: number | null }[] = []
    let tone: BriefingTone
    if (!planned) {
      headline = 'Noch kein Plan'
      tone = 'unknown'
    } else if (session) {
      const mins = session.blocks.reduce((n, b) => n + b.minutes, 0)
      headline = session.title
      headlineMeta = mins > 0 ? HM(mins * 60) : null
      blocks = session.blocks
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

    const sleepV = isPresent(model.sleep) ? model.sleep.value : null
    const hrvV = isPresent(model.hrv) ? model.hrv.value : null
    const rhrV = isPresent(model.restingHr) ? model.restingHr.value : null

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
      why = sleepV || hrvV || rhrV
        ? 'Messwerte vorhanden. Die Bereitschaft ist noch nicht verfügbar.'
        : 'Die Nacht-Werte stehen noch aus.'
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


    // ── the verdict, and the contributors behind it ──────────────────────
    // A rider reads the WORD before the figure. This app's own Today dock puts
    // "Grünes Licht" beside 88 for exactly that reason, and every readiness
    // screen worth copying does the same.
    // The reaction, banded. Only the top one gets its own flourish — a line
    // that lands every morning is wallpaper.
    const celebration = score == null ? null
      : score.score >= 90 ? {
          title: 'Häng es ins Museum.',
          body: 'So einen Wert bekommt man nicht geschenkt. Dein Körper hat heute Nacht abgeliefert — fahr etwas Schönes damit.',
          crowned: true,
        }
      : score.score >= 80 ? {
          title: 'Grünes Licht.',
          body: 'Alles steht auf Fahren. Was du heute vorhast, trägt dich auch durch.',
          crowned: false,
        }
      : score.score >= 65 ? {
          title: 'Solide Basis.',
          body: 'Genug im Tank für den Plan. Kein Grund zur Vorsicht, kein Grund zum Übermut.',
          crowned: false,
        }
      : score.score >= 50 ? {
          title: 'Mit Gefühl.',
          body: 'Geht klar — halt aber etwas zurück. Der Tag muss nicht heute entschieden werden.',
          crowned: false,
        }
      : {
          title: 'Halt die Zügel kurz.',
          body: 'Heute zählt Erholung mehr als Wattzahlen. Der Plan läuft dir nicht weg.',
          crowned: false,
        }

    const readinessVerdict = score == null
      ? null
      : score.score >= 80 ? 'Grünes Licht'
      : score.score >= 65 ? 'Solide Basis'
      : score.score >= 50 ? 'Mit Gefühl'
      : 'Halt die Zügel kurz'

    const contributors: Contributor[] = []
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

    if (sleepV) {
      // 0-10 h of scale, and the band a rider can actually be held to: seven to
      // nine hours is the range every sleep guideline agrees on, so it is
      // stated rather than derived from a short history.
      const hrs = sleepV.totalS / 3600
      contributors.push({
        key: 'sleep', label: 'Schlaf',
        value: `${Math.floor(sleepV.totalS / 3600)}:${String(Math.round((sleepV.totalS % 3600) / 60)).padStart(2, '0')} h`,
        sentence: hrs >= 7 && hrs <= 9 ? 'Volle Nacht'
          : hrs > 9 ? 'Über 9 Stunden'
          : hrs >= 6 ? 'Etwas kurz'
          : 'Zu kurz',
        at: clamp01(hrs / 10), band: { lo: 0.7, hi: 0.9 }, bandLabel: '7–9 h',
        tone: hrs >= 7 && hrs <= 9 ? 'good' : hrs < 6 ? 'warn' : 'flat',
        dir: hrs >= 7 ? 'up' : hrs < 6 ? 'down' : 'flat',
      })
      if (sleepV.deepS != null) {
        // Deep sleep is judged as a SHARE of the night, not in minutes: 90 min
        // is excellent after seven hours and alarming after four. 13-23 % is
        // the range the sleep literature converges on.
        const share = sleepV.deepS / sleepV.totalS
        contributors.push({
          key: 'deep', label: 'Tiefschlaf',
          value: `${Math.round(sleepV.deepS / 60)} min`,
          sentence: share >= 0.13 && share <= 0.23 ? 'Gesunder Tiefschlaf'
            : share > 0.23 ? 'Viel Tiefschlaf'
            : 'Wenig Tiefschlaf',
          at: clamp01(share / 0.35), band: { lo: 0.13 / 0.35, hi: 0.23 / 0.35 },
          bandLabel: '13–23 %',
          tone: share >= 0.13 && share <= 0.23 ? 'good' : share < 0.10 ? 'warn' : 'flat',
          dir: share > 0.23 ? 'up' : share < 0.13 ? 'down' : 'flat',
        })
      }
    }

    // HRV and resting pulse are placed against the rider's OWN trailing band —
    // the only range that means anything for a vital sign. The scale runs a
    // little past both edges so a reading outside the band still has somewhere
    // to sit instead of pinning to the end.
    const ownSpectrum = (v: number, b: { low: number; high: number } | null | undefined) => {
      if (!b || b.high === b.low) return { at: null, band: null }
      const pad = (b.high - b.low) * 0.8
      const lo = b.low - pad
      const span = (b.high + pad) - lo
      return {
        at: clamp01((v - lo) / span),
        band: { lo: clamp01((b.low - lo) / span), hi: clamp01((b.high - lo) / span) },
      }
    }

    if (hrvV) {
      const sp = ownSpectrum(hrvV.value, hrvV.band)
      contributors.push({
        key: 'hrv', label: 'HRV', value: `${Math.round(hrvV.value)} ${hrvV.unit}`,
        sentence: !hrvV.band ? 'HRV: persönlicher Vergleich noch offen' : hrvV.band?.position === 'above' ? 'HRV über deinem Bereich'
          : hrvV.band?.position === 'below' ? 'HRV unter deinem Bereich'
          : 'HRV in deinem Bereich',
        at: sp.at, band: sp.band,
        bandLabel: hrvV.band ? `${Math.round(hrvV.band.low)}–${Math.round(hrvV.band.high)} ${hrvV.unit}` : null,
        // DIRECTIONAL, like the resting pulse two blocks below — and for the
        // same reason. "Outside the band either way is worth a look" flagged
        // HRV ABOVE baseline in red, which is the one HRV reading that is
        // unambiguously good news: it is the basis of HRV-guided training
        // (Plews 2013), and this app's own readiness model scores above-band
        // HRV monotonically upward (`readiness_score._hrv_component`). So the
        // morning sheet was painting a red arrow on the signal the score two
        // centimetres above it was rewarding. Below the band is the flag.
        tone: hrvV.band == null ? 'flat' : hrvV.band.position === 'below' ? 'warn' : 'good',
        dir: hrvV.band?.position === 'above' ? 'up' : hrvV.band?.position === 'below' ? 'down' : 'flat',
      })
    }
    if (rhrV) {
      const sp = ownSpectrum(rhrV.value, rhrV.band)
      contributors.push({
        key: 'rhr', label: 'Ruhepuls', value: `${Math.round(rhrV.value)} ${rhrV.unit}`,
        // Under the band is the GOOD side here, and a marker on the left says
        // nothing about that on its own.
        sentence: !rhrV.band ? 'Ruhepuls: persönlicher Vergleich noch offen' : rhrV.band?.position === 'below' ? 'Ruhepuls unter deinem persönlichen Bereich'
          : rhrV.band?.position === 'above' ? 'Ruhepuls über deinem Bereich'
          : 'Ruhepuls in deinem Bereich',
        at: sp.at, band: sp.band,
        bandLabel: rhrV.band ? `${Math.round(rhrV.band.low)}–${Math.round(rhrV.band.high)} ${rhrV.unit}` : null,
        // Directional: below or inside the band is good; only above is a flag.
        tone: rhrV.band == null ? 'flat' : rhrV.band.position === 'above' ? 'warn' : 'good',
        dir: rhrV.band?.position === 'above' ? 'up' : rhrV.band?.position === 'below' ? 'down' : 'flat',
      })
    }

    // ── the night ─────────────────────────────────────────────────────────
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
    let fatigueSpark: number[] = []
    /** Which weekday the newest PMC row belongs to — the bar the WOCHE spark
     *  lights. Mon=0. Undefined when there is no series to date it from. */
    let todayWeekday: number | undefined
    if (pmc || load || weekDays.some((d) => d.tss != null)) {
      const series = pmc?.series ?? []
      const last = series[series.length - 1] ?? null
      const prev = series[series.length - 2] ?? null
      // ATL is a rolling average, so yesterday minus today IS what the body
      // shed overnight. Only meaningful when it actually fell.
      const drop = last && prev ? prev.atl - last.atl : null
      todayWeekday = last ? (new Date(`${last.date}T00:00:00`).getDay() + 6) % 7 : undefined
      // Night-over-night recovery for the last week, so the tile's spark is the
      // same quantity its number is.
      fatigueSpark = series.slice(-8).map((pt, i, arr) => (i === 0 ? 0 : arr[i - 1].atl - pt.atl)).slice(1)
      const yTss = prev?.tss ?? null
      const noteParts: string[] = []
      if (drop != null && drop > 0.5) noteParts.push(`Über Nacht hat dein Körper ${drop.toFixed(1)} Ermüdung abgebaut`)
      else if (drop != null && drop < -0.5) noteParts.push(`Deine Ermüdung ist über Nacht um ${Math.abs(drop).toFixed(1)} gestiegen`)
      if (yTss != null && yTss > 0) noteParts.push(`gestern hast du ${Math.round(yTss)} TSS eingefahren`)
      body = {
        yesterdayTss: yTss != null ? Math.round(yTss) : null,
        fatigueDrop: drop != null ? Math.round(drop * 10) / 10 : null,
        form: pmc ? Math.round(pmc.form) : null,
        // The last four weeks, thinned to what a 90px sparkline can show.
        formSeries: series.slice(-28).map((pt) => ({ date: pt.date, tsb: pt.tsb })),
        week: weekDays,
        weekSpent: load ? Math.round(load.spent) : null,
        weekPlanned: load ? Math.round(load.planned) : null,
      }
    }

    const streak = days >= 2 ? `${days} Tage in Folge` : null

    // ── the load tiles ────────────────────────────────────────────────────
    const loadTiles: StatTile[] = []
    if (body) {
      if (body.form != null) {
        loadTiles.push({
          key: 'form', label: 'FORM',
          value: `${body.form > 0 ? '+' : ''}${body.form}`, unit: null,
          spark: body.formSeries.slice(-7).map((p) => p.tsb),
          // TSB's SIGN is what riders read off it, so the clause names the side
          // rather than repeating the figure.
          sub: body.form > 5 ? 'frisch' : body.form < -15 ? 'tief im Block' : 'im Aufbau',
          tone: body.form > 5 ? 'good' : body.form < -15 ? 'warn' : 'flat',
        })
      }
      if (body.fatigueDrop != null) {
        loadTiles.push({
          key: 'drop', label: 'ÜBER NACHT',
          value: `${body.fatigueDrop > 0 ? '−' : '+'}${Math.abs(body.fatigueDrop)}`, unit: null,
          spark: fatigueSpark,
          sub: body.fatigueDrop > 0 ? 'Ermüdung abgebaut' : 'Ermüdung gestiegen',
          tone: body.fatigueDrop > 0 ? 'good' : 'warn',
        })
      }
      if (body.weekSpent != null) {
        const pct = body.weekPlanned ? Math.round((body.weekSpent / body.weekPlanned) * 100) : null
        loadTiles.push({
          key: 'week', label: 'WOCHE', value: String(body.weekSpent), unit: 'TSS',
          spark: body.week.map((d) => d.tss ?? 0),
          // FROM THE DATA, NOT FROM A CLOCK. The last PMC point IS today's
          // row, so its weekday is the bar to light — and reading a clock here
          // would be impure inside the memo anyway (react-hooks/purity).
          // Mon=0; `getDay()` is Sun=0, so Sunday folds to the end of ITS week.
          todayIdx: todayWeekday,
          sub: pct != null ? `${pct} % vom Plan` : null,
          tone: 'flat',
        })
      }
    }

    // ── the warm line ─────────────────────────────────────────────────────
    // Composed, in the order a rider would care: a good night first, then a
    // long streak, then a hard day behind them. One line or none.
    const slept = sleepV ? sleepV.totalS / 3600 : null
    let welcome: string | null = null
    if (slept != null && slept >= 7.5 && (hrvV?.band?.position ?? 'in') !== 'below') {
      welcome = 'Die Nacht war lang genug.'
    } else if (hrvV?.band?.position === 'above') {
      welcome = 'Dein Körper hat die Nacht gut genutzt.'
    } else if (days >= 7) {
      welcome = `${days} Tage am Stück.`
    } else if (body?.yesterdayTss != null && body.yesterdayTss >= 90) {
      welcome = 'Gestern war ein großer Tag.'
    } else if (slept != null && slept < 6) {
      welcome = 'Kurze Nacht — nimm dir den Tag entsprechend.'
    }

    return {
      greeting, welcome, dateLabel, headline, headlineMeta, blocks, why, tone, window,
      readiness: score ? { score: Math.round(score.score), delta: score.deltaVsYesterday } : null,
      heroImage: stage?.bike_image ?? null,
      celebration,
      night,
      body,
      readinessVerdict,
      contributors,
      streak,
      bare: !planned && !window && !night && !body,
    }
  }, [user, model, weather, week, stage])
}
