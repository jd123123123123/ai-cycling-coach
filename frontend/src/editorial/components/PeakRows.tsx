import { isPresent, type Value } from '../data/value'

export interface PeakRow {
  duration: string
  watts: number
  percentOfSeasonBest: number | null
}

/**
 * Transcribed from "Peak Power" (kx6iy, `01 The Session`): Kicker Row
 * (K "PEAK POWER TODAY" 9/800/ls1.6 $e-mid, right-aligned "% OF SEASON
 * BEST" 9/800/ls1.6 $e-quiet) above a Rows list (G0XmO, gap 9), each row a
 * duration label (44px, 9/800/ls1 $e-mid), a 10px-tall filled meter track,
 * a Value+Unit pair (16px Sora 800 $e-ink + "W" 9/700 $e-lo), and a
 * right-aligned percentage (9/800/ls0.6 $e-quiet).
 *
 * Data source (task-9-report.md, verify-check 3): `usePowerProfile()`'s
 * `peaks`/`mmp_curve` are a SANITIZED envelope across every stored ride
 * ever (`build_power_profile` in `detailed_power_profile.py` takes no date
 * range at all), never scoped to a season, and never scoped to today's
 * ride specifically — there is no endpoint anywhere that returns "today's
 * ride's power at 5s/1min/5min/12min." That is a bigger gap than the
 * brief's own question (which only asked about the season-best percentage
 * column): TodayModel cannot ground the duration/watts values themselves,
 * so `peaks` is always missing, not just missing its percentage column.
 * This matches the existing Insight Strip item ("PEAK POWER" →
 * `missing('No peak-power analysis yet.')`, TodayView.tsx, task 8) — the
 * same gap, found again independently here.
 *
 * The percentage column itself is still handled honestly per-row: when
 * every row's `percentOfSeasonBest` is null (as it always will be, given
 * the above), the whole column — header included — is omitted rather than
 * rendering a dash for a number nobody claims to know.
 */
export default function PeakRows({ peaks }: { peaks: Value<PeakRow[]> }) {
  const present = isPresent(peaks)
  const list = present ? peaks.value : []
  const showPct = list.some((p) => p.percentOfSeasonBest != null)

  return (
    <section data-peak-rows style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-mid)' }}>
          PEAK POWER TODAY
        </span>
        {showPct && (
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-quiet)' }}>
            % OF SEASON BEST
          </span>
        )}
      </div>

      {present ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {list.map((p) => (
            <div key={p.duration} style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--e-mid)', width: 44 }}>
                {p.duration}
              </span>
              <div style={{ flex: 1, height: 10, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', height: 8, borderRadius: 1, background: 'var(--e-peak-track)' }} />
              </div>
              <div style={{ width: 56, display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'flex-end' }}>
                <span
                  style={{
                    fontFamily: 'var(--e-display)', fontSize: 16, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1, color: 'var(--e-ink)',
                  }}
                >
                  {p.watts}
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 700, color: 'var(--e-lo)' }}>W</span>
              </div>
              {showPct && (
                <span
                  style={{
                    fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: 'var(--e-quiet)', width: 38, textAlign: 'right',
                  }}
                >
                  {p.percentOfSeasonBest != null ? `${Math.round(p.percentOfSeasonBest)}%` : '—'}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
          {peaks.missing}
        </p>
      )}
    </section>
  )
}
