/**
 * W3 · Trainingsplan — shared math + formatting for the periodized plan surfaces
 * (W3PlanView, W3GoalView, W3LoadForecastView).
 *
 * Every number a caller feeds these helpers is REAL coaching data (the /weeks
 * mesocycle context, the /plan/build weekly-TSS series, the athlete's FTP /
 * weight, the season's activities, the parsed target-event route). The helpers
 * only reshape it — the interval→bar + Ø-watts math is transcribed 1:1 from
 * W3TodayPage (which itself mirrors the Train tab's PlanTab), so the plan card
 * reads the SAME real plan as Today. Where a value is a derivation (the phase
 * week-ranges, the requirement targets from the route profile) the caller marks
 * it; nothing here fabricates.
 */
import type { DayPlan, IntervalBlockOut } from '../../api/weeks'

// ── German date formatting ──────────────────────────────────────────────────
export const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const DE_MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']
export const DE_WD = ['M', 'D', 'M', 'D', 'F', 'S', 'S'] // Mon→Sun single letters
export const DE_WD2 = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Local Date from an ISO YYYY-MM-DD (no UTC shift).
 *
 * TOTAL ON PURPOSE. This is called from twenty places, several of them inside
 * components that mount on EVERY `/e/w3-*` screen — the weekly-review gate
 * among them. It used to do `d.slice(0, 10)` with nothing in front of it, so a
 * single missing date anywhere in any payload did not blank one card: it threw
 * through the whole render tree and replaced the entire app with the error
 * card, on every screen, until that payload changed. A date is precisely the
 * field a partial, older or half-migrated payload is most likely to be missing,
 * and the type says `string` only because TypeScript cannot police what the
 * server actually sent.
 *
 * Bad input yields an INVALID Date rather than a plausible wrong one. Callers
 * that format it get "NaN"-free handling through the existing DASH paths, and
 * anything that needs to know can ask `Number.isNaN(d.getTime())` — a question
 * you cannot ask of an exception that already unmounted the page. */
