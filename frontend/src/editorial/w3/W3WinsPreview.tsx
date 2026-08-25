import W3WinsView, { type W3WinsVm } from './W3WinsView'

/**
 * Backend-free preview of the REAL screen — /e/w3-wins-preview, unguarded.
 *
 * A fixture, not a lookalike: it feeds `W3WinsView` the same view model the
 * live page builds, so the design flow can be reviewed without a session and
 * the preview cannot drift into a second design. Every value below has a real
 * counterpart in `/achievements/mine`, the wallet and the power curve.
 */

const FIXTURE: W3WinsVm = {
  micro: 'ERFOLGE',
  eyebrow: 'SAISON 2026 · AUGUST',
  headline: 'Nichts hier ist',
  headlineAccent: 'gekauft.',
  deck: 'Jedes Abzeichen wird gefahren. Erkannt aus deinen eigenen Fahrten — Datum, Wert und Rest inklusive.',

  ledger: [
    { key: 'badges', value: '12', unit: 'von 34', label: 'ABZEICHEN' },
    { key: 'active', value: '2', label: 'CHALLENGES LIVE' },
    { key: 'rc', value: '1.315', unit: 'RC', label: 'RIDECOIN' },
  ],

  latestChapter: 'ZULETZT VERDIENT',
  latestTitle: 'Dein letztes Abzeichen',
  latest: {
    icon: 'mountain',
    title: 'Erster Century',
    value: '133,1 km',
    detail: 'Deine längste Fahrt — und die erste über 100 km. Gefahren am Stück, ohne Pause über 20 Minuten.',
    dateLabel: '14. AUGUST',
    fresh: true,
  },
  latestEmpty: 'Deine erste gewertete Fahrt schaltet das erste Abzeichen frei. Es gibt keinen anderen Weg hinein.',
  cabinetValue: '12 von 34',
  cabinetLit: 12,
  cabinetTotal: 34,
  next: { label: 'Als Nächstes · 300 W FTP', value: 'noch 8 W' },

  badgesChapter: 'DIE VITRINE',
  badgesTitle: 'Abzeichen',
  badgesSub: 'Verdiente zuerst, dann die, die am nächsten dran sind',
  badges: [
    { key: 'century', icon: 'mountain', name: 'Erster Century', caption: '133,1 KM', earned: true, pct: null },
    { key: '10k', icon: 'medal', name: '10 000 Hm', caption: 'GESAMMELT', earned: true, pct: null },
    { key: 'dawn', icon: 'sunrise', name: 'Frühaufsteher', caption: '×14 FAHRTEN', earned: true, pct: null },
    { key: 'cat4', icon: 'flame', name: 'Cat 4 Anstieg', caption: 'CAT 4', earned: true, pct: null },
    { key: 'kj', icon: 'zap', name: '10 000 kJ Woche', caption: '10.240 KJ', earned: true, pct: null },
    { key: 'streak7', icon: 'bike', name: '7-Tage-Streak', caption: '7 TAGE', earned: true, pct: null },
    { key: 'ftp', icon: 'gauge', name: '300 W FTP', caption: 'NOCH 8 W', earned: false, pct: 0.97 },
    { key: 'streak', icon: 'flame', name: '30-Tage-Streak', caption: '17 VON 30', earned: false, pct: 0.57 },
    { key: 'everest', icon: 'mountain', name: 'Everesting', caption: 'NOCH 3.140 M', earned: false, pct: 0.65 },
  ],

  recordsChapter: 'DEINE REKORDE',
  recordsTitle: 'Persönliche Bestwerte',
  recordsSub: 'Aus deiner eigenen Leistungskurve. Der Balken zeigt jede Dauer als Anteil deiner Spitzenleistung — die Form deiner Kurve.',
  recordsEmpty: 'Noch keine Wattdaten. Eine einzige Fahrt mit Leistungsmessung reicht — dann steht deine Kurve hier.',
  records: [
    { key: '5s', label: '5 SEK', value: '1.240 W', wkg: '17,0 W/kg', frac: 1, pr: false },
    { key: '1m', label: '1 MIN', value: '620 W', wkg: '8,5 W/kg', frac: 0.5, pr: true },
    { key: '12m', label: '12 MIN', value: '288 W', wkg: '3,9 W/kg', frac: 0.232, pr: false },
    { key: '20m', label: '20 MIN', value: '276 W', wkg: '3,8 W/kg', frac: 0.223, pr: false },
  ],

  lifeChapter: 'ALLE ZEITEN',
  lifeTitle: 'Was zusammengekommen ist',
  lifeSub: 'Alles, was der Coach je von dir gewertet hat',
  life: [
    { key: 'km', value: '14.208', unit: 'km', label: 'GEFAHREN INSGESAMT' },
    { key: 'rides', value: '486', unit: '', label: 'FAHRTEN' },
    { key: 'hours', value: '612', unit: 'h', label: 'IM SATTEL' },
    { key: 'asc', value: '162.400', unit: 'hm', label: 'HÖHENMETER' },
    { key: 'kj', value: '1.980.400', unit: 'kJ', label: 'ARBEIT' },
  ],

  ctaLabel: 'OFFENE CHALLENGES',
  ctaCaption: '4 warten auf dich',
}

/** The cold-start shape, so the empty branches get looked at as often as the
 *  full one: /e/w3-wins-preview?empty. A rider on day one sees this. */
const EMPTY: W3WinsVm = {
  ...FIXTURE,
  ledger: [
    { key: 'badges', value: '0', unit: 'von 34', label: 'ABZEICHEN' },
    { key: 'active', value: '0', label: 'CHALLENGES LIVE' },
    { key: 'rc', value: '0', unit: 'RC', label: 'RIDECOIN' },
  ],
  latestTitle: 'Noch nichts verdient',
  latest: null,
  cabinetValue: '0 von 34',
  cabinetLit: 0,
  cabinetTotal: 34,
  next: null,
  badges: [],
  recordsSub: 'Aus deiner eigenen Leistungskurve, sobald es eine gibt.',
  records: FIXTURE.records.map((r) => ({ ...r, value: '—', wkg: null, frac: null, pr: false })),
  life: [],
  ctaCaption: '9 warten auf dich',
}

export default function W3WinsPreview() {
  const empty = typeof window !== 'undefined' && window.location.search.includes('empty')
  return <W3WinsView vm={empty ? EMPTY : FIXTURE} />
}
