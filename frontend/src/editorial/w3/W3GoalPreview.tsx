import W3GoalView, { type W3GoalVm } from './W3GoalView'

/** TEMP preview harness — renders W3GoalView with a pen-faithful fixture, no
 *  backend. Route /e/w3-goal-preview is unguarded. Mirrors pen2 frame `l4QUjL`.
 *  Remove before merge. */

// 3 climb bumps over a rolling profile (52 bars).
const ELEV = Array.from({ length: 52 }, (_, i) => {
  const base = 0.3 + 0.12 * Math.sin(i / 4)
  const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(i - c) / w)
  const climb = bump(13, 4) + bump(30, 4) + bump(44, 3)
  return { h: Math.min(1, base + climb * 0.7), climb: climb > 0.45 }
})

const FIXTURE: W3GoalVm = {
  priorityChip: 'A-RENNEN',
  priorityLabel: 'Hauptziel der Saison',
  eventName: 'Harz Extrem Marathon',
  daysCol: '53',
  dateCol: { big: 'So, 4. Okt', sub: 'Start 07:30' },
  locCol: { big: 'Braunlage', sub: 'Harz, DE' },
  distHm: '212 km · 3.900 hm',
  hasRoute: true,
  elevBars: ELEV,
  elevLabels: ['0 km', '70', '212 km'],
  climbs: [
    { name: 'Sonnenberg', km: 'km 52', detail: '6,2 km · 7,4 %' },
    { name: 'Torfhaus', km: 'km 118', detail: '9,8 km · 5,1 %' },
    { name: 'Wurmberg', km: 'km 176', detail: '4,1 km · 9,2 %' },
  ],
  routeCta: null,
  gaps: [
    { label: 'Schwellenleistung', currentText: '292', targetText: '320 W', pct: 0.91, remainingText: 'noch 28 W · im Plan', onTrack: true },
    { label: 'Watt pro Kilo', currentText: '4,0', targetText: '4,4 W/kg', pct: 0.91, remainingText: 'noch 0,4 · im Plan', onTrack: true },
    { label: 'Längste Fahrt', currentText: '142', targetText: '212 km', pct: 0.67, remainingText: 'noch 70 km · hinter Plan', onTrack: false },
    { label: 'Höhenmeter / Woche', currentText: '1.240', targetText: '2.000 hm', pct: 0.62, remainingText: 'noch 760 hm · hinter Plan', onTrack: false },
    { label: 'Fahrten über 4 h', currentText: '6', targetText: '12', pct: 0.5, remainingText: 'noch 6 · hinter Plan', onTrack: false },
  ],
  infoNote: 'Die Zielwerte kommen aus den Streckendaten: 3.900 hm auf 212 km heißen rund 5 Stunden über 240 W am Berg.',
  editRows: [
    { id: 'day', icon: 'cal', label: 'Renntag', value: 'So, 4. Oktober', editable: true },
    { id: 'prio', icon: 'flag', label: 'Priorität', value: 'A-Rennen', editable: true },
    { id: 'dist', icon: 'dist', label: 'Distanz', value: '212 km', editable: false },
    { id: 'hm', icon: 'hm', label: 'Höhenmeter', value: '3.900 hm', editable: false },
    { id: 'time', icon: 'time', label: 'Zielzeit', value: '7:45 h', editable: false },
  ],
  eventDateISO: '2026-10-04',
  priority: 'A',
}

export default function W3GoalPreview() {
  return (
    <W3GoalView
      vm={FIXTURE}
      onBack={() => history.back()}
      onSwitch={() => { location.assign('/e/w3-plan-preview') }}
      onRemove={async () => true}
      onSave={async () => true}
      onRehearseRoute={() => {}}
    />
  )
}
