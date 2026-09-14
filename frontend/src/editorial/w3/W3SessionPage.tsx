import { useCallback, useMemo } from 'react'
import W3Loading from './W3Loading'
import W3LoadError from './W3LoadError'
import { useNavigate, useParams } from 'react-router-dom'
import { useSessionModel } from '../data/useSessionModel'
import { useTodaySession } from '../../hooks/useTodaySession'
import { useAdaptive } from '../../hooks/useAdaptive'
import { useStreak } from '../../hooks/useStreak'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useGarage } from '../../hooks/useGarage'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { planDurSec, planIF, planTargetWatts, blocksFromIntervals, isSessionDay, parseISO, fmtDEShort } from './w3plan'
import { isPresent } from '../data/value'
import { funName, powerProfile, effortGuide } from './w3session'
import { forecastRideRc } from '../../api/rewards'
import W3SessionView, { type W3SessionVm, type W3Step, type W3ShapeBar, type W3EarnTile, type W3EarnLedger } from './W3SessionView'

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
 * not a fabricated read-out. "What it earns" shows the REAL streak this session
 * extends plus the season ledgers it pays into (season TSS, season saddle
 * time): banked + this session = the season on completion, with this session's
 * exact share of that sum and its size against the season's average ride. All
 * of it is arithmetic over totals already fetched here — no rate is assumed.
 * The RideCoin line is the same real forecast Today and the plan show:
 * `forecastRideRc` over the prescribed TSS and the live streak multiplier.
 *
 * Buttons: back, share (Web Share / clipboard), export the workout (.fit,
 * `downloadWorkoutExport` — the real export path), and back-to-today.
 */

