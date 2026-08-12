import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionModel } from '../data/useSessionModel'
import { isPresent } from '../data/value'
import W3SessionView, { type W3SessionVm, type W3Step, type W3ShapeBar } from './W3SessionView'

/**
 * W3 · 06 SESSION DETAIL, wired to live data. Route /e/w3-session(/:id).
 *
 * Real coaching data from `useSessionModel` → the vm (title, numeral, stats,
 * blocks, shape, routes). Honest "—" where a field is withheld. The physiology
 * cues ("How to ride it") and the reward tiles / record chance are FIXTURES
 * reproducing the pen — the physiology-target and reward-economy backends
 * aren't built (the reward layer is the `garage-composable-figures` spec).
 */

const fmtMin = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

export default function W3SessionPage() {
  const navigate = useNavigate()
  const model = useSessionModel()

  const vm = useMemo<W3SessionVm>(() => {
    const title = isPresent(model.title) ? model.title.value : 'Session'
    const num = isPresent(model.numeral) ? model.numeral.value : null
    const watts = isPresent(model.statWatts) ? model.statWatts.value : null
    const durMin = isPresent(model.statDurationMin) ? model.statDurationMin.value : null
    const tss = isPresent(model.statTss) ? model.statTss.value : null
    const inZone = isPresent(model.statInZoneMin) ? model.statInZoneMin.value : null
    const blocks = isPresent(model.blocks) ? model.blocks.value : []

    // shape bars + hero gauge from the real blocks
    const peakW = blocks.reduce((m, b) => Math.max(m, isPresent(b.watts) ? b.watts.value : 0), 0) || 1
    const shapeBars: W3ShapeBar[] = blocks.map((b) => {
      const w = isPresent(b.watts) ? b.watts.value : 0
      return { w: Math.max(0.18, w / (peakW * 1.05)), work: b.isMain }
    })
    const gauge: boolean[] = blocks.flatMap((b) => {
      const span = Math.max(1, Math.round((b.minutes / (durMin || 75)) * 20))
      return Array.from({ length: span }, () => b.isMain)
    }).slice(0, 20)
    while (gauge.length < 20) gauge.push(false)

    const steps: W3Step[] = blocks.map((b, i) => {
      const w = isPresent(b.watts) ? b.watts.value : null
      return {
        idx: String(i + 1).padStart(2, '0'),
        name: b.reps > 1 ? `${b.name}` : b.name,
        note: isPresent(b.note) ? b.note.value : '',
        watts: w != null ? `${w} W` : '—',
        dur: fmtMin(b.minutes),
        isMain: b.isMain,
        fill: w != null ? Math.min(1, w / peakW) : 0.3,
      }
    })

    return {
      navTitle: 'Today’s session',
      title,
      numeral: num ? num.text : '—',
      qualifier: num ? num.sub : '',
      thresholdW: watts != null ? `${watts} W` : '—',
      totalTime: durMin != null ? fmtMin(durMin) : '—',
      gauge,
      prescriptionClaim: isPresent(model.claim) ? model.claim.value : (isPresent(model.payoffClaim) ? model.payoffClaim.value : title),
      stats: [
        { v: durMin != null ? fmtMin(durMin) : '—', l: 'DURATION', s: inZone != null ? `${inZone} min in zone` : '' },
        { v: tss != null ? String(tss) : '—', l: 'LOAD · TSS', s: '' },
        { v: watts != null ? `${watts} W` : '—', l: 'TARGET', s: 'work interval' },
        { v: inZone != null ? `${inZone}` : '—', l: 'MIN IN ZONE', s: 'at or above threshold' },
      ],
      shapeBars: shapeBars.length ? shapeBars : [{ w: 0.3, work: false }, { w: 0.9, work: true }, { w: 0.3, work: false }],
      shapeFtpTag: watts != null ? `Target ${watts} W` : '',
      shapeLabels: ['WARM UP', num ? num.qualifier : 'MAIN SET', 'COOL'],
      stepsMeta: `${blocks.length || '—'} steps · ${durMin != null ? fmtMin(durMin) : '—'}`,
      steps: steps.length ? steps : [],

      // ── fixture: live physiology cues (no per-session target service yet) ──
      howToRide: [
        { label: 'HR AT MINUTE 3', value: '165 bpm', band: 'mid' },
        { label: 'WORDS PER BREATH', value: '3 – 4', band: 'mid' },
        { label: 'HR WHEN BLOCK 5 STARTS', value: '135 bpm', band: 'low' },
        { label: 'CADENCE', value: '91 rpm', band: 'mid' },
      ],

      route: isPresent(model.routes) && model.routes.value[0]
        ? (() => {
            const r = model.routes.value[0]
            return {
              name: r.name,
              lastRidden: `Ridden ${r.rideCount}×`,
              stats: [
                { v: durMin != null ? fmtMin(durMin) : '—', l: 'EXPECTED' },
                { v: `${Math.round(r.distanceKm)} km`, l: 'DISTANCE' },
                { v: isPresent(r.ascentM) ? `${Math.round(r.ascentM.value)} m` : '—', l: 'CLIMBING' },
                { v: `${r.rideCount}×`, l: 'RIDDEN' },
              ],
              notes: ['Matched to today’s blocks from your own rides.'],
              foot: 'Your recorded track for this route.',
            }
          })()
        : null,

      // ── fixture: reward economy ──
      unlocks: [
        { icon: 'zap', v: '112', l: 'RIDECOIN', s: 'Earned by this session’s TSS' },
        { icon: 'hexagon', v: '18/25', l: 'CARBON FRAME', s: 'Seven rides from unlocked' },
        { icon: 'flame', v: 'DAY 18', l: 'STREAK', s: 'Your longest run yet' },
        { icon: 'users', v: '#3', l: 'IN YOUR CLUB', s: 'Up two places this week' },
      ],
      record: { pct: 72, tag: '12-MIN BEST', label: 'chance you take the record today', why: 'Block 4 is eight minutes at your target. Your 12-minute best is close — hold the last block and the maths does the rest.' },
      sendTarget: 'Garmin Edge 840',
    }
  }, [model])

  return <W3SessionView vm={vm} onBack={() => navigate(-1)} />
}
