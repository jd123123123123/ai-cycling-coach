import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useCurrentWeek, WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { useRehearseRoute } from '../../hooks/useRehearseRoute'
import { updateProfile } from '../../api/athletes'
import { listRehearsals, getRehearsal } from '../../api/rehearsal'
import { parseISO, fmtDE, fmtDEShort, daysBetween, makeGap } from './w3plan'
import W3GoalView, { type W3GoalVm, type Climb, type GoalReqRow, type GoalEditRow } from './W3GoalView'

/**
 * W3 · DEIN ZIEL, wired to real data. Route /e/w3-goal.
 *
 * Real: target event + priority (profile), the parsed race route — distance,
 * elevation gain, climbs and the elevation profile — reused from the rehearsal
 * store (`listRehearsals` → the `target_event` row → `getRehearsal`), and the
 * athlete's current fitness for each requirement gap (FTP, W/kg, longest ride,
 * weekly climbing, 4h+ rides — all from the season's activities).
 *
 * DERIVED (marked below): the requirement TARGETS, computed from the route's
 * distance + elevation demand (target FTP prefers the athlete's own goal, else a
 * climb-demand stretch; weekly-climbing + long-ride-count targets scale off the
 * event's hm and distance). Climb NAMES are not in the GPX, so they render as
 * "Anstieg N · km X" — honest, never fabricated place names.
 */

