import { Flame } from 'lucide-react'
import Bars from '../components/Bars'
import DayMark from '../components/DayMark'
import DayRail from '../components/DayRail'
import DeltaRow from '../components/DeltaRow'
import FatigueCurve from '../components/FatigueCurve'
import InsightStrip from '../components/InsightStrip'
import MetricTrack from '../components/MetricTrack'
import PeakRows, { type PeakTotal } from '../components/PeakRows'
import PMCChart from '../components/PMCChart'
import SecHead from '../components/SecHead'
import Statement from '../components/Statement'
import StatTile from '../components/StatTile'
import StatusBar from '../components/StatusBar'
import TabBar from '../components/TabBar'
import Verdict from '../components/Verdict'
import WhatThisChanges from '../components/WhatThisChanges'
import ZoneRows from '../components/ZoneRows'
import { isPresent, mapValue, missing, present, type Value } from '../data/value'
import type { PmcPoint, TodayModel } from '../data/useTodayModel'
import EditorialRoot from '../EditorialRoot'
import type { CSSProperties } from 'react'

/**
 * The Today screen's layout, as a pure function of an already-assembled
 * TodayModel. Splitting it from the hook is what lets a fixture render the
 * real screen — no React Query, no auth, no backend — which is how these
 * screens get looked at rather than merely type-checked.
 *
 * The spine every Today state shares:
 *   StatusBar → Hero → Day Rail → Insight Strip → numbered sections
 *   → Tomorrow Band → TabBar
 *
 * Built for the Trained state, transcribed from the Trained frame (LdBJ4):
 * task 8 built the Hero + Insight Strip; task 9 added the numbered sections
 * ("01 The Session", "02 The Cost", "03 Trajectory"). The Quote Plate and
 * the Tomorrow Plate remain for a later task.
 *
 * Two things this hero deliberately leaves out, both recorded in
 * task-8-report.md as TodayModel gaps rather than invented:
 *  - The Cover's background photo (RLLDR's image fill + scrim) — TodayModel
 *    carries no ride-photo field, so the Cover sits on var(--e-ground)
 *    instead of a fabricated image.
 *  - The RC context line ("▲ hardest session in 18 days" / "+31 over your
 *    daily average") and the Hero Body's power-trace bar chart + block
 *    labels ("0:00" / "285 W AVG · 4 BLOCKS HELD" / "1:47") — both are
 *    session-history comparisons TodayModel has no field for, and the power
 *    trace additionally needs a per-second series no hook here provides.
 *    `sessionContext` routes this permanently-missing value through
 *    `missing()` rather than a hardcoded string, so a later task adding a
 *    real source only has to change this variable, not the markup below it.
 *
 * CORRECTED (coordinator's formal review, finding 1): the MetricTrack call
 * for session load previously passed "SESSION LOAD" as `label`, which
 * rendered it as a caption ABOVE the numeral. Trained's own Metric Track
 * has no such caption — "SESSION LOAD" is the unit stack's second line,
 * next to "TSS". Now passed as `unitSub`; `label`/`state` are both empty,
 * so MetricTrack renders no top caption at all for this call, matching the
 * pen exactly. See MetricTrack.tsx's own doc comment for the full record.
 */
