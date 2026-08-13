import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionModel } from '../data/useSessionModel'
import { useTodaySession } from '../../hooks/useTodaySession'
import { useAdaptive } from '../../hooks/useAdaptive'
import { useStreak } from '../../hooks/useStreak'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { downloadWorkoutExport } from '../../api/coach'
import { isPresent } from '../data/value'
import { funName, powerProfile, effortGuide } from './w3session'
import W3SessionView, { type W3SessionVm, type W3Step, type W3ShapeBar, type W3EarnTile } from './W3SessionView'

/**
 * W3 · 06 SESSION DETAIL, wired to live data. Route /e/w3-session(/:id).
 *
 * Real coaching data comes from `useSessionModel` (title, numeral, stats,
 * blocks, shape, routes). When there is no fully-resolved workout, the page
 * falls back to the coach's daily decision `planned` (title / TSS / duration
 * are real; intensity is derived from TSS×duration; watts stay honest "—"
 * without an FTP anchor) — the SAME fallback `W3TodayPage` uses.
 *
 * The hero name is a characterful `funName` over the real prescribed title
 * (kept as the subtitle). "How to ride it" is the session's zone definition,
 * not a fabricated read-out. "What it earns" shows the REAL streak + TSS this
 * session banks; the one `fixture:` is the RideCoin conversion line, since the
 * reward economy isn't wired into this screen.
 *
 * Buttons: back, share (Web Share / clipboard), export the workout (.fit,
 * `downloadWorkoutExport` — the real export path), and back-to-today.
 */

const fmtMin = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

