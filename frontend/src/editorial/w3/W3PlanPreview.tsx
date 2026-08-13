import W3PlanView, { type W3PlanVm } from './W3PlanView'

/** TEMP preview harness — renders W3PlanView with a pen-faithful fixture, no
 *  backend. Route /e/w3-plan-preview is unguarded. Mirrors pen2 frame `i3tIj`
 *  (Harz Extrem Marathon). Remove before merge. */

const TARGETS = [380, 430, 470, 300, 500, 540, 580, 420, 560, 600, 520, 360]

const FIXTURE: W3PlanVm = {
  eventName: 'Harz Extrem Marathon',
  eventSub: 'So, 4. Oktober · Braunlage · 212 km · 3.900 hm',
  daysToStart: 53,
  weeksDaysLabel: '7 Wochen 4 Tage',
  planWeekLabel: 'Planwoche 5 von 12',
  phases: [
    { name: 'Grundlage', weeks: 'W1–3', active: false },
    { name: 'Aufbau', weeks: 'W4–7', active: true },
    { name: 'Spezifisch', weeks: 'W8–10', active: false },
    { name: 'Taper', weeks: 'W11–12', active: false },
  ],
  railProgress: 0.4,
  planWeekNum: 5,
  totalWeeks: 12,
  reqSummary: 'Strecke, Anforderungsprofil und Renntag',
  daysRight: '53 Tage',
  phaseOfTotal: 'Phase 2 von 4',
  block: {
    phase: 'Aufbau',
    dateRange: '11. Aug – 7. Sep',
    weekOfBlock: 'Woche 2 von 4',
    restNote: 'Woche 4 ist eine Ruhewoche',
    text: 'In diesem Block hebst du die Schwelle an, ohne das Grundlagenvolumen zu verlieren. Zwei harte Einheiten pro Woche, der Rest bleibt bewusst locker – die Anpassung passiert zwischen den Intervallen, nicht in ihnen.',
    tags: ['Schwelle', 'Z2-Volumen', 'Kraftausdauer'],
    next: 'Danach: Spezifisch ab 8. Sep – Renntempo am Berg',
  },
  avgTss: '507',
  weekBars: TARGETS.map((t, i) => ({
    idx: i + 1,
    tss: t,
    kind: i === 4 ? 'current' : i < 4 ? 'done' : (i === 3 || i === 7 || i === 11 ? 'rest' : 'planned'),
    isRest: i === 3 || i === 7 || i === 11,
  })),
  weekRangeLabel: 'Mo 11. – So 17. August · Woche 2 im Aufbau',
  weekBadge: '1 / 6',
  weekStats: [
    { value: '8:15 h', label: 'Zeit' },
    { value: '540', label: 'TSS' },
    { value: '6', label: 'Einheiten' },
    { value: '1.240', label: 'Höhenmeter' },
  ],
  dayStrip: [
    { letter: 'M', date: '11', frac: 40, isToday: false, isRest: false },
    { letter: 'D', date: '12', frac: 112, isToday: true, isRest: false },
    { letter: 'M', date: '13', frac: 55, isToday: false, isRest: false },
    { letter: 'D', date: '14', frac: 90, isToday: false, isRest: false },
    { letter: 'F', date: '15', frac: 0, isToday: false, isRest: true },
    { letter: 'S', date: '16', frac: 140, isToday: false, isRest: false },
    { letter: 'S', date: '17', frac: 70, isToday: false, isRest: false },
  ],
  sessionTitle: '4 × 8 Threshold',
  sessionDur: '1h 15m',
  targetW: '285 W',
  sessionTss: '112',
  ftpPct: '98%',
  ftpTag: 'FTP 292 W',
  sessionBars: [
    { w: 0.3, work: false }, { w: 0.42, work: false }, { w: 0.55, work: false },
    { w: 0.95, work: true }, { w: 0.24, work: false },
    { w: 0.96, work: true }, { w: 0.24, work: false },
    { w: 0.97, work: true }, { w: 0.24, work: false },
    { w: 0.98, work: true }, { w: 0.4, work: false },
  ],
  easierTss: '−15 TSS',
  harderTss: '+18 TSS',
  earnNote: 'Diese Einheit bringt 4.200 POWER · 12 CYCLE',
  forecastValue: '312 W',
  adaptExplainer:
    'Jede gefahrene Einheit, deine HRV und dein Schlaf fließen jede Nacht zurück in den Plan. Verpasste Tage werden nicht nachgeholt, sondern eingerechnet – der Block bleibt, die Dosis ändert sich. Nur Renntag und Phasenlängen sind fix.',
  adjustDays: [true, true, true, true, false, true, true],
  adjustHours: 8.25,
  adjustLongDay: 5,
  goalOptions: [
    { id: 'race', icon: 'flag', title: 'Rennen', meta: 'AKTIV', desc: 'Harz Extrem Marathon · 4. Okt · rückwärts vom Renntag geplant, mit Streckenprofil', state: 'active', real: true },
    { id: 'vo2', icon: 'gauge', title: 'VO2max-Block', meta: '12 Wochen · ausgewählt', desc: 'Zwei harte Einheiten pro Woche · Ziel +6 % an der Spitze', state: 'selected', real: false },
    { id: 'ftp', icon: 'trend', title: 'FTP-Block', meta: '8 Wochen', desc: 'Schwelle anheben, Volumen halten · Ziel 292 → 310 W', state: 'idle', real: false },
    { id: 'base', icon: 'base', title: 'Grundlage halten', meta: 'offen', desc: 'Kein Datum, nur Konstanz · 3–5 Einheiten pro Woche', state: 'idle', real: true },
  ],
}

export default function W3PlanPreview() {
  return (
    <W3PlanView
      vm={FIXTURE}
      onBack={() => history.back()}
      onGoal={() => { location.hash = '#/e/w3-goal-preview' }}
      onLoad={() => { location.hash = '#/e/w3-load-preview' }}
      onStartRide={() => { location.hash = '#/e/w3-session-preview' }}
      onAdapt={async () => ({ title: 'Sweet Spot 3×12', tss: 97, note: 'Angepasst – Sweet Spot 3×12', railsDowngraded: false })}
      onRebuild={async () => true}
      onSwitchGoal={async () => true}
    />
  )
}
