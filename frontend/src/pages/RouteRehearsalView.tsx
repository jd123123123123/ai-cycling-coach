/**
 * RouteRehearsalView — `/rehearse/:id`, the surface eight tasks of engine work
 * exist to produce: what this route will actually do to you.
 *
 * Layout, top to bottom: the verdict (always a RANGE, never a bare time) →
 * the scrubbable elevation profile → a readout for whatever point of the road
 * the finger is on → the climbs and what each costs in W′ → fuelling → the
 * assumptions the whole projection rests on.
 *
 * The assumptions sit at the BOTTOM on purpose. They are the answer to "why
 * does it say that?", which is a question the athlete only asks after reading
 * the verdict — and putting them first would read as a form to fill in before
 * the app will talk to you.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Route, Wind } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import Scene from '../components/scene/Scene'
import { useLocale } from '../contexts/LocaleContext'
import { useDailyDecision } from '../hooks/useDailyDecision'
import {
  getRehearsal,
  updateAssumptions,
  type Draft,
  type Effort,
  type Rehearsal,
  type RiderOverrides,
} from '../api/rehearsal'
import RehearsalProfile from '../components/rehearsal/RehearsalProfile'
import WPrimeTrace from '../components/rehearsal/WPrimeTrace'
import VerdictBlock from '../components/rehearsal/VerdictBlock'
import ClimbCards from '../components/rehearsal/ClimbCards'
import AssumptionsRow from '../components/rehearsal/AssumptionsRow'
import RiderKnobs from '../components/rehearsal/RiderKnobs'
import TargetTimeCard from '../components/rehearsal/TargetTimeCard'
import ActualVsPredicted from '../components/rehearsal/ActualVsPredicted'
import CompareRehearsals from '../components/rehearsal/CompareRehearsals'
import RideMetrics from '../components/rehearsal/RideMetrics'
import TimeInZones from '../components/rehearsal/TimeInZones'
import EngineVsRoute from '../components/rehearsal/EngineVsRoute'
import CostCard from '../components/rehearsal/CostCard'
import SegmentPlan from '../components/rehearsal/SegmentPlan'
import RouteRecord from '../components/rehearsal/RouteRecord'
import ForecastRing from '../components/rehearsal/ForecastRing'
import GradientCard from '../components/rehearsal/GradientCard'
import TrainingEffectCard from '../components/rehearsal/TrainingEffectCard'
import BaselineStrip from '../components/rehearsal/BaselineStrip'
import EffortProfile from '../components/rehearsal/EffortProfile'
import CoachNote from '../components/rehearsal/CoachNote'
import PlanActions from '../components/rehearsal/PlanActions'
import FuelPlanCard from '../components/rehearsal/FuelPlanCard'
import RouteMap from '../components/crew/RouteMap'
import RouteSketch from '../components/ui/RouteSketch'
import {
  blowUpIndices,
  polylineFromSegments,
  polylineIndices,
  powerColors,
} from '../components/rehearsal/rehearsalMap'
import { useRehearsalPlayback } from '../hooks/useRehearsalPlayback'
import {
  blowUpCeilingW,
  climbLabel,
  elevationsFromSegments,
  formatDecimal,
  formatHms,
  wPrimeCapacity,
} from '../components/rehearsal/rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../components/dashboard/glassCard'

const PROFILE_HEIGHT = 150

export default function RouteRehearsalView() {
  const { id } = useParams()
  const rehearsalId = Number(id)
  const navigate = useNavigate()
  const { locale } = useLocale()
  const { decision } = useDailyDecision()
  const readinessScore = decision?.readiness?.score ?? null
  const de = locale === 'de'
  const queryClient = useQueryClient()

  const [scrubIdx, setScrubIdx] = useState<number | null>(null)

  const { data, isLoading, isError } = useQuery<Rehearsal>({
    queryKey: ['rehearsal', rehearsalId],
    queryFn: () => getRehearsal(rehearsalId),
    enabled: Number.isFinite(rehearsalId),
    staleTime: 5 * 60 * 1000,
  })

  // The profile is an SVG with an explicit viewBox, so it needs a real pixel
  // width. Measured rather than hard-coded because the shell's padding differs
  // between 390 px phones and the 640 px capped reading column.
  const profileBoxRef = useRef<HTMLDivElement>(null)
  const [profileWidth, setProfileWidth] = useState(358)
  const segmentCount = data?.segments.length ?? 0
  useEffect(() => {
    const el = profileBoxRef.current
    if (!el) return
    const apply = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setProfileWidth(w)
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
    // Re-runs when the profile box first appears — it is only rendered once the
    // rehearsal has loaded, so there is nothing to measure on the first pass.
  }, [segmentCount])

  const mutation = useMutation({
    mutationFn: (patch: { draft?: Draft; effort?: Effort; use_weather?: boolean } & RiderOverrides) =>
      updateAssumptions(rehearsalId, patch),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['rehearsal', rehearsalId], fresh)
      setScrubIdx(null)
    },
  })

  const segments = useMemo(() => data?.segments ?? [], [data])
  const elevations = useMemo(() => elevationsFromSegments(segments), [segments])
  const wPrime = useMemo(() => wPrimeCapacity(segments), [segments])

  // ── The map, and the one index that drives everything ──────────────────
  const routeLine = useMemo(() => polylineFromSegments(segments), [segments])
  const routeIdxs = useMemo(() => polylineIndices(segments), [segments])
  const routeColors = useMemo(() => powerColors(segments), [segments])
  const blowUpIdxs = useMemo(
    () => blowUpIndices(segments, data?.blow_ups ?? []),
    [segments, data],
  )
  const [mapReady, setMapReady] = useState(false)

  const { playIdx, playing, skip, replay } = useRehearsalPlayback({
    rehearsalId,
    count: segments.length,
    enabled: !isLoading && segments.length > 1,
  })

  // A finger always wins over the film — touching the profile IS the skip.
  const activeIdx = scrubIdx ?? playIdx
  const onScrubShared = useCallback(
    (i: number | null) => {
      if (i != null && playing) skip()
      setScrubIdx(i)
    },
    [playing, skip],
  )

  // Where to put the dot on the map. `routeIdxs` maps map-vertex → segment, so
  // this walks it backwards: the nearest drawn vertex at or before the cursor.
  const markerLatLng = useMemo<[number, number] | null>(() => {
    if (activeIdx == null || routeLine.length === 0) return null
    let best = 0
    for (let k = 0; k < routeIdxs.length; k++) {
      if (routeIdxs[k] <= activeIdx) best = k
      else break
    }
    return routeLine[best] ?? null
  }, [activeIdx, routeIdxs, routeLine])

  // "<name> · vor 3 Std." — the subject and its age in one line. Age is
  // relative because "2026-08-04T05:12Z" is not something a rider converts in
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

  const blowUp = data?.blow_ups?.[0] ?? null
  const blowUpClimb = useMemo(() => {
    if (!blowUp || blowUp.climb_id == null || !data) return null
    const climb = data.climbs.find((c) => c.climb_id === blowUp.climb_id)
    return climb ? climbLabel(climb, de) : null
  }, [blowUp, data, de])

  // The header names the ROUTE, not the feature. A centred "PROBEFAHRT"
  // eyebrow told the athlete which screen they were on, which they already
  // knew, and left the actual subject — which road, from which file, how
  // fresh — to be discovered further down. Source and age matter here because
  // a forecast is only as current as the assumptions behind it.
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
          style={{
            gap: 4,
            padding: '4px 9px',
            background: 'var(--color-violet-soft)',
          }}
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
        {de ? 'Fahre die Strecke im Kopf ab …' : 'Riding the route in our head…'}
      </p>,
    )
  }

  if (isError || !data) {
    return shell(
      <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
        {de
          ? 'Diese Probefahrt konnten wir nicht laden.'
          : 'We could not load this rehearsal.'}
      </p>,
    )
  }

  // The readout follows the shared cursor, so it narrates the film as it plays
  // instead of sitting on its placeholder until someone touches the screen.
  const scrubbed = activeIdx != null ? segments[activeIdx] ?? null : null

  // The map footer's three facts. Each is null unless the rehearsal genuinely
  // carries it, so an undated or indoor route shows a name and nothing invented.
  const startLabel =
    data?.assumptions?.start_hour != null
      ? `${String(data.assumptions.start_hour).padStart(2, '0')}:00`
      : null


  // "Fits today" is a readiness claim, so it is null when readiness is unknown
  // rather than defaulting to a reassuring yes.
  const fitsToday =
    readinessScore == null
      ? null
      : readinessScore >= 65 || (data?.ascent_m ?? 0) < 600

  // The design says "faster than your LAST ride here"; the history payload
  // carries the athlete's BEST here (`forecast_vs_best_s`, negative when the
  // forecast is quicker). Best is the honest comparison available, and the
  // label says best rather than last.
  const fasterThanBestS =
    data?.history?.forecast_vs_best_s != null && data.history.forecast_vs_best_s < 0
      ? Math.abs(data.history.forecast_vs_best_s)
      : null

  return shell(
    <>
      {/* The route as a landscape, drawn from the same elevations the profile
          chart plots. Not decoration: it is this rider's actual road, so the
          page opens on the shape of the day rather than on a title. Renders
          nothing when there are no elevations — the honest-gap rule. */}
      <section
        className="-mt-3 overflow-hidden rounded-b-[20px]"
        style={{ marginLeft: -16, marginRight: -16 }}
      >
        <Scene
          kind="terrain"
          values={elevations}
          seed={`rehearsal:${data.id}`}
          height={132}
        />
      </section>

      {/* The route's name and age moved INTO the header, so this block was
          stating the same name a second time twenty pixels below it. Distance
          and ascent survive on the gradient card's own subtitle and axis. */}

      {/* ── MapHero: where the road actually runs, coloured by target watts ──
          The SVG sketch is drawn first and stays until MapLibre reports a
          painted frame, so a blocked tile host or a phone without WebGL still
          shows the route rather than an empty black box. */}
      {routeLine.length > 1 && (
        <section
          style={{
            position: 'relative',
            borderRadius: 20,
            overflow: 'hidden',
            height: 232,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
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
            lineColors={routeColors.length === routeLine.length ? routeColors : undefined}
            markerLatLng={markerLatLng}
            styleKey="dark"
            onReady={() => setMapReady(true)}
          />
          {/* One control, two jobs: it interrupts the film while it runs, and
              afterwards it is the only way back to it — the film plays by
              itself exactly once per rehearsal, and a rider who skipped it or
              came back later should not have to clear storage to see it. */}
          <button
            type="button"
            onClick={playing ? skip : replay}
            aria-label={
              playing
                ? (de ? 'Durchfahrt überspringen' : 'Skip the fly-through')
                : (de ? 'Durchfahrt abspielen' : 'Play the fly-through')
            }
            style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '5px 11px',
                borderRadius: 999,
                background: 'rgba(10,12,15,0.72)',
                border: '1px solid rgba(255,255,255,0.22)',
                backdropFilter: 'blur(8px)',
                fontSize: 11,
                fontWeight: 700,
              color: '#fff',
            }}
          >
            {playing
              ? (de ? 'Überspringen' : 'Skip')
              : (de ? 'Durchfahrt' : 'Fly through')}
          </button>

          {/* The map's own footer: what this road IS, in one line, plus the
              three facts that decide whether today is the day to ride it.
              Previously the map was a picture with no caption — the athlete had
              to look elsewhere to learn even the route's name. */}
          <div
            className="flex flex-col"
            style={{ padding: '13px 15px 15px', gap: 3, background: 'var(--color-paper-2)' }}
          >
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
              {/* The design shows temperature and wind here. The rehearsal
                  payload carries only WHETHER weather was used, not the values
                  — and pulling today's local forecast would print Munich's
                  temperature next to a road in the Dolomites. So this states
                  that weather is in the model, and no number it does not have. */}
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

      {/* The four numbers the whole forecast is computed FROM. Stated before
          the verdict, so the athlete can judge the prediction against its own
          inputs instead of taking it on trust. */}
      <BaselineStrip ftpUsedW={data.ftp_used_w ?? null} />

      {/* The headline the design leads with: time inside a ring whose arcs are
          the predicted time-in-zone, then the route's own facts as pills. */}
      <ForecastRing
        band={data.band}
        zones={data.zones ?? []}
        distanceM={data.distance_m}
        ascentM={data.ascent_m}
        fitsToday={fitsToday}
        fasterThanBestS={fasterThanBestS}
        de={de}
      />

      {/* VerdictBlock keeps the disclosures underneath — which inputs are
          defaults, where the blow-up is, why a time may be impossible. The
          ring is the answer; this is the fine print that keeps it honest. */}
      <VerdictBlock
        headline={false}
        band={data.band}
        blowUpKm={blowUp ? blowUp.distance_m / 1000 : null}
        blowUpClimb={blowUpClimb}
        blowUpWatts={blowUp ? blowUpCeilingW(segments, blowUp.distance_m) : null}
        cdaIsDefault={data.cda_is_default}
        durabilityIsDefault={data.durability_is_default}
        wPrimeIsDefault={data.w_prime_is_default}
        weatherUsed={data.weather_used}
        bandSamples={data.band_samples ?? 0}
        missing={data.missing}
        de={de}
      />

      {/* The profile painted by gradient, with the summit marked and the
          kilometres-per-bucket underneath — one card, as the design has it. */}
      <GradientCard
        segments={segments}
        distanceM={data.distance_m}
        ascentM={data.ascent_m}
      />


      {data.actual && <ActualVsPredicted actual={data.actual} de={de} />}

      <TargetTimeCard data={data} de={de} />

      {segments.length > 0 && (
        <section
          {...GLASS_CARD_MARKER}
          style={{ ...glassCardStyle, borderRadius: 20, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div ref={profileBoxRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <RehearsalProfile
              segments={segments}
              elevations={elevations}
              width={profileWidth}
              height={PROFILE_HEIGHT}
              onScrub={onScrubShared}
              activeIdx={activeIdx}
              blowUpIdxs={blowUpIdxs}
            />
            <WPrimeTrace
              segments={segments}
              wPrimeJ={wPrime}
              width={profileWidth}
              height={54}
              activeIdx={activeIdx}
              de={de}
            />
          </div>

          {/* The readout keeps its height whether or not a finger is down, so
              scrubbing doesn't shove the rest of the page up and down. */}
          <div style={{ minHeight: 44, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'baseline' }}>
            {scrubbed ? (
              <>
                <Readout label="km" value={formatDecimal(scrubbed.start_m / 1000, de)} />
                <Readout label={de ? 'Steigung' : 'Gradient'} value={`${formatDecimal(scrubbed.gradient_pct, de)} %`} />
                {/* Everything below the gradient is a PROJECTION, so each one
                    falls back to `—` on its own: an unpaced rehearsal still
                    scrubs the real road, it just has nothing to say about
                    watts. */}
                <Readout
                  label={de ? 'Ziel' : 'Target'}
                  value={scrubbed.power_w != null ? `${Math.round(scrubbed.power_w)} W` : '—'}
                />
                <Readout
                  label={de ? 'Tempo' : 'Speed'}
                  value={scrubbed.speed_ms != null ? `${formatDecimal(scrubbed.speed_ms * 3.6, de)} km/h` : '—'}
                />
                <Readout
                  label={de ? 'Zeit' : 'Elapsed'}
                  value={scrubbed.elapsed_s != null ? formatHms(scrubbed.elapsed_s) : '—'}
                />
                <Readout
                  label="W′"
                  value={
                    wPrime != null && scrubbed.w_bal_j != null
                      ? `${Math.round(Math.max(0, Math.min(1, scrubbed.w_bal_j / wPrime)) * 100)} %`
                      : '—'
                  }
                />
              </>
            ) : (
              <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                {data.can_predict
                  ? de
                    ? 'Über das Profil streichen — Watt, Tempo und W′ an jedem Punkt.'
                    : 'Drag across the profile — watts, speed and W′ at any point.'
                  : de
                    ? 'Über das Profil streichen — Kilometer und Steigung an jedem Punkt.'
                    : 'Drag across the profile — distance and gradient at any point.'}
              </span>
            )}
          </div>
        </section>
      )}

      <ClimbCards climbs={data.climbs} segments={segments} de={de} />

      {/* ── The forecast stack ─────────────────────────────────────────────
          Everything here is derived from one 1 Hz expansion of the simulated
          ride, so a predicted NP is comparable with a recorded one rather than
          a parallel estimate that would drift from it. */}
      {/* No section heading here: RideMetrics below already titles itself
          "WAS DICH ERWARTET", and adding one printed the same words twice. */}
      <RideMetrics data={data} de={de} />

      <TimeInZones
        zones={data.zones ?? []}
        ftpUsedW={data.ftp_used_w}
        ftpIsCpFallback={data.ftp_is_cp_fallback}
        de={de}
      />

      <EngineVsRoute demand={data.demand ?? []} de={de} />

      <CostCard battery={data.battery} matches={data.matches} de={de} />

      {/* The same forecast in the watch's own vocabulary. Its own card, not a
          footnote under W' and battery. */}
      <TrainingEffectCard trainingEffect={data.training_effect} />

      {/* The road's shape, coloured by what it costs — where the hard part
          actually falls, which neither the profile nor the zone totals say. */}
      <EffortProfile
        segments={segments}
        distanceM={data.distance_m}
        ascentM={data.ascent_m}
        ftpW={data.ftp_used_w ?? null}
      />

      {/* The plan a rider carries down the road, then the record it is
          measured against, then what to eat while doing it. */}
      <SegmentPlan chapters={data.chapters ?? []} de={de} />

      <RouteRecord
        history={data.history}
        pr={data.pr}
        forecastS={data.total_time_s}
        de={de}
      />

      <FuelPlanCard fuel={data.fuel} de={de} />

      {(data.total_kj != null || data.carbs_g_per_hour != null) && (
        <section
          {...GLASS_CARD_MARKER}
          style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span
            className="eyebrow"
            style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
          >
            {de ? 'VERPFLEGUNG' : 'FUELLING'}
          </span>
          <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
            {data.carbs_g_per_hour != null ? `${Math.round(data.carbs_g_per_hour)} g/h` : '—'}
          </span>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-ink-2)', margin: 0 }}>
            {data.total_kj != null
              ? de
                ? `Rund ${Math.round(data.total_kj).toLocaleString('de-DE')} kJ Arbeit — Kohlenhydrate ab der ersten Stunde, nicht erst wenn es weh tut.`
                : `About ${Math.round(data.total_kj).toLocaleString('en-US')} kJ of work — start the carbs in hour one, not when it starts to hurt.`
              : de
                ? 'Kohlenhydrate ab der ersten Stunde, nicht erst wenn es weh tut.'
                : 'Start the carbs in hour one, not when it starts to hurt.'}
          </p>
        </section>
      )}

      {/* The one block that ties this road to THIS morning. */}
      <CoachNote
        ascentM={data.ascent_m}
        distanceM={data.distance_m}
        blowUps={(data.blow_ups ?? []).length}
      />

      <CompareRehearsals current={data} de={de} />

      <AssumptionsRow
        assumptions={data.assumptions}
        onChange={(patch) => mutation.mutate(patch)}
        disabled={mutation.isPending}
        de={de}
      />

      <RiderKnobs
        assumptions={data.assumptions}
        onChange={(patch) => mutation.mutate(patch)}
        disabled={mutation.isPending}
        canProject={data.source_kind === 'target_event' || data.source_kind === 'crew_event'}
        de={de}
      />
      {mutation.isPending && (
        <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
          {de ? 'Rechne die Strecke neu …' : 'Re-running the route…'}
        </span>
      )}
      {mutation.isError && (
        <span style={{ fontSize: 12.5, color: 'var(--color-ink-2)' }}>
          {de
            ? 'Die Annahme konnte nicht gespeichert werden — die Zahlen oben gelten noch für die alte Einstellung.'
            : 'That assumption could not be saved — the numbers above still reflect the previous setting.'}
        </span>
      )}

      {/* What the athlete can DO with the forecast, once they believe it.
          Last, and deliberately after the knobs: a pacing plan is only worth
          taking away once the assumptions behind it are the ones they meant. */}
      <PlanActions
        rehearsalId={rehearsalId}
        canExport={(data.chapters ?? []).length > 0 && data.ftp_used_w != null}
      />
    </>,
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10.5, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>{label}</span>
      <span className="num-display" style={{ fontSize: 15, color: 'var(--color-ink)' }}>
        {value}
      </span>
    </span>
  )
}
