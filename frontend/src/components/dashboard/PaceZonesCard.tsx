import { Link } from 'react-router-dom'
import { Footprints } from 'lucide-react'
import { useTrainingZones, type SpeedZone } from '../../hooks/useTrainingZones'
import { useLocale } from '../../contexts/LocaleContext'

// Seiler 3-zone running pace zones from the athlete's threshold pace.
// Speeds arrive in m/s; runners read min/km, so we convert. Higher speed =
// faster = lower min/km, so open-ended zones flip direction: the easy zone
// (only a max speed) reads "slower than X", the hard zone (only a min speed)
// reads "faster than X".

function paceFromSpeed(ms: number | undefined): string | null {
  if (!ms || ms <= 0) return null
  const minPerKm = 1000 / ms / 60
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const ZONE_COLOR = ['var(--color-good)', 'var(--color-caution)', 'var(--color-bad)']

function ZoneRow({ index, zone }: { index: number; zone: SpeedZone }) {
  const color = ZONE_COLOR[index] ?? 'var(--color-muted)'
  const fastP = paceFromSpeed(zone.max_speed_ms) // fastest pace in the zone
  const slowP = paceFromSpeed(zone.min_speed_ms) // slowest pace in the zone
  const range = fastP && slowP ? `${fastP}–${slowP}`
    : fastP ? `> ${fastP}`   // easy zone — slower than its fast bound
    : slowP ? `< ${slowP}`   // hard zone — faster than its slow bound
    : '—'
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderTop: index === 0 ? undefined : '1px solid var(--color-rule)' }}>
      <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
      <span className="flex-1 min-w-0" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{zone.name}</span>
      <span className="num-mono" style={{ fontSize: 13, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>{range}<span style={{ color: 'var(--color-muted)', marginLeft: 4, fontSize: 11 }}>/km</span></span>
    </div>
  )
}

export default function PaceZonesCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data, isLoading } = useTrainingZones()
  const pace = data?.pace_zones
  const hasZones = !!pace && Object.keys(pace).length > 0
  // Threshold speed = zone2's upper bound (LT2), fall back to zone3's lower bound.
  const thresholdPace = hasZones
    ? paceFromSpeed(pace!.zone2?.max_speed_ms ?? pace!.zone3?.min_speed_ms)
    : null

  return (
    <div className="rounded-[18px] p-5 sm:p-6" style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow inline-flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--color-muted)' }}>
          <Footprints size={12} strokeWidth={2} style={{ color: 'var(--color-sport-run)' }} />
          {de ? 'Lauf-Pace-Zonen' : 'Running pace zones'}
        </span>
        {thresholdPace && (
          <span className="num-mono" style={{ fontSize: 11.5, color: 'var(--color-ink-2)' }}>
            {de ? 'Schwelle' : 'Threshold'} {thresholdPace}<span style={{ color: 'var(--color-muted)', marginLeft: 3 }}>/km</span>
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-24 rounded-xl shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
      ) : hasZones ? (
        <div>
          {Object.values(pace!).map((z, i) => <ZoneRow key={i} index={i} zone={z} />)}
        </div>
      ) : (
        // No running threshold pace on file — send them to set it.
        <div className="flex flex-col gap-2 py-2">
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
            {de
              ? 'Noch keine Lauf-Schwellenpace hinterlegt. Trage sie ein, um deine Seiler-Pace-Zonen (locker · Schwelle · hart) zu sehen.'
              : 'No running threshold pace on file yet. Set it to see your Seiler pace zones (easy · threshold · hard).'}
          </p>
          <Link to="/settings" className="inline-flex self-start items-center rounded-full px-3.5 py-1.5" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-paper)', background: 'var(--color-sport-run)' }}>
            {de ? 'Schwellenpace setzen' : 'Set threshold pace'}
          </Link>
        </div>
      )}
    </div>
  )
}
