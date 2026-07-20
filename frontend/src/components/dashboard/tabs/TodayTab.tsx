/**
 * TodayTab — rebuilt 1:1 from pencil-new.pen "Screen · Today" (OwSbv).
 * Card order matches the .pen exactly: Greeting header (+avatar) → Race chip →
 * Recovery card (ring + 3 sub-scores) → Workout card (coral, 3-stat + Start) →
 * Load card (CTL/ATL/TSB) → Activity card (rings + legend) → Metrics row
 * (Resting HR / HRV / Strain) → Streak card (weekday status dots).
 * Every value is real Garmin/backend data; no extra cards.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../../api/client'
import { COACH_BRIEF_KEY_ROOT } from '../../../hooks/useCoachBrief'
import { subDays, format, startOfWeek, addDays } from 'date-fns'
import { Link } from 'react-router-dom'
import { Flag, Heart, Activity, Zap, Target, Play, ListChecks, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Flame, Check, Moon, Sparkles, Pause, Minus } from 'lucide-react'
import type { Adaptations } from '../../../api/coach'
import type { AthleteState } from '../../../api/athletes'
import SessionReviewCard from '../SessionReviewCard'
import RecoveryEtaCard from '../RecoveryEtaCard'
import TheRoadCard from '../TheRoadCard'
import BreakthroughCelebration from '../BreakthroughCelebration'
import AbsorptionCard from '../AbsorptionCard'
import LevelStripCard from '../LevelStripCard'
import { useStreak, useSetAthleteStatus } from '../../../hooks/useStreak'
import { useCoachBrief } from '../../../hooks/useCoachBrief'
import { useDailyMetrics } from '../../../hooks/useDailyMetrics'
import { useTodaySnapshot } from '../../../hooks/useTodaySnapshot'
import { usePMC } from '../../../hooks/usePMC'
import { useActivitiesRange } from '../../../hooks/useActivitiesRange'
import { useGoalTrajectory } from '../../../hooks/useGoalTrajectory'
import { useAthleteProfile } from '../../../hooks/useAthleteProfile'
import { computeReadiness, readinessTier } from '../../../utils/metrics'
import { latestLoad, daysToEvent, localDayKey } from '../../../utils/loadMetrics'
import ScoreRing from '../../ui/ScoreRing'
import { useLocale } from '../../../contexts/LocaleContext'
import { useAuth } from '../../../contexts/AuthContext'
import { tFor } from '../../../i18n/strings'

const CARD = 'rounded-[24px] p-5'
const cardStyle = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' } as const

function readinessColor(score: number | null): string {
  if (score == null) return 'var(--color-muted)'
  if (score >= 66) return 'var(--color-recovery)'
  if (score >= 34) return 'var(--color-amber)'
  return 'var(--color-move)'
}

export default function TodayTab() {
  const { locale } = useLocale()
  const { user } = useAuth()
  const de = locale === 'de'
  const today = useMemo(() => new Date(), [])
  const { data: brief } = useCoachBrief()
  const { data: metricsResp } = useDailyMetrics(useMemo(() => subDays(today, 30), [today]), today)
  const { data: snapshot } = useTodaySnapshot()
  const { data: pmc } = usePMC(90)
  const { data: acts } = useActivitiesRange(useMemo(() => subDays(today, 8), [today]), today)
  const { data: trajectory } = useGoalTrajectory()
  const { data: profile } = useAthleteProfile()
  const { data: streakData } = useStreak()
  const setStatus = useSetAthleteStatus()

  const metrics = metricsResp?.metrics ?? []
  const latest = [...metrics].reverse().find((m) => m.hrv_status != null || m.resting_hr != null || m.sleep_score != null) ?? null
  const evidence = (brief?.evidence as Record<string, unknown> | undefined) ?? {}
  // ONE readiness story across surfaces: derive the headline with the EXACT
  // same chain the Recovery tab uses (live Garmin training-readiness snapshot →
  // deterministic composite of HRV/battery/sleep). Both tabs read the same
  // snapshot + the same 30-day metrics window, so the hero number here and the
  // "% recovered" number on Recovery are guaranteed to be the same value —
  // never two look-alike numbers that silently disagree.
  const score = snapshot?.training_readiness
    ?? computeReadiness(latest?.hrv_status ?? null, latest?.body_battery ?? null, latest?.sleep_score ?? null)
  const rColor = readinessColor(score ?? null)
  const tier = readinessTier(score ?? null)

  const athlete = evidence.athlete as Record<string, unknown> | undefined
  const goalName = athlete?.goal_target as string | undefined
  // P0-5: days-to-event comes from the shared selector over the LIVE profile
  // event date; the cacheable brief evidence is only a last-resort fallback.
  const daysToGoal = daysToEvent(profile?.target_event_date)
    ?? (athlete?.days_to_goal as number | undefined)
    ?? null
  // Prefer the coach evidence name; fall back to the logged-in user's email local
  // part (e.g. "jannis.deters@…" → "Jannis") so the greeting is always personal.
  const nameFromEmail = (email: string | undefined | null): string | undefined => {
    const local = (email ?? '').split('@')[0]?.split(/[._-]/)[0]
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : undefined
  }
  const athleteName = ((athlete?.name as string | undefined)?.split(' ')[0]) || nameFromEmail(user?.email)

  const pmcBio = evidence.biometrics as Record<string, unknown> | undefined
  const hrv = pmcBio?.hrv as Record<string, unknown> | undefined
  const hrvDelta = hrv?.delta_pct as number | null | undefined
  const sleepScore = latest?.sleep_score ?? null
  const bodyBattery = latest?.body_battery ?? null
  const restingHr = latest?.resting_hr ?? null
  const hrvNow = snapshot?.hrv_overnight_avg ?? latest?.hrv_status ?? null

  // P0-5: ONE producer for CTL/ATL/TSB — the shared latestLoad selector over
  // live PMC. Never the brief's evidence.pmc snapshot (60-day window, cacheable
  // for far longer than a day) — the Form chip must always equal the displayed
  // CTL − the displayed ATL.
  const load = latestLoad(pmc?.entries)
  const ctl = load?.ctl ?? null
  const atl = load?.atl ?? null
  const tsb = load?.tsb ?? null
  const dCtl = load?.dCtl7 ?? null

  const workout = brief?.prescribed_workout
  // Rest-day detection — a rest day has nothing to start or view. Robustly read
  // the same PrescribedWorkout the plan card renders: no workout at all, a
  // rest/recovery template id or category, a rest/recovery title, or zeroed
  // targets (≈0 TSS and ≈0 duration) all mean "no session prescribed".
  const isRestDay = useMemo(() => {
    if (!workout) return true
    const id = (workout.template_id ?? '').toLowerCase()
    const cat = (workout.category ?? '').toLowerCase()
    const title = (workout.title ?? '').toLowerCase()
    if (/^(rest|recovery)/.test(id)) return true
    if (/\b(rest|recovery)\b/.test(cat) || /\b(ruhetag|erholung)\b/.test(cat)) return true
    if (/\b(rest day|ruhetag)\b/.test(title)) return true
    const tss = workout.predicted_tss ?? 0
    const dur = workout.duration_minutes ?? 0
    if (tss <= 1 && dur <= 1) return true
    return false
  }, [workout])
  const review = brief?.post_ride_review ?? null
  const adaptations = (brief as { adaptations?: Adaptations | null } | undefined)?.adaptations ?? null
  const [whyOpen, setWhyOpen] = useState(false)
  const wBlocks = workout?.blocks ?? []
  const wBlockSummary = wBlocks.length > 0
    ? wBlocks.slice(0, 5).map((b) => b.name).filter(Boolean).join(' → ')
    : null

  // Workout intensity zone, derived from real prescribed TSS + duration (IF).
  const wIntensity = useMemo(() => {
    if (!workout) return null
    const durHr = (workout.duration_minutes ?? 0) / 60
    if (durHr <= 0 || workout.predicted_tss == null) return null
    const iff = Math.sqrt(workout.predicted_tss / (durHr * 100))
    if (iff < 0.75) return { z: 'Z2', t: de ? 'Grundlage' : 'Endurance' }
    if (iff < 0.85) return { z: 'Z3', t: 'Tempo' }
    if (iff < 0.95) return { z: 'Z4', t: de ? 'Schwelle' : 'Threshold' }
    return { z: 'Z5', t: 'VO₂' }
  }, [workout, de])

  // Today's training snapshot — real activity channels only (no steps).
  // P0-2: activities are bucketed onto BROWSER-LOCAL days via the shared
  // localDayKey selector — never a UTC `.slice(0, 10)` prefix.
  const todayKey = localDayKey(today)
  const todayActs = (acts?.activities ?? []).filter((a) => localDayKey(a.started_at ?? a.date ?? '') === todayKey)
  const moveLoad = Math.round(todayActs.reduce((s, a) => s + (a.tss ?? 0), 0))
  const exMin = Math.round(todayActs.reduce((s, a) => s + (a.duration_seconds ?? 0) / 60, 0))
  const hasTss = todayActs.some((a) => a.tss != null)

  // Daily training-load target: meso plan (weekly/7) → today's prescribed TSS → default.
  const dailyTssTarget = Math.max(
    60,
    Math.round(
      trajectory?.weekly_tss_required && trajectory.weekly_tss_required > 0
        ? trajectory.weekly_tss_required / 7
        : workout?.predicted_tss ?? 120,
    ),
  )

  const hasSessionToday = todayActs.length > 0
  const loadPct = Math.min(100, Math.round((moveLoad / dailyTssTarget) * 100))

  // Strain (0–21), derived from today's real training load.
  const strain = moveLoad > 0 ? Math.min(21, moveLoad / 8) : null
  const strainState = strain == null ? '—' : strain >= 8 && strain <= 16 ? (de ? 'Optimal' : 'Optimal') : strain > 16 ? (de ? 'Hoch' : 'High') : (de ? 'Leicht' : 'Light')

  const greeting = (() => {
    const h = today.getHours()
    const base = de ? (h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend') : (h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
    return athleteName ? `${base}, ${athleteName}` : base
  })()

  // "Why this?" — the SPECIFIC inputs behind today's prescription (never a
  // black box: every chip is a real signal the engine weighed) + the science
  // frameworks the brief cites. All values come from the brief evidence /
  // metrics already loaded — nothing fabricated, chips render only when real.
  const whyInputs = useMemo(() => {
    const chips: { l: string; v: string }[] = []
    if (typeof tsb === 'number') chips.push({ l: 'Form', v: `${tsb >= 0 ? '+' : ''}${tsb} TSB` })
    if (atl != null) chips.push({ l: de ? 'Ermüdung' : 'Fatigue', v: `${atl} ATL` })
    if (typeof hrvDelta === 'number') chips.push({ l: 'HRV', v: `${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}% vs. Baseline` })
    if (sleepScore != null) chips.push({ l: de ? 'Schlaf' : 'Sleep', v: `${Math.round(sleepScore)}/100` })
    if (typeof daysToGoal === 'number' && goalName) chips.push({ l: de ? 'Event' : 'Event', v: `${daysToGoal} ${de ? 'Tage bis' : 'days to'} ${goalName.length > 18 ? goalName.slice(0, 17) + '…' : goalName}` })
    return chips
  }, [tsb, atl, hrvDelta, sleepScore, daysToGoal, goalName, de])
  const frameworks = (brief?.frameworks_cited ?? []).slice(0, 3)

  // Week streak — forgiving, plan-aware (server: trained + planned-rest days
  // extend, sick/injured/break days pause, only skipped sessions break).
  // Day dots fall back to client activity-presence while the query loads.
  const trainedSet = useMemo(() => new Set((acts?.activities ?? []).map((a) => localDayKey(a.started_at ?? a.date ?? ''))), [acts])
  const weekDays = useMemo(() => {
    const monday = startOfWeek(today, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i)
      const key = format(d, 'yyyy-MM-dd')
      const serverState = streakData?.week?.find((w) => w.date === key)?.state
      const isToday = key === todayKey
      const isPast = d < today && !isToday
      const done = serverState === 'trained' || (serverState == null && trainedSet.has(key))
      const state: 'done' | 'today' | 'rest' | 'paused' | 'missed' | 'upcoming' =
        done ? 'done'
        : isToday ? 'today'
        : serverState === 'rest' ? 'rest'
        : serverState === 'paused' ? 'paused'
        : serverState === 'missed' || serverState === 'unplanned' ? (isPast ? 'missed' : 'upcoming')
        : isPast ? 'missed' : 'upcoming'
      return { key, label: format(d, 'EEEEE'), state }
    })
  }, [today, todayKey, trainedSet, streakData])
  // P0-2: NO client-side streak fallback — the old consecutive-days algorithm
  // contradicted the forgiving server streak while the query loaded. Until the
  // server number arrives we render nothing rather than a different number.
  const streak = streakData?.streak ?? null
  const streakPaused = streakData?.paused ?? false
  const athleteState: AthleteState = streakData?.status?.state ?? 'healthy'

  // Refreshingly-funny, always-true day wrap-up — synthesizes today's move
  // (already-trained / rest / prescribed session) against the real readiness
  // tier + HRV/sleep signals. Every line cites a REAL signal and today's real
  // move; nothing fabricated. Variants are picked deterministically by day of
  // month (no Math.random) so the line varies day-to-day but is stable today.
  const trainedToday = !!review || hasSessionToday
  const hrvDown = typeof hrvDelta === 'number' && hrvDelta <= -3
  const hrvUp = typeof hrvDelta === 'number' && hrvDelta >= 3
  const sleptWell = typeof sleepScore === 'number' && sleepScore >= 80
  const sleptShort = typeof sleepScore === 'number' && sleepScore < 65
  const green = tier === 'peak' || tier === 'ready'
  const roughRecovery = hrvDown || tier === 'rest' || sleptShort
  const wTitle = workout?.title
  const hrvPct = typeof hrvDelta === 'number' ? `${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}%` : null
  // Sleep buckets for sleep-specific copy: >=85 earns a genuine compliment
  // naming the number, 65–84 is neutral-positive, <65 (sleptShort above) gets
  // a concrete recommendation + expectation-setting. sN is the real score.
  const sN = sleepScore != null ? Math.round(sleepScore) : null
  const sleptGreat = sN != null && sN >= 85
  const sleptOk = sN != null && sN >= 65 && sN < 85

  // Strongest TRUE positive signal, phrased as a lowercase mid-sentence clause.
  const goodReason = hrvUp && hrvPct ? (de ? `die HRV brummt (${hrvPct})` : `HRV's humming (${hrvPct})`)
    : sleptWell ? (de ? `der Schlaf lag bei ${Math.round(sleepScore!)}` : `sleep landed at ${Math.round(sleepScore!)}`)
    : green ? (de ? 'die Bereitschaft steht auf Grün' : 'readiness is green')
    : (de ? 'die Werte sind ruhig' : 'the signals are calm')
  // Strongest TRUE cautionary signal, same lowercase clause form.
  const badReason = hrvDown && hrvPct ? (de ? `die HRV lahmt (${hrvPct})` : `HRV's dragging its feet (${hrvPct})`)
    : sleptShort ? (de ? `der Schlaf war dünn (${Math.round(sleepScore!)})` : `sleep came up light (${Math.round(sleepScore!)})`)
    : (de ? 'du bist sichtlich platt' : "you're clearly cooked")
  const badReasonCap = badReason.charAt(0).toUpperCase() + badReason.slice(1)
  const namePart = athleteName ? `, ${athleteName}` : ''
  const pick = (arr: string[]) => arr[today.getDate() % arr.length]

  const heroLine = (() => {
    if (trainedToday) {
      if (roughRecovery) return pick(de ? [
        `Solide Einheit, aber ${badReason} — heute Abend zählt Schlaf, nicht Strava.`,
        `Arbeit erledigt; jetzt ${badReason}, also sei nett zu dir und bleib horizontal.`,
        `Training drin, aber ${badReason}. Erholungsmodus: voll aktiviert.`,
        `Arbeit im Kasten, aber ${badReason} — die klügsten Watt heute Abend sind null.`,
        `Für heute fertig; ${badReason} — also Abendessen, Licht runter, Schluss.`,
        `Einheit gespeichert, aber ${badReason} — heute Abend ist aggressives Ausruhen dran.`,
      ] : [
        `Solid work logged, but ${badReason} — tonight's about sleep, not Strava.`,
        `You did the work; now ${badReason}, so be kind to yourself and horizontal.`,
        `Session's in, but ${badReason}. Recovery mode: fully engaged.`,
        `Work's banked, but ${badReason} — the smartest watts tonight are zero.`,
        `Done for today; ${badReason} — so it's dinner, dim lights, done.`,
        `Session logged. Since ${badReason}, tonight's job is aggressive resting.`,
      ])
      return pick(de ? [
        `Einheit im Kasten und ${goodReason} — jetzt darfst du grandios faul sein.`,
        `Training sitzt, ${goodReason}. Erlaubnis zum Nichtstun: erteilt.`,
        `Abgeliefert, ${goodReason} — Beine hoch und ruhig ein bisschen stolz sein.`,
        `Trainiert, und ${goodReason} — so einen Tag unterschreibst du zweimal.`,
        `Arbeit erledigt und ${goodReason}. Sofa verdient, Form folgt.`,
        `Haken dran, ${goodReason} — die Anpassung übernimmt die Nachtschicht.`,
      ] : [
        `You banked the work and ${goodReason} — go be gloriously lazy.`,
        `Session's done and ${goodReason}. Permission to do absolutely nothing: granted.`,
        `Work's in the bank, ${goodReason} — put your legs up and gloat a little.`,
        `Trained, and ${goodReason} — that's a day you'd sign for twice.`,
        `The work's done and ${goodReason}. Sofa earned, form pending.`,
        `Boxes ticked, ${goodReason} — let the adaptation work the night shift.`,
      ])
    }
    if (isRestDay) {
      // Sleep-specific rest-day lines: a great night doubles the recovery win,
      // a thin night gets a concrete tonight-plan while the rest day absorbs it.
      if (sleptGreat) return pick(de ? [
        `Schlaf ${sN} am Ruhetag — doppelte Erholung eingesackt. Wunderschön.`,
        `Ruhetag plus Schlaf bei ${sN}: die Anpassung macht Überstunden, du bist der Chef.`,
        `Schlaf ${sN} an dem Tag, an dem der Plan nichts wollte — Erholung mit Zinseszins.`,
        `Score ${sN} im Schlaf und null Trainingsstress — heute baut sich von selbst.`,
        `Schlaf ${sN} + Ruhetag = das leise Duo, das Saisons gewinnt. Bleib liegen.`,
        `Ruhetag, und du hast ${sN} geschlafen. Nichts zu reparieren — heute Nacht wiederholen.`,
      ] : [
        `Sleep ${sN} on a rest day — that's how you double-dip recovery. Beautiful.`,
        `Rest day plus sleep at ${sN}: adaptation is working overtime and you're the boss.`,
        `Sleep ${sN} on the one day the plan asked for nothing — recovery compounding nicely.`,
        `A ${sN} sleep score and zero training stress — today literally builds itself.`,
        `Sleep ${sN} + rest day = the quiet combo that wins seasons. Keep lounging.`,
        `Rest day, and you slept a ${sN}. Nothing to fix here — do it again tonight.`,
      ])
      if (sleptShort) return pick(de ? [
        `Ruhetag, und der Schlaf lag bei ${sN} — gutes Timing. Heute Abend: früher runterfahren, Bildschirme aus.`,
        `Schlaf bei ${sN}; gut, dass heute nichts ansteht. Koffein früh stoppen, echte Nacht nachlegen.`,
        `Schlaf ${sN} am Ruhetag — der Plan rettet dich gerade. Zahl's mit einer frühen Nacht zurück.`,
        `Schlaf ${sN} — dünn. Der Ruhetag fängt das auf; heute Abend deutlich früher abschalten.`,
        `Nur ${sN} beim Schlaf; der Ruhetag deckt dich. Kein Koffein nach dem Mittag wirkt Wunder.`,
        `Schlaf ${sN}. Kein Training, keine Schuld — mach heute Nacht die Korrektur, nicht die Fortsetzung.`,
      ] : [
        `Rest day, and sleep was ${sN} — perfect timing. Tonight: earlier wind-down, screens off.`,
        `Sleep came in at ${sN}; good thing today asks nothing. Cut caffeine early, bank a real night.`,
        `A ${sN} sleep on a rest day is the plan saving you. Repay it with an early night.`,
        `Sleep ${sN} — thin. The rest day absorbs it; tonight, start winding down well before you're tired.`,
        `Only ${sN} on sleep; the rest day has you covered. No caffeine after lunch works wonders.`,
        `Sleep ${sN}. Zero guilt, zero training — just make tonight the fix, not the sequel.`,
      ])
      return pick(de ? [
        `Ruhetag${namePart}. Deine Beine schicken gerade ein Dankeschön — tu nichts, aber brillant.`,
        `Keine Einheit heute${namePart} — Erholung ist das Training, und du glänzt im Liegen.`,
        `Ruhetag verdient${namePart}. Schuldgefühle nicht inklusive, Fortschritt schon.`,
        `Ruhetag${namePart} — der Plan sagt damit: die Arbeit wirkt.`,
        `Heutige Aufgabe: nichts. Wer Ruhetage kann, peakt mit Absicht.`,
        `Ruhetag. Fitness entsteht in den Lücken — du stehst gerade in einer.`,
      ] : [
        `Rest day${namePart}. Your legs just sent a thank-you note — do nothing, brilliantly.`,
        `No session today${namePart} — recovery is the workout, and you're crushing it lying down.`,
        `Rest day earned${namePart}. Guilt not included; gains are.`,
        `Rest day${namePart} — the plan's way of saying the work is working.`,
        `Today's assignment: nothing. Athletes who nail rest days peak on purpose.`,
        `Rest day. Fitness is built in the gaps — you're standing in one.`,
      ])
    }
    if (wTitle) {
      // Sleep outranks the readiness tier: a short night caps today at
      // maintenance no matter how green the composite looks. At most TWO
      // signals per line — sleep plus (optionally) the HRV delta.
      if (sleptShort) {
        const up = hrvUp && hrvPct != null
        return pick(de ? [
          up ? `Schlaf ${sN}, aber HRV ${hrvPct} — der Motor will. ${wTitle} ehrlich fahren, heute früher runterfahren.`
             : `Schlaf ${sN} — heute zählt als Erhalt, nicht als Aufbau. ${wTitle} ehrlich halten, früher runterfahren.`,
          `Eine ${sN}er-Nacht deckelt den Tag: ${wTitle} nach Plan, keine Bonus-Watt, Koffein ab Mittag streichen.`,
          `Schlaf ${sN}. Fahr ${wTitle}, aber benote dich auf Zurückhaltung — die echte Einheit ist heute Nacht.`,
          up ? `Dünner Schlaf (${sN}), willige HRV (${hrvPct}) — ${wTitle} zählt heute als Erhalt, auch das ein Sieg.`
             : `Kurze Nacht (${sN}) — ${wTitle} geht trotzdem, als Erhalt. Heute Abend: Bildschirme aus, früher Licht aus.`,
          `Schlaf ${sN} heißt: heute erhalten, morgen aufbauen. ${wTitle} locker-ehrlich, 30 Min früher runterfahren.`,
          `Schlaf bei ${sN} — ${wTitle} im Plauderton fahren; das Comeback kaufst du mit einer frühen Nacht.`,
        ] : [
          up ? `Sleep ${sN}, but HRV ${hrvPct} — the engine's willing. Ride ${wTitle} honest, wind down earlier tonight.`
             : `Sleep ${sN} — today counts as maintenance, not building. Keep ${wTitle} honest, wind down earlier.`,
          `A ${sN} night caps the ceiling: ${wTitle} to plan, no bonus watts, caffeine off by mid-afternoon.`,
          `Sleep ${sN}. Do ${wTitle}, but grade yourself on restraint — the real session tonight is in bed.`,
          up ? `Thin sleep (${sN}), willing HRV (${hrvPct}) — ${wTitle} counts as maintenance today. Still a win.`
             : `Short night (${sN}) — ${wTitle} still works as maintenance. Tonight: screens down, lights out early.`,
          `Sleep ${sN} means today maintains, tomorrow builds. ${wTitle} easy-honest, wind-down 30 min earlier.`,
          `Sleep hit ${sN} — keep ${wTitle} conversational; the comeback gets bought with an early night.`,
        ])
      }
      if (tier === 'rest' || hrvDown) {
        // Great sleep + dragging HRV: recovery is half-done — say both, crisply.
        if (sleptGreat && hrvDown && hrvPct != null) return pick(de ? [
          `Schlaf ${sN} hat geliefert, die HRV (${hrvPct}) zieht noch nach — ${wTitle} kontrolliert fahren.`,
          `Starke Nacht (${sN}), maulige HRV (${hrvPct}) — nimm die Mitte: ${wTitle} nach Plan, keine Show-Sprints.`,
          `Schlaf ${sN} vs. HRV ${hrvPct}: Erholung halb fertig. ${wTitle} ruhig — der Rest kommt heute Nacht.`,
          `${sN} geschlafen; die HRV (${hrvPct}) sieht's anders. ${wTitle} locker starten, nur pushen, wenn die Beine ja sagen.`,
          `Schlaf ${sN} kauft dir die Einheit; HRV ${hrvPct} setzt das Tempolimit. ${wTitle}, kontrolliert.`,
          `Schlaf ${sN}, HRV bei ${hrvPct} — der Körper sortiert noch Papierkram. ${wTitle} sauber halten.`,
        ] : [
          `Sleep ${sN} did its job, but HRV ${hrvPct} hasn't caught up — ride ${wTitle} controlled and let it.`,
          `Great night (${sN}), grumpy HRV (${hrvPct}) — take the middle: ${wTitle} to plan, no sprints for glory.`,
          `Sleep ${sN} vs HRV ${hrvPct}: recovery's half-done. ${wTitle} steady — the other half comes tonight.`,
          `You slept a ${sN}; HRV ${hrvPct} disagrees. Start ${wTitle} easy and only push if the legs vote yes.`,
          `Sleep ${sN} bought you the session; HRV ${hrvPct} sets the speed limit. ${wTitle}, controlled.`,
          `A ${sN} sleep with HRV at ${hrvPct} — the body's still filing paperwork. Keep ${wTitle} tidy.`,
        ])
        return pick(de ? [
          `Achtung: ${badReason}, halt ${wTitle} also locker — Heldenmodus kann warten.`,
          `${badReasonCap} heute — nimm ${wTitle} als lockere Runde, nicht als Duell.`,
          `Der Körper zeigt Gelb (${badReason}); ${wTitle} locker fahren oder gegen Erholung tauschen.`,
          `Kein rotes Licht, aber ${badReason} — ${wTitle} im Gesprächstempo hält die Woche am Leben.`,
          `${badReasonCap} — also ${wTitle} wie ein Warm-up fahren. Fitness ist geduldig; Ermüdung merkt sich alles.`,
          `Vorsichtstag: ${badReason}. ${wTitle} locker heute schlägt die Zwangspause nächste Woche.`,
        ] : [
          `Heads-up: ${badReason}, so keep ${wTitle} chill — hero mode can wait.`,
          `${badReasonCap} today — treat ${wTitle} as a gentle spin, not a duel.`,
          `Body's waving a yellow flag (${badReason}); do ${wTitle} easy or swap for rest.`,
          `Not a red light, but ${badReason} — ${wTitle} at conversation pace keeps the week alive.`,
          `Since ${badReason}, ride ${wTitle} like a warm-up. Fitness is patient; fatigue keeps receipts.`,
          `Careful day: ${badReason}. ${wTitle} easy now beats a forced week off later.`,
        ])
      }
      if (sleptGreat) {
        const up = hrvUp && hrvPct != null
        return pick(de ? [
          `Schlaf ${sN} — genau da passiert Anpassung. Löse es bei ${wTitle} ein.`,
          up ? `Schlaf ${sN}, HRV ${hrvPct} — grüner wird's nicht. ${wTitle} gehört heute dir.`
             : `Schlaf ${sN} — der Körper hat die Nachtschicht geliefert. ${wTitle} gehört heute dir.`,
          `Eine ${sN}er-Nacht ist Geld auf dem Konto — gib es für ${wTitle} aus, nicht fürs Scrollen.`,
          `Schlaf ${sN}: Erholung voll bezahlt. ${wTitle} ist der Tag, um Zinsen einzusammeln.`,
          up ? `${sN} geschlafen, HRV bei ${hrvPct} — der Motor ist warm. Richte ihn auf ${wTitle}.`
             : `${sN} geschlafen — der Motor ist ausgeruht und warm. Richte ihn auf ${wTitle}.`,
          `Schlaf-Score ${sN}. Aus solchen Nächten werden Athleten gebaut — nutz das für ${wTitle}.`,
        ] : [
          `Sleep ${sN} — that's where adaptation happens. Cash it in on ${wTitle}.`,
          up ? `Sleep ${sN}, HRV ${hrvPct} — it doesn't get greener. ${wTitle} is yours today.`
             : `Sleep ${sN} — the body did its overnight shift. ${wTitle} is yours today.`,
          `A ${sN} night is money in the bank — spend it on ${wTitle}, not on scrolling.`,
          `Sleep ${sN}: recovery paid in full. ${wTitle} is the day to collect interest.`,
          up ? `Slept ${sN} with HRV at ${hrvPct} — the engine is warm. Point it at ${wTitle}.`
             : `Slept a ${sN} — the engine is rested and warm. Point it at ${wTitle}.`,
          `Sleep score ${sN}. Nights like that build athletes — go make ${wTitle} count.`,
        ])
      }
      if (green) return pick(de ? [
        `Du bist bereit und ${wTitle} ist heute die Einheit zum Abliefern — ${goodReason}.`,
        `Grünes Licht: ${goodReason}, also wartet ${wTitle} nur darauf, zerlegt zu werden.`,
        `Beine geladen und ${goodReason} — mach ${wTitle} zu deinem Spielplatz.`,
        `Alles zeigt nach oben — ${goodReason}. ${wTitle} weiß nicht, was gleich passiert.`,
        `Heute ist der Tag, für den der Plan geplant hat: ${goodReason}. ${wTitle} abliefern.`,
        `Komplett grünes Brett — ${goodReason}. ${wTitle} verdient deine guten Beine.`,
      ] : [
        `You're primed and today's ${wTitle} is the one to nail — ${goodReason}.`,
        `Green light: ${goodReason}, so ${wTitle} is begging to be crushed.`,
        `Legs are loaded and ${goodReason} — go make ${wTitle} regret nothing.`,
        `Everything's pointing up — ${goodReason}. ${wTitle} won't know what hit it.`,
        `Today's the day the plan planned for: ${goodReason}. Go execute ${wTitle}.`,
        `Full green board — ${goodReason}. ${wTitle} deserves your good legs.`,
      ])
      // 65–84: neutral-positive, still naming the real number.
      if (sleptOk) return pick(de ? [
        `Schlaf ${sN} — solide, nicht spektakulär. ${wTitle} nach Plan ist heute genau richtig.`,
        `Eine ${sN}er-Nacht: genug Sprit für ${wTitle}, nicht genug für Improvisation. Fahr den Plan.`,
        `Schlaf ${sN} hält alles im Spiel — ${wTitle} wie geplant, dann schauen, wie es läuft.`,
        `Ordentliche Nacht (${sN}). Mehr braucht ${wTitle} nicht — abliefern und erholen.`,
        `Schlaf ${sN}: die ruhige Mitte. ${wTitle} im Soll-Tempo erledigt heute den Job.`,
        `Solide ${sN} beim Schlaf — passt zum Tag: ${wTitle}, ruhig, fertig, früh ins Bett.`,
      ] : [
        `Sleep ${sN} — solid, not spectacular. ${wTitle} at plan is exactly right today.`,
        `A ${sN} night: enough fuel for ${wTitle}, not enough for improvisation. Ride the plan.`,
        `Sleep ${sN} keeps everything on the table — ${wTitle} as written, then see how it flows.`,
        `Decent night (${sN}). ${wTitle} won't need more than that — execute and recover.`,
        `Sleep ${sN}: the quiet middle. ${wTitle} at prescribed effort does its job today.`,
        `A workmanlike ${sN} on sleep — matches today: ${wTitle}, steady, done, early night.`,
      ])
      return pick(de ? [
        `Mittlere Signale heute — geh ${wTitle} kontrolliert an und schau, wie's läuft.`,
        `Nicht Topform, nicht kaputt — ${wTitle} vernünftig fahren und die Beine entscheiden lassen.`,
        `Gelbliche Bereitschaft: ${wTitle} ist ein Go, nur nicht das Internet gewinnen wollen.`,
        `Die Signale zucken mit den Schultern — ${wTitle} nach Plan, die ersten 20 Minuten entscheiden.`,
        `Keine roten Flaggen, kein Feuerwerk: ${wTitle} wie verschrieben ist heute die kluge Wette.`,
        `Die Daten sind unentschieden — fahr ${wTitle} nach Gefühl: locker starten, Steigerung verdienen.`,
      ] : [
        `Middling signals today — take ${wTitle} at a controlled effort and see how it flows.`,
        `Not peak, not wrecked — run ${wTitle} sensibly and let the legs vote.`,
        `Amber-ish readiness: ${wTitle} is a go, just don't try to win the internet.`,
        `Signals are shrugging — ${wTitle} at plan, and let the first 20 minutes decide.`,
        `No red flags, no fireworks: ${wTitle} as prescribed is the smart money today.`,
        `The data's undecided, so ride ${wTitle} by feel — start easy, earn the upgrades.`,
      ])
    }
    return pick(de ? [
      'Die Zahlen trudeln noch ein — gleich hast du deinen Read.',
      'Signale werden synchronisiert… dein Spielplan ist in Sekunden da.',
    ] : [
      "Numbers are still landing — hang tight and I'll have your read in a moment.",
      'Syncing your signals… your game plan is seconds away.',
    ])
  })()
  // Human wrap-up line — prefer the coach's REAL LLM verdict (richer, personal,
  // already synthesized from today's evidence + any post-ride review); fall back
  // to the deterministic witty line when the brief carries no verdict yet.
  const verdictLine = brief?.verdict?.trim()
  const wrapLine = verdictLine && verdictLine.length > 0 ? verdictLine : heroLine

  // DAY-STATE-AWARE decision pill — the one-glance "today's move". It must never
  // contradict the wrap-up line (or tell an athlete to "train" after they've
  // already trained). Priority: already trained today → session logged (+ a
  // recover nuance when depleted); rest day prescribed → rest day; otherwise the
  // readiness tier decides go-hard / go-controlled / recover.
  const { pillWord, pillColor } = (() => {
    // Self-reported status outranks every readiness signal — the hero must
    // never say "primed to train" to an athlete who marked themselves sick.
    if (athleteState === 'sick') return { pillWord: de ? 'Krank gemeldet · nur Erholung' : 'Marked sick · recovery only', pillColor: 'var(--color-amber)' }
    if (athleteState === 'injured') return { pillWord: de ? 'Verletzt gemeldet · heilen' : 'Marked injured · heal up', pillColor: 'var(--color-amber)' }
    if (athleteState === 'break') return { pillWord: de ? 'Pause · locker bleiben' : 'On a break · keep it light', pillColor: 'var(--color-recovery)' }
    if (trainedToday) {
      return roughRecovery
        ? { pillWord: de ? 'Einheit erledigt · erholen' : 'Session logged · recover', pillColor: 'var(--color-amber)' }
        : { pillWord: de ? 'Einheit erledigt' : 'Session logged', pillColor: 'var(--color-recovery)' }
    }
    if (isRestDay) return { pillWord: de ? 'Ruhetag' : 'Rest day', pillColor: 'var(--color-recovery)' }
    if (tier === 'peak' || tier === 'ready') return { pillWord: de ? 'Bereit zu trainieren' : 'Primed to train', pillColor: rColor }
    if (tier === 'caution') return { pillWord: de ? 'Kontrolliert trainieren' : 'Train controlled', pillColor: rColor }
    if (tier === 'rest') return { pillWord: de ? 'Erholen · locker' : 'Recover · go easy', pillColor: rColor }
    return { pillWord: de ? 'Lade…' : 'Loading…', pillColor: rColor }
  })()

  // ── MOMENT-ADAPTIVE HERO ───────────────────────────────────────────────────
  // The hero surfaces DIFFERENT, moment-relevant signals. Detected from real
  // data: whether a session is already logged today, and the wall-clock hour.
  //   • post    → trained today: session wrap-up (what you did + recover + next)
  //   • evening → not trained, ≥18:00: wind-down (recovery + tomorrow + sleep)
  //   • morning → not trained, else: overnight-recovery story + what's on deck
  const hour = today.getHours()
  const moment: 'post' | 'evening' | 'morning' = trainedToday ? 'post' : hour >= 18 ? 'evening' : 'morning'

  const sleepHours = latest?.sleep_detail?.total_s != null ? latest.sleep_detail.total_s / 3600 : null
  // Session IF — prefer the review's measured intensity factor, else derive it
  // from today's real TSS + moving time (same IF math as the prescribed card).
  const sessionIF = review?.intensity_factor?.actual
    ?? (exMin > 0 && moveLoad > 0 ? Math.sqrt(moveLoad / ((exMin / 60) * 100)) : null)
  // Compact letter grade only (A+…F) — the tile is narrow, so no descriptor.
  const gradeInfo = (g: NonNullable<typeof review>['grade']) => {
    switch (g) {
      case 'perfect': return { t: 'A+', c: 'var(--color-recovery)' }
      case 'strong': return { t: 'A', c: 'var(--color-recovery)' }
      case 'okay': return { t: 'B', c: 'var(--color-stand)' }
      case 'overcooked': return { t: 'C', c: 'var(--color-amber)' }
      case 'undercooked': return { t: 'D', c: 'var(--color-amber)' }
      default: return { t: '—', c: 'var(--color-ink)' }
    }
  }
  const tomorrow = brief?.tomorrow_plan ?? null
  const chipLabel = (c: string | undefined): string | undefined => {
    if (!c) return undefined
    const en: Record<string, string> = { recovery: 'Recovery', endurance: 'Endurance', tempo: 'Tempo', threshold: 'Threshold', vo2: 'VO₂', race: 'Race' }
    const dede: Record<string, string> = { recovery: 'Erholung', endurance: 'Grundlage', tempo: 'Tempo', threshold: 'Schwelle', vo2: 'VO₂', race: 'Rennen' }
    return (de ? dede : en)[c] ?? c
  }

  interface Tile { label: string; value: string; unit?: string; sub?: string; subColor?: string; color?: string }
  const momentLabel = moment === 'post'
    ? (de ? 'Einheit abgeschlossen' : 'Session wrap-up')
    : moment === 'evening'
      ? (de ? 'Ausklang' : 'Wind-down')
      : (de ? 'Erholung über Nacht' : 'Overnight recovery')

  const hrvSub = typeof hrvDelta === 'number'
    ? { text: `${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}%`, color: hrvDelta >= 0 ? 'var(--color-recovery)' : 'var(--color-amber)' }
    : null

  const momentTiles: Tile[] = (() => {
    if (moment === 'post') {
      const g = review ? gradeInfo(review.grade) : null
      return [
        { label: de ? 'Dauer' : 'Duration', value: exMin > 0 ? `${exMin}` : '—', unit: exMin > 0 ? 'min' : '' },
        { label: 'TSS', value: (hasTss || moveLoad > 0) ? `${moveLoad}` : '—', sub: (hasTss || moveLoad > 0) ? `${loadPct}% ${de ? 'Ziel' : 'goal'}` : undefined },
        { label: de ? 'Intensität' : 'Intensity', value: sessionIF != null ? sessionIF.toFixed(2) : (wIntensity ? wIntensity.z : '—'), unit: sessionIF != null ? 'IF' : '', sub: wIntensity ? wIntensity.t : undefined },
        { label: de ? 'Note' : 'Grade', value: g ? g.t : '—', color: g ? g.c : undefined },
      ]
    }
    if (moment === 'evening') {
      const sleepTarget = roughRecovery ? '8.5' : '8'
      return [
        { label: de ? 'Erholung' : 'Recovery', value: bodyBattery != null ? `${Math.round(bodyBattery)}` : '—', unit: bodyBattery != null ? '%' : '', color: 'var(--color-recovery)' },
        { label: de ? 'Morgen' : 'Tomorrow', value: tomorrow?.predicted_tss != null ? `${Math.round(tomorrow.predicted_tss)}` : (isRestDay ? (de ? 'Ruhe' : 'Rest') : '—'), unit: tomorrow?.predicted_tss != null ? 'TSS' : '', sub: chipLabel(tomorrow?.intensity_chip) },
        { label: de ? 'Schlafziel' : 'Sleep target', value: sleepTarget, unit: 'h', color: 'var(--color-stand)' },
      ]
    }
    // morning
    const tiles: Tile[] = [
      { label: 'HRV', value: hrvNow != null ? `${Math.round(hrvNow)}` : '—', unit: hrvNow != null ? 'ms' : '', sub: hrvSub?.text, subColor: hrvSub?.color, color: 'var(--color-recovery)' },
      { label: de ? 'Schlaf' : 'Sleep', value: sleepHours != null ? sleepHours.toFixed(1) : (sleepScore != null ? `${Math.round(sleepScore)}` : '—'), unit: sleepHours != null ? 'h' : '', sub: sleepScore != null ? `Score ${Math.round(sleepScore)}` : undefined, color: 'var(--color-stand)' },
      { label: de ? 'Ruhepuls' : 'Resting HR', value: restingHr != null ? `${Math.round(restingHr)}` : '—', unit: restingHr != null ? 'bpm' : '', color: 'var(--color-move)' },
    ]
    if (!isRestDay && workout) {
      tiles.push({ label: de ? 'Heute' : 'On deck', value: workout.predicted_tss != null ? `${Math.round(workout.predicted_tss)}` : '—', unit: workout.predicted_tss != null ? 'TSS' : '', sub: wIntensity ? wIntensity.z : undefined, color: 'var(--color-accent)' })
    }
    return tiles
  })()

  // "One thing that matters now" — a single moment-specific, real-signal line.
  const focusLine: string | null = (() => {
    if (moment === 'post') {
      const nudge = review?.next_session_nudge?.trim() || brief?.regeneration?.bullets?.[0]?.trim()
      if (nudge) return nudge
      return de ? 'Priorität jetzt: auffüllen, dehnen, früh ins Bett.' : 'Priority now: refuel, stretch, early night.'
    }
    if (moment === 'evening') {
      if (tomorrow?.description?.trim()) return `${de ? 'Morgen' : 'Tomorrow'}: ${tomorrow.description.trim()}`
      if (!isRestDay && wTitle) return `${de ? 'Morgen wartet' : 'Up next'}: ${wTitle}`
      return de ? 'Heute Abend zählt Schlaf — er baut die Form von morgen.' : "Tonight, sleep is the work — it builds tomorrow's form."
    }
    // morning
    if (!isRestDay && wTitle) return `${de ? 'Fokus heute' : "Today's focus"}: ${wTitle}`
    return de ? 'Fokus heute: Erholung ist die Aufgabe.' : "Today's focus: recovery is the assignment."
  })()

  // ── "Morning read" — a compact deterministic paragraph under the hero line.
  // Synthesizes ONLY real signals: last night's sleep (hours + score), the HRV
  // delta vs baseline, whether yesterday was trained or rested, and today's
  // prescribed session. Every clause is conditionally built — a missing signal
  // simply drops its sentence, nothing is ever invented — and each language
  // gets its own word order (no templated Denglish). Variant phrasing is picked
  // deterministically with the same day-of-month `pick` as the hero line.
  const yKey = localDayKey(subDays(today, 1))
  const yesterdayTrained = trainedSet.has(yKey)
  const yesterdayTss = Math.round(
    (acts?.activities ?? [])
      .filter((a) => localDayKey(a.started_at ?? a.date ?? '') === yKey)
      .reduce((s, a) => s + (a.tss ?? 0), 0),
  )
  const morningRead: string | null = (() => {
    if (moment !== 'morning') return null
    if (sN == null && typeof hrvDelta !== 'number') return null

    const hStr = sleepHours != null ? (de ? `${sleepHours.toFixed(1).replace('.', ',')} h` : `${sleepHours.toFixed(1)}h`) : null
    const yCtx = yesterdayTrained
      ? (yesterdayTss > 0
          ? (de ? ` nach ${yesterdayTss} TSS gestern` : ` after yesterday's ${yesterdayTss} TSS`)
          : (de ? ' nach der gestrigen Einheit' : " after yesterday's session"))
      : (de ? ' nach dem gestrigen Ruhetag' : " after yesterday's rest day")

    // Sentence 1 — sleep in context of yesterday (falls back to yesterday-only
    // when no sleep data landed).
    const s1 = (() => {
      if (sN == null) {
        return yesterdayTrained
          ? (yesterdayTss > 0
              ? (de ? `${yesterdayTss} TSS von gestern stecken in den Beinen.` : `${yesterdayTss} TSS from yesterday are in the legs.`)
              : (de ? 'Die gestrige Einheit steckt noch in den Beinen.' : "Yesterday's session is still in the legs."))
          : (de ? 'Gestern war Ruhetag — die Beine sollten ruhig sein.' : 'Yesterday was a rest day — the legs should be quiet.')
      }
      const base = hStr
        ? (de ? `${hStr} Schlaf (Score ${sN})` : `Slept ${hStr} (${sN})`)
        : (de ? `Schlaf-Score ${sN}` : `Sleep score ${sN}`)
      const q = sleptGreat
        ? pick(de ? ['eine richtige Nacht', 'Erholung sauber verbucht', 'so sieht Aufbau aus'] : ['a proper night', 'recovery banked in full', 'the kind training pays for'])
        : sleptShort
          ? pick(de ? ['etwas dünn', 'eher kurz', 'weniger, als der Plan mag'] : ['a bit thin', 'on the short side', 'less than the plan would like'])
          : pick(de ? ['ordentlich, brauchbar', 'solide genug', 'kein Drama'] : ['decent and workable', 'solid enough', 'no drama there'])
      return de ? `${base}${yCtx} — ${q}.` : `${base} — ${q}${yCtx}.`
    })()

    // Sentence 2 — the HRV delta vs baseline, only when real.
    const s2 = typeof hrvDelta === 'number' && hrvPct != null
      ? (hrvUp
          ? pick(de
              ? [`Die HRV ist bei ${hrvPct} — der Motor will.`, `HRV ${hrvPct} — der Motor sagt ja.`, `Die HRV (${hrvPct}) hält zu dir.`]
              : [`HRV is ${hrvPct}, so the engine is willing.`, `HRV sits at ${hrvPct} — the engine says yes.`, `HRV ${hrvPct} has your back.`])
          : hrvDown
            ? pick(de
                ? [`Die HRV liegt bei ${hrvPct} — das Ego bleibt heute in der Garage.`, `HRV ${hrvPct} bittet um Zurückhaltung.`, `HRV ${hrvPct} — der Motor will es ruhig.`]
                : [`HRV is ${hrvPct}, so keep the ego parked.`, `HRV at ${hrvPct} asks for restraint.`, `HRV ${hrvPct} — the engine wants an easy one.`])
            : pick(de
                ? [`Die HRV ist stabil (${hrvPct}).`, `Die HRV hält die Linie (${hrvPct}).`]
                : [`HRV is steady (${hrvPct}).`, `HRV is holding its line (${hrvPct}).`]))
      : null

    // Sentence 3 — today's move, keyed to the same state as the hero line.
    const s3 = (() => {
      if (isRestDay) return pick(de
        ? ['Ruhetag wie geplant — lass ihn arbeiten.', 'Nichts im Plan; die Erholung ist die Einheit.', 'Heute wird geruht — nimm den Sieg mit.']
        : ['Rest day as planned — let it do its job.', 'Nothing on the plan; recovery is the session.', 'Today rests — take the win.'])
      if (!wTitle) return null
      if (sleptShort || hrvDown) return pick(de
        ? [`${wTitle} steht — locker starten, die Beine haben das letzte Wort.`, `${wTitle} bleibt im Plan; wenn die Beine meckern, kleiner dosieren.`, `${wTitle} wie geplant, aber ehrlich bleiben — kürzer ist heute auch eine Antwort.`]
        : [`${wTitle} is on — start easy and let the legs cast the deciding vote.`, `${wTitle} stays on the plan; scale it down if the legs argue.`, `${wTitle} as planned, but keep it honest — shorter is a fine answer today.`])
      if (green || sleptGreat) return pick(de
        ? [`${wTitle} steht an — ein guter Tag, es richtig zu machen.`, `Grünes Licht für ${wTitle}; fahr es mit Absicht.`, `${wTitle} wie geplant — die Lage spricht für vollen Wert.`]
        : [`${wTitle} is on deck — a good day to do it properly.`, `Green light for ${wTitle}; ride it like you mean it.`, `${wTitle} as planned — conditions point to full value.`])
      return pick(de
        ? [`${wTitle} wie geplant — ruhig fahren, keine Heldentaten nötig.`, `${wTitle} ist der Job heute; nach Plan fahren, danach neu bewerten.`, `${wTitle} im Soll-Bereich macht genau, was es soll.`]
        : [`${wTitle} as planned — steady effort, no heroics needed.`, `${wTitle} is today's job; ride to plan, reassess after.`, `${wTitle} at prescribed effort does exactly what it should.`])
    })()

    return [s1, s2, s3].filter(Boolean).join(' ')
  })()

  // Momentum cues — a training streak + a real 7-day fitness (CTL) trend. Both
  // are honest, real-data motivators; rendered as small chips, never hype.
  const showStreak = streak != null && streak > 0
  const showFitnessTrend = dCtl != null

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Hero — "here's exactly where you stand right now" snapshot.
          Greeting + date, headline readiness state + score ring, a personalized
          one-liner synthesized from today's move × readiness, and 3 key stats.
          Gradient + glow are keyed to the readiness color. */}
      <div
        className="rounded-[28px] p-5 flex flex-col gap-5"
        style={{
          background: `linear-gradient(150deg, color-mix(in srgb, ${rColor} 15%, var(--color-paper-2)) 0%, var(--color-paper-2) 62%)`,
          border: `1px solid color-mix(in srgb, ${rColor} 40%, var(--color-rule))`,
          boxShadow: `0 12px 34px -18px color-mix(in srgb, ${rColor} 70%, transparent)`,
        }}
      >
        {/* Greeting + date + avatar */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)', lineHeight: 1.1 }}>{greeting}</h1>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-2)' }}>{format(today, de ? 'EEEE, d. MMMM' : 'EEEE, MMMM d')}</span>
          </div>
          <Link
            to="/profile"
            className="shrink-0 grid place-items-center rounded-full overflow-hidden"
            style={{ width: 46, height: 46, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
            aria-label={de ? 'Profil öffnen' : 'Open profile'}
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{(athleteName ?? 'A').charAt(0).toUpperCase()}</span>
            )}
          </Link>
        </div>

        {/* Readiness ring + headline state + personalized one-liner */}
        <Link to="/dashboard?tab=recovery" className="hover-card flex items-center gap-5">
          <ScoreRing score={score ?? 0} color={rColor} size={104}>
            <div className="flex flex-col items-center">
              <span className="num-display" style={{ fontSize: 32, color: rColor, lineHeight: 1 }}>{score != null ? Math.round(score) : '—'}</span>
              <span className="eyebrow" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>/ 100</span>
            </div>
          </ScoreRing>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <span className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Bereitschaft' : 'Readiness'}</span>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${pillColor} 15%, transparent)` }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: pillColor }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: pillColor }}>{pillWord}</span>
            </span>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.4 }}>{wrapLine}</p>
          </div>
        </Link>

        {/* Morning read — compact deterministic synthesis of last night + today.
            Only renders in the morning moment and only from real signals. */}
        {morningRead && (
          <div className="flex flex-col gap-1">
            <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{tFor(locale, 'morning_read')}</span>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{morningRead}</p>
          </div>
        )}

        {/* Momentum cues — real streak + 7-day fitness trend, small chips */}
        {(showStreak || showFitnessTrend) && (
          <div className="flex flex-wrap items-center gap-2">
            {showStreak && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                <Flame size={13} style={{ color: 'var(--color-amber)' }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-2)' }}>{streak} {de ? 'Tage Serie' : 'day streak'}</span>
              </span>
            )}
            {showFitnessTrend && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                {dCtl! >= 0 ? <TrendingUp size={13} style={{ color: 'var(--color-recovery)' }} /> : <TrendingDown size={13} style={{ color: 'var(--color-muted)' }} />}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-2)' }}>{de ? 'Fitness' : 'Fitness'} {dCtl! >= 0 ? '+' : ''}{dCtl} <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>(7d)</span></span>
              </span>
            )}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--color-rule)' }} />

        {/* Moment-adaptive metric row — the RIGHT signals for right now:
            morning = overnight recovery (HRV Δ / Sleep / RHR / on-deck);
            post-session = wrap-up (Duration / TSS / IF / Grade);
            evening = wind-down (Recovery / Tomorrow / Sleep target). */}
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>{momentLabel}</span>
          <div className="flex">
            {momentTiles.map((t, i) => (
              <div key={i} className="flex-1 flex items-stretch">
                {i > 0 && <div style={{ width: 1, background: 'var(--color-rule)' }} />}
                <div className="flex-1 flex flex-col items-center gap-1 px-1">
                  <span className="flex items-baseline gap-0.5">
                    <span className="num-display" style={{ fontSize: 19, color: t.color ?? 'var(--color-ink)', lineHeight: 1 }}>{t.value}</span>
                    {t.unit && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t.unit}</span>}
                  </span>
                  <span className="eyebrow" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-muted)', textAlign: 'center' }}>{t.label}</span>
                  {t.sub && <span style={{ fontSize: 10, fontWeight: 700, color: t.subColor ?? 'var(--color-ink-2)', lineHeight: 1 }}>{t.sub}</span>}
                </div>
              </div>
            ))}
          </div>
          {focusLine && (
            <div className="flex items-start gap-2" style={{ marginTop: 2 }}>
              <Sparkles size={13} strokeWidth={2.2} style={{ color: rColor, marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{focusLine}</p>
            </div>
          )}
        </div>
      </div>

      {/* Breakthrough celebration — only when the detector found a real one (P1.2) */}
      <BreakthroughCelebration />

      {/* Absorb-and-replan disclosure — the plan bent around your riding (P1.4) */}
      <AbsorptionCard />

      {/* Weekly recap entry — Monday + Tuesday, the reflection ritual (P1.3) */}
      {(today.getDay() === 1 || today.getDay() === 2) && (
        <Link to="/recap/week" className={`${CARD} hover-card flex items-center gap-3.5`} style={{ ...cardStyle, borderColor: 'var(--color-accent)' }}>
          <span className="grid place-items-center rounded-[14px] shrink-0" style={{ width: 44, height: 44, background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)' }}>
            <Sparkles size={22} style={{ color: 'var(--color-accent)' }} />
          </span>
          <div className="flex-1 min-w-0">
            <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{de ? 'Deine Woche als Story' : 'Your week, as a story'}</span>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{de ? 'Letzte Woche in 5 Karten — was du gebaut hast.' : 'Last week in 5 cards — what you built.'}</p>
          </div>
          <ChevronRight size={18} className="hover-arrow shrink-0" style={{ color: 'var(--color-accent)' }} />
        </Link>
      )}

      {/* Race chip → Season page (countdown, phases, race-day plan) */}
      {goalName && (
        <Link to="/season" className={`${CARD} hover-card flex items-center gap-3.5`} style={cardStyle}>
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)' }}>
            <Flag size={20} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="eyebrow" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Nächstes Ziel' : 'Next goal'}</div>
            <div className="num-display truncate" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{goalName}</div>
          </div>
          {daysToGoal != null && daysToGoal > 0 && (
            <div className="flex flex-col items-end">
              <span className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{Math.abs(daysToGoal)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{de ? 'Tage' : 'days'}</span>
            </div>
          )}
          <span className="hover-arrow"><ChevronRight size={18} style={{ color: 'var(--color-muted)' }} /></span>
        </Link>
      )}

      {/* Session Review — recommendation vs. what the athlete actually did */}
      {review && <SessionReviewCard review={review} de={de} />}

      {/* Rest day — no session prescribed: nothing to start or view */}
      {isRestDay && (
        <div
          className="rounded-[24px] p-5 flex items-center gap-3.5"
          style={cardStyle}
        >
          <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 46, height: 46, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
            <Moon size={22} strokeWidth={2} style={{ color: 'var(--color-recovery)' }} />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-recovery)' }}>{de ? 'Heutiger Plan' : "Today's plan"}</span>
            <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{de ? 'Ruhetag' : 'Rest day'}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{de ? 'Erholung & Regeneration — keine Einheit vorgesehen.' : 'Recovery & regeneration — no session prescribed.'}</p>
          </div>
        </div>
      )}

      {/* Workout card (coral) */}
      {!isRestDay && workout && (
        <div
          className="rounded-[24px] p-5 hover-card flex flex-col gap-[18px]"
          style={{ background: 'linear-gradient(125deg, color-mix(in srgb, var(--color-accent) 16%, var(--color-paper-2)) 0%, var(--color-paper-2) 72%)', border: '1px solid var(--color-accent)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap size={16} strokeWidth={2.4} style={{ color: 'var(--color-accent)' }} />
              <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-accent)' }}>{de ? 'Heutiger Plan' : "Today's plan"}</span>
            </div>
            <span className="num-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{(workout.category ?? '').toLowerCase().includes('run') ? (de ? 'Laufen' : 'Run') : (de ? 'Rad' : 'Bike')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{workout.title}</h2>
            {workout.why_this_workout && <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{workout.why_this_workout}</p>}
          </div>

          {/* What changed & why — transparent, data-driven adaptation */}
          {adaptations && (adaptations.summary || adaptations.changes.length > 0) && (
            <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
              <button type="button" onClick={() => setWhyOpen((o) => !o)} className="flex items-center gap-2 text-left">
                <Sparkles size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                <span className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.35 }}>{adaptations.summary}</span>
                {adaptations.changes.length > 0 && <ChevronDown size={16} style={{ color: 'var(--color-muted)', transform: whyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />}
              </button>
              {whyOpen && adaptations.changes.length > 0 && (
                <div className="flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 10 }}>
                  {adaptations.changes.map((c, i) => {
                    const col = c.severity === 'boost' ? 'var(--color-recovery)' : c.severity === 'ease' ? 'var(--color-amber)' : 'var(--color-strain)'
                    return (
                      <div key={i} className="flex gap-2.5">
                        <span className="shrink-0 mt-1" style={{ width: 7, height: 7, borderRadius: 999, background: col }} />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink)' }}>
                            {c.signal}{c.direction === 'up' ? ' ↑' : c.direction === 'down' ? ' ↓' : ''} · <span style={{ color: col, fontWeight: 600 }}>{c.action}</span>
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--color-ink-2)', lineHeight: 1.35 }}>{c.detail}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.35, fontStyle: 'italic' }}>{c.principle}</span>
                        </div>
                      </div>
                    )
                  })}
                  {(whyInputs.length > 0 || frameworks.length > 0) && (
                    <WhyInputChips whyInputs={whyInputs} frameworks={frameworks} de={de} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Why this? — inputs disclosure even when nothing was adapted today.
              The coach shows its work: the exact signals it weighed. */}
          {!adaptations?.changes?.length && (whyInputs.length > 0 || frameworks.length > 0) && (
            <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--color-paper) 55%, transparent)', border: '1px solid var(--color-rule)' }}>
              <button type="button" onClick={() => setWhyOpen((o) => !o)} className="flex items-center gap-2 text-left">
                <Sparkles size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
                <span className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Warum genau diese Einheit?' : 'Why this session?'}</span>
                <ChevronDown size={16} style={{ color: 'var(--color-muted)', transform: whyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />
              </button>
              {whyOpen && (
                <div style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 10 }}>
                  <WhyInputChips whyInputs={whyInputs} frameworks={frameworks} de={de} />
                </div>
              )}
            </div>
          )}
          <div className="flex gap-5">
            {([
              { l: de ? 'ZIEL-TSS' : 'TARGET TSS', v: workout.predicted_tss != null ? `${Math.round(workout.predicted_tss)}` : '—' },
              { l: de ? 'DAUER' : 'DURATION', v: workout.duration_minutes != null ? `${workout.duration_minutes} min` : '—' },
              { l: de ? 'INTENSITÄT' : 'INTENSITY', v: wIntensity ? `${wIntensity.z} · ${wIntensity.t}` : '—' },
            ]).map((s, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="eyebrow" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{s.l}</span>
                <span className="num-display" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{s.v}</span>
              </div>
            ))}
          </div>
          <div className="hover-reveal">
            <div className="flex flex-col gap-1" style={{ fontSize: 12.5, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>
              <span className="truncate">{wBlockSummary ?? (wIntensity ? `${wIntensity.z} · ${wIntensity.t}` : (de ? 'Intervallprofil' : 'Interval profile'))}</span>
              <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{de ? 'Komplettes Workout →' : 'Full workout →'}</span>
            </div>
          </div>
          {/* One-tap rails-safe alternates — the Go-Gentler choice architecture.
              Applied through the SAME audited path as the chat modifier. */}
          <AlternateRow de={de} indoor={false} />
          <Link to="/workout/today" className="inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 min-h-[44px]" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink)', fontSize: 14, fontWeight: 700 }}>
            <ListChecks size={16} strokeWidth={2} style={{ color: 'var(--color-ink-2)' }} /> {de ? 'Workout ansehen' : 'View full workout'} <ChevronRight size={16} style={{ color: 'var(--color-muted)' }} />
          </Link>
          <Link to="/workout/today" className="inline-flex items-center justify-center gap-2 rounded-full py-3.5 min-h-[48px]" style={{ background: 'var(--color-accent)', color: '#0A0C0F', fontSize: 15, fontWeight: 700, boxShadow: '0 6px 18px -4px color-mix(in srgb, var(--color-accent) 55%, transparent)' }}>
            <Play size={18} strokeWidth={2.6} fill="#0A0C0F" /> {de ? 'Einheit starten' : 'Start Workout'}
          </Link>
        </div>
      )}

      {/* The Road — load corridor: 21 days back, today, 10 days ahead (P1.1).
          Absorbs the old Training Load card's stat row + sparkline. */}
      <TheRoadCard ctlNow={ctl} atlNow={atl} tsbNow={tsb} dCtl={dCtl} />

      {/* Recovery outlook — forward TSB projection ("fresh by Thursday") */}
      <RecoveryEtaCard />

      {/* Level strip — real-work levels + forgiving streak (.pen i5D9C) */}
      <LevelStripCard />

      {/* Metrics row — Resting HR / HRV / Strain (real Garmin) */}
      <div className="grid grid-cols-3 gap-3">
        <MetricTile to="/dashboard?tab=recovery" icon={Heart} iconColor="var(--color-move)" label={de ? 'Ruhepuls' : 'Resting HR'} value={restingHr != null ? `${Math.round(restingHr)}` : '—'} unit="bpm"
          trend={restingHr != null && latest?.resting_hr != null ? { icon: TrendingDown, text: de ? 'ausgeruht' : 'rested', color: 'var(--color-recovery)' } : undefined} />
        <MetricTile to="/dashboard?tab=recovery" icon={Activity} iconColor="var(--color-recovery)" label="HRV" value={hrvNow != null ? `${Math.round(hrvNow)}` : '—'} unit="ms"
          trend={typeof hrvDelta === 'number' ? { icon: hrvDelta >= 0 ? TrendingUp : TrendingDown, text: `${hrvDelta >= 0 ? '+' : ''}${hrvDelta.toFixed(0)}%`, color: hrvDelta >= 0 ? 'var(--color-recovery)' : 'var(--color-amber)' } : undefined} />
        <MetricTile to="/dashboard?tab=recovery" icon={Zap} iconColor="var(--color-strain)" label="Strain" value={strain != null ? strain.toFixed(1) : '—'} unit=""
          trend={strain != null ? { icon: Target, text: strainState, color: 'var(--color-strain)' } : undefined} />
      </div>

      {/* Streak card — forgiving, plan-aware. Planned rest days keep the flame
          alive; sick/injured/break days PAUSE it (never break it) and feed the
          coach (status → rest/deload directive → interlock). */}
      <div className={`${CARD} flex flex-col gap-4`} style={cardStyle}>
        <div className="flex items-center justify-between">
          <span className="eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-ink-2)' }}>{de ? 'Diese Woche' : 'This Week'}</span>
          <span className="flex items-center gap-1">
            {streak != null && streak > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'var(--color-surface-2)' }}>
                {streakPaused
                  ? <Pause size={14} style={{ color: 'var(--color-muted)' }} />
                  : <Flame size={14} style={{ color: 'var(--color-amber)' }} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: streakPaused ? 'var(--color-muted)' : 'var(--color-amber)' }}>
                  {streak} {de ? 'Tage Serie' : 'day streak'}{streakPaused ? (de ? ' · pausiert' : ' · paused') : ''}
                </span>
              </span>
            )}
            <Link to="/dashboard?tab=history" aria-label={de ? 'Verlauf öffnen' : 'Open history'} className="hover-arrow"><ChevronRight size={16} style={{ color: 'var(--color-muted)' }} /></Link>
          </span>
        </div>
        <div className="flex gap-2">
          {weekDays.map((d, i) => {
            const bg = d.state === 'done' ? 'color-mix(in srgb, var(--color-recovery) 18%, transparent)'
              : d.state === 'rest' ? 'color-mix(in srgb, var(--color-recovery) 10%, transparent)'
              : d.state === 'paused' ? 'color-mix(in srgb, var(--color-amber) 12%, transparent)'
              : d.state === 'today' ? 'var(--color-accent)' : 'var(--color-surface-2)'
            const border = d.state === 'upcoming' ? '1px solid var(--color-rule)' : 'none'
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: bg, border }}>
                  {d.state === 'done' && <Check size={17} strokeWidth={3} style={{ color: 'var(--color-recovery)' }} />}
                  {d.state === 'today' && <Zap size={17} strokeWidth={2.6} fill="#0A0C0F" style={{ color: '#0A0C0F' }} />}
                  {d.state === 'rest' && <Moon size={14} style={{ color: 'var(--color-recovery)' }} />}
                  {d.state === 'paused' && <Pause size={14} style={{ color: 'var(--color-amber)' }} />}
                  {d.state === 'missed' && <Minus size={14} style={{ color: 'var(--color-muted)' }} />}
                </div>
                <span className="eyebrow" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}>{d.label}</span>
              </div>
            )
          })}
        </div>
        {streakPaused && (
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
            {de
              ? 'Serie pausiert — sie wartet auf dich. Erholung zählt nicht gegen dich.'
              : 'Streak paused — it’s waiting for you. Recovery never counts against you.'}
          </p>
        )}
        {/* Athlete status — one honest tap. Feeds streak pause + the coach
            (sick/injured → rest directive → competitive surfaces mute). */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-muted)', marginRight: 2 }}>
            {de ? 'STATUS' : 'STATUS'}
          </span>
          {([
            { s: 'healthy' as AthleteState, en: 'Healthy', deL: 'Gesund' },
            { s: 'sick' as AthleteState, en: 'Sick', deL: 'Krank' },
            { s: 'injured' as AthleteState, en: 'Injured', deL: 'Verletzt' },
            { s: 'break' as AthleteState, en: 'On a break', deL: 'Pause' },
          ]).map(({ s, en, deL }) => {
            const active = athleteState === s
            return (
              <button
                key={s}
                type="button"
                disabled={setStatus.isPending}
                onClick={() => { if (!active) setStatus.mutate(s) }}
                className="rounded-full px-2.5 py-1"
                style={{
                  fontSize: 11.5, fontWeight: 600,
                  background: active ? 'color-mix(in srgb, var(--color-amber) 16%, transparent)' : 'var(--color-surface-2)',
                  border: `1px solid ${active ? 'var(--color-amber)' : 'var(--color-rule)'}`,
                  color: active ? 'var(--color-amber)' : 'var(--color-ink-2)',
                  opacity: setStatus.isPending ? 0.6 : 1,
                }}
              >
                {de ? deL : en}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── One-tap alternates — rails-safe swaps for today's session ────────────────
// Three honest options (45-min / gentler / indoor) applied through the same
// audited modifier path the chat uses. The server's rails can downgrade or
// refuse; the returned `reason` is narrated verbatim. Undo shares the chat
// tool's 60-minute server-enforced window.
function AlternateRow({ de, indoor }: { de: boolean; indoor: boolean }) {
  const qc = useQueryClient()
  const [result, setResult] = useState<{ reason: string; ok: boolean; undone?: boolean } | null>(null)
  const apply = useMutation({
    mutationFn: async (label: 'less_time' | 'recover' | 'indoor') =>
      (await apiClient.post<{
        success: boolean; reason: string; title?: string | null
        duration_min?: number; predicted_tss?: number; template_id?: string
      }>('/coach/brief/alternate', { label })).data,
    onSuccess: (res) => {
      setResult({ reason: res.reason, ok: !!res.success })
      if (res.success) {
        // The server's brief cache still holds the pre-swap prescription, so
        // patch the visible card directly from the modification result.
        qc.setQueriesData({ queryKey: COACH_BRIEF_KEY_ROOT }, (old: unknown) => {
          const brief = old as { prescribed_workout?: Record<string, unknown> | null } | undefined
          if (!brief?.prescribed_workout) return old
          return {
            ...brief,
            prescribed_workout: {
              ...brief.prescribed_workout,
              ...(res.title ? { title: res.title } : {}),
              ...(res.duration_min != null ? { duration_minutes: res.duration_min } : {}),
              ...(res.predicted_tss != null ? { predicted_tss: res.predicted_tss } : {}),
              ...(res.template_id ? { template_id: res.template_id } : {}),
            },
          }
        })
      }
    },
  })
  const undo = useMutation({
    mutationFn: async () => (await apiClient.post<{ success: boolean; reason?: string }>('/coach/brief/alternate/undo')).data,
    onSuccess: (res) => {
      setResult(res.success ? { reason: de ? 'Rückgängig gemacht — die Original-Einheit steht wieder.' : 'Undone — your original session is back.', ok: true, undone: true } : { reason: res.reason ?? '', ok: false })
      if (res.success) qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
    },
  })
  const busy = apply.isPending || undo.isPending
  const OPTIONS: { label: 'less_time' | 'recover' | 'indoor'; text: string; hide?: boolean }[] = [
    { label: 'less_time', text: de ? 'Nur 45 min' : '45-min version' },
    { label: 'recover', text: de ? 'Sanfter' : 'Gentler' },
    { label: 'indoor', text: 'Indoor', hide: indoor },
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
          {de ? 'ODER PASS ES AN' : 'OR MAKE IT YOURS'}
        </span>
        {OPTIONS.filter((o) => !o.hide).map((o) => (
          <button
            key={o.label}
            type="button"
            disabled={busy}
            onClick={() => apply.mutate(o.label)}
            className="rounded-full px-2.5 py-1"
            style={{
              fontSize: 11.5, fontWeight: 600,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)',
              color: 'var(--color-ink-2)', opacity: busy ? 0.6 : 1,
            }}
          >
            {o.text}
          </button>
        ))}
      </div>
      {result?.reason && (
        <div className="rounded-[12px] flex items-start gap-2" style={{ background: `color-mix(in srgb, ${result.ok ? 'var(--color-recovery)' : 'var(--color-amber)'} 12%, transparent)`, padding: '9px 11px' }}>
          <Sparkles size={13} style={{ color: result.ok ? 'var(--color-recovery)' : 'var(--color-amber)', flexShrink: 0, marginTop: 2 }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-2)', lineHeight: 1.4 }}>{result.reason}</span>
          {result.ok && !result.undone && (
            <button type="button" disabled={busy} onClick={() => undo.mutate()} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0 }}>
              {de ? 'Rückgängig' : 'Undo'}
            </button>
          )}
        </div>
      )}
      {apply.isError && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-strain)' }}>{de ? 'Anpassen fehlgeschlagen — versuch es nochmal.' : 'Change failed — try again.'}</span>
      )}
    </div>
  )
}

