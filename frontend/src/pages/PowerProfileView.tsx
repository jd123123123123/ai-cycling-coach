/**
 * PowerProfileView — built against pencil-new.pen "Screen · Power Profile"
 * (QLszB): Header → Power Curve card (peak bars, W ↔ W/kg toggle, zone
 * colors) → CP/Engine card → Phenotype card (violet) → Benchmarks table →
 * durability tiles. Every number from GET /analytics/power-profile —
 * computed from the athlete's own ride streams, no external service.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Gauge, Fingerprint, BatteryCharging, Percent } from 'lucide-react'
import DashboardShell from '../components/dashboard/DashboardShell'
import DashboardSection from '../components/dashboard/DashboardSection'
import { usePowerProfile, useRideCounts } from '../hooks/usePowerProfile'
import { useLocale } from '../contexts/LocaleContext'
import { useLanguage } from '../contexts/LanguageContext'
import { metricLabel, type GlossaryKey } from '../utils/metricLabel'
import { useGlossary } from '../components/ui/GlossarySheet'

// Static dotted underline — the tap-to-explain affordance (no hover-only cues).
const TAPPABLE_LABEL = {
  textDecoration: 'underline dotted',
  textUnderlineOffset: 3,
  textDecorationColor: 'var(--color-muted)',
} as const

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
  const { language } = useLanguage()
  const glossary = useGlossary()
  const [unit, setUnit] = useState<'w' | 'wkg'>('w')
  const { data } = usePowerProfile()
  const { data: counts } = useRideCounts()

  // Locale-aware percent formatting — audit shows DE '5,8 %' / EN '5.8%'.
  const fmtPct = (v: number) =>
    de ? `${v.toFixed(1).replace('.', ',')} %` : `${v.toFixed(1)}%`

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

  // THE display threshold (audit P0-1) + a W/kg derived from the same weight
  // the backend used for cp_wkg (weight ≈ cp / cp_wkg) — arithmetic, not a
  // second model. Null whenever either input is missing.
  const threshold = data?.threshold_watts ?? null
  const isManual = data?.threshold_source === 'manual'
  const modelValid = data?.model_valid === true
  const weightKg =
    data?.cp_watts != null && data?.cp_wkg != null && data.cp_wkg > 0
      ? data.cp_watts / data.cp_wkg
      : null
  const thresholdWkg = threshold != null && weightKg != null ? threshold / weightKg : null
  const ridesWithPower = counts?.rides_with_power ?? data?.n_rides ?? null

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

  // Phenotype is an output of the CP model — only shown when that model is
  // validated (audit P0-1: no rider-type claims from an unreliable fit).
  const phen = (data?.model_valid ? data?.phenotype : null) ?? null
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
            {ridesWithPower != null && (
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {de ? `Aus ${ridesWithPower} Fahrten mit Power — nur deine echten Daten` : `From ${ridesWithPower} rides with power — your real data only`}
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

        {/* ── Engine card: THE canonical threshold (audit P0-1) ── */}
        {threshold != null && (
          <div className="flex flex-col gap-3.5 p-5" style={CARD}>
            <div className="flex items-center gap-2">
              <Gauge size={16} style={{ color: 'var(--color-recovery)' }} />
              <span className="eyebrow" style={{ fontSize: 11.5, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                {de ? 'DEIN MOTOR' : 'YOUR ENGINE'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="num-display" style={{ fontSize: 40, color: 'var(--color-ink)' }}>{Math.round(threshold)}</span>
              <button
                type="button"
                onClick={() => glossary.open('ftp', `${Math.round(threshold)} W`)}
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-muted)', background: 'none', border: 0, padding: '10px 0', cursor: 'pointer', ...TAPPABLE_LABEL }}
              >
                W · {isManual
                  ? metricLabel('ftp', language, locale)
                  : de ? `${metricLabel('ftp', language, locale)} (geschätzt)` : `${metricLabel('ftp', language, locale)} (estimated)`}
              </button>
              {thresholdWkg != null && (
                <span className="num-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-recovery)' }}>{thresholdWkg.toFixed(1)} W/kg</span>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.4 }}>
              {isManual
                ? (de ? 'Aus deinem Profil — die eine Zahl, an der sich alles ausrichtet.' : 'From your profile — the one number everything else keys off.')
                : (de
                    ? 'Fortlaufend aus deinen besten Efforts geschätzt — kein Testtag nötig.'
                    : 'Continuously estimated from your best efforts — no test day required.')}
            </p>
            {modelValid ? (
              <DashboardSection
                id="power-profile-model-details"
                title={de ? 'Modelldetails' : 'Model details'}
                subtitle={de ? 'CP · W′ · eFTP — das Modell hinter der Schätzung' : 'CP · W′ · eFTP — the model behind the estimate'}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex">
                    {([
                      { v: data?.cp_watts != null ? `${Math.round(data.cp_watts)} W` : '—', l: metricLabel('cp', language, locale), hint: de ? 'Dauerleistung' : 'sustainable', g: 'cp' as GlossaryKey, has: data?.cp_watts != null },
                      { v: data?.w_prime_j != null ? `${(data.w_prime_j / 1000).toFixed(1)} kJ` : '—', l: metricLabel('w_prime', language, locale), hint: de ? 'Streichhölzer' : 'matchbook', g: 'w_prime' as GlossaryKey, has: data?.w_prime_j != null },
                      { v: data?.eftp_watts != null ? `${Math.round(data.eftp_watts)} W` : '—', l: metricLabel('eftp', language, locale), hint: de ? 'aus Fahrten' : 'from rides', g: 'eftp' as GlossaryKey, has: data?.eftp_watts != null },
                      { v: data?.r_squared != null ? `${Math.round(data.r_squared * 100)}%` : '—', l: de ? 'Modell-Fit' : 'model fit', hint: 'R²', g: null, has: false },
                    ] as Array<{ v: string; l: string; hint: string; g: GlossaryKey | null; has: boolean }>).map((s, i) => {
                      const inner = (
                        <>
                          <span className="num-display" style={{ fontSize: 18, color: 'var(--color-ink)' }}>{s.v}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-2)', ...(s.g ? TAPPABLE_LABEL : null) }}>{s.l}</span>
                          <span className="eyebrow" style={{ fontSize: 9, color: 'var(--color-muted)' }}>{s.hint}</span>
                        </>
                      )
                      const edge = i > 0 ? '1px solid var(--color-rule)' : undefined
                      return s.g ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => glossary.open(s.g as GlossaryKey, s.has ? s.v : null)}
                          className="flex-1 flex flex-col items-center gap-0.5"
                          style={{ background: 'none', border: 0, borderLeft: edge, padding: 0, minHeight: 44, cursor: 'pointer' }}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={{ borderLeft: edge }}>
                          {inner}
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                    {de
                      ? 'Critical Power aus dem Monod-Scherrer-Modell über deine besten Efforts. Angezeigt wird immer die FTP oben — das Modell ist der Beleg dahinter.'
                      : 'Critical Power from the Monod–Scherrer model over your best efforts. The FTP above is the display number — this model is the evidence behind it.'}
                  </p>
                </div>
              </DashboardSection>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.4 }}>
                {de
                  ? 'CP-Modell noch nicht belastbar — braucht mehr harte Bestwerte.'
                  : 'CP model not reliable yet — needs more hard best efforts.'}
              </p>
            )}
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

        {/* ── Durability tiles (.pen c5cMZ) — tappable chips → glossary sheet ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => glossary.open('durability', data?.durability_best_pct != null ? `${data.durability_best_pct > 0 ? '+' : ''}${Math.round(data.durability_best_pct)} %` : null)}
            className="flex flex-col items-start gap-1.5 p-4 text-left"
            style={{ ...CARD, minHeight: 44, cursor: 'pointer' }}
          >
            <div className="flex items-center gap-1.5">
              <BatteryCharging size={14} style={{ color: 'var(--color-recovery)' }} />
              <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-muted)', ...TAPPABLE_LABEL }}>
                {metricLabel('durability', language, locale).toUpperCase()}
              </span>
            </div>
            <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
              {data?.durability_best_pct != null ? `${data.durability_best_pct > 0 ? '+' : ''}${Math.round(data.durability_best_pct)}%` : '—'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Bester Power-Abfall spät in einer Fahrt' : 'Best late-ride power drop-off'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => glossary.open('decoupling', data?.avg_decoupling_pct != null ? fmtPct(data.avg_decoupling_pct) : null)}
            className="flex flex-col items-start gap-1.5 p-4 text-left"
            style={{ ...CARD, minHeight: 44, cursor: 'pointer' }}
          >
            <div className="flex items-center gap-1.5">
              <Percent size={14} style={{ color: 'var(--color-amber)' }} />
              <span className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-muted)', ...TAPPABLE_LABEL }}>
                {metricLabel('decoupling', language, locale).toUpperCase()}
              </span>
            </div>
            <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>
              {data?.avg_decoupling_pct != null ? `${data.avg_decoupling_pct.toFixed(1)}%` : '—'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--color-muted)', lineHeight: 1.35 }}>
              {de ? 'Ø Puls-Drift — unter 5% ist stark aerob' : 'Avg HR drift — under 5% means a deep aerobic base'}
            </span>
          </button>
        </div>
      </div>
      {glossary.sheet}
    </DashboardShell>
  )
}