export function parseISO(d: string | null | undefined): Date {
  if (typeof d !== 'string' || d === '') return new Date(NaN)
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  if (!Number.isFinite(y)) return new Date(NaN)
  return new Date(y, (m ?? 1) - 1, day ?? 1)
}
/** "So, 4. Oktober" */
export function fmtDE(d: Date): string {
  return `${DE_WD2[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${DE_MONTHS[d.getMonth()]}`
}
/** "4. Okt" */
export function fmtDEShort(d: Date): string {
  return `${d.getDate()}. ${DE_MONTHS_SHORT[d.getMonth()]}`
}
/** "11. Aug – 7. Sep" */
export function fmtRange(a: Date, b: Date): string {
  return `${a.getDate()}. ${DE_MONTHS_SHORT[a.getMonth()]} – ${b.getDate()}. ${DE_MONTHS_SHORT[b.getMonth()]}`
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
/** Whole days between two dates (b − a), calendar-based. */
export function daysBetween(a: Date, b: Date): number {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  return Math.round(ms / 86400000)
}
/** "7 Wochen 4 Tage" from a whole-day count. */
export function weeksDaysLabel(days: number): string {
  const w = Math.floor(days / 7)
  const d = days % 7
  if (w <= 0) return `${d} Tag${d === 1 ? '' : 'e'}`
  return d === 0 ? `${w} Woche${w === 1 ? '' : 'n'}` : `${w} Woche${w === 1 ? '' : 'n'} ${d} Tag${d === 1 ? '' : 'e'}`
}
/** "8:15 h" from hours (decimal). */
export function fmtHoursHM(hoursDec: number | null): string {
  if (hoursDec == null || !isFinite(hoursDec)) return '—'
  const h = Math.floor(hoursDec)
  const m = Math.round((hoursDec - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

// ── Interval → bar + Ø-watts (transcribed from W3TodayPage / PlanTab) ────────
export function planDurSec(p: DayPlan): number {
  return p.duration_seconds_target ?? (p.intervals ?? []).reduce((s, iv) => s + (iv.duration_seconds ?? 0), 0)
}
export function isSessionDay(p: DayPlan): boolean {
  return p.category !== 'rest' && (planDurSec(p) > 0 || (p.intervals?.length ?? 0) > 0 || (p.target_tss ?? 0) > 0)
}
export function planIF(p: DayPlan): number | null {
  const dur = planDurSec(p)
  return p.target_tss != null && p.target_tss > 0 && dur > 0
    ? Math.sqrt(p.target_tss / ((dur / 3600) * 100))
    : null
}
function blockPctSeconds(iv: IntervalBlockOut): { pctSeconds: number; seconds: number } {
  const onPct = iv.power_target_pct_ftp ?? 0
  if (iv.reps && iv.on_s && iv.on_s > 0) {
    const offPct = iv.off_pct_ftp ?? 0
    const offS = iv.off_s ?? 0
    const onSeconds = iv.reps * iv.on_s
    const offSeconds = iv.reps * offS
    return { pctSeconds: onSeconds * onPct + offSeconds * offPct, seconds: onSeconds + offSeconds }
  }
  return { pctSeconds: iv.duration_seconds * onPct, seconds: iv.duration_seconds }
}
export function cyclingAvgWatts(ivs: IntervalBlockOut[], ftp: number | null): number | null {
  if (ftp == null) return null
  const powered = ivs.filter((iv) => (iv.power_target_pct_ftp ?? 0) > 0 && iv.duration_seconds > 0)
  const tot = powered.reduce((s, iv) => s + iv.duration_seconds, 0)
  if (tot <= 0) return null
  const pctSeconds = powered.reduce((s, iv) => s + blockPctSeconds(iv).pctSeconds, 0)
  return Math.round((pctSeconds / tot) * ftp)
}
export function planTargetWatts(p: DayPlan, ftp: number | null): number | null {
  const avg = cyclingAvgWatts(p.intervals ?? [], ftp)
  if (avg != null) return avg
  const ifac = planIF(p)
  return ifac != null && ftp != null ? Math.round(ifac * ftp) : null
}
function ivFrac(iv: IntervalBlockOut): number {
  return iv.power_target_pct_ftp ? Math.min(1, iv.power_target_pct_ftp / 1.25) : Math.min(1, iv.zone / 7)
}
export interface PlanBar { w: number; work: boolean }
/** Real interval blocks → the session card's power-profile bars (work = zone≥3). */
export function blocksFromIntervals(ivs: IntervalBlockOut[]): PlanBar[] {
  const REP_CAP = 6
  const bars: PlanBar[] = []
  for (const iv of ivs) {
    const work = iv.zone >= 3
    if (iv.reps && iv.reps > 1 && iv.on_s && iv.on_s > 0) {
      const n = Math.min(iv.reps, REP_CAP)
      const offFrac = iv.off_pct_ftp ? Math.min(1, iv.off_pct_ftp / 1.25) : 0.22
      for (let r = 0; r < n; r++) {
        bars.push({ w: ivFrac(iv), work })
        bars.push({ w: offFrac, work: false })
      }
    } else {
      bars.push({ w: ivFrac(iv), work })
    }
  }
  return bars
}
/** Honest warm-up→body→cool envelope for a steady endurance ride with no
 *  structured intervals (avoids one flat beam). */
export function enduranceEnvelope(): PlanBar[] {
  return [
    { w: 0.34, work: false }, { w: 0.5, work: false }, { w: 0.66, work: false },
    ...Array.from({ length: 7 }, () => ({ w: 0.86, work: true })),
    { w: 0.6, work: false }, { w: 0.4, work: false },
  ]
}

// ── Training-zone time across the planned week (Belastung & Prognose) ────────
/** Seconds in each of Z1..Z5 across the week's real intervals. Z6/Z7 fold into
 *  Z5; a structured set's on-seconds land in the interval's zone, off-seconds in
 *  Z1 (recovery). Days without power fall back to the day's category zone. */
export function weekZoneSeconds(days: DayPlan[]): [number, number, number, number, number] {
  const z: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  const bucket = (zone: number) => Math.max(0, Math.min(4, zone <= 1 ? 0 : zone === 2 ? 1 : zone === 3 ? 2 : zone === 4 ? 3 : 4))
  const catZone: Record<string, number> = { recovery: 1, endurance: 2, tempo: 3, sweet_spot: 3, threshold: 4, vo2: 5 }
  for (const d of days) {
    if (d.category === 'rest') continue
    const ivs = d.intervals ?? []
    if (ivs.length === 0) {
      // No structured blocks — assign the whole planned duration to its category zone.
      const secs = planDurSec(d)
      if (secs > 0) z[bucket(catZone[d.category] ?? 2)] += secs
      continue
    }
    for (const iv of ivs) {
      if (iv.reps && iv.on_s && iv.on_s > 0) {
        z[bucket(iv.zone)] += iv.reps * iv.on_s
        z[0] += iv.reps * (iv.off_s ?? 0)
      } else {
        z[bucket(iv.zone)] += iv.duration_seconds
      }
    }
  }
  return z
}

// ── Requirement gap (goal detail: current → target) ─────────────────────────
export interface ReqGap {
  label: string
  currentText: string
  targetText: string
  /** 0..1 progress of current toward target. */
  pct: number
  remainingText: string
  onTrack: boolean
}
/** Build one requirement row. `onTrack` (im Plan / hinter Plan) is true when the
 *  athlete already covers ≥ 82% of the target — the honest "close enough that the
 *  plan closes it" threshold; below that it's flagged "hinter Plan". */
export function makeGap(
  label: string,
  current: number | null,
  target: number | null,
  fmt: (n: number) => string,
  remainFmt: (remain: number) => string,
): ReqGap {
  if (current == null || target == null || target <= 0) {
    return { label, currentText: current != null ? fmt(current) : '—', targetText: target != null ? fmt(target) : '—', pct: 0, remainingText: '—', onTrack: false }
  }
  const pct = Math.max(0, Math.min(1, current / target))
  const remain = Math.max(0, target - current)
  const onTrack = pct >= 0.82
  return {
    label,
    currentText: fmt(current),
    targetText: fmt(target),
    pct,
    remainingText: remain <= 0 ? 'erreicht' : `${remainFmt(remain)} · ${onTrack ? 'im Plan' : 'hinter Plan'}`,
    onTrack,
  }
}

// ── Phase rail (Grundlage / Aufbau / Spezifisch / Taper) ────────────────────
export interface PhaseSeg { name: string; weeks: string; active: boolean }
/** Map the real meso-block phase string onto one of the four display phases. */
export function displayPhase(raw: string | null | undefined): 'Grundlage' | 'Aufbau' | 'Spezifisch' | 'Taper' {
  const s = (raw ?? '').toLowerCase()
  if (/(taper|peak|realiz|race)/.test(s)) return s.includes('spez') ? 'Spezifisch' : /taper|peak/.test(s) ? 'Taper' : 'Spezifisch'
  if (/(spez|special|build2|vo2|threshold)/.test(s)) return 'Spezifisch'
  if (/(aufbau|build|transmut)/.test(s)) return 'Aufbau'
  return 'Grundlage'
}
/** Derive the four phase week-ranges for an N-week plan (standard base-heavy
 *  split). DERIVED for the rail's ranges; the ACTIVE highlight is the real phase. */
export function phaseRail(totalWeeks: number, activePhase: 'Grundlage' | 'Aufbau' | 'Spezifisch' | 'Taper'): PhaseSeg[] {
  const n = Math.max(4, totalWeeks)
  const taper = n >= 10 ? 2 : 1
  const base = Math.max(2, Math.round((n - taper) * 0.32))
  const build = Math.max(2, Math.round((n - taper) * 0.36))
  const spec = Math.max(1, n - taper - base - build)
  let cursor = 1
  const seg = (name: PhaseSeg['name'], len: number): PhaseSeg => {
    const from = cursor
    const to = cursor + len - 1
    cursor = to + 1
    return { name, weeks: from === to ? `W${from}` : `W${from}–${to}`, active: name === activePhase }
  }
  return [seg('Grundlage', base), seg('Aufbau', build), seg('Spezifisch', spec), seg('Taper', taper)]
}
/** Phase-appropriate coach copy for the active block (generated from the REAL
 *  phase, not fabricated numbers). */
export function phaseBlurb(phase: 'Grundlage' | 'Aufbau' | 'Spezifisch' | 'Taper'): { text: string; tags: string[]; next: string } {
  switch (phase) {
    case 'Grundlage':
      return { text: 'Volumen aufbauen, locker fahren. Die aerobe Basis trägt später jede harte Einheit – jetzt zählt Zeit im Sattel, nicht Watt.', tags: ['Z2-Volumen', 'Grundlagenausdauer', 'Kadenz'], next: 'Danach: Aufbau – die Schwelle kommt dazu' }
    case 'Aufbau':
      return { text: 'In diesem Block hebst du die Schwelle an, ohne das Grundlagenvolumen zu verlieren. Zwei harte Einheiten pro Woche, der Rest bleibt bewusst locker – die Anpassung passiert zwischen den Intervallen, nicht in ihnen.', tags: ['Schwelle', 'Z2-Volumen', 'Kraftausdauer'], next: 'Danach: Spezifisch – Renntempo am Berg' }
    case 'Spezifisch':
      return { text: 'Jetzt wird es rennspezifisch: lange Anstiege im Renntempo, VO2max-Spitzen und Fahrten, die Dauer und Höhenmeter des Ziels nachstellen. Weniger Volumen, mehr Schärfe.', tags: ['Renntempo', 'VO2max', 'Lange Anstiege'], next: 'Danach: Taper – frisch werden' }
    case 'Taper':
      return { text: 'Belastung runter, Schärfe halten. Kurze harte Reize halten das System wach, während die Ermüdung abfließt – am Renntag stehst du frisch und spritzig am Start.', tags: ['Formaufbau', 'Kurze Reize', 'Erholung'], next: 'Danach: Renntag' }
  }
}

// ── Die Wochen des Blocks: Gefäße und ihre Füllung ────────────────────
/**
 * ZWEI GRÖSSEN, ZWEI FELDER. Vorher stand beides in einem `tss`: vergangene
 * Wochen trugen die GEFAHRENE Last, künftige die GEPLANTE, auf einer Skala und
 * im selben Grau. Damit war die eine Frage, für die es diese Reihe gibt --
 * habe ich die Woche getroffen? -- nicht darstellbar.
 *
 * `planned` ist die Höhe des Gefäßes und immer echt. `actual` ist die Füllung
 * und darf `null` sein.
 *
 * UND `?? t` IST WEG. Eine vergangene Woche ohne Fahrt zeichnete den Zielwert
 * in voller Höhe und meldete ihn dem Screenreader als "gefahren" -- eine
 * erfundene Zahl, die als Messung auftrat. Sie ist jetzt `null`, das Gefäß
 * bleibt leer, und die Beschriftung sagt "nicht gefahren".
 *
 * DIE RUHEWOCHE WIRD NICHT MEHR GERATEN. `isRestWeek` erkannte Erholung an
 * einem Einbruch von >= 12 % gegen die Nachbarn; eine harte Woche zwischen zwei
 * härteren bekam dasselbe Etikett. Der Plan kennt seine Phasen selbst, und sie
 * stehen zwei Zeilen tiefer als Label. Ein kurzes Gefäß zeigt den Taper ohne
 * Vermutung.
 */
export type WeekKind = 'done' | 'planned' | 'current'
export interface WeekBar {
  idx: number
  /** Die geplante Wochenlast in TSS. Höhe des Gefäßes. */
  planned: number
  /** Die gefahrene Last, oder `null` für "nicht gefahren". Nie ein Ersatzwert. */
  actual: number | null
  /** `actual / planned`, gedeckelt bei 1 — die Füllhöhe. `null` ohne Fahrt. */
  fill: number | null
  /** Über dem Ziel. Das Gefäß läuft über, statt höher zu werden. */
  over: boolean
  kind: WeekKind
}

export function buildWeeklyBars(
  targets: number[] | null,
  currentIdx: number,
  actualByWeek: (number | null)[],
): WeekBar[] {
  if (!targets || targets.length === 0) return []
  return targets.map((t, i) => {
    const planned = Math.round(t)
    const raw = actualByWeek[i]
    // Streng auf Zahlen geprüft: etwas, das sich zufällig in ein Float wandeln
    // lässt, darf hier keine Messung werden.
    const actual = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : null
    const kind: WeekKind = i === currentIdx ? 'current' : i < currentIdx ? 'done' : 'planned'
    const fill = actual == null || planned <= 0 ? null : Math.min(1, actual / planned)
    return { idx: i + 1, planned, actual, fill, over: actual != null && planned > 0 && actual > planned, kind }
  })
}

