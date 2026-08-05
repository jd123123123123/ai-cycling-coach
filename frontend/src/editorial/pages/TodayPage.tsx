import { Flame } from 'lucide-react'
import DayMark from '../components/DayMark'
import DayRail from '../components/DayRail'
import InsightStrip from '../components/InsightStrip'
import MetricTrack from '../components/MetricTrack'
import StatusBar from '../components/StatusBar'
import TabBar from '../components/TabBar'
import Verdict from '../components/Verdict'
import { isPresent, mapValue, missing, present, type Value } from '../data/value'
import { useTodayModel } from '../data/useTodayModel'
import EditorialRoot from '../EditorialRoot'

/**
 * The spine every Today state shares:
 *   StatusBar → Hero → Day Rail → Insight Strip → numbered sections
 *   → Tomorrow Band → TabBar
 *
 * This task (8) builds the Hero + Insight Strip for the Trained state only,
 * transcribed from the Trained frame (LdBJ4). The numbered sections
 * ("01 The Session", "02 The Cost", "03 Trajectory"), the Quote Plate and
 * the Tomorrow Plate belong to later tasks and are not built here.
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
 */
export default function TodayPage() {
  const model = useTodayModel()
  const { state } = model

  const sessionLoad: Value<number> = isPresent(model.session)
    ? model.session.value.tss != null
      ? present(model.session.value.tss)
      : missing('No TSS estimate for this session.')
    : missing(model.session.missing)

  const sessionName: Value<string> = mapValue(model.session, (s) => s.title)

  const insightItems = [
    { label: 'PEAK POWER', value: missing<string>('No peak-power analysis yet.') },
    {
      label: 'UNTIL BACK TO NEUTRAL',
      value: mapValue(model.recovery, (r) => `${Math.round(r.hoursRemaining)} h`),
    },
    { label: 'FITNESS', value: mapValue(model.pmc, (p) => `${Math.round(p.fitness)}`) },
  ]

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
              label="SESSION LOAD"
              state=""
              value={sessionLoad}
              unit="TSS"
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
                No session-load comparison available yet.
              </span>
            </div>
          </div>

          <DayMark state={state} />
        </div>

        <div data-hero-body style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '20px 24px 0 24px' }}>
          <Verdict
            headline={mapValue(model.verdict, (v) => v.headline)}
            body={mapValue(model.verdict, (v) => v.body)}
          />
        </div>

        <InsightStrip items={insightItems} />

        <TabBar active="today" />
      </main>
    </EditorialRoot>
  )
}
