/**
 * RouteRehearsalView — `/rehearse/:id`, built 1:1 from the pencil frame
 * "V4 · Route Forecast (GPX)" (`Sq53F`).
 *
 * Layout, top to bottom, exactly as the frame has it:
 *   Header         — back · title + source · GPX badge
 *   MapCard        — the road, captioned
 *   BaselineStrip  — the four values the forecast is computed FROM
 *   HeroForecast   — the zone ring with the time inside it
 *   GradientCard   — the profile painted by gradient + km per bucket
 *   MetricRows     — avg power, NP, speed, load, energy, HR
 *   TimeInZones    — where the time goes
 *   EngineCard     — your engine vs this route
 *   CostCard       — what it costs you
 *   TrainingEffect — what your watch will say
 *   EffortProfile  — the mountain ahead
 *   HistoryCard    — you vs this route
 *   CoachNote      — how it sits against today
 *   CTA + SecRow   — export, ask, save
 *
 * ── What was deliberately REMOVED (2026-08-04) ───────────────────────────
 * Everything not in the frame, on the user's explicit instruction. The page
 * had grown well past its own design: the scrubbable profile with its W′ trace
 * and readout, ClimbCards, SegmentPlan, FuelPlanCard, the fuel summary strip,
 * ActualVsPredicted, TargetTimeCard, CompareRehearsals, AssumptionsRow,
 * RiderKnobs, the map fly-through, and the terrain banner.
 *
 * Those components still exist and several are genuinely good — they are
 * simply not THIS screen. Removing the fly-through also removed the scrub
 * plumbing (playback hook, active index, measured profile width) that existed
 * only to feed it, which is most of why this file is now a third of its
 * former length.
 *
 * VerdictBlock went with them. Two of its disclosures cannot be dropped
 * without misleading the reader — "no FTP, no prediction" and the blow-up
 * warning — so those are kept inline, where the frame has room for them.
 * Losing the rest (CdA-is-a-default, durability-unknown) is a real cost, and
 * the honest place for them is a disclosure the frame does have room for
 * rather than this page's former wall of caveats.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Route, Wind } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { useLocale } from '../contexts/LocaleContext'
import { useDailyDecision } from '../hooks/useDailyDecision'
import { getRehearsal, type Rehearsal } from '../api/rehearsal'
import BaselineStrip from '../components/rehearsal/BaselineStrip'
import ForecastRing from '../components/rehearsal/ForecastRing'
import GradientCard from '../components/rehearsal/GradientCard'
import RideMetrics from '../components/rehearsal/RideMetrics'
import TimeInZones from '../components/rehearsal/TimeInZones'
import EngineVsRoute from '../components/rehearsal/EngineVsRoute'
import CostCard from '../components/rehearsal/CostCard'
import TrainingEffectCard from '../components/rehearsal/TrainingEffectCard'
import EffortProfile from '../components/rehearsal/EffortProfile'
import RouteRecord from '../components/rehearsal/RouteRecord'
import CoachNote from '../components/rehearsal/CoachNote'
import PlanActions from '../components/rehearsal/PlanActions'
import RouteMap from '../components/crew/RouteMap'
import RouteSketch from '../components/ui/RouteSketch'
import { polylineFromSegments, powerColors } from '../components/rehearsal/rehearsalMap'
import { climbLabel, formatDecimal } from '../components/rehearsal/rehearsalMath'

export default function RouteRehearsalView() {
  const { id } = useParams()
  const rehearsalId = Number(id)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const de = locale === 'de'
  const { decision } = useDailyDecision()
  const readinessScore = decision?.readiness?.score ?? null

  const [mapReady, setMapReady] = useState(false)

  const { data, isLoading, isError } = useQuery<Rehearsal>({
    queryKey: ['rehearsal', rehearsalId],
    queryFn: () => getRehearsal(rehearsalId),
    enabled: Number.isFinite(rehearsalId),
    staleTime: 5 * 60 * 1000,
  })

  const segments = useMemo(() => data?.segments ?? [], [data])
  const routeLine = useMemo(() => polylineFromSegments(segments), [segments])
  const routeColors = useMemo(() => powerColors(segments), [segments])

  // "<name> · vor 3 Std." — the subject and its age in one line. Age is
  // relative because an ISO timestamp is not something a rider converts in
  // their head before a ride.
  const sourceLine = useMemo(() => {
    if (!data) return null
    const name = data.name || (de ? 'Unbenannte Strecke' : 'Unnamed route')
    const created = data.created_at ? new Date(data.created_at) : null
    if (!created || Number.isNaN(created.getTime())) return name
    const mins = Math.max(0, Math.round((Date.now() - created.getTime()) / 60000))
    const age =
      mins < 2 ? (de ? 'gerade eben' : 'just now')
        : mins < 60 ? (de ? `vor ${mins} Min.` : `${mins} min ago`)
        : mins < 60 * 24 ? (de ? `vor ${Math.round(mins / 60)} Std.` : `${Math.round(mins / 60)} h ago`)
        : (de ? `vor ${Math.round(mins / 1440)} T.` : `${Math.round(mins / 1440)} d ago`)
    return `${name} · ${age}`
  }, [data, de])

  const header = (
    <div className="flex items-center" style={{ gap: 12 }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={de ? 'Zurück' : 'Back'}
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
      >
        <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
      </button>
      <div className="flex min-w-0 flex-col" style={{ gap: 1 }}>
        <span className="num-display truncate" style={{ fontSize: 20, color: 'var(--color-ink)' }}>
          {de ? 'Streckenvorschau' : 'Route Forecast'}
        </span>
        {sourceLine && (
          <span className="truncate" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
            {sourceLine}
          </span>
        )}
      </div>
      {data?.source_kind && (
        <span
          className="ml-auto shrink-0 inline-flex items-center rounded-full"
          style={{ gap: 4, padding: '4px 9px', background: 'var(--color-violet-soft)' }}
        >
          <Route size={12} style={{ color: 'var(--color-violet)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-violet)' }}>
            {data.source_kind === 'gpx' ? 'GPX' : data.source_kind.toUpperCase()}
          </span>
        </span>
      )}
    </div>
  )

  const shell = (children: React.ReactNode) => (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {header}
        {children}
      </div>
    </DashboardShell>
  )

  if (isLoading) {
    return shell(
      <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>
        {de ? 'Probefahrt wird geladen …' : 'Loading rehearsal…'}
      </p>,
    )
  }

  if (isError || !data) {
    return shell(
      <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
        {de ? 'Diese Probefahrt konnten wir nicht laden.' : 'We could not load this rehearsal.'}
      </p>,
    )
  }

  const startLabel =
    data.assumptions?.start_hour != null
      ? `${String(data.assumptions.start_hour).padStart(2, '0')}:00`
      : null

  // "Fits today" is a readiness claim, so it is null when readiness is unknown
  // rather than defaulting to a reassuring yes.
  const fitsToday =
    readinessScore == null ? null : readinessScore >= 65 || data.ascent_m < 600

  const fasterThanBestS =
    data.history?.forecast_vs_best_s != null && data.history.forecast_vs_best_s < 0
      ? Math.abs(data.history.forecast_vs_best_s)
      : null

  const blowUp = data.blow_ups?.[0] ?? null
  const blowUpClimbRow =
    blowUp?.climb_id != null ? data.climbs.find((c) => c.climb_id === blowUp.climb_id) : undefined
  const blowUpClimb = blowUpClimbRow ? climbLabel(blowUpClimbRow, de) : null

  return shell(
    <>
      {/* ── MapCard ── the road, captioned. */}
      {routeLine.length > 1 && (
        <section
          className="overflow-hidden rounded-[20px]"
          style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
        >
          <div style={{ position: 'relative', height: 232, background: 'var(--color-surface-2)' }}>
            {/* The SVG sketch holds the frame until MapLibre reports a painted
                tile, so a blocked tile host or a phone without WebGL still
                shows the route instead of an empty black box. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                opacity: mapReady ? 0 : 1,
                transition: 'opacity 320ms ease',
              }}
            >
              <RouteSketch
                polyline={routeLine}
                width={358}
                height={232}
                color="var(--color-accent)"
                strokeWidth={2.5}
                halo
                endpoints
                ariaLabel={de ? 'Streckenverlauf' : 'Route outline'}
              />
            </div>
            <RouteMap
              polyline={routeLine}
              lineColors={routeColors}
              styleKey="dark"
              onReady={() => setMapReady(true)}
            />
          </div>

          <div className="flex flex-col" style={{ padding: '13px 15px 15px', gap: 3 }}>
            <span className="num-display truncate" style={{ fontSize: 20, color: 'var(--color-ink)' }}>
              {data.name || (de ? 'Unbenannte Strecke' : 'Unnamed route')}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
              {`${formatDecimal(data.distance_m / 1000, de)} km · ${Math.round(data.ascent_m)} ${de ? 'Hm' : 'm up'}`}
            </span>
            <div className="flex items-center flex-wrap" style={{ gap: 14, marginTop: 5 }}>
              {startLabel && (
                <span className="inline-flex items-center" style={{ gap: 5 }}>
                  <Clock size={13} style={{ color: 'var(--color-muted)' }} />
                  <span className="num-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>
                    {startLabel}
                  </span>
                </span>
              )}
              {/* The frame shows a temperature and a wind bearing here. The
                  rehearsal payload carries only WHETHER weather was used, not
                  the values, and today's local forecast would print the wrong
                  city's weather beside a road in the Dolomites. */}
              {data.weather_used && (
                <span className="inline-flex items-center" style={{ gap: 5 }}>
                  <Wind size={13} style={{ color: 'var(--color-ink-blue)' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>
                    {de ? 'Wetter eingerechnet' : 'Weather included'}
                  </span>
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── BaselineStrip ── */}
      <BaselineStrip ftpUsedW={data.ftp_used_w ?? null} />

      {/* ── HeroForecast ── */}
      {data.can_predict ? (
        <ForecastRing
          band={data.band}
          zones={data.zones ?? []}
          distanceM={data.distance_m}
          ascentM={data.ascent_m}
          fitsToday={fitsToday}
          fasterThanBestS={fasterThanBestS}
          de={de}
        />
      ) : (
        /* The one state the frame has no picture for. Without an FTP or CP
           there is no time to put in the ring, and inventing one is the exact
           failure this whole page exists to avoid. */
        <section
          className="rounded-[20px] flex flex-col"
          style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', padding: 16, gap: 6 }}
        >
          <span
            className="eyebrow"
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-amber)' }}
          >
            {de ? 'KEINE ZEITVORHERSAGE' : 'NO TIME PREDICTION'}
          </span>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-ink-2)', margin: 0 }}>
            {de
              ? 'Ohne FTP oder CP können wir keine Zeit schätzen — nur das Profil.'
              : 'Without an FTP or CP we cannot estimate a time — only the profile.'}
          </p>
        </section>
      )}

      {/* The blow-up is the one warning that cannot be dropped: it names the
          place this ride comes apart, and the ring cannot show it. */}
      {blowUp && (
        <p style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--color-ink)', margin: 0 }}>
          {de
            ? `Bei km ${formatDecimal(blowUp.distance_m / 1000, de)}${blowUpClimb ? ` an ${blowUpClimb}` : ''} geht das Licht aus.`
            : `At km ${formatDecimal(blowUp.distance_m / 1000, de)}${blowUpClimb ? ` on ${blowUpClimb}` : ''} the lights go out.`}
        </p>
      )}

      {/* ── GradientCard ── */}
      <GradientCard segments={segments} distanceM={data.distance_m} ascentM={data.ascent_m} />

      {/* ── SecTitle + MetricRows ── RideMetrics carries the frame's
          "WHAT TO EXPECT" heading itself. */}
      <RideMetrics data={data} de={de} />

      {/* ── TimeInZones ── */}
      <TimeInZones
        zones={data.zones ?? []}
        ftpUsedW={data.ftp_used_w}
        ftpIsCpFallback={data.ftp_is_cp_fallback}
        de={de}
      />

      {/* ── EngineCard ── */}
      <EngineVsRoute demand={data.demand ?? []} de={de} />

      {/* ── CostCard ── */}
      <CostCard battery={data.battery} matches={data.matches} de={de} />

      {/* ── TrainingEffect ── */}
      <TrainingEffectCard trainingEffect={data.training_effect} />

      {/* ── EffortProfile ── */}
      <EffortProfile
        segments={segments}
        distanceM={data.distance_m}
        ascentM={data.ascent_m}
        ftpW={data.ftp_used_w ?? null}
      />

      {/* ── HistoryCard ── */}
      <RouteRecord history={data.history} pr={data.pr} forecastS={data.total_time_s} de={de} />

      {/* ── CoachNote ── */}
      <CoachNote
        ascentM={data.ascent_m}
        distanceM={data.distance_m}
        blowUps={(data.blow_ups ?? []).length}
      />

      {/* ── CTA + SecRow ── */}
      <PlanActions
        rehearsalId={rehearsalId}
        canExport={(data.chapters ?? []).length > 0 && data.ftp_used_w != null}
      />
    </>,
  )
}