const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function W3GoalPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: profile } = useAthleteProfile()
  const { data: week } = useCurrentWeek(0)
  const seasonStart = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const { data: seasonActs } = useActivitiesRange(seasonStart, new Date())
  const { rehearse } = useRehearseRoute()

  const { data: rehearsals } = useQuery({
    queryKey: ['rehearsals', 'list'],
    queryFn: () => listRehearsals(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const targetItem = rehearsals?.find((r) => r.source_kind === 'target_event') ?? null
  const { data: fullRoute } = useQuery({
    queryKey: ['rehearsal', targetItem?.id],
    queryFn: () => getRehearsal(targetItem!.id),
    enabled: targetItem != null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  const vm = useMemo<W3GoalVm>(() => {
    const today = new Date()
    const goals = profile?.goals ?? null
    const ftp = profile?.ftp_watts ?? null
    const weight = profile?.weight_kg ?? null
    const eventDate = profile?.target_event_date ? parseISO(profile.target_event_date) : null
    const daysToStart = eventDate ? Math.max(0, daysBetween(today, eventDate)) : (week?.meso_block?.days_to_event ?? null)
    const type = profile?.target_event_type ?? null
    const prio = profile?.target_priority ?? (type === 'race' ? 'A' : type === 'fondo' ? 'B' : null)

    const distKm = targetItem ? Math.round(targetItem.distance_m / 1000) : null
    const eventHm = targetItem ? Math.round(targetItem.ascent_m) : null

    // ── requirement targets (DERIVED from the route demand) ──
    const targetFtp = goals?.target_ftp ?? (ftp != null ? Math.round(ftp * 1.1) : null)
    const targetWkg = targetFtp != null && weight != null ? targetFtp / weight : null
    const curWkg = ftp != null && weight != null ? ftp / weight : null
    // weekly-climbing target ≈ half the event's total elevation (a week that
    // rehearses race-day vertical), rounded to 100 hm.
    const weeklyHmTarget = eventHm != null ? Math.round((eventHm * 0.5) / 100) * 100 : null
    // 4h+ ride target scales with the event distance (~1 long ride per ~18 km).
    const longRideTarget = distKm != null ? Math.max(6, Math.round(distKm / 18)) : null

    // ── current fitness from the season's real activities ──
    const acts = seasonActs?.activities ?? []
    const cyc = acts.filter((a) => a.sport === 'cycling')
    const longestKm = cyc.length ? Math.round(Math.max(0, ...cyc.map((a) => (a.distance_meters ?? 0) / 1000))) : null
    const weeksElapsed = Math.max(1, Math.round(daysBetween(seasonStart, today) / 7))
    const totalHm = cyc.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
    const weeklyHm = cyc.length ? Math.round(totalHm / weeksElapsed) : null
    const rides4h = cyc.filter((a) => (a.duration_seconds ?? 0) >= 4 * 3600).length

    const gaps: GoalReqRow[] = [
      makeGap('Schwellenleistung', ftp, targetFtp, (n) => `${Math.round(n)}`, (r) => `noch ${Math.round(r)} W`),
      makeGap('Watt pro Kilo', curWkg, targetWkg, (n) => n.toFixed(1).replace('.', ','), (r) => `noch ${r.toFixed(1).replace('.', ',')}`),
      makeGap('Längste Fahrt', longestKm, distKm, (n) => `${Math.round(n)}`, (r) => `noch ${Math.round(r)} km`),
      makeGap('Höhenmeter / Woche', weeklyHm, weeklyHmTarget, (n) => de(Math.round(n)), (r) => `noch ${de(Math.round(r))} hm`),
      makeGap('Fahrten über 4 h', cyc.length ? rides4h : null, longRideTarget, (n) => `${Math.round(n)}`, (r) => `noch ${Math.round(r)}`),
    ].map((g) => ({
      label: g.label, currentText: g.currentText, targetText: g.targetText === '—' ? '—' :
        (g.label === 'Schwellenleistung' ? `${g.targetText} W` : g.label === 'Watt pro Kilo' ? `${g.targetText} W/kg` : g.label === 'Längste Fahrt' ? `${g.targetText} km` : g.label === 'Höhenmeter / Woche' ? `${g.targetText} hm` : g.targetText),
      pct: g.pct, remainingText: g.remainingText, onTrack: g.onTrack,
    }))

    // ── elevation profile from the route segments ──
    const segs = fullRoute?.segments ?? []
    let elevBars: { h: number; climb: boolean }[] = []
    if (segs.length > 0) {
      const elevs = segs.map((s) => s.elevation_m ?? 0)
      const lo = Math.min(...elevs), hi = Math.max(...elevs, lo + 1)
      const N = Math.min(48, segs.length)
      const step = segs.length / N
      elevBars = Array.from({ length: N }, (_, i) => {
        const s = segs[Math.min(segs.length - 1, Math.floor(i * step))]
        return { h: 0.12 + 0.88 * (((s.elevation_m ?? lo) - lo) / (hi - lo)), climb: s.climb_id != null }
      })
    }
    const climbs: Climb[] = (fullRoute?.climbs ?? []).slice(0, 4).map((c, i) => ({
      name: `Anstieg ${i + 1}`,
      km: `km ${Math.round(c.start_m / 1000)}`,
      detail: `${(c.length_m / 1000).toFixed(1).replace('.', ',')} km · ${c.avg_grade_pct.toFixed(1).replace('.', ',')} %`,
    }))
    const hasRoute = !!fullRoute && segs.length > 0

    // ── info note (derived from route demand) ──
    const climbHours = eventHm != null ? Math.round((eventHm / 800) * 10) / 10 : null // ~800 hm/h at tempo
    const infoNote = eventHm != null && distKm != null
      ? `Die Zielwerte kommen aus den Streckendaten: ${de(eventHm)} hm auf ${distKm} km heißen rund ${climbHours != null ? de(climbHours, 0) : '5'} Stunden über 240 W am Berg.`
      : 'Setze eine Streckendatei (GPX) für dein Ziel, dann kommen die Zielwerte aus dem echten Höhenprofil.'

    // ── finish-time estimate (derived, display-only) ──
    const estHours = distKm != null && eventHm != null ? distKm / 27 + eventHm / 2600 : null
    const zielzeit = estHours != null ? `${Math.floor(estHours)}:${String(Math.round((estHours % 1) * 60)).padStart(2, '0')} h` : '—'

    const editRows: GoalEditRow[] = [
      { id: 'day', icon: 'cal', label: 'Renntag', value: eventDate ? fmtDE(eventDate) : '—', editable: true },
      { id: 'prio', icon: 'flag', label: 'Priorität', value: prio ? `${prio}-Rennen` : '—', editable: true },
      { id: 'dist', icon: 'dist', label: 'Distanz', value: distKm != null ? `${distKm} km` : '—', editable: false },
      { id: 'hm', icon: 'hm', label: 'Höhenmeter', value: eventHm != null ? `${de(eventHm)} hm` : '—', editable: false },
      { id: 'time', icon: 'time', label: 'Zielzeit', value: zielzeit, editable: false },
    ]

    return {
      priorityChip: prio ? `${prio}-RENNEN` : (type === 'fondo' ? 'GRAN FONDO' : type === 'audax' ? 'AUDAX' : type ? type.toUpperCase() : 'KEIN ZIEL'),
      priorityLabel: prio === 'A' ? 'Hauptziel der Saison' : prio ? 'Nebenziel der Saison' : 'Kein Renntag gesetzt',
      eventName: goals?.target_event_name || (type === 'race' ? 'Dein A-Rennen' : type === 'fondo' ? 'Dein Gran Fondo' : 'Kein Ziel gesetzt'),
      daysCol: daysToStart != null ? String(daysToStart) : '—',
      dateCol: { big: eventDate ? `${fmtDEShort(eventDate)}` : '—', sub: eventDate ? fmtDE(eventDate).split(',')[0] : 'Renntag' },
      locCol: { big: '—', sub: 'Ort · aus GPX' },
      distHm: distKm != null && eventHm != null ? `${distKm} km · ${de(eventHm)} hm` : '—',
      hasRoute,
      elevBars,
      elevLabels: ['0 km', distKm != null ? `${Math.round(distKm / 2)}` : '—', distKm != null ? `${distKm} km` : '—'],
      climbs,
      routeCta: !hasRoute ? (profile?.has_target_event_route ? 'Höhenprofil & Anstiege siehst du in der Streckenvorschau.' : null) : null,
      gaps,
      infoNote,
      editRows,
      eventDateISO: profile?.target_event_date ?? null,
      priority: prio,
    }
  }, [profile, week, seasonActs, seasonStart, targetItem, fullRoute])

  const onSave = useCallback(async (dateISO: string, priority: 'A' | 'B' | 'C'): Promise<boolean> => {
    try {
      await updateProfile({ target_event_date: dateISO, target_priority: priority })
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: ['plan', 'build'] })
      return true
    } catch { return false }
  }, [qc])

  const onRemove = useCallback(async (): Promise<boolean> => {
    try {
      await updateProfile({ target_event_date: null, target_event_type: null })
      void qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      return true
    } catch { return false }
  }, [qc])

  return (
    <W3GoalView
      vm={vm}
      onBack={() => navigate(-1)}
      onSwitch={() => navigate('/e/w3-plan')}
      onRemove={onRemove}
      onSave={onSave}
      onRehearseRoute={() => rehearse('target_event')}
    />
  )
}
