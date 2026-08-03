import type { Rehearsal } from '../../api/rehearsal'
import { formatDecimal } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'

/**
 * RideMetrics — the six numbers a rider already knows how to read.
 *
 * Nothing here is invented for this screen: average power, NP, IF, TSS, work
 * and heart rate are the vocabulary every cycling app shares. What is different
 * is that these are FORECASTS produced by the same functions that measure a
 * recorded ride, which is why a predicted NP of 232 W can be compared directly
 * against the 228 W the rider comes home with.
 *
 * A cell shows "—" rather than a zero when its input is missing. The heart-rate
 * cell in particular is absent for most riders — it needs an LTHR, a resting
 * and a maximum, and a predicted heart rate built on a guessed maximum would
 * be a fabrication wearing a number's clothes.
 */
export default function RideMetrics({ data, de }: { data: Rehearsal; de: boolean }) {
  const cells: { label: string; value: string; sub?: string; estimate?: boolean }[] = [
    {
      label: de ? 'Ø LEISTUNG' : 'AVG POWER',
      value: data.avg_power_w != null ? `${Math.round(data.avg_power_w)} W` : '—',
    },
    {
      label: de ? 'NORM. LEISTUNG' : 'NORM. POWER',
      value: data.normalized_power_w != null ? `${Math.round(data.normalized_power_w)} W` : '—',
      sub:
        data.variability_index != null
          ? `VI ${formatDecimal(data.variability_index, de, 2)}`
          : undefined,
    },
    {
      label: 'IF',
      value: data.intensity_factor != null ? formatDecimal(data.intensity_factor, de, 2) : '—',
      sub:
        data.ftp_used_w != null
          ? `${de ? 'geg.' : 'vs'} ${Math.round(data.ftp_used_w)} W${data.ftp_is_cp_fallback ? ' (CP)' : ''}`
          : undefined,
    },
    {
      label: de ? 'TRAININGSLAST' : 'TRAINING LOAD',
      value: data.tss != null ? `${Math.round(data.tss)}` : '—',
      sub: 'TSS',
    },
    {
      label: de ? 'ARBEIT' : 'WORK',
      value:
        data.total_kj != null
          ? `${Math.round(data.total_kj).toLocaleString(de ? 'de-DE' : 'en-US')}`
          : '—',
      sub: 'kJ',
    },
    {
      label: de ? 'Ø PULS' : 'AVG HR',
      value: data.heart_rate != null ? `${Math.round(data.heart_rate.avg_bpm)}` : '—',
      sub: data.heart_rate != null ? `max ${Math.round(data.heart_rate.max_bpm)} bpm` : (de ? 'kein Puls-Profil' : 'no HR profile'),
      estimate: data.heart_rate != null,
    },
  ]

  const anything = cells.some((c) => c.value !== '—')
  if (!anything) return null

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{ ...glassCardStyle, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.16em', fontWeight: 800, color: 'var(--color-ink-2)' }}
      >
        {de ? 'WAS DICH ERWARTET' : 'WHAT TO EXPECT'}
      </span>

      {/* Two rows of three. A grid rather than three separate cards: these are
          one reading, not six. */}
      {[0, 3].map((offset) => (
        <div key={offset} style={{ display: 'flex', gap: 10 }}>
          {cells.slice(offset, offset + 3).map((c) => (
            <div key={c.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{ fontSize: 9.5, letterSpacing: '0.1em', fontWeight: 800, color: 'var(--color-muted)' }}
              >
                {c.label}
              </span>
              <span
                className="num-display"
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: c.value === '—' ? 'var(--color-muted)' : 'var(--color-ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {c.value}
                {c.estimate && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)' }}> ≈</span>
                )}
              </span>
              {c.sub && (
                <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{c.sub}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
