import { isPresent, type Value } from '../data/value'

export interface HrZone {
  name: string
  lowBpm: number
  highBpm: number
  seconds: number
}

/**
 * Transcribed from "HR Zones" (vvR2D, `01 The Session`): Kicker Row (K
 * "TIME IN HEART RATE ZONES" 9/800/ls1.6 $e-mid, Caption "36% AT THRESHOLD"
 * 9/700/ls1.2 $e-quiet, right-aligned "1:47 TOTAL" 9/800/ls1.6 $e-quiet) —
 * a 12px-tall segmented Bar (asN1m, 5 rects, gap 3) — a 5-column Legend
 * (KjKQ7, gap 3: 2px Tone rect, "Z1" 9/800/ls1 $e-mid, "22:00" 13/800
 * $e-ink, "< 124" 8/700 $e-quiet).
 *
 * Zone tones (Bar + Legend "Tone" both use the same 5): Z1 #FFFFFF14
 * (var(--d-1)), Z2 #FFFFFF26 (var(--e-zone-z2), no existing token matched),
 * Z3 #FFFFFF3D (var(--e-zone-z3)), Z4 literal #FF5E00 → var(--st-active)
 * (this IS the "at threshold" zone the caption calls out), Z5 #FFFFFF8C
 * (var(--d-4), an exact match).
 *
 * Data source (task-9-report.md, verify-check 2): `useStreamAnalysis`'s
 * `hr_zones` carries `{ secs: number[5], max_hr }` — the backend derives
 * `secs` from FIXED %-of-max-HR bounds (60/70/80/90%, `_hr_zones` in
 * `activity_stream_analysis.py`), not from any user-configured zone table
 * (`useTrainingZones` has no heart-rate zones at all — only power/pace).
 * So bpm bounds ARE real, computed the same way every time: zone i spans
 * `[bounds[i] * max_hr, bounds[i+1] * max_hr)`, open above for Z5 — this is
 * exactly what produces the pen's own "< 124" / "164 +" shape. `zones` is
 * missing whenever there is no ride today or the ride has no HR stream —
 * never because zones are "unset" (there is nothing to configure), so
 * TodayModel's reason text says so rather than reusing the brief's literal
 * suggested string.
 */
const ZONE_TONE = ['var(--d-1)', 'var(--e-zone-z2)', 'var(--e-zone-z3)', 'var(--st-active)', 'var(--d-4)']

export default function ZoneRows({ zones }: { zones: Value<HrZone[]> }) {
  const present = isPresent(zones)
  const list = present ? zones.value : []
  const totalSeconds = list.reduce((sum, z) => sum + z.seconds, 0)
  const z4 = list.find((z) => z.name === 'Z4')
  const thresholdPct = z4 && totalSeconds > 0 ? Math.round((z4.seconds / totalSeconds) * 100) : null

  return (
    <section data-zone-rows style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-mid)',
            }}
          >
            TIME IN HEART RATE ZONES
          </span>
          {thresholdPct != null && (
            <span
              style={{
                fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: 'var(--e-quiet)',
              }}
            >
              {thresholdPct}% AT THRESHOLD
            </span>
          )}
        </div>
        <span
          style={{
            fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1.6, color: 'var(--e-quiet)',
          }}
        >
          {present ? `${formatMinSec(totalSeconds)} TOTAL` : '—'}
        </span>
      </div>

      {present ? (
        <>
          <div style={{ width: '100%', height: 12, display: 'flex', gap: 3 }}>
            {list.map((z, i) => (
              <div
                key={z.name}
                style={{ flex: z.seconds > 0 ? z.seconds : 0, height: 12, background: ZONE_TONE[i] ?? 'var(--d-1)' }}
              />
            ))}
          </div>
          <div style={{ width: '100%', display: 'flex', gap: 3 }}>
            {list.map((z, i) => (
              <div key={z.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ width: '100%', height: 2, background: ZONE_TONE[i] ?? 'var(--d-1)' }} />
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--e-mid)' }}>
                  {z.name}
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 13, fontWeight: 800, color: 'var(--e-ink)' }}>
                  {formatMinSec(z.seconds)}
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 700, color: 'var(--e-quiet)' }}>
                  {formatRange(z)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
          {zones.missing}
        </p>
      )}
    </section>
  )
}

function formatMinSec(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatRange(z: HrZone): string {
  if (z.lowBpm <= 0) return `< ${z.highBpm}`
  if (!Number.isFinite(z.highBpm)) return `${z.lowBpm} +`
  return `${z.lowBpm}–${z.highBpm}`
}
