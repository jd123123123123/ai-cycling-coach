import W3WeekReviewView, { type W3WeekReviewVm } from './W3WeekReviewView'

/**
 * TEMP preview — `/e/w3-week-review-preview` (unguarded). A LAYOUT fixture for
 * the WOCHENRÜCKBLICK so the composition can be judged without a logged-in
 * athlete who happens to have a finished week behind them.
 *
 * Everything below is invented and exists ONLY on this route. The live page
 * (`W3WeekReviewPage`) builds the identical view-model from `/analytics/
 * weekly-recap`, `/weeks/current`, the PMC series and the RideCoin ledger, and
 * renders "—" wherever the athlete's data can't back a figure.
 */
export const WEEK_REVIEW_FIXTURE: W3WeekReviewVm = {
  rangeLabel: '10. Aug – 16. Aug',
  weekTag: 'KW 33',
  tone: 'strong',
  celebrate: true,
  kicker: 'LETZTE WOCHE',
  title: 'Woche',
  titleAccent: 'geliefert.',
  tssDone: 412,
  complianceLabel: '412 VON 430 TSS GEPLANT',
  compliancePct: 96,
  verdict: 'Genau im Korridor. Genau so entsteht Form.',
  stats: [
    { icon: 'rides', label: 'FAHRTEN', value: '5', unit: '' },
    { icon: 'timer', label: 'SATTELZEIT', value: '9:20', unit: 'h' },
    { icon: 'route', label: 'DISTANZ', value: '268', unit: 'km' },
    { icon: 'climb', label: 'HÖHENMETER', value: '3.140', unit: 'm' },
  ],
  days: [
    { letter: 'Mo', num: '10', pct: 0, label: '0', peak: false },
    { letter: 'Di', num: '11', pct: 46, label: '58', peak: false },
    { letter: 'Mi', num: '12', pct: 62, label: '78', peak: false },
    { letter: 'Do', num: '13', pct: 0, label: '0', peak: false },
    { letter: 'Fr', num: '14', pct: 52, label: '65', peak: false },
    { letter: 'Sa', num: '15', pct: 100, label: '126', peak: true },
    { letter: 'So', num: '16', pct: 68, label: '85', peak: false },
  ],
  deltas: [
    { label: 'TSS', value: '+64', dir: 'up' },
    { label: 'DISTANZ', value: '+41 km', dir: 'up' },
    { label: 'ZEIT', value: '−0:20 h', dir: 'down' },
  ],
  tiles: [
    { key: 'elev', label: 'HÖHENMETER', value: '3.140 m', caption: '≈ 0,4× Mount Everest' },
    { key: 'longest', label: 'LÄNGSTE FAHRT', value: '92 km', caption: 'deine weiteste Fahrt der Woche' },
    { key: 'days', label: 'AKTIVE TAGE', value: '5 / 7', caption: 'der Rhythmus trägt' },
    { key: 'coins', label: 'RIDECOIN', value: '+512', caption: 'letzte Woche aufs Konto gebucht' },
  ],
  moment: {
    badge: 'DURCHBRUCH',
    title: 'Neue 20-Minuten-Bestleistung',
    detail: '284 W über 20 Minuten am Samstag — 4 % über deinem bisherigen Bestwert der letzten 90 Tage.',
  },
  fitness: {
    delta: '+3,4',
    dir: 'up',
    now: 'CTL 62',
    note: 'Deine Grundfitness ist letzte Woche gewachsen. Genau dafür fährst du.',
  },
  nextBlock: 'Spezifischer Block · Woche 2 von 4',
  nextTitle: 'Jetzt wird es',
  nextAccent: 'spezifisch.',
  nextTss: 448,
  nextTssNote: 'geplant für Mo – So · Spezifischer Block',
  rampFrom: 430,
  rampFromLabel: 'letzte Woche geplant',
  preface: 'Zweite Woche im spezifischen Block: weniger Umfang als zuletzt, dafür zwei harte Einheiten an der Schwelle.',
  evidence: [
    { key: 'block', label: 'BLOCK', value: 'Spezifischer Block', note: 'Die gesammelte Grundlage wird scharf gestellt — weniger Umfang, mehr Qualität.' },
    { key: 'ctl', label: 'FITNESS-ANKER', value: 'CTL 62', note: 'Das Wochenbudget wird von deiner Fitness aus gerechnet — je höher CTL, desto mehr TSS trägt eine Woche wirklich.' },
    { key: 'ramp', label: 'RAMPE', value: '+4 %', note: 'Gegenüber letzte Woche geplant. Mehr als 8 % pro Woche lässt der Plan nicht zu — das ist die Friel-Grenze gegen zu schnelles Aufbauen.' },
    { key: 'hours', label: 'ZEITBUDGET', value: '12 h', note: 'Du hast 12 h pro Woche angegeben. Der Plan startet bei 9 h und wächst mit deiner Fitness dorthin — sonst wäre der Sprung zu groß.' },
    { key: 'event', label: 'ZIEL', value: '7 Wochen', note: 'Bis Ötztaler Radmarathon sind es noch 48 Tage. Danach richtet sich, wie hart diese Woche sein darf.' },
  ],
  planDays: [
    { letter: 'Mo', title: 'Ruhetag', tss: '—', rest: true },
    { letter: 'Di', title: 'Schwelle 2×20', tss: '92 TSS', rest: false },
    { letter: 'Mi', title: 'Grundlage 90', tss: '68 TSS', rest: false },
    { letter: 'Do', title: 'Ruhetag', tss: '—', rest: true },
    { letter: 'Fr', title: 'VO2max 5×4', tss: '86 TSS', rest: false },
    { letter: 'Sa', title: 'Lange Ausfahrt', tss: '138 TSS', rest: false },
    { letter: 'So', title: 'Regeneration 60', tss: '38 TSS', rest: false },
  ],
  planDaysLabel: 'DER PLAN',
}

export default function W3WeekReviewPreview() {
  return <W3WeekReviewView vm={WEEK_REVIEW_FIXTURE} />
}
