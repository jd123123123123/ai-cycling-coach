import W3BikerView, { type W3BikerVm } from './W3BikerView'

/**
 * TEMP preview — /e/w3-biker-preview, unguarded and backend-free.
 *
 * It renders the REAL screen (`W3BikerView`), not a lookalike built out of the
 * same parts: a preview that composes the page differently is exactly how the
 * live page drifted away from the design in the first place — the highlights
 * screen looked finished here for a day while `/e/w3-biker` still served the
 * old one. `?empty` shows the state that is easiest to get wrong: a rider with
 * no figurine and only two records, so the bento has to close up.
 */
export default function W3BikerPreview() {
  const empty = new URLSearchParams(window.location.search).has('empty')

  const vm: W3BikerVm = {
    rider: {
      avatarUrl: empty ? null : '/w3/example-rider.webp',
      handle: '@jannis',
      role: 'Funseeker',
      pills: empty ? [{ v: '—', l: 'KM' }, { v: '—', l: 'FAHRTEN' }] : [{ v: '12.480', l: 'KM' }, { v: '284', l: 'FAHRTEN' }],
      tier: { label: 'Level 7 · Funseeker', pct: empty ? 0 : 0.73, note: empty ? '' : '312 RC bis Level 8' },
      milestone: empty ? null : { pct: 0.5, label: 'Stufe', note: '1.200 RC bis PRESTIGE' },
      records: empty
        ? [
          { key: 'longest_ride_km', value: '84', unit: 'km', label: 'LÄNGSTE FAHRT', ride: 'Feierabendrunde', when: '2. Aug' },
          { key: 'hardest_ride_tss', value: '96', unit: 'TSS', label: 'HÄRTESTE FAHRT', ride: null, when: null },
        ]
        : [
          { key: 'longest_ride_km', value: '212,4', unit: 'km', label: 'LÄNGSTE FAHRT', ride: 'Harzrunde', when: '4. Mai' },
          { key: 'highest_climb_m', value: '2.140', unit: 'hm', label: 'HÖCHSTER ANSTIEG', ride: 'Brocken', when: '18. Juni' },
          { key: 'longest_time_s', value: '8:12', unit: 'Std.', label: 'LÄNGSTE ZEIT', ride: 'Havel-Schleife', when: '2. Juli' },
          { key: 'hardest_ride_tss', value: '341', unit: 'TSS', label: 'HÄRTESTE FAHRT', ride: 'Intervalle', when: '9. Aug' },
        ],
      badges: { unlocked: empty ? 1 : 14, total: 32, latest: empty ? null : 'Erster Jahrhunderter' },
    },
    coin: empty ? null : { balance: '4.820', note: 'aus echten Fahrten verdient' },
    referral: empty ? null : { code: 'LUCA-7F3', note: '2 aktiv · 1 abgeschlossen' },
    devices: [
      { name: 'Garmin', sub: empty ? 'Nicht verbunden' : 'Sync vor 2 h', icon: 'watch', on: !empty },
      { name: 'Wahoo', sub: 'Nicht verbunden', icon: 'zap', on: false },
    ],
  }

  // The handlers are passed (as no-ops) rather than omitted: without
  // `onCreateRider` the empty portrait renders without its one affordance, and
  // a preview that hides the action is previewing a dead end.
  return <W3BikerView
      season={[
        { label: 'Kilometer', value: '4.182', unit: 'km', note: '+18 % zum Vorjahr' },
        { label: 'Höhenmeter', value: '61.400', unit: 'hm', note: 'Ø 620 hm / Fahrt' },
        { label: 'FTP', value: '292', unit: 'W', note: '+11 W seit der ersten Messung' },
        { label: 'Fahrten', value: '134', note: 'Ø 4,1 pro Woche' },
      ]}
      curve={{
        value: 84, delta: 12,
        series: Array.from({ length: 84 }, (_, i) => 58 + i * 0.32 + Math.sin(i / 3) * 3.2),
        months: ['MRZ', 'APR', 'MAI', 'JUN', 'JUL'],
      }}
      onGarage={() => { /* preview: the button must be visible to be reviewed */ }}
      onCrew={() => { /* the crew door, so the tail can be reviewed whole */ }}
      // A preview that cannot reach a state certifies nothing about it — the
      // voice picker is a real control and has to be reviewable here.
      voice={{ value: 'kumpel', busy: false, onSet: () => {} }}
      bike={{ name: 'Canyon Ultimate CF SLX', imageUrl: '/w3/example-bike.webp', weightKg: 7.1, km: 4182, count: 3 }} vm={vm} onCreateRider={() => {}} onBadges={() => {}} onReferral={() => {}} onRecord={() => {}} />
}
