import { useMemo, useState, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Flag } from 'lucide-react'
import { usePMC } from '../../hooks/usePMC'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { useGoalTrajectory } from '../../hooks/useGoalTrajectory'
import { parseISO, fmtDEShort, DE_MONTHS_SHORT } from './w3plan'
import { T, FONT, EASE, Kicker, DASH } from './w3tokens'
import { S, lux, hairline, TNUM } from './w3surfaces'

/**
 * W3 · Today "Dein aktueller Status" — where the rider's fitness actually
 * stands, and what that number MEANS.
 *
 * It replaced the mirrored fitness/fatigue bar pair (`MirrorChart`), which drew
 * 42 bars with no axis, no dates and no reading: a CTL of 62 said nothing.
 * Every element here turns a raw training-load number into something a rider
 * can act on, and every one of them is real:
 *
 *   • CTL / ATL / TSB + the 90-day series — GET /training-load/pmc (`usePMC`).
 *     The chart is that series, on a zero-based axis, with real month ticks,
 *     a dashed reference line at the window's own peak CTL, and today as the
 *     emphasised endpoint. Drag across it to read any day.
 *   • "Bestwert" / "so fit wie zuletzt am …" — derived from the SAME series by
 *     scanning backwards for the last day that was at least as fit as today.
 *     Window-bounded, and the copy says so ("der letzten 90 Tage").
 *   • the 28-day and 7-day CTL moves — the same series, differenced.
 *   • the form band + its sentence — the rider's real TSB read against the
 *     standard Coggan freshness bands. An interpretation of a real number,
 *     never a number of its own.
 *   • the projection — GET /coach/trajectory (server-side forward simulation
 *     over the materialised plan: `ctl_projected_at_goal`, `on_track`,
 *     `weekly_tss_required/actual`), else /weeks/current →
 *     `meso_block.progression` for a rider with no target event.
 *
 * Nothing is invented. No percentiles, no peer comparisons, no "top 10 %".
 * Where the wire is empty the block is omitted rather than padded, and the
 * whole card degrades to an honest "—" when there is no PMC at all.
 */

