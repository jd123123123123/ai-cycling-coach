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
  return <W3BikerView vm={vm} onCreateRider={() => {}} onBadges={() => {}} onReferral={() => {}} onRecord={() => {}} />
}