export default function W3SessionPage() {
  const navigate = useNavigate()
  const model = useSessionModel()
  const session = useTodaySession()
  const { data: adaptive } = useAdaptive()
  const { data: streak } = useStreak()
  // Season-to-date totals for the saddle-time + TSS earn tiles.
  const { data: seasonActs } = useActivitiesRange(new Date(new Date().getFullYear(), 0, 1), new Date())

  const vm = useMemo<W3SessionVm>(() => {
    const acts = seasonActs?.activities ?? []
    const seasonTss = acts.length ? Math.round(acts.reduce((s, a) => s + (a.tss ?? 0), 0)) : null
    const seasonSaddleMin = acts.length ? Math.round(acts.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 60) : null
    const workout = session.workout
    const planned = adaptive?.daily_decision?.planned ?? null

    // Real, resolved values from the session model.
    const modelTitle = isPresent(model.title) ? model.title.value : null
    const num = isPresent(model.numeral) ? model.numeral.value : null
    const watts = isPresent(model.statWatts) ? model.statWatts.value : null
    const durMin = isPresent(model.statDurationMin) ? model.statDurationMin.value : null
    const tss = isPresent(model.statTss) ? model.statTss.value : null
    const inZone = isPresent(model.statInZoneMin) ? model.statInZoneMin.value : null
    const blocks = isPresent(model.blocks) ? model.blocks.value : []

    // Fallback to the coach's daily decision when the model has no workout.
    const title = modelTitle ?? planned?.title ?? null
    const templateId = workout?.template_id ?? planned?.template_id ?? null
    const effDurMin = durMin ?? planned?.duration_minutes ?? null
    const effTss = tss ?? (planned?.target_tss != null ? Math.round(planned.target_tss) : null)
    const hasSession = title != null

    // Intensity factor (Coggan): from real TSS × duration, whichever source.
    const durHr = effDurMin != null ? effDurMin / 60 : null
    const iff = durHr != null && durHr > 0 && effTss != null ? Math.sqrt(effTss / (durHr * 100)) : null
    const ftpPct = iff != null ? `${Math.round(iff * 100)}%` : ''

    const hero = funName(templateId, iff, title)

    // Power-shape bars from the real blocks; a steady ride draws an honest
    // warm-up→body→cool envelope (via the helper) instead of one flat beam.
    const peakW = blocks.reduce((m, b) => Math.max(m, isPresent(b.watts) ? b.watts.value : 0), 0) || 1
    const rawBars: W3ShapeBar[] = blocks.map((b) => {
      const w = isPresent(b.watts) ? b.watts.value : 0
      return { w: Math.max(0.18, w / (peakW * 1.05)), work: b.isMain }
    })
    const shapeBars = powerProfile(rawBars, hasSession)

    // Hero gauge (20 segs), work tall/acid — from the real blocks' time share.
    const gauge: boolean[] = blocks.flatMap((b) => {
      const span = Math.max(1, Math.round((b.minutes / (effDurMin || 75)) * 20))
      return Array.from({ length: span }, () => b.isMain)
    }).slice(0, 20)
    while (gauge.length < 20) gauge.push(false)

    const steps: W3Step[] = blocks.map((b, i) => {
      const w = isPresent(b.watts) ? b.watts.value : null
      return {
        idx: String(i + 1).padStart(2, '0'),
        name: b.reps > 1 ? `${b.name} · ${b.reps}×` : b.name,
        note: isPresent(b.note) ? b.note.value : '',
        watts: w != null ? `${w} W` : '—',
        dur: fmtMin(b.minutes),
        isMain: b.isMain,
        fill: w != null ? Math.min(1, w / peakW) : 0.3,
      }
    })

    // What it earns — REAL: the streak this session extends + the TSS it banks.
    const streakDays = streak?.streak ?? null
    const earns: W3EarnTile[] = []
    if (streakDays != null) {
      earns.push({ icon: 'flame', v: `DAY ${streakDays + 1}`, l: 'STREAK', s: streakDays > 0 ? `Extends your ${streakDays}-day run` : 'Starts a new run' })
    }
    // TSS + saddle time as SEASON-to-date totals, with this ride's increase.
    if (seasonTss != null || effTss != null) {
      earns.push({
        icon: 'zap',
        v: seasonTss != null ? seasonTss.toLocaleString('en-US') : '—',
        l: 'SEASON TSS',
        s: effTss != null ? `+${effTss} this ride` : 'Season training load',
      })
    }
    if (seasonSaddleMin != null || (durHr != null && durHr > 0)) {
      const h = seasonSaddleMin != null ? Math.floor(seasonSaddleMin / 60) : null
      earns.push({
        icon: 'clock',
        v: h != null ? `${h}h` : '—',
        l: 'SADDLE · SEASON',
        s: effDurMin ? `+${fmtMin(effDurMin)} this ride` : 'Time on the bike this year',
      })
    }
    // fixture: RideCoin conversion — the reward economy (wallet/ledger) is not
    // wired into this screen, so no coin figure is shown; the note names the
    // real rule (RideCoin is awarded by a completed session's TSS on ingest).
    const earnNote = effTss != null
      ? 'Finishing this ride also awards RideCoin, scaled to its TSS.'
      : ''

    const prescriptionClaim = isPresent(model.claim)
      ? model.claim.value
      : (title ? `Today’s prescription: ${title}.` : 'No session is prescribed for today.')

    const shapeLabels: [string, string, string] = ['WARM UP', num ? (num.qualifier || 'MAIN SET') : 'STEADY', 'COOL']

    return {
      navTitle: 'Today’s session',
      funName: hero,
      title: title ?? 'Session',
      numeral: num ? num.text : '—',
      qualifier: num ? num.sub : '',
      thresholdW: watts != null ? `${watts} W` : '—',
      totalTime: effDurMin != null ? fmtMin(effDurMin) : '—',
      gauge,
      prescriptionClaim,
      stats: [
        { icon: 'clock', v: effDurMin != null ? fmtMin(effDurMin) : '—', l: 'DURATION', s: inZone != null ? `${inZone} min in zone` : '' },
        { icon: 'flame', v: effTss != null ? String(effTss) : '—', l: 'LOAD · TSS', s: ftpPct ? `${ftpPct} of FTP` : '' },
        { icon: 'zap', v: watts != null ? `${watts} W` : '—', l: 'TARGET', s: watts != null ? 'work interval' : 'no FTP anchor' },
        { icon: 'gauge', v: inZone != null ? `${inZone}` : '—', l: 'MIN IN ZONE', s: inZone != null ? 'at or above target' : '' },
      ],
      shapeBars,
      shapeFtpTag: watts != null ? `Target ${watts} W` : (ftpPct ? `${ftpPct} of FTP` : ''),
      shapeLabels,
      stepsMeta: steps.length > 0 ? `${blocks.length} steps · ${effDurMin != null ? fmtMin(effDurMin) : '—'}` : '',
      steps,

      // Honest zone-derived effort guide (replaces the old fabricated HR/cadence read-outs).
      effort: effortGuide(iff),

      route: isPresent(model.routes) && model.routes.value[0]
        ? (() => {
            const r = model.routes.value[0]
            return {
              name: r.name,
              lastRidden: `RIDDEN ${r.rideCount}×`,
              stats: [
                { v: `${Math.round(r.distanceKm)} km`, l: 'DISTANCE' },
                { v: isPresent(r.ascentM) ? `${Math.round(r.ascentM.value)} m` : '—', l: 'CLIMBING' },
                { v: effDurMin != null ? fmtMin(effDurMin) : '—', l: 'EXPECTED' },
                { v: `${r.rideCount}×`, l: 'RIDDEN' },
              ],
              notes: ['Matched to today’s blocks from your own rides.'],
              foot: 'Drawn from your recorded track for this route.',
            }
          })()
        : null,

      earns,
      earnNote,

      canExport: workout != null,
      primaryLabel: workout != null ? 'Export to your head unit' : 'Back to today',
    }
  }, [model, session.workout, adaptive, streak, seasonActs])

  const onExport = useCallback(() => {
    // The real export path — GET /coach/workout/export serves today's
    // prescribed workout as a .fit for a head unit. Client-side Blob download.
    void downloadWorkoutExport('fit')
  }, [])

  const onToday = useCallback(() => navigate('/e/w3-today'), [navigate])

  const onShare = useCallback(async () => {
    const text = [vm.funName, vm.title !== vm.funName ? vm.title : null, vm.totalTime !== '—' ? `${vm.totalTime} · ${vm.stats[1]?.v ?? ''} TSS` : null]
      .filter(Boolean).join(' — ')
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: vm.funName, text })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      }
    } catch {
      // user dismissed the share sheet — no-op
    }
  }, [vm])

  return <W3SessionView vm={vm} onBack={() => navigate(-1)} onShare={onShare} onExport={onExport} onToday={onToday} />
}
