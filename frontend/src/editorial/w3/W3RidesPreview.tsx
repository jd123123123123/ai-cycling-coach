import W3RidesView, { type W3RidesVm } from './W3RidesView'

/** TEMP preview — pen-exact fixture, no backend. /e/w3-rides-preview is
 *  unguarded; remove before merge. Shows the full "Confirm your rides" concept
 *  including the (fixture) unconfirmed-claim mechanic the live page omits. */

const FIXTURE: W3RidesVm = {
  title: 'Confirm\nyour rides',
  subtitle: 'Pulled automatically from Strava, Garmin and Wahoo. Confirm to bank the training load and the reward.',
  monthStats: [
    { v: '14', l: 'RIDES · AUG' },
    { v: '11h 20m', l: 'TIME · AUG' },
    { v: '1,842', l: 'TSS · AUG' },
  ],
  unconfirmed: [
    { key: 'a', title: 'Threshold 4 × 8', source: 'Garmin', dur: '1:15', tss: '112 TSS', watts: '285 W', power: 112, cycle: 0 },
    { key: 'b', title: 'Endurance ride', source: 'Strava', dur: '2:04', tss: '96 TSS', watts: '198 W', power: 96, cycle: 0 },
    { key: 'c', title: 'Recovery spin', source: 'Wahoo', dur: '0:45', tss: '28 TSS', watts: '142 W', power: 28, cycle: 0 },
  ],
  historyLabel: 'CONFIRMED · AUGUST',
  history: [
    { day: '08', title: 'Sweet spot 3 × 15', tss: '98 TSS', power: '+98', fill: 0.64, rested: false },
    { day: '07', title: 'Rest day walk', tss: '—', power: '—', fill: 0.05, rested: true },
    { day: '06', title: 'Hill repeats', tss: '124 TSS', power: '+124', fill: 0.47, rested: false },
    { day: '04', title: 'Long endurance', tss: '150 TSS', power: '+150', fill: 0.58, rested: false },
    { day: '03', title: 'Openers', tss: '41 TSS', power: '+41', fill: 0.3, rested: false },
  ],
}

export default function W3RidesPreview() {
  return <W3RidesView vm={FIXTURE} />
}
