import { useMemo } from 'react'
import { useWeeklyRecap } from '../../hooks/useWeeklyRecap'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { usePMC } from '../../hooks/usePMC'
import { useWallet } from '../../hooks/useWallet'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import type { WeeklyRecap } from '../../api/weeklyRecap'
import type { ActivityRead } from '../../api/dashboard'
import type { WeekResponse } from '../../api/weeks'
import type { Wallet } from '../../api/rewards'
import { DASH } from './w3tokens'
import { DE_WD2, addDays, fmtDEShort, fmtHoursHM, parseISO } from './w3plan'
import type {
  W3WeekReviewVm, W3ReviewDay, W3ReviewDelta, W3ReviewTile,
  W3ReviewEvidence, W3ReviewPlanDay, W3ReviewTone,
} from './W3WeekReviewView'

/**
 * W3 - THE weekly-review producer, in one place.
 *
 * Both surfaces that tell the weekly story read this hook and nothing else:
 *
 *   - `W3WeekReviewPage` - the full-screen WOCHENRUECKBLICK (/e/w3-week-review)
 *   - `W3WeekRecapCard`  - the Today button and its celebration popup
 *
 * That is the whole point of the extraction. The recap is a plan-vs-actual
 * story assembled from five different endpoints; computing it twice would give
 * the rider two versions of their own week, and the popup would eventually
 * disagree with the page it links to.
 *
 * ACT 1 - last COMPLETED week, from `/analytics/weekly-recap`. That endpoint is
 * the server's ONE producer of the weekly story: athlete-local totals, the same
 * window's totals a week earlier, plan-vs-actual through `planned_week_total()`
 * (the identical estimator `/weeks/current` uses for `planned_tss_total`, so
 * the two acts are measured on one ruler), the CTL delta across the week from
 * the real PMC series, the physiology-grounded breakthroughs detected inside
 * the week, and the biggest ride.
 *
 * The recap carries no per-day shape and no elevation, so those - and only
 * those - come from `useActivitiesRange(mon, sun)` over the same week.
 *
 * ACT 2 - the coming week, from `useCurrentWeek(0)`. `planned_tss_total` is the
 * display target. The "why" is the mesocycle context the generator itself
 * published: the Issurin block position, the CTL anchor (`usePMC`), the ramp
 * against last week under Friel's 8 % cap, the server-written `hours_note.de`,
 * and the event / progression horizon.
 *
 * HONESTY: every figure here is real or an explicit dash. A panel whose data is
 * missing is dropped, never filled. A missed week is stated plainly and pointed
 * forward - and `celebrate` (the confetti) stays false unless there is a
 * genuine achievement.
 */

const RC_LEDGER_LIMIT = 25    // services/rewards.get_wallet(ledger_limit=25)
const FRIEL_RAMP_CAP_PCT = 8  // services/mesocycle_generator.FRIEL_RAMP_CAP_PCT
const MESO_LENGTH_WEEKS = 4   // services/mesocycle_generator.MESO_LENGTH_WEEKS
const EVEREST_M = 8849        // the same yardstick w3RiderStats uses

const BLOCK_DE: Record<string, string> = {
  accumulation: 'Aufbaublock',
  transmutation: 'Spezifischer Block',
  realization: 'Wettkampfblock',
  recovery: 'Ruhewoche',
}
const BLOCK_NOTE: Record<string, string> = {
  accumulation: 'Volumen sammeln. Viele ruhige Kilometer, aus denen die Grundfitness wächst.',
  transmutation: 'Die gesammelte Grundlage wird scharf gestellt — weniger Umfang, mehr Qualität.',
  realization: 'Frisch werden und die Form abrufen. Kurz, intensiv, mit echten Pausen.',
  recovery: 'Erholung ist hier die Trainingseinheit. Der Block plant sie bewusst ein — sie ist kein Ausfall.',
}
const BLOCK_TITLE: Record<string, [string, string]> = {
  accumulation: ['Jetzt wird', 'aufgebaut.'],
  transmutation: ['Jetzt wird es', 'spezifisch.'],
  realization: ['Jetzt zählt', 'die Form.'],
  recovery: ['Ruhewoche —', 'so geplant.'],
}
const EVENT_DE: Record<string, string> = {
  road_race: 'Straßenrennen', gran_fondo: 'Gran Fondo', time_trial: 'Zeitfahren',
  criterium: 'Kriterium', gravel: 'Gravel-Event', mtb: 'MTB-Rennen', tour: 'Tour',
}

