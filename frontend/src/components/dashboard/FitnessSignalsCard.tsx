import { useLocale } from '../../contexts/LocaleContext'
import { usePowerProfile } from '../../hooks/usePowerProfile'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'

// Fitness Signals — the physiological benchmarks that anchor everything else:
// threshold power (CP / eFTP), threshold heart rate (LTHR) and body weight. A
// tile grid of Sora numbers. Renders nothing until at least one signal exists.

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] p-3.5" style={{ background: 'var(--color-surface-2)' }}>
      <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--color-muted)' }}>{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="num-display" style={{ fontSize: 24, color: 'var(--color-ink)' }}>{value}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{unit}</span>
      </div>
    </div>
  )
}

export default function FitnessSignalsCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data: power } = usePowerProfile()
  const { data: athlete } = useAthleteProfile()

  const threshold = power?.cp_watts ?? power?.eftp_watts ?? athlete?.ftp_watts ?? null
  const lthr = athlete?.lthr_cycling ?? null
  const weight = athlete?.weight_kg ?? null

  const tiles: { label: string; value: string; unit: string }[] = []
  if (threshold != null) tiles.push({ label: power?.cp_watts ? 'CP' : 'FTP', value: `${Math.round(threshold)}`, unit: 'W' })
  if (lthr != null) tiles.push({ label: 'LTHR', value: `${Math.round(lthr)}`, unit: 'bpm' })
  if (weight != null) tiles.push({ label: de ? 'Gewicht' : 'Weight', value: weight.toFixed(1), unit: 'kg' })
  if (threshold != null && weight != null && weight > 0) tiles.push({ label: 'W/kg', value: (threshold / weight).toFixed(1), unit: 'W/kg' })

  if (tiles.length === 0) return null

  return (
    <div className="rounded-[24px] p-5 flex flex-col gap-4" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="num-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-ink)' }}>{de ? 'Fitness-Signale' : 'Fitness Signals'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{de ? 'Physiologische Benchmarks' : 'Physiological benchmarks'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Tile key={t.label} label={t.label} value={t.value} unit={t.unit} />
        ))}
      </div>
    </div>
  )
}