export default function TodayView({ model }: { model: TodayModel }) {
  const { state } = model

  const sessionLoad: Value<number> = isPresent(model.session)
    ? model.session.value.tss != null
      ? present(model.session.value.tss)
      : missing('No TSS estimate for this session.')
    : missing(model.session.missing)

  const sessionName: Value<string> = mapValue(model.session, (s) => s.title)

  const sessionContext: Value<string> = missing('No session-load comparison available yet.')

  const insightItems = [
    { label: 'PEAK POWER', value: missing<string>('No peak-power analysis yet.') },
    {
      label: 'UNTIL BACK TO NEUTRAL',
      value: mapValue(model.recovery, (r) => `${Math.round(r.hoursRemaining)} h`),
    },
    { label: 'FITNESS', value: mapValue(model.pmc, (p) => `${Math.round(p.fitness)}`) },
  ]

  // ---- 01 The Session ----------------------------------------------------
  // `Bars` renders the one row TodayModel can ground — planned per-block
  // targets (model.session.value.blocks) — never a fabricated "ridden" row.
  // `DeltaRow` reads `delta` off the same list (always null today — see
  // planVsRidden's own doc comment on TodayModel) but is positioned above
  // the honestly-missing "WHAT YOU RODE" row, not above `Bars`, per the
  // tree (Fpt7K: DeltaRow → Ridden → Baseline → Bars/Planned).
  const sessionBlocks = isPresent(model.session)
    ? model.session.value.blocks.map((b) => ({
      label: b.label,
      minutes: b.minutes,
      watts: b.watts != null ? present(b.watts) : missing<number>('No target for this block.'),
      delta: null as number | null,
    }))
    : []
  const sessionClaim: Value<string> = mapValue(model.planVsRidden, () => '')

  // "Peak Power Today"'s Total hero (qYRaJ) is speculative even when peaks
  // exist: no field marks any one row as "the headline" one. The longest
  // duration in the list is the closest defensible stand-in (matches the
  // pen's own example, whose Total mirrors its 12-minute row) — but since
  // `model.peaks` is always missing today (verify-check 3), this is inert
  // until a real source exists.
  const peaksTotal: Value<PeakTotal> = isPresent(model.peaks) && model.peaks.value.length > 0
    ? present({
      watts: model.peaks.value[model.peaks.value.length - 1].watts,
      unit: `WATTS · ${model.peaks.value[model.peaks.value.length - 1].duration}`,
      delta: null,
    })
    : missing(isPresent(model.peaks) ? 'No headline peak identified for this ride yet.' : model.peaks.missing)

  const rideMicro: Value<string> = mapValue(model.ride, (r) => [
    r.distanceM != null ? `${(r.distanceM / 1000).toFixed(1)} KM` : null,
    r.kj != null ? `${r.kj.toLocaleString('en-GB')} KJ` : null,
    r.avgHr != null ? `${r.avgHr} BPM AVG` : null,
    r.np != null ? `NP ${r.np} W` : null,
  ].filter(Boolean).join('     '))

  // ---- 02 The Cost ---------------------------------------------------------
  const costTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: 'LOAD', value: sessionLoad, unit: 'TSS' },
    {
      label: 'TIME',
      value: isPresent(model.session)
        ? present(formatHoursMinutes(model.session.value.blocks.reduce((sum, b) => sum + b.minutes, 0)))
        : missing(model.session.missing),
      unit: 'HRS',
    },
    {
      label: 'INTENSITY',
      value: isPresent(model.session)
        ? model.session.value.intensityFactor != null
          ? present(model.session.value.intensityFactor.toFixed(2))
          : missing('No intensity factor for this session.')
        : missing(model.session.missing),
      unit: 'IF',
    },
    {
      label: 'POWER',
      value: isPresent(model.session)
        ? model.session.value.targetWatts != null
          ? present(model.session.value.targetWatts)
          : missing('No uniform target for this session.')
        : missing(model.session.missing),
      unit: 'WATTS',
    },
  ]

  const fatigueDelta1d = isPresent(model.pmc) ? pmcDelta(model.pmc.value.series, 1, (p) => p.atl) : null
  const costClaim: Value<string> = isPresent(model.pmc) && fatigueDelta1d != null
    ? present(fatigueDelta1d >= 0 ? `Fatigue jumped ${fatigueDelta1d}.` : `Fatigue eased ${Math.abs(fatigueDelta1d)}.`)
    : missing(isPresent(model.pmc) ? 'Not enough history to say how fatigue moved.' : model.pmc.missing)

  // ---- 03 Trajectory --------------------------------------------------------
  const fitnessDelta7d = isPresent(model.pmc) ? pmcDelta(model.pmc.value.series, 7, (p) => p.ctl) : null
  const trajectoryTiles: { label: string; value: Value<number | string>; unit: string }[] = [
    { label: 'FITNESS', value: mapValue(model.pmc, (p) => Math.round(p.fitness)), unit: fitnessDelta7d != null ? `${signed(fitnessDelta7d)} / 7D` : '' },
    { label: 'FATIGUE', value: mapValue(model.pmc, (p) => Math.round(p.fatigue)), unit: fatigueDelta1d != null ? `${signed(fatigueDelta1d)} / 1D` : '' },
    { label: 'FORM', value: mapValue(model.pmc, (p) => signed(Math.round(p.form))), unit: isPresent(model.pmc) ? (model.pmc.value.form < 0 ? 'SPENT' : model.pmc.value.form > 0 ? 'BANKED' : 'NEUTRAL') : '' },
  ]
  const trajectoryClaim: Value<string> = isPresent(model.pmc) && fitnessDelta7d != null
    ? present(`Fitness ${fitnessDelta7d >= 0 ? 'up' : 'down'} ${Math.abs(fitnessDelta7d)}. Form ${model.pmc.value.form < 0 ? 'spent' : model.pmc.value.form > 0 ? 'banked' : 'neutral'}.`)
    : missing(isPresent(model.pmc) ? 'Not enough history to chart a trend.' : model.pmc.missing)
  const pmcSeries: Value<PmcPoint[]> = mapValue(model.pmc, (p) => p.series)

  return (
    <EditorialRoot state={state}>
      <main data-day-state={state} style={{ display: 'flex', flexDirection: 'column' }}>
        <StatusBar time={new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />

        <div
          data-hero
          style={{
            width: '100%',
            background: 'var(--e-ground)',
            padding: '14px 24px 26px 24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 22,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <span
                  style={{
                    fontFamily: 'var(--e-body)',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.8,
                    color: 'var(--e-mid)',
                  }}
                >
                  {isPresent(model.dateLabel) ? model.dateLabel.value : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <Flame size={14} color="var(--e-mid)" aria-hidden="true" />
                  <span
                    style={{
                      fontFamily: 'var(--e-body)',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1.4,
                      color: 'var(--e-mid)',
                    }}
                  >
                    {isPresent(model.streakDays) ? `${model.streakDays.value} DAYS` : '—'}
                  </span>
                </div>
              </div>
            </div>

            <DayRail state={state} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <span
              style={{
                fontFamily: 'var(--e-display)',
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 1,
                color: 'var(--e-ink)',
              }}
            >
              {isPresent(sessionName) ? sessionName.value : '—'}
            </span>

            <MetricTrack
              label=""
              state=""
              value={sessionLoad}
              unit="TSS"
              unitSub="SESSION LOAD"
              delta={null}
              band={null}
              hue="var(--m-load)"
            />

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--e-quiet)',
                }}
              >
                {isPresent(sessionContext) ? sessionContext.value : sessionContext.missing}
              </span>
            </div>
          </div>

          <div style={{ position: 'absolute', top: 150, right: 24 }}>
            <DayMark state={state} />
          </div>
        </div>

        <div data-hero-body style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '20px 24px 0 24px' }}>
          <Verdict
            headline={mapValue(model.verdict, (v) => v.headline)}
            body={mapValue(model.verdict, (v) => v.body)}
          />
        </div>

        <InsightStrip items={insightItems} />

        <section data-section="01" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
          <SecHead
            index="01"
            title="THE SESSION"
            kicker
            chip={isPresent(model.session) ? `${model.session.value.blocks.length} BLOCKS` : undefined}
          />
          {/* Section 01's own Statement claim depends entirely on
              plan-vs-ridden matching (see sessionClaim above), which is
              always missing today. A bare "—" here, with its only
              explanation sitting well below the bars, read like a broken
              render (coordinator review round 2, defect 3) — the fuller
              reason is printed once, immediately under the honest-missing
              "WHAT YOU RODE" row below, so this Statement contributes
              nothing when it would just be a second, redundant dash. It
              still renders normally the day a real claim is available. */}
          {isPresent(sessionClaim) && <Statement claim={sessionClaim} />}

          <div style={{ paddingTop: 24 }}>
            {/* CORRECTED (coordinator review round 2, defect 1): this used
                to feed the PLANNED blocks to a "WHAT YOU RODE" heading, then
                admit right below it that the ride wasn't matched to its plan
                — planned numbers under a ridden label, the exact
                substitution the missing-data rule forbids. Now this heading
                owns its own honestly-missing row, and the actual data we
                have — the plan — renders below under its own true label. */}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 0 9px 0' }}>
              <span style={kickerLabel}>WHAT YOU RODE</span>
              <span style={kickerLabelQuiet}>
                {isPresent(model.session) && model.session.value.targetWatts != null
                  ? `TARGET ${model.session.value.targetWatts} W`
                  : ''}
              </span>
            </div>

            {/* CORRECTED (coordinator review round 3, defect 1): the Deltas
                row (Z7tZK in the tree) sits above the Ridden bars, not above
                Planned — moved here, above this honest-missing row, from
                inside `Bars` (which now renders only Planned). See
                `DeltaRow.tsx` and `Bars.tsx` for the full record. */}
            <DeltaRow blocks={sessionBlocks} />

            {/* CORRECTED (coordinator review round 3, defect 3): this
                placeholder used to reserve the full 104px chart height even
                though the ghost bars inside it are only 8px tall, leaving
                ~96px of dead space under the label before the reason text.
                "Frame intact" means the label, rails and Baseline survive —
                not a bar chart's pixel envelope when there is no chart, so
                this container is no longer height-constrained; it collapses
                to its (short, flat) content. */}
            <div data-ridden-row style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              {sessionBlocks.map((b, i) => (
                <div
                  key={i}
                  style={{ flex: b.minutes || 1, height: 8, borderRadius: '3px 3px 0 0', background: 'var(--e-bar-dim)' }}
                />
              ))}
            </div>
            {!isPresent(model.planVsRidden) && (
              <p style={quietReason}>{model.planVsRidden.missing}</p>
            )}

            <div data-baseline style={{ width: '100%', height: 1, background: 'var(--e-baseline)', margin: '10px 0' }} />

            <Bars blocks={sessionBlocks} />
            <div style={{ width: '100%', paddingTop: 8 }}>
              <span style={kickerLabelQuiet}>WHAT WAS PLANNED</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '18px 0 0 0' }}>
            <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: 'var(--e-mid)' }}>
              {isPresent(rideMicro) ? rideMicro.value : rideMicro.missing}
            </span>
          </div>

          <div style={{ paddingTop: 28 }}>
            <PeakRows total={peaksTotal} peaks={model.peaks} />
          </div>

          <div style={{ paddingTop: 28 }}>
            <ZoneRows zones={model.zones} />
          </div>

          <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: '100%', height: 1, background: 'var(--e-hairline)' }} />
            <span style={kickerLabelDim}>WHAT THIS CHANGES</span>
            <WhatThisChanges value={model.whatThisChanges} />
          </div>
        </section>

        <section data-section="02" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
          <SecHead
            index="02"
            title="THE COST"
            kicker
            chip={isPresent(model.recovery) ? `${Math.round(model.recovery.value.hoursRemaining)}H TO RUN` : undefined}
          />
          <Statement claim={costClaim} />

          <div style={{ width: '100%', display: 'flex', paddingTop: 20 }}>
            {costTiles.map((t) => (
              <StatTile key={t.label} label={t.label} value={t.value} unit={t.unit} />
            ))}
          </div>

          <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={kickerLabelDim}>FATIGUE · NEXT 48 HOURS</span>
            <FatigueCurve pmc={model.pmc} recovery={model.recovery} />
          </div>
        </section>

        <section data-section="03" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '42px 24px 0 24px' }}>
          <SecHead
            index="03"
            title="TRAJECTORY"
            kicker
            chip={fitnessDelta7d == null ? undefined : fitnessDelta7d > 0 ? 'CLIMBING' : fitnessDelta7d < 0 ? 'DECLINING' : 'STEADY'}
          />
          <Statement claim={trajectoryClaim} />

          <div style={{ width: '100%', display: 'flex', paddingTop: 20 }}>
            {trajectoryTiles.map((t) => (
              <StatTile key={t.label} label={t.label} value={t.value} unit={t.unit} />
            ))}
          </div>

          <div style={{ paddingTop: 14 }}>
            <PMCChart series={pmcSeries} days={42} />
          </div>
        </section>

        <TabBar active="today" />
      </main>
    </EditorialRoot>
  )
}

const kickerLabel: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-mid)',
}
const kickerLabelQuiet: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-quiet)',
}
const kickerLabelDim: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-lo)',
}
const quietReason: CSSProperties = {
  fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: '8px 0 0 0',
}

function pmcDelta(series: PmcPoint[], daysBack: number, pick: (p: PmcPoint) => number): number | null {
  if (series.length === 0) return null
  const last = series[series.length - 1]
  const priorIndex = series.length - 1 - daysBack
  const prior = priorIndex >= 0 ? series[priorIndex] : null
  if (prior == null) return null
  return Math.round(pick(last) - pick(prior))
}

function signed(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}

function formatHoursMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}:${String(m).padStart(2, '0')}`
}