const de1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** "12" / "7,5" — no trailing ",0" on a whole number of hours. */
const deNum = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const signed = (n: number, fmt: (x: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`
/** Local ISO day key for an activity, matching the recap's athlete-local buckets
 *  as closely as the browser can (the device timezone IS the athlete's). */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function toneOf(recap: WeeklyRecap): W3ReviewTone {
  const { sessions, tss } = recap.totals
  if (sessions === 0) return 'empty'
  const planned = recap.planned_tss
  if (planned == null || planned <= 0) return 'steady'
  const pct = (tss / planned) * 100
  return pct >= 85 ? 'strong' : pct >= 60 ? 'steady' : 'quiet'
}

/** The week's RideCoin, from the ledger — but ONLY when the ledger provably
 *  covers the whole week. `/rewards/wallet` returns the 25 most recent entries;
 *  a full page whose oldest line is still inside the week means older lines were
 *  cut off, and a truncated sum would understate the earn. Then: no tile. */
function coinsOf(wallet: Wallet | undefined, startMs: number, endMs: number): number | null {
  const ledger = wallet?.ledger ?? []
  if (ledger.length === 0) return null
  const stamps = ledger.map((e) => (e.at ? new Date(e.at).getTime() : NaN)).filter((t) => Number.isFinite(t))
  if (stamps.length !== ledger.length) return null              // an undated line — can't attribute
  const covered = ledger.length < RC_LEDGER_LIMIT || Math.min(...stamps) < startMs
  if (!covered) return null
  const earned = ledger.reduce((s, e, i) => {
    const t = stamps[i]
    return t >= startMs && t <= endMs && e.amount > 0 ? s + e.amount : s
  }, 0)
  return earned > 0 ? earned : null
}

function buildVm(
  recap: WeeklyRecap,
  acts: ActivityRead[],
  week: WeekResponse | undefined,
  ctlNow: number | null,
  coins: number | null,
  eventName: string | null,
): W3WeekReviewVm {
  const start = parseISO(recap.week_start)
  const end = parseISO(recap.week_end)
  const t = recap.totals
  const p = recap.prev_totals
  const tone = toneOf(recap)

  // ── plan-vs-done ──
  const planned = recap.planned_tss
  const compliancePct = planned != null && planned > 0 ? Math.round((t.tss / planned) * 100) : null
  const complianceLabel = planned != null && planned > 0
    ? `${t.tss} VON ${planned} TSS GEPLANT`
    : 'FÜR LETZTE WOCHE LAG KEIN PLAN IM SYSTEM'

  const TITLES: Record<W3ReviewTone, [string, string]> = {
    strong: ['Woche', 'geliefert.'],
    steady: ['Woche', 'gefahren.'],
    quiet: ['Ruhige', 'Woche.'],
    empty: ['Keine Fahrt', 'letzte Woche.'],
  }
  const verdict =
    tone === 'empty'
      ? 'Letzte Woche ist keine Fahrt angekommen. Kein Drama — weiter unten steht, wie die neue Woche aussieht.'
      : compliancePct == null
        ? `${t.sessions} ${t.sessions === 1 ? 'Einheit' : 'Einheiten'} und ${de1(t.km)} km. Für letzte Woche lag kein Plan im System — verglichen wird, sobald einer steht.`
        : compliancePct >= 110
          ? 'Mehr als der Plan verlangt hat. Die neue Woche rechnet das ein.'
          : compliancePct >= 85
            ? 'Genau im Korridor. Genau so entsteht Form.'
            : compliancePct >= 60
              ? 'Etwas unter Plan — das trägt trotzdem.'
              : 'Eine ruhige Woche. Der Plan rechnet damit und passt sich an.'

  // ── the four stat cards (recap totals; ascent from the rides themselves) ──
  const elevM = acts.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
  const hasElev = acts.some((a) => (a.elevation_gain_m ?? 0) > 0)
  const stats: W3WeekReviewVm['stats'] = [
    { icon: 'rides', label: 'FAHRTEN', value: String(t.sessions), unit: '' },
    { icon: 'timer', label: 'SATTELZEIT', value: t.hours > 0 ? fmtHoursHM(t.hours) : DASH, unit: t.hours > 0 ? 'h' : '' },
    { icon: 'route', label: 'DISTANZ', value: t.km > 0 ? String(Math.round(t.km)) : DASH, unit: t.km > 0 ? 'km' : '' },
    { icon: 'climb', label: 'HÖHENMETER', value: hasElev ? Math.round(elevM).toLocaleString('de-DE') : DASH, unit: hasElev ? 'm' : '' },
  ]

  // ── the shape of the week: seven real daily TSS buckets ──
  const byDay = new Map<string, number>()
  for (const a of acts) {
    const key = isoDay(new Date(a.started_at))
    byDay.set(key, (byDay.get(key) ?? 0) + (a.tss ?? 0))
  }
  const dayTss = Array.from({ length: 7 }, (_, i) => Math.round(byDay.get(isoDay(addDays(start, i))) ?? 0))
  const maxDay = Math.max(...dayTss, 0)
  const days: W3ReviewDay[] = maxDay > 0
    ? dayTss.map((v, i) => {
        const d = addDays(start, i)
        return {
          letter: DE_WD2[i] ?? '', num: String(d.getDate()),
          pct: Math.round((v / maxDay) * 100), label: `${v}`,
          peak: v === maxDay && v > 0 && dayTss.indexOf(maxDay) === i,
        }
      })
    : []

  // ── vs. the week before (only when there IS a week before to compare) ──
  const hasPrev = p.sessions > 0 || p.tss > 0
  const dTss = t.tss - p.tss
  const dKm = t.km - p.km
  const dH = t.hours - p.hours
  const dirOf = (n: number, eps = 0) => (n > eps ? 'up' : n < -eps ? 'down' : 'flat') as W3ReviewDelta['dir']
  const deltas: W3ReviewDelta[] = hasPrev
    ? [
        { label: 'TSS', value: signed(dTss, (x) => String(Math.round(x))), dir: dirOf(dTss) },
        { label: 'DISTANZ', value: `${signed(dKm, (x) => String(Math.round(x)))} km`, dir: dirOf(dKm, 0.5) },
        { label: 'ZEIT', value: `${signed(dH, (x) => fmtHoursHM(x))} h`, dir: dirOf(dH, 0.05) },
      ]
    : []

  // ── insight tiles — a raw figure made human, each dropped without its data ──
  const longest = acts.reduce((m, a) => Math.max(m, (a.distance_meters ?? 0) / 1000), 0)
  const tiles: W3ReviewTile[] = []
  if (hasElev && elevM > 0) {
    // Everest is only a useful yardstick once the week is a meaningful fraction
    // of one. Below that "0,0× Mount Everest" says nothing — switch to percent.
    const everest = elevM / EVEREST_M
    tiles.push({
      key: 'elev', label: 'HÖHENMETER', value: `${Math.round(elevM).toLocaleString('de-DE')} m`,
      caption: everest >= 0.1 ? `≈ ${de1(everest)}× Mount Everest` : `≈ ${Math.round(everest * 100)} % vom Mount Everest`,
    })
  }
  if (longest > 0) {
    tiles.push({ key: 'longest', label: 'LÄNGSTE FAHRT', value: `${Math.round(longest)} km`, caption: 'deine weiteste Fahrt der Woche' })
  }
  if (t.sessions > 0) {
    tiles.push({ key: 'days', label: 'AKTIVE TAGE', value: `${t.active_days} / 7`, caption: t.active_days >= 4 ? 'der Rhythmus trägt' : 'jeder Tag zählt mit' })
  }
  if (coins != null) {
    tiles.push({ key: 'coins', label: 'RIDECOIN', value: `+${coins.toLocaleString('de-DE')}`, caption: 'letzte Woche aufs Konto gebucht' })
  }

  // ── best moment: a real breakthrough, else the week's biggest ride ──
  const bt = recap.breakthroughs[0]
  const br = recap.best_ride
  const moment = bt
    ? { badge: 'DURCHBRUCH', title: bt.headline, detail: bt.detail }
    : br
      ? {
          badge: 'GRÖSSTE FAHRT DER WOCHE',
          title: br.title || `${Math.round(br.km)} km`,
          detail: [
            br.date ? fmtDEShort(parseISO(br.date)) : null,
            `${Math.round(br.tss)} TSS`,
            br.km > 0 ? `${Math.round(br.km)} km` : null,
            br.hours > 0 ? `${fmtHoursHM(br.hours)} h` : null,
          ].filter(Boolean).join(' · '),
        }
      : null

  // ── fitness moved (CTL across the week) ──
  const cd = recap.ctl_delta
  const fitness = cd != null || ctlNow != null
    ? {
        delta: cd != null ? signed(cd, de1) : DASH,
        dir: (cd == null ? 'flat' : cd > 0.05 ? 'up' : cd < -0.05 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
        now: ctlNow != null ? `CTL ${Math.round(ctlNow)}` : DASH,
        note: cd == null
          ? 'Für die Bewegung fehlt noch ein Endpunkt in deiner Fitness-Kurve.'
          : cd > 0.05
            ? 'Deine Grundfitness ist letzte Woche gewachsen. Genau dafür fährst du.'
            : cd < -0.05
              ? 'Fitness leicht abgebaut — CTL folgt immer der Belastung der letzten Wochen.'
              : 'Fitness gehalten — die Woche hat dein Niveau getragen.',
      }
    : null

  // ── ACT 2: the coming week ──
  const meso = week?.meso_block ?? null
  const pos = meso?.block_position ?? null
  const [nextTitle, nextAccent] = pos ? (BLOCK_TITLE[pos] ?? ['Neue Woche', 'startet.']) : ['Neue Woche', 'startet.']
  const nextBlock = meso
    ? `${BLOCK_DE[meso.block_position] ?? 'Trainingsblock'} · Woche ${meso.block_index_in_meso + 1} von ${MESO_LENGTH_WEEKS}`
    : 'Der Plan für diese Woche wird noch erstellt'
  const nextTss = week?.planned_tss_total ?? null

  // The ramp is stated against what it is actually computed from — last week's
  // PLAN. Only if that is missing do we fall back to what was ridden, and the
  // label says so, because plan-vs-ridden is a different comparison.
  const rampFrom = planned != null && planned > 0 ? planned : t.tss > 0 ? t.tss : null
  const rampFromLabel = planned != null && planned > 0 ? 'letzte Woche geplant' : 'letzte Woche gefahren'
  const rampPct = nextTss != null && rampFrom != null && rampFrom > 0
    ? Math.round(((nextTss - rampFrom) / rampFrom) * 100)
    : null
  const nextTssNote = nextTss != null
    ? `geplant für Mo – So${meso ? ` · ${BLOCK_DE[meso.block_position] ?? 'Trainingsblock'}` : ''}`
    : 'Für diese Woche liegt noch kein Plan im System.'

  const evidence: W3ReviewEvidence[] = []
  if (meso) {
    evidence.push({
      key: 'block',
      label: 'BLOCK',
      value: BLOCK_DE[meso.block_position] ?? 'Block',
      note: BLOCK_NOTE[meso.block_position] ?? 'Der Block bestimmt, wofür die Woche gebaut ist.',
    })
  }
  if (ctlNow != null) {
    evidence.push({
      key: 'ctl',
      label: 'FITNESS-ANKER',
      value: `CTL ${Math.round(ctlNow)}`,
      note: 'Das Wochenbudget wird von deiner Fitness aus gerechnet — je höher CTL, desto mehr TSS trägt eine Woche wirklich.',
    })
  }
  if (rampPct != null) {
    evidence.push({
      key: 'ramp',
      label: 'RAMPE',
      value: `${signed(rampPct, (x) => String(Math.round(x)))} %`,
      note: `Gegenüber ${rampFromLabel}. Mehr als ${FRIEL_RAMP_CAP_PCT} % pro Woche lässt der Plan nicht zu — das ist die Friel-Grenze gegen zu schnelles Aufbauen.`,
    })
  }
  if (meso?.hours_note) {
    evidence.push({
      key: 'hours',
      label: 'ZEITBUDGET',
      value: `${deNum(meso.hours_note.declared_hours)} h`,
      // Written by the generator itself, already in German — the one place that
      // can honestly explain why a declared 12 h week starts smaller.
      note: meso.hours_note.de || meso.hours_note.reason,
    })
  }
  if (meso?.days_to_event != null) {
    const wks = Math.max(0, Math.ceil(meso.days_to_event / 7))
    const what = eventName ?? (meso.target_event_type ? EVENT_DE[meso.target_event_type] ?? meso.target_event_type : 'dein Zielevent')
    evidence.push({
      key: 'event', label: 'ZIEL',
      value: `${wks} ${wks === 1 ? 'Woche' : 'Wochen'}`,
      note: `Bis ${what} sind es noch ${meso.days_to_event} Tage. Danach richtet sich, wie hart diese Woche sein darf.`,
    })
  } else if (meso?.progression) {
    evidence.push({
      key: 'horizon', label: 'AUFBAU-HORIZONT',
      value: `CTL ${Math.round(meso.progression.target_ctl)}`,
      note: `Ohne Zielevent baut der Plan über ${meso.progression.horizon_weeks} Wochen von CTL ${Math.round(meso.progression.start_ctl)} auf CTL ${Math.round(meso.progression.target_ctl)} auf.`,
    })
  }

  // The prescribed days that are still ahead — /weeks/current is anchored on
  // TODAY, so on a Tuesday it hands back Tue…Mon. We keep only what belongs to
  // this Mon–Sun week and name the section accordingly, rather than pass off
  // next Monday as part of this week.
  const thisMonday = addDays(new Date(), -((new Date().getDay() + 6) % 7))
  const thisSundayMs = addDays(thisMonday, 6).getTime()
  // A day without a usable date cannot be placed on the week, so it is dropped
  // rather than allowed to poison the row it lands in.
  const planRows = (week?.days ?? []).filter((d) => {
    const t = parseISO(d.date).getTime()
    return Number.isFinite(t) && t <= thisSundayMs
  })
  const planDays: W3ReviewPlanDay[] = planRows.map((d) => {
    const dt = parseISO(d.date)
    const rest = d.category === 'rest'
    return {
      letter: DE_WD2[(dt.getDay() + 6) % 7] ?? '',
      title: rest ? 'Ruhetag' : d.title,
      tss: rest ? DASH : d.target_tss != null ? `${Math.round(d.target_tss)} TSS` : DASH,
      rest,
    }
  })

  return {
    rangeLabel: `${fmtDEShort(start)} – ${fmtDEShort(end)}`,
    weekTag: `KW ${isoWeek(start)}`,
    tone,
    celebrate: recap.breakthroughs.length > 0 || (tone === 'strong' && t.sessions > 0),
    kicker: 'LETZTE WOCHE',
    title: TITLES[tone][0],
    titleAccent: TITLES[tone][1],
    tssDone: Math.round(t.tss),
    complianceLabel, compliancePct, verdict,
    stats, days, deltas, tiles, moment, fitness,
    nextBlock, nextTitle, nextAccent, nextTss, nextTssNote,
    rampFrom, rampFromLabel,
    preface: week?.preface || null,
    evidence,
    planDays,
    planDaysLabel: planRows.length >= 7 ? 'DER PLAN' : 'DER REST DER WOCHE',
  }
}

/** ISO-8601 week number (Mon-anchored), for the "KW 33" chip. */
function isoWeek(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const first = new Date(t.getFullYear(), 0, 4)
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7)
}

/** Whether last week holds a story worth showing at all: a ride, or a plan it
 *  could have been measured against. A rider with neither gets no card and no
 *  popup - an empty celebration is worse than silence. */
export function recapHasStory(recap: WeeklyRecap | undefined): boolean {
  if (!recap) return false
  // `totals` guarded too: this decides whether a GLOBAL gate fires, so a recap
  // that arrives without it must mean "no story", never an exception.
  return (recap.totals?.sessions ?? 0) > 0 || (recap.planned_tss ?? 0) > 0
}

/** The ONE read of the weekly story. Fetches the five sources, builds the vm. */
export function useWeekReviewVm(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true
  const { data: recap, isLoading, isError } = useWeeklyRecap({ locale: 'de', enabled })
  const { data: week } = useCurrentWeek(0)
  const { data: pmc } = usePMC(90)
  const { data: wallet } = useWallet()
  const { data: profile } = useAthleteProfile()

  // The reviewed week's own rides - for the per-day shape and the ascent, the
  // two things the recap payload does not carry. Before the recap lands we
  // compute the SAME window locally (last completed Mon-Sun), so the query key
  // doesn't change underneath us and no throwaway request is made.
  const [from, to] = useMemo(() => {
    if (recap) return [parseISO(recap.week_start), parseISO(recap.week_end)] as const
    const lastMonday = addDays(new Date(), -((new Date().getDay() + 6) % 7) - 7)
    return [lastMonday, addDays(lastMonday, 6)] as const
  }, [recap])
  const { data: range } = useActivitiesRange(from, to)

  const vm = useMemo(() => {
    if (!recap) return null
    const acts = (range?.activities ?? []).filter((a) => a.sport === 'cycling')
    const entries = pmc?.entries ?? []
    const ctlNow = entries.length > 0 ? entries[entries.length - 1].ctl : null
    const coins = coinsOf(wallet, parseISO(recap.week_start).getTime(), parseISO(recap.week_end).getTime() + 86_399_999)
    return buildVm(recap, acts, week, ctlNow, coins, profile?.goals?.target_event_name ?? null)
  }, [recap, range, week, pmc, wallet, profile])

  return { vm, recap, isLoading, isError }
}