const DASH = '—'
const fmtMin = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`
const fmtInt = (n: number) => Math.round(n).toLocaleString('de-DE')
/** This session against the season's average ride — a ratio of two real
 *  totals, not a forecast. Below 0.05× the "0.0×" read-out is meaningless, so
 *  it says so in words instead. */
const vsAvg = (x: number, kind: 'load' | 'length'): string =>
  x < 0.05
    ? (kind === 'load' ? 'Ein Bruchteil der Belastung deiner Durchschnittsfahrt dieser Saison.' : 'Ein Bruchteil der Länge deiner Durchschnittsfahrt dieser Saison.')
    : kind === 'load'
      ? `${x.toFixed(1)}× die Belastung deiner bisherigen Durchschnittsfahrt dieser Saison.`
      : `${x.toFixed(1)}× so lang wie deine bisherige Durchschnittsfahrt dieser Saison.`

const ZONE_NAME = ['', 'Erholung', 'Ausdauer', 'Tempo', 'Schwelle', 'VO2max', 'Anaerob', 'Sprint']

export default function W3SessionPage() {
  const navigate = useNavigate()
  // ── /e/w3-session/2026-09-13 — ANY day of the plan week, not just today ──
  // The param existed and was never read: from Saturday's card there was no
  // way to see Saturday's session. A date param resolves against the same
  // /weeks/current payload the plan renders, so the two can never disagree.
  const { id: param } = useParams()
  const dateParam = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null
  const now = new Date()
  const localToday = new Date(now.getFullYear(),now.getMonth(),now.getDate(),12)
  const requested = dateParam ? new Date(`${dateParam}T12:00:00`) : localToday
  const ahead = Math.round((requested.getTime()-localToday.getTime())/86400000)
  const offset = ahead < 7 ? 0 : Math.min(12,Math.floor((ahead+(localToday.getDay()+6)%7)/7))
  const { data: week, isLoading: weekLoading, isError: weekError, refetch: retryWeek, isFetching: weekFetching } = useCurrentWeek(offset)
  const { data: profile } = useAthleteProfile()
  const model = useSessionModel()
  const session = useTodaySession()
  const { data: adaptive } = useAdaptive()
  const { data: streak } = useStreak()
  // Season-to-date totals for the saddle-time + TSS earn tiles.
  const { data: seasonActs } = useActivitiesRange(new Date(new Date().getFullYear(), 0, 1), new Date())
  // The rider's own bike for the cover — never the stock one (see W3SessionView).
  const { data: garage } = useGarage()

  const vm = useMemo<W3SessionVm>(() => {
    // Season-to-date, counted only over the activities that actually carry the
    // metric — so the totals are unchanged, but the per-ride averages below
    // divide by a real denominator instead of silently by the null rides too.
    const acts = seasonActs?.activities ?? []
    const tssActs = acts.filter((a) => a.tss != null)
    const durActs = acts.filter((a) => a.duration_seconds != null)
    const seasonTss = tssActs.length ? Math.round(tssActs.reduce((s, a) => s + (a.tss as number), 0)) : null
    const seasonSaddleMin = durActs.length ? Math.round(durActs.reduce((s, a) => s + (a.duration_seconds as number), 0) / 60) : null
    const avgTss = seasonTss != null && tssActs.length > 0 ? seasonTss / tssActs.length : null
    const avgSaddleMin = seasonSaddleMin != null && durActs.length > 0 ? seasonSaddleMin / durActs.length : null
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

    // What it earns — REAL: the streak this session extends, plus the season
    // ledgers it pays into.
    const streakDays = streak?.streak ?? null
    const earns: W3EarnTile[] = []
    if (streakDays != null) {
      earns.push({ icon: 'flame', v: `TAG ${streakDays + 1}`, l: 'STREAK', s: streakDays > 0 ? `Verlängert deinen ${streakDays}-Tage-Streak` : 'Startet einen neuen Streak' })
    }

    // Season TSS + saddle time as LEDGERS rather than flat tiles: banked
    // (season to date) + this session = the season on completion, plus this
    // session's exact share of that sum. Every figure is arithmetic over
    // numbers already on this page — no future rate is assumed anywhere, so
    // none of it is a projection. The session is today's PRESCRIPTION, not a
    // logged ride, so it is ADDED to the season rather than counted in it
    // (the section header says "On completion"). When the season total isn't
    // known the old plain tile stands in, so the "—" contract still holds.
    const ledgers: W3EarnLedger[] = []
    if (seasonTss != null && effTss != null && effTss > 0) {
      const total = seasonTss + effTss
      ledgers.push({
        icon: 'zap',
        label: 'SAISON-TSS',
        banked: fmtInt(seasonTss),
        delta: `+${effTss}`,
        total: fmtInt(total),
        share: total > 0 ? effTss / total : null,
        note: avgTss != null && avgTss > 0 ? vsAvg(effTss / avgTss, 'load') : '',
      })
    } else if (seasonTss != null || effTss != null) {
      earns.push({
        icon: 'zap',
        v: seasonTss != null ? fmtInt(seasonTss) : DASH,
        l: 'SAISON-TSS',
        s: effTss != null ? `+${effTss} diese Fahrt` : 'Saison-Belastung',
      })
    }
    if (seasonSaddleMin != null && effDurMin != null && effDurMin > 0) {
      const total = seasonSaddleMin + effDurMin
      ledgers.push({
        icon: 'clock',
        label: 'SATTEL · SAISON · H:MM',
        banked: fmtMin(seasonSaddleMin),
        delta: `+${fmtMin(effDurMin)}`,
        total: fmtMin(total),
        share: total > 0 ? effDurMin / total : null,
        note: avgSaddleMin != null && avgSaddleMin > 0 ? vsAvg(effDurMin / avgSaddleMin, 'length') : '',
      })
    } else if (seasonSaddleMin != null || (durHr != null && durHr > 0)) {
      const h = seasonSaddleMin != null ? Math.floor(seasonSaddleMin / 60) : null
      earns.push({
        icon: 'clock',
        v: h != null ? `${h}h` : DASH,
        l: 'SATTEL · SAISON',
        s: effDurMin ? `+${fmtMin(effDurMin)} diese Fahrt` : 'Zeit auf dem Rad dieses Jahr',
      })
    }
    // The REAL forecast from the one ported earn ladder (api/rewards ←
    // rewards.py): base = 1 RC/TSS capped 150, × the rider's live streak
    // multiplier. Labelled "ca." because the session is unridden.
    const earnNote = (() => {
      const rc = forecastRideRc(effTss ?? null, streak?.streak ?? null)
      return rc != null
        ? `Fährst du sie zu Ende, bringt sie ca. ${rc.toLocaleString('de-DE')} RideCoin.`
        : ''
    })()

    const prescriptionClaim = isPresent(model.claim)
      ? model.claim.value
      : (title ? `Heute vorgegeben: ${title}.` : 'Für heute ist keine Einheit vorgegeben.')

    const shapeLabels: [string, string, string] = ['EINROLLEN', num ? (num.qualifier || 'HAUPTTEIL') : 'KONSTANT', 'AUSROLLEN']

    return {
      navTitle: 'Einheit heute',
      bikeImage: garage?.bike?.image_base64 ?? null,
      funName: hero,
      title: title ?? 'Einheit',
      numeral: num ? num.text : '—',
      qualifier: num ? num.sub : '',
      thresholdW: watts != null ? `${watts} W` : '—',
      totalTime: effDurMin != null ? fmtMin(effDurMin) : '—',
      gauge,
      prescriptionClaim,
      stats: [
        { icon: 'clock', v: effDurMin != null ? fmtMin(effDurMin) : '—', l: 'DAUER', s: inZone != null ? `${inZone} min in Zone` : '' },
        { icon: 'flame', v: effTss != null ? String(effTss) : '—', l: 'BELASTUNG · TSS', s: ftpPct ? `${ftpPct} von FTP` : '' },
        { icon: 'zap', v: watts != null ? `${watts} W` : '—', l: 'ZIEL', s: watts != null ? 'im Hauptteil' : 'kein FTP-Anker' },
        { icon: 'gauge', v: inZone != null ? `${inZone}` : '—', l: 'MIN IN ZONE', s: inZone != null ? 'auf Ziel oder darüber' : '' },
      ],
      shapeBars,
      shapeFtpTag: watts != null ? `Ziel ${watts} W` : (ftpPct ? `${ftpPct} von FTP` : ''),
      shapeLabels,
      stepsMeta: steps.length > 0 ? `${blocks.length} Blöcke · ${effDurMin != null ? fmtMin(effDurMin) : '—'}` : '',
      steps,

      // Honest zone-derived effort guide (replaces the old fabricated HR/cadence read-outs).
      effort: effortGuide(iff),

      route: isPresent(model.routes) && model.routes.value[0]
        ? (() => {
            const r = model.routes.value[0]
            return {
              name: r.name,
              lastRidden: `${r.rideCount}× GEFAHREN`,
              stats: [
                { v: `${Math.round(r.distanceKm)} km`, l: 'DISTANZ' },
                { v: isPresent(r.ascentM) ? `${Math.round(r.ascentM.value)} m` : '—', l: 'HÖHENMETER' },
                { v: effDurMin != null ? fmtMin(effDurMin) : '—', l: 'ERWARTET' },
                { v: `${r.rideCount}×`, l: 'GEFAHREN' },
              ],
              notes: ['Aus deinen eigenen Fahrten zu den heutigen Blöcken passend.'],
              foot: 'Aus deinem aufgezeichneten Track für diese Strecke.',
            }
          })()
        : null,

      earns,
      ledgers,
      earnNote,

      canExport: workout != null,
      primaryLabel: workout != null ? 'Zum Head-Unit exportieren' : 'Zurück zu heute',
    }
  }, [model, session.workout, adaptive, streak, seasonActs, garage])

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

  // ── the date branch, after every hook has run ─────────────────────────
  if (weekLoading && !week) return <W3Loading label="Deine Einheit lädt…"/>
  if (weekError && !week) return <W3LoadError title="Einheit gerade nicht verfügbar" detail="Bitte lade den gewählten Trainingstag erneut." onRetry={()=>void retryWeek()} retrying={weekFetching}/>
  const day = (week?.days ?? []).find((d) => dateParam ? d.date === dateParam : d.is_today) ?? null
  if (day && isSessionDay(day)) {
    const ftp = profile?.ftp_watts ?? null
    const secs = planDurSec(day)
    const durMin = secs > 0 ? Math.round(secs / 60) : null
    const dTss = day.target_tss != null ? Math.round(day.target_tss) : null
    const iff = planIF(day)
    const mainPct = Math.max(0,...day.intervals.map(iv=>iv.power_target_pct_ftp??0))
    const w = ftp!=null&&mainPct>0 ? Math.round(ftp*mainPct) : planTargetWatts(day,ftp)
    const dt = parseISO(day.date)
    const dayLabel = dt ? `${dt.toLocaleDateString('de-DE',{weekday:'short'})}, ${fmtDEShort(dt)}` : day.date
    const bars = day.intervals.length > 0 ? blocksFromIntervals(day.intervals) : []
    const shape = powerProfile(bars.map((b) => ({ w: b.w, work: b.work })), true)
    const gaugeSegs: boolean[] = shape.length > 0
      ? Array.from({ length: 20 }, (_, i) => shape[Math.floor((i / 20) * shape.length)]?.work ?? false)
      : Array.from({ length: 20 }, () => false)
    const steps: W3Step[] = day.intervals.map((iv, i) => {
      const min = Math.round(iv.duration_seconds / 60)
      const isMain = iv.zone >= 3
      return {
        idx: String(i + 1).padStart(2, '0'),
        name: ZONE_NAME[iv.zone] ?? `Zone ${iv.zone}`,
        note: iv.reps && iv.reps > 1 && iv.on_s
          ? `${iv.reps}× ${iv.on_s}s an${iv.off_s ? ` / ${iv.off_s}s locker` : ''}`
          : iv.power_target_pct_ftp != null ? `${Math.round(iv.power_target_pct_ftp * 100)} % der FTP` : '',
        watts: ftp != null && iv.power_target_pct_ftp != null ? `${Math.round(ftp * iv.power_target_pct_ftp)} W` : '—',
        dur: `${min} min`,
        isMain,
        fill: Math.min(1, (iv.power_target_pct_ftp ?? 0.6) / 1.2),
      }
    })
    const dayVm: W3SessionVm = {
      navTitle: dayLabel,
      bikeImage: garage?.bike?.image_base64 ?? null,
      funName: funName(day.template_id ?? null, iff, day.title),
      title: day.title ?? 'Einheit',
      numeral: dTss != null ? String(dTss) : '—',
      qualifier: 'TSS geplant',
      thresholdW: w != null ? `${w} W` : '—',
      totalTime: durMin != null ? fmtMin(durMin) : '—',
      gauge: gaugeSegs,
      prescriptionClaim: `Geplant für ${dayLabel}: ${day.title ?? 'Einheit'}.${day.rationale ? ` ${day.rationale}` : ''}`,
      stats: [
        { icon: 'clock', v: durMin != null ? fmtMin(durMin) : '—', l: 'DAUER', s: '' },
        { icon: 'flame', v: dTss != null ? String(dTss) : '—', l: 'BELASTUNG · TSS', s: iff != null ? `${Math.round(iff * 100)} % von FTP` : '' },
        { icon: 'zap', v: w != null ? `${w} W` : '—', l: 'ZIEL', s: w != null ? 'im Hauptteil' : 'kein FTP-Anker' },
        { icon: 'target', v: day.intervals.length > 0 ? String(day.intervals.length) : '—', l: 'BLÖCKE', s: '' },
      ],
      shapeBars: shape,
      shapeFtpTag: w != null ? `Ziel ${w} W` : '',
      shapeLabels: ['EINROLLEN', 'HAUPTTEIL', 'AUSROLLEN'],
      stepsMeta: steps.length > 0 ? `${steps.length} Blöcke · ${durMin != null ? fmtMin(durMin) : '—'}` : '',
      steps,
      effort: effortGuide(iff),
      route: null,
      // Forward-looking honesty: a future day extends no streak yet and pays
      // nothing until ridden — the note carries the forecast, the tiles stay out.
      earns: day.is_today ? vm.earns : [],
      ledgers: day.is_today ? vm.ledgers : [],
      earnNote: (() => {
        const rc = forecastRideRc(dTss, streak?.streak ?? null)
        return rc != null ? `Bringt ca. ${rc.toLocaleString('de-DE')} RideCoin, wenn du sie fährst.` : ''
      })(),
      canExport: true,
      primaryLabel: 'Strecke & Export',
    }
    return <W3SessionView workoutDate={day.date} vm={dayVm} onBack={() => navigate(-1)} onToday={() => navigate('/e/w3-plan')} />
  }

  if (dateParam && (!day || !isSessionDay(day))) return <div style={{padding:28,color:'#fff'}}><h2>{day?'An diesem Tag ist kein Radtraining geplant.':'Diese Einheit ist in der aktuellen Woche nicht verfügbar.'}</h2><button onClick={()=>navigate('/e/w3-plan')}>Zum Plan</button></div>
  const todayDate = (week?.days??[]).find(d=>d.is_today&&isSessionDay(d))?.date
  return <W3SessionView workoutDate={dateParam??todayDate} vm={{...vm,canExport:!!todayDate,primaryLabel:todayDate?'Strecke & Export':vm.primaryLabel}} onBack={() => navigate(-1)} onShare={onShare} onToday={onToday} />
}