// Transparent: a band that paints `T.bg` cuts off the ground the hero hands
// down the page. See `w3tokens.band`.
const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', padding: `0 20px ${padBottom}px`, fontFamily: FONT })
const ellipsis = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const num = (n: number, digits = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${num(Math.abs(n), digits)}`

// ── Form (TSB) bands ────────────────────────────────────────────────────────
// The standard Coggan freshness reading of a real TSB. These are labels on the
// rider's own number — the number itself is never adjusted to fit a band.
interface FormBand { from: number; to: number; label: string; hue: string; meaning: string }
const FORM_BANDS: FormBand[] = [
  { from: -60, to: -30, label: 'Hohe Last', hue: T.warn, meaning: 'Deine Ermüdung liegt klar über deiner Fitness. In einem harten Block ist das normal — Schlaf und die nächste Entlastung entscheiden, ob daraus Form wird.' },
  { from: -30, to: -10, label: 'Produktiver Aufbau', hue: T.acid, meaning: 'Der Bereich, in dem Fitness entsteht: du trägst mehr Ermüdung, als dein Schnitt gewohnt ist — und wächst genau daran.' },
  { from: -10, to: 5, label: 'Ausgeglichen', hue: T.mid, meaning: 'Fitness und Ermüdung halten sich die Waage. Das hält dein Niveau, es baut es nicht aus.' },
  { from: 5, to: 20, label: 'Frisch', hue: T.cool, meaning: 'Du bist erholt — der beste Bereich für harte Einheiten, Tests und Wettkämpfe.' },
  { from: 20, to: 45, label: 'Sehr frisch', hue: T.mid, meaning: 'Sehr erholt. Für einen Renntag ideal; hält es über Wochen an, rutscht deine Fitness langsam ab.' },
]
const FORM_MIN = -45
const FORM_MAX = 30
const bandFor = (tsb: number): FormBand => FORM_BANDS.find((b) => tsb >= b.from && tsb < b.to) ?? (tsb < -30 ? FORM_BANDS[0] : FORM_BANDS[FORM_BANDS.length - 1])

// ── The chart ───────────────────────────────────────────────────────────────
const CW = 300 // viewBox units; strokes stay 1:1 via vectorEffect
const CH = 124

interface Pt { i: number; date: Date; ctl: number; atl: number; tsb: number }

function LoadChart({ pts, peak, peakIdx, cur, showPeak, onScrub }: {
  pts: Pt[]; peak: number; peakIdx: number; cur: number; showPeak: boolean; onScrub: (i: number | null) => void
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const n = pts.length
  const top = Math.max(peak, ...pts.map((p) => p.atl)) * 1.12 || 1
  const x = (i: number) => (n <= 1 ? CW / 2 : (i / (n - 1)) * CW)
  const y = (v: number) => CH - (v / top) * CH

  const line = (key: 'ctl' | 'atl') => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  const area = `${line('ctl')} L${x(n - 1).toFixed(1)},${CH} L${x(0).toFixed(1)},${CH} Z`

  // Month ticks from the REAL dates — the first day of each month in view.
  const ticks = pts
    .map((p, i) => ({ i, d: p.date }))
    .filter(({ i, d }) => i > 0 && d.getMonth() !== pts[i - 1].date.getMonth())

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || r.width <= 0) return
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    onScrub(Math.round(f * (n - 1)))
  }

  const c = pts[cur]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', minWidth: 0 }}>
      <div
        ref={ref}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons > 0) pick(e.clientX) }}
        onPointerUp={() => onScrub(null)}
        onPointerCancel={() => onScrub(null)}
        style={{ width: '100%', minWidth: 0, touchAction: 'pan-y', cursor: 'crosshair' }}
      >
        <svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="w3ctlFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.acid} stopOpacity={0.38} />
              <stop offset="62%" stopColor={T.acid} stopOpacity={0.10} />
              <stop offset="100%" stopColor={T.acid} stopOpacity={0} />
            </linearGradient>
            {/* The fitness line glows; fatigue does not. One hero, one voice. */}
            <filter id="w3ctlGlow" x="-8%" y="-40%" width="116%" height="180%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Baseline (0) and the window's own peak — the only two rules drawn. */}
          <line x1={0} y1={CH} x2={CW} y2={CH} stroke={T.rule} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {/* Drawn only when the peak is somewhere BEHIND the rider. Standing on
              your own best, the line runs through today's dot and reads as a
              decorative rule — exactly the kind of gridline this chart avoids. */}
          {showPeak && (
            <line x1={0} y1={y(peak)} x2={CW} y2={y(peak)} stroke={T.d2} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          )}

          <motion.path d={area} fill="url(#w3ctlFill)"
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 }} />
          {/* The two ANIMATED paths deliberately omit vectorEffect. `pathLength`
              is a stroke-dash offset in user units; with
              preserveAspectRatio="none" a non-scaling stroke measures its dash
              in unstretched space, so the drawn line stops short of its own
              endpoint by the stretch factor. Letting the stroke scale keeps the
              dash and the render in one space — the 3% width distortion at
              300→310px is invisible, a line that misses its endpoint is not.
              The static reference lines above keep their crisp 1px. */}
          {/* No strokeDasharray here: motion implements `pathLength` AS a dash
              offset, so an explicit dash pattern on the same element fights it
              and the line renders in fragments. Fatigue is separated from
              fitness by weight and opacity instead. */}
          <motion.path d={line('atl')} fill="none" stroke={T.cool} strokeOpacity={0.65} strokeWidth={1.25} strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.85, ease: EASE, delay: 0.15 }} />
          <motion.path d={line('ctl')} fill="none" stroke={T.acid} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" filter="url(#w3ctlGlow)"
            initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />

          {/* Peak marker — only when it isn't today (today already has the dot). */}
          {peakIdx < n - 1 && (
            <circle cx={x(peakIdx)} cy={y(pts[peakIdx].ctl)} r={2.6} fill={T.bg} stroke={T.d3} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          )}

          {/* Scrub readout line */}
          {cur < n - 1 && (
            <line x1={x(cur)} y1={0} x2={x(cur)} y2={CH} stroke={T.d3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          <circle cx={x(cur)} cy={y(c.ctl)} r={4} fill={T.acid} style={{ filter: `drop-shadow(0 0 6px ${T.acid})` }} />
          <circle cx={x(cur)} cy={y(c.atl)} r={2.6} fill={T.cool} />
        </svg>
      </div>

      {/* Real x-axis: month labels at their real positions, ends anchored. */}
      <div style={{ position: 'relative', height: 12, width: '100%' }}>
        <span style={{ position: 'absolute', left: 0, fontSize: 9, fontWeight: 600, color: T.quiet }}>{DE_MONTHS_SHORT[pts[0].date.getMonth()]}</span>
        {ticks.map((t) => (
          <span key={t.i} style={{ position: 'absolute', left: `${(t.i / (n - 1)) * 100}%`, transform: 'translateX(-50%)', fontSize: 9, fontWeight: 600, color: T.quiet }}>
            {DE_MONTHS_SHORT[t.d.getMonth()]}
          </span>
        ))}
        <span style={{ position: 'absolute', right: 0, fontSize: 9, fontWeight: 700, color: T.mid }}>heute</span>
      </div>
    </div>
  )
}

// ── The card ────────────────────────────────────────────────────────────────
export default function W3TodayStatus() {
  const reduce = useReducedMotion()
  const { data: pmc } = usePMC(90)
  const { data: week } = useCurrentWeek(0)
  const { data: traj } = useGoalTrajectory()
  const [hov, setHov] = useState<number | null>(null)

  const pts = useMemo<Pt[]>(
    () => (pmc?.entries ?? []).map((e, i) => ({ i, date: parseISO(e.date), ctl: e.ctl, atl: e.atl, tsb: e.tsb })),
    [pmc],
  )

  const meso = week?.meso_block ?? null

  // ── Section head ──────────────────────────────────────────────────────────
  const n = pts.length
  const last = n > 0 ? pts[n - 1] : null

  // No PMC on the wire at all → the honest empty card, no invented shape.
  if (!last) {
    return (
      <div style={{ ...band(26), gap: 14 }}>
        <Head tag={null} />
        <div style={{ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker>Wo du stehst</Kicker>
          <span style={{ fontSize: 26, fontWeight: 700, color: T.quiet }}>{DASH}</span>
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
            Deine Fitnesskurve entsteht aus geloggten Fahrten. Sobald die ersten Einheiten drin sind, steht hier dein Verlauf.
          </span>
        </div>
      </div>
    )
  }

  const ctlNow = Math.round(last.ctl)
  const atlNow = Math.round(last.atl)
  const tsbNow = Math.round(last.tsb)
  const fb = bandFor(last.tsb)

  // Peak of the loaded window (and where it sat) — a real reference line.
  let peakIdx = 0
  for (let i = 1; i < n; i++) if (pts[i].ctl > pts[peakIdx].ctl) peakIdx = i
  const peak = pts[peakIdx].ctl
  // A "Bestwert" has to be earned against a real history. A rider four weeks
  // into their first block is at their 90-day high every single morning by
  // construction — the badge would fire forever and mean nothing. Below a
  // month of actual training the meaning line falls through to the 4-week
  // move instead, which is both truer and more useful to them.
  const MIN_HISTORY_DAYS = 28
  const trainedDays = pts.reduce((s, p) => s + (p.ctl > 0 ? 1 : 0), 0)
  const atPeak = last.ctl >= peak - 0.5 && trainedDays >= MIN_HISTORY_DAYS

  /** CTL `d` days ago (nearest stored day), or null when the window is shorter. */
  const ctlDaysAgo = (d: number): number | null => {
    const t = last.date.getTime() - d * 86_400_000
    let best: Pt | null = null
    for (const p of pts) if (p.date.getTime() <= t && (best == null || p.date > best.date)) best = p
    return best && last.date.getTime() - best.date.getTime() >= (d - 3) * 86_400_000 ? best.ctl : null
  }
  const c28 = ctlDaysAgo(28)
  const c7 = ctlDaysAgo(7)
  const d28 = c28 != null ? last.ctl - c28 : null
  const d7 = c7 != null ? last.ctl - c7 : null

  // The last day that was at least as fit as today — "so fit wie zuletzt am …".
  let sinceIdx: number | null = null
  for (let i = n - 2; i >= 0; i--) { if (pts[i].ctl >= last.ctl) { sinceIdx = i; break } }
  const daysSince = sinceIdx != null ? Math.round((last.date.getTime() - pts[sinceIdx].date.getTime()) / 86_400_000) : null

  // The one sentence that makes CTL mean something. Earned, never celebratory
  // about a week that went backwards: a falling curve inside a recovery block
  // is named as the plan working, not as a loss.
  const recovering = meso?.block_position === 'recovery'
  const meaning: string = atPeak
    ? `Höchster Fitnessstand der letzten ${n} Tage.`
    : daysSince != null && daysSince >= 14
      ? `So fit wie zuletzt am ${fmtDEShort(pts[sinceIdx!].date)}.`
      : d28 != null && d28 >= 2
        ? `${signed(Math.round(d28))} CTL in vier Wochen — der Aufbau greift.`
        : d28 != null && d28 <= -2
          ? recovering
            ? `${signed(Math.round(d28))} CTL in vier Wochen — genau das, was die Entlastungswoche machen soll.`
            : `${signed(Math.round(d28))} CTL in vier Wochen. Weniger Last als im Vormonat.`
          : `Stabil auf CTL ${ctlNow} — du hältst dein Niveau.`

  // Clamped: a scrub index survives in state across a PMC refetch, and a
  // shorter series would otherwise index past the end and crash the card.
  const cur = Math.max(0, Math.min(n - 1, hov ?? n - 1))
  const cp = pts[cur]

  // ── The projection: where this leads ──────────────────────────────────────
  // Priority 1 — the server's own forward simulation over the materialised plan
  // (goal_trajectory.py). Priority 2 — the no-event progression horizon the
  // mesocycle generator wrote. Neither on the wire → the row is omitted.
  const evWeeks = traj?.days_to_goal != null ? Math.round(traj.days_to_goal / 7) : null
  const trajOk = traj != null
    && traj.event_name != null
    && traj.ctl_projected_at_goal != null
    && traj.days_to_goal != null && traj.days_to_goal > 6
    && traj.projection_basis !== 'insufficient_data'
  const prog = meso?.progression ?? null
  const progOk = !trajOk && prog != null && prog.horizon_weeks > 0 && prog.target_ctl > 0

  const ON_TRACK: Record<string, { text: string; hue: string }> = {
    ahead: { text: 'VORAUS', hue: T.acid },
    on_track: { text: 'AUF KURS', hue: T.acid },
    behind: { text: 'NOCH LÜCKE', hue: T.warn },
  }
  const track = trajOk && traj ? ON_TRACK[traj.on_track] ?? null : null

  const projTo = trajOk && traj ? Math.round(traj.ctl_projected_at_goal!) : progOk && prog ? Math.round(prog.target_ctl) : null
  const projWeeks = trajOk ? evWeeks : progOk && prog ? prog.horizon_weeks : null
  const projWhere = trajOk && traj ? traj.event_name : progOk ? 'Ohne Zielevent — dein Aufbau-Horizont' : null

  // Head tag: the form band, which is the section's actual verdict.
  const tag = `FORM ${signed(tsbNow)}`

  return (
    <div style={{ ...band(26), gap: 14 }}>
      <Head tag={tag} />

      <div style={{ ...lux(26), padding: S.xl, gap: S.xl, minWidth: 0 }}>

        {/* ── Headline: the number, and what it means ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.md, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs, minWidth: 0, flex: 1 }}>
            <Kicker>Fitness · CTL</Kicker>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm, minWidth: 0 }}>
              <span style={{ ...TNUM, fontSize: 52, fontWeight: 700, letterSpacing: -2.4, lineHeight: 0.92, color: atPeak ? T.acid : T.ink, textShadow: atPeak ? `0 0 28px ${T.acid}4D` : 'none' }}>{ctlNow}</span>
              {d28 != null && (
                <span style={{ ...TNUM, fontSize: 13, fontWeight: 700, color: d28 >= 0 ? T.acid : T.mid, flex: 'none' }}>
                  {signed(Math.round(d28))} <span style={{ color: T.quiet, fontWeight: 600 }}>/ 4 Wo.</span>
                </span>
              )}
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid, minWidth: 0, paddingTop: 2 }}>{meaning}</span>
          </div>
          {atPeak && (
            <span style={{ flex: 'none', padding: '6px 12px', borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}2E`, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.acid }}>BESTWERT</span>
          )}
        </div>

        {/* ── The 90-day curve. Drag to read any day. ── */}
        <LoadChart pts={pts} peak={peak} peakIdx={peakIdx} cur={cur} showPeak={!atPeak} onScrub={setHov} />

        {/* ── Readout: today, or the scrubbed day ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ ...ellipsis, flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.quiet }}>
            {cur === n - 1 ? 'Heute' : fmtDEShort(cp.date)}
          </span>
          <Legend hue={T.acid} label="Fitness" value={String(Math.round(cp.ctl))} />
          <Legend hue={T.cool} label="Ermüdung" value={String(Math.round(cp.atl))} />
          <Legend hue={T.mid} label="Form" value={signed(Math.round(cp.tsb))} />
        </div>

        <div style={hairline(-S.xs)} />

        {/* ── Form: the real TSB on a named scale, with the band's meaning ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet, flex: 'none' }}>Form · TSB</span>
            {/* The band's colour lives in the gauge below, not in this label —
                otherwise "Produktiver Aufbau" shouts as loudly as the CTL
                headline and the screen has two competing focal points. Amber
                is the one exception: a band that asks for attention says so. */}
            <span style={{ ...ellipsis, flex: 1, fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: fb.hue === T.warn ? T.warn : T.ink, textAlign: 'right' }}>{fb.label} · {signed(tsbNow)}</span>
          </div>

          {/* The scale: five real bands as separate capsules, the rider's own
              band lit, and a needle standing ON the track rather than floating
              over it. Each segment keeps its own rounded ends so the gauge
              reads as a set of named zones, not one bar with a stripe. */}
          <div style={{ position: 'relative', width: '100%', height: 8, marginTop: 2 }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 3 }}>
              {FORM_BANDS.map((b) => {
                const w = ((Math.min(b.to, FORM_MAX) - Math.max(b.from, FORM_MIN)) / (FORM_MAX - FORM_MIN)) * 100
                const on = b.label === fb.label
                return (
                  <div key={b.label} style={{
                    width: `${Math.max(0, w)}%`, borderRadius: 100,
                    background: on ? b.hue : '#FFFFFF14',
                    opacity: on ? 0.55 : 1,
                    boxShadow: on ? `0 0 12px ${b.hue}59` : 'none',
                  }} />
                )
              })}
            </div>
            <motion.div
              initial={reduce ? false : { opacity: 0, scaleY: 0.4 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
              style={{
                position: 'absolute', top: -4, height: 16, width: 3, borderRadius: 100, background: fb.hue,
                left: `${((Math.min(FORM_MAX, Math.max(FORM_MIN, last.tsb)) - FORM_MIN) / (FORM_MAX - FORM_MIN)) * 100}%`,
                transform: 'translateX(-50%)', boxShadow: `0 0 10px ${fb.hue}, 0 0 0 3px ${T.bg}`,
              }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
            <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.2, color: T.quiet }}>−45 · müde</span>
            <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.2, color: T.quiet }}>0</span>
            <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.2, color: T.quiet }}>+30 · frisch</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid, minWidth: 0 }}>{fb.meaning}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet, minWidth: 0 }}>
            {ctlNow} Fitness − {atlNow} Ermüdung = {signed(tsbNow)} Form
            {d7 != null ? ` · ${signed(Math.round(d7))} CTL in 7 Tagen` : ''}
          </span>
        </div>

        {/* ── Where this leads: the server's own forward simulation ── */}
        {projTo != null && projWeeks != null && projWeeks > 0 && (
          <>
            <div style={hairline(-S.xs)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, minWidth: 0 }}>
                <Flag size={12} color={T.quiet} style={{ flex: 'none' }} />
                <span style={{ ...ellipsis, flex: 1, fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>
                  {projWhere ?? 'Wohin das führt'}
                </span>
                {track && (
                  <span style={{ flex: 'none', padding: '4px 10px', borderRadius: 100, background: `${track.hue}1A`, border: `1px solid ${track.hue}2E`, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: track.hue }}>{track.text}</span>
                )}
              </div>
              {/* now → then, on its own tile so the projection reads as a
                  separate object from the measured present above it */}
              <div style={{ display: 'flex', alignItems: 'center', gap: S.md, minWidth: 0, background: '#FFFFFF08', borderRadius: 16, padding: '13px 14px' }}>
                <Step label="heute" value={String(ctlNow)} dim />
                <ArrowRight size={15} color={T.d2} style={{ flex: 'none' }} />
                <Step label={`in ${projWeeks} ${projWeeks === 1 ? 'Woche' : 'Wochen'}`} value={String(projTo)} />
                {trajOk && traj?.ctl_target != null && (
                  <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
                    <span style={{ ...TNUM, fontSize: 13, fontWeight: 700, color: T.mid }}>{Math.round(traj.ctl_target)}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>ZIELWERT</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.5, color: T.quiet, minWidth: 0 }}>
                {trajOk && traj
                  ? traj.weekly_tss_required != null && traj.weekly_tss_actual != null
                    ? `Hochgerechnet aus deinem geplanten Training. Dafür braucht es ${num(Math.round(traj.weekly_tss_required))} TSS pro Woche — aktuell fährst du ${num(Math.round(traj.weekly_tss_actual))}.`
                    : 'Hochgerechnet aus deinem bereits geplanten Training bis zum Zieltermin.'
                  : `Ohne Zielevent baut der Plan über ${projWeeks} Wochen von CTL ${prog ? Math.round(prog.start_ctl) : DASH} auf CTL ${projTo} auf.`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** The section head. Its pill is deliberately NOT acid: the form value it
 *  carries is stated again — with its band and its arithmetic — inside the
 *  card, so shouting it here would spend the screen's one loud slot on a
 *  duplicate. The acid in this section belongs to the CTL headline + curve. */
function Head({ tag }: { tag: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Dein aktueller Status</span>
        <span style={{ ...ellipsis, fontSize: 10.5, fontWeight: 600, color: T.quiet }}>Erarbeitet, nicht gekauft</span>
      </div>
      {tag && (
        <div style={{ flex: 'none', padding: '7px 13px', borderRadius: 100, background: T.surface2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.mid }}>{tag}</span>
        </div>
      )}
    </div>
  )
}

function Legend({ hue, label, value }: { hue: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
      <span style={{ width: 5, height: 5, borderRadius: 100, background: hue, flex: 'none', boxShadow: `0 0 6px ${hue}80` }} />
      <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ ...TNUM, fontSize: 12.5, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{value}</span>
    </div>
  )
}

function Step({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none', minWidth: 0 }}>
      <span style={{ ...TNUM, fontSize: dim ? 21 : 28, fontWeight: 700, letterSpacing: dim ? -0.7 : -1.1, lineHeight: 1, color: dim ? T.mid : T.ink }}>{value}</span>
      <span style={{ ...ellipsis, fontSize: 8, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: T.quiet }}>{label}</span>
    </div>
  )
}
