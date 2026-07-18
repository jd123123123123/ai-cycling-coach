/**
 * PowerProfileView — built against pencil-new.pen "Screen · Power Profile"
 * (QLszB): Header → Power Curve card (peak bars, W ↔ W/kg toggle, zone
 * colors) → CP/Engine card → Phenotype card (violet) → Benchmarks table →
 * durability tiles. Every number from GET /analytics/power-profile —
 * computed from the athlete's own ride streams, no external service.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Gauge, Fingerprint, BatteryCharging, Percent } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import { apiClient } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

interface PowerProfile {
  available?: boolean
  cp_watts: number | null
  w_prime_j: number | null
  eftp_watts: number | null
  r_squared: number | null
  cp_wkg: number | null
  n_rides: number
  peaks: Record<string, number>
  peaks_wkg: Record<string, number>
  phenotype: { type: string; note: string; reserves: { neuromuscular_x: number; anaerobic_x: number; vo2_x: number } } | null
  durability_best_pct: number | null
  avg_decoupling_pct: number | null
  total_kj: number | null
}

const CARD = { background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 24 } as const

const DURATIONS: { key: string; label: string; zone: string }[] = [
  { key: '5', label: '5s', zone: 'var(--color-zone-6)' },
  { key: '15', label: '15s', zone: 'var(--color-zone-5)' },
  { key: '30', label: '30s', zone: 'var(--color-zone-5)' },
  { key: '60', label: '1m', zone: 'var(--color-zone-4)' },
  { key: '300', label: '5m', zone: 'var(--color-zone-3)' },
  { key: '600', label: '10m', zone: 'var(--color-zone-3)' },
  { key: '1200', label: '20m', zone: 'var(--color-zone-2)' },
  { key: '3600', label: '60m', zone: 'var(--color-zone-1)' },
]

export default function PowerProfileView() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const navigate = useNavigate()
  const [unit, setUnit] = useState<'w' | 'wkg'>('w')
  const { data } = useQuery<PowerProfile>({
    queryKey: ['analytics', 'power-profile'],
    queryFn: async () => (await apiClient.get<PowerProfile>('/analytics/power-profile')).data,
    staleTime: 30 * 60 * 1000,
  })

  const bars = useMemo(() => {
    if (!data) return []
    const src = unit === 'w' ? data.peaks : data.peaks_wkg
    if (!src) return []
    const vals = DURATIONS.map((d) => src[d.key]).filter((v): v is number => v != null)
    const max = Math.max(1, ...vals)
    return DURATIONS.filter((d) => src[d.key] != null).map((d) => ({
      ...d,
      v: src[d.key],
      h: Math.max(8, Math.round((src[d.key] / max) * 120)),
    }))
  }, [data, unit])

  if (data && data.available === false) {
    return (
      <DashboardShell>
        <div className="p-6 mx-auto" style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>
            {de ? 'Noch keine Power-Streams — fahre mit Powermeter und synchronisiere.' : 'No power streams yet — ride with a power meter and sync.'}
          </p>
        </div>
      </DashboardShell>
    )
  }

  const phen = data?.phenotype ?? null
  const reserves = phen ? [
    { label: de ? 'Neuromuskulär' : 'Neuromuscular', x: phen.reserves.neuromuscular_x, color: 'var(--color-zone-6)' },
    { label: de ? 'Anaerob' : 'Anaerobic', x: phen.reserves.anaerobic_x, color: 'var(--color-zone-5)' },
    { label: 'VO₂', x: phen.reserves.vo2_x, color: 'var(--color-zone-3)' },
  ] : []
  const maxReserve = Math.max(1.01, ...reserves.map((r) => r.x))

  return (
    <DashboardShell>
      <div className="mx-auto flex flex-col gap-5 px-4 pb-24 pt-3" style={{ maxWidth: 640 }}>
        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} aria-label={de ? 'Zurück' : 'Back'} className="grid place-items-center rounded-full" style={{ width: 40, height: 40, background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}>
            <ArrowLeft size={18} style={{ color: 'var(--color-ink-2)' }} />
          </button>
          <div className="flex flex-col">
            <h1 className="num-display" style={{ fontSize: 26, color: 'var(--color-ink)' }}>{de ? 'Power-Profil' : 'Power Profile'}</h1>
            {data && (
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {de ? `Aus ${data.n_rides} Fahrten mit Power — nur deine echten Daten` : `From ${data.n_rides} rides with power — your real data only`}
              </span>
            )}
          </div>
        </div>

        {/* ── Power curve (accent card, .pen mOAt3) ── */}
        <div className="flex flex-col gap-4 p-5" style={{ ...CARD, borderColor: 'var(--color-accent)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} style={{ color: 'var(--color-accent)' }} />
              <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                {de ? 'BESTWERTE · 90 TAGE' : 'PEAK POWERS · 90 DAYS'}
              </span>
            </div>
            <div className="flex gap-1 rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
              {(['w', 'wkg'] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnit(u)} className="rounded-full px-3 py-1" style={{
                  fontSize: 11.5, fontWeight: 700,
                  background: unit === u ? 'var(--color-accent)' : 'transparent',
                  color: unit === u ? '#0A0C0F' : 'var(--color-ink-2)',
                }}>
                  {u === 'w' ? 'W' : 'W/kg'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2" style={{ height: 150 }}>
            {bars.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                <span className="num-mono" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-ink)' }}>
                  {unit === 'w' ? Math.round(b.v) : b.v.toFixed(1)}
                </span>
                <div className="w-full rounded-t-[6px]" style={{ height: b.h, background: b.zone, opacity: 0.92 }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {bars.map((b) => (
              <span key={b.key} className="flex-1 text-center eyebrow" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{b.label}</span>
            ))}
          </div>
        </div>

        {/* ── Engine card: CP · W′ · eFTP (.pen CEBwA) ── */}
        {data?.cp_watts != null && (
          <div className="flex flex-col gap-3.5 p-5" style={CARD}>
            <div className="flex items-center gap-2">
              <Gauge size={16} style={{ color: 'var(--color-recovery)' }} />
              <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                {de ? 'DEIN MOTOR' : 'YOUR ENGINE'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="num-display" style={{ fontSize: 40, color: 'var(--color-ink)' }}>{Math.round(data.cp_watts)}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-muted)' }}>W CP</span>
              {data.cp_wkg != null && (
                <span className="num-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-recovery)' }}>{data.cp_wkg.toFixed(1)} W/kg</span>
              )}
            </div>
            <div className="flex">
              {([
                { v: data.w_prime_j != null ? `${(data.w_prime_j / 1000).toFixed(1)} kJ` : '—', l: 'W′', hint: de ? 'Streichhölzer' : 'matchbook' },
                { v: data.eftp_watts != null ? `${Math.round(data.eftp_watts)} W` : '—', l: 'eFTP', hint: de ? 'aus Fahrten' : 'from rides' },
                { v: data.r_squared != null ? `${Math.round(data.r_squared * 100)}%` : '—', l: de ? 'Modell-Fit' : 'model fit', hint: 'R²' },
              ]).map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={i > 0 ? { borderLeft: '1px solid var(--color-rule)' } : undefined}>
                  <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{s.v}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)' }}>{s.l}</span>
                  <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{s.hint}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.4 }}>
              {de
                ? 'Critical Power aus dem Monod-Scherrer-Modell über deine besten Efforts — kein Testtag nötig.'
                : 'Critical Power from the Monod–Scherrer model over your best efforts — no test day required.'}
            </p>
          </div>
        )}

        {/* ── Phenotype (violet card, .pen cVuvN) ── */}
        {phen && (
          <div className="flex flex-col gap-3.5 p-5" style={{ borderRadius: 24, background: 'color-mix(in srgb, var(--color-violet) 12%, var(--color-paper-2))', border: '1px solid var(--color-violet)' }}>
            <div className="flex items-center gap-2">
              <Fingerprint size={16} style={{ color: 'var(--color-violet)' }} />
              <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-violet)' }}>
                {de ? 'DEIN FAHRERTYP' : 'YOUR RIDER TYPE'}
              </span>
            </div>
            <span className="num-display" style={{ fontSize: 28, color: 'var(--color-ink)' }}>{phen.type}</span>
            <p style={{ fontSize: 13.5, color: 'var(--color-ink-2)', lineHeight: 1.5 }}>{phen.note}</p>
            <div className="flex flex-col gap-2.5">
              {reserves.map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-2)', width: 110 }}>{r.label}</span>
                  <div className="flex-1 rounded-full" style={{ height: 8, background: 'var(--color-surface-2)' }}>
                    <div className="rounded-full" style={{ height: 8, width: `${Math.min(100, (r.x / maxReserve) * 100)}%`, background: r.color }} />
                  </div>
                  <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)', width: 44, textAlign: 'right' }}>{r.x.toFixed(2)}×</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {de ? 'Reserven relativ zu deiner CP — wie viel „oben drauf" du je System hast.' : 'Reserves relative to your CP — how much headroom each system carries.'}
            </p>
          </div>
        )}

        {/* ── Durability tiles (.pen c5cMZ) ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5 p-4" style={CARD}>
            <div className="flex items-center gap-1.5">
              <BatteryCharging size={14} style={{ color: 'var(--color-recovery)' }} />
              <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{de ? 'HALTBARKEIT' : 'DURABILITY'}</span>
            </div>
            <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
              {data?.durability_best_pct != null ? `${data.durability_best_pct > 0 ? '+' : ''}${Math.round(data.durability_best_pct)}%` : '—'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Bester Power-Abfall spät in einer Fahrt' : 'Best late-ride power drop-off'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 p-4" style={CARD}>
            <div className="flex items-center gap-1.5">
              <Percent size={14} style={{ color: 'var(--color-amber)' }} />
              <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-muted)' }}>{de ? 'ENTKOPPLUNG' : 'DECOUPLING'}</span>
            </div>
            <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
              {data?.avg_decoupling_pct != null ? `${data.avg_decoupling_pct.toFixed(1)}%` : '—'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Ø Puls-Drift — unter 5% ist stark aerob' : 'Avg HR drift — under 5% means a deep aerobic base'}
            </span>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