// ── "Why this?" input chips — the coach shows its work ───────────────────────
// Every chip is a REAL signal the engine weighed today; frameworks are the
// science the brief cites. Text wears ink tokens; nothing is fabricated.
function WhyInputChips({ whyInputs, frameworks, de }: {
  whyInputs: { l: string; v: string }[]
  frameworks: string[]
  de: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {whyInputs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
            {de ? 'WAS DER COACH HEUTE GEWOGEN HAT' : 'WHAT THE COACH WEIGHED TODAY'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {whyInputs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted)' }}>{c.l}</span>
                <span className="num-mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink)' }}>{c.v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {frameworks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>
            {de ? 'WISSENSCHAFT' : 'SCIENCE'}
          </span>
          {frameworks.map((f, i) => (
            <span key={i} className="rounded-full px-2 py-0.5" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-recovery)', background: 'color-mix(in srgb, var(--color-recovery) 12%, transparent)' }}>
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}


function MetricTile({ to, icon: Icon, iconColor, label, value, unit, trend }: {
  to: string; icon: typeof Heart; iconColor: string; label: string; value: string; unit: string
  trend?: { icon: typeof Heart; text: string; color: string }
}) {
  return (
    <Link to={to} className="rounded-[20px] p-4 hover-card flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-center gap-2">
        <Icon size={17} style={{ color: iconColor }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: 'var(--color-muted)', paddingBottom: 3 }}>{unit}</span>}
      </div>
      {trend && (
        <div className="hover-reveal">
          <div className="flex items-center gap-1">
            <trend.icon size={15} style={{ color: trend.color }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: trend.color }}>{trend.text}</span>
          </div>
        </div>
      )}
    </Link>
  )
}
