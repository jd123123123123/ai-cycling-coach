import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Zap, ChevronDown } from 'lucide-react'
import { usePowerProfile } from '../../hooks/usePowerProfile'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useCountUp } from '../../hooks/useCountUp'
import { useLocale } from '../../contexts/LocaleContext'

// Athlete Critical Power + the full power profile, fit from the cross-ride
// power-duration envelope (stream-derived). Signature element: the
// power-duration curve with CP drawn as a dashed asymptote the curve flattens
// toward. Surfaces CP/eFTP/W′, W/kg (toggle), peak power across 8 durations,
// rider-type phenotype, durability + decoupling, and a per-ride breakdown.

const VB_W = 340
const VB_H = 132
const PAD_L = 8
const PAD_R = 8
const PAD_T = 14
const PAD_B = 18

const PEAK_LABELS: Record<string, string> = {
  '5': '5s', '15': '15s', '30': '30s', '60': '1min',
  '300': '5min', '600': '10min', '1200': '20min', '3600': '60min',
}
const PEAK_ORDER = ['5', '15', '30', '60', '300', '600', '1200', '3600']
const TICKS = [5, 60, 300, 1200, 3600]

function fmtDuration(s: number, de: boolean): string {
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return de ? `${m}min` : `${m}m`
}

export default function CriticalPowerCard() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data, isLoading } = usePowerProfile()
  const { data: profile } = useAthleteProfile()

  const hasWkg = data?.cp_wkg != null && data?.wkg_curve != null
  const [showWkg, setShowWkg] = useState(false)
  const [showRides, setShowRides] = useState(false)
  const wkg = showWkg && hasWkg

  const cp = data?.cp_watts ?? null
  const eftp = data?.eftp_watts ?? null
  const wPrime = data?.w_prime_j ?? null
  const storedFtp = profile?.ftp_watts ?? null
  const delta = eftp != null && storedFtp != null ? Math.round(eftp - storedFtp) : null

  const cpVal = wkg ? data?.cp_wkg ?? null : cp
  const unit = wkg ? 'W/kg' : 'W'
  const fmtV = (v: number) => (wkg ? v.toFixed(2) : Math.round(v).toString())

  // Power-duration curve geometry for the active unit (log-x, linear-y).
  const curve = useMemo(() => {
    const src = wkg ? data?.wkg_curve : data?.mmp_curve
    if (!src || cpVal == null) return null
    const pts = Object.entries(src)
      .map(([d, w]) => ({ d: Number(d), w: Number(w) }))
      .filter((p) => p.d > 0 && p.w > 0)
      .sort((a, b) => a.d - b.d)
    if (pts.length < 2) return null
    const lx = (d: number) => Math.log10(d)
    const xmin = lx(pts[0].d)
    const xmax = lx(pts[pts.length - 1].d)
    const ymax = Math.max(...pts.map((p) => p.w)) * 1.02
    const px = (d: number) => PAD_L + ((lx(d) - xmin) / (xmax - xmin)) * (VB_W - PAD_L - PAD_R)
    const py = (w: number) => PAD_T + (1 - w / ymax) * (VB_H - PAD_T - PAD_B)
    const line = pts.map((p) => `${px(p.d)},${py(p.w)}`).join(' ')
    const area = `${px(pts[0].d)},${py(0)} ${line} ${px(pts[pts.length - 1].d)},${py(0)}`
    const ticks = TICKS.filter((t) => t >= pts[0].d && t <= pts[pts.length - 1].d).map((t) => ({ t, x: px(t) }))
    return { line, area, cpY: py(cpVal), ticks, dots: pts.map((p) => ({ x: px(p.d), y: py(p.w) })) }
  }, [data, cpVal, wkg])

  const countedCp = useCountUp(cp ?? 0, { durationMs: 900 })
  const hasDelta = delta != null && Math.abs(delta) >= 3

  if (isLoading) {
    return (
      <div className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <div className="h-4 w-44 rounded animate-pulse mb-3" style={{ backgroundColor: 'var(--color-rule)' }} />
        <div className="h-28 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--color-rule)' }} />
      </div>
    )
  }

  if (!data?.available || cp == null) {
    return (
      <div className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <span className="eyebrow flex items-center gap-1.5" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          <Zap size={11} /> CRITICAL POWER
        </span>
        <p className="text-[11px] leading-relaxed mt-2" style={{ color: 'var(--color-muted)', maxWidth: '34ch' }}>
          {de
            ? 'Fahre mit Leistungsmesser — sobald genug Strecken mit Leistungsdaten synchronisiert sind, modellieren wir deine Critical Power.'
            : 'Ride with a power meter — once enough rides with power data sync, we model your Critical Power from the power-duration curve.'}
        </p>
      </div>
    )
  }

  return (
    <div
      className="paper-grain rounded-[20px] px-5 py-4 sm:px-6 sm:py-5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: hasDelta && delta! > 0 ? '1px solid rgba(48, 209, 88, 0.30)' : '1px solid var(--color-rule)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="eyebrow flex items-center gap-1.5" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
          <Zap size={11} color="var(--color-forest-2)" /> CRITICAL POWER
        </span>
        <div className="flex items-center gap-3">
          {hasWkg && (
            <div className="flex rounded-[7px] overflow-hidden" style={{ border: '1px solid var(--color-rule)' }}>
              {[['W', false], ['W/kg', true]].map(([label, on]) => (
                <button
                  key={label as string}
                  onClick={() => setShowWkg(on as boolean)}
                  className="num-mono px-2 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: (on as boolean) === wkg ? 'var(--color-forest-2)' : 'transparent',
                    color: (on as boolean) === wkg ? 'var(--color-paper)' : 'var(--color-muted)',
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
          )}
          <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9 }}>
            {data.n_rides} {de ? 'FAHRTEN' : 'RIDES'} · R²&nbsp;{data.r_squared?.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Stat trio */}
      <div className="flex items-end gap-6 mt-2 flex-wrap">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-forest-2)', fontSize: 9, letterSpacing: '0.18em' }}>CP</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="num-display leading-none" style={{ fontSize: 'clamp(26px, 3.2vw, 34px)', color: 'var(--color-ink)' }}>
              {wkg ? data.cp_wkg!.toFixed(2) : countedCp}
            </span>
            <span className="num-mono text-[12px]" style={{ color: 'var(--color-ink-2)' }}>{unit}</span>
            {!wkg && data.cp_wkg != null && (
              <span className="num-mono text-[11px] ml-1" style={{ color: 'var(--color-forest-2)' }}>{data.cp_wkg.toFixed(2)} W/kg</span>
            )}
          </div>
        </div>
        {eftp != null && (
          <div>
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.18em' }}>eFTP</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="num-display leading-none" style={{ fontSize: 'clamp(18px, 2.2vw, 24px)', color: 'var(--color-ink-2)' }}>{Math.round(eftp)}</span>
              <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>W</span>
            </div>
          </div>
        )}
        {wPrime != null && (
          <div>
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.18em' }}>W′</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="num-display leading-none" style={{ fontSize: 'clamp(18px, 2.2vw, 24px)', color: 'var(--color-ink-2)' }}>{(wPrime / 1000).toFixed(1)}</span>
              <span className="num-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>kJ</span>
            </div>
          </div>
        )}
        {hasDelta && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-[8px]" style={{ backgroundColor: delta! > 0 ? 'rgba(48, 209, 88, 0.10)' : 'rgba(255, 159, 10, 0.10)', border: delta! > 0 ? '1px solid rgba(48, 209, 88, 0.25)' : '1px solid rgba(255, 159, 10, 0.25)' }}>
            {delta! > 0 ? <TrendingUp size={12} color="#30D158" /> : <TrendingDown size={12} color="var(--color-amber)" />}
            <span className="num-mono text-[11px] font-semibold" style={{ color: delta! > 0 ? '#30D158' : 'var(--color-amber)' }}>{delta! > 0 ? '+' : ''}{delta}W vs FTP</span>
          </div>
        )}
      </div>

      {/* Power-duration curve */}
      {curve && (
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full mt-3" style={{ display: 'block' }} role="img" aria-label="Power-duration curve">
          <defs>
            <linearGradient id="cp-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-forest-2)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-forest-2)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={PAD_L} y1={curve.cpY} x2={VB_W - PAD_R} y2={curve.cpY} stroke="var(--color-amber)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          <text x={VB_W - PAD_R} y={curve.cpY - 4} textAnchor="end" className="num-mono" style={{ fontSize: 9, fill: 'var(--color-amber)' }}>
            CP {fmtV(cpVal!)}{unit}
          </text>
          <polygon points={curve.area} fill="url(#cp-area)" />
          <polyline points={curve.line} fill="none" stroke="var(--color-forest-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {curve.dots.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--color-forest-2)" />))}
          {curve.ticks.map((tk) => {
            const anchor = tk.x > VB_W - 24 ? 'end' : tk.x < 24 ? 'start' : 'middle'
            return (
              <text key={tk.t} x={tk.x} y={VB_H - 5} textAnchor={anchor} className="num-mono" style={{ fontSize: 8, fill: 'var(--color-muted)' }}>{fmtDuration(tk.t, de)}</text>
            )
          })}
        </svg>
      )}

      {/* Peak power strip — 8 durations, W or W/kg per toggle. */}
      {data.peaks && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {PEAK_ORDER.map((key) => {
            const w = data.peaks?.[key]
            if (w == null) return null
            const shown = wkg ? data.peaks_wkg?.[key] : w
            if (shown == null) return null
            return (
              <div key={key} className="rounded-[10px] px-2.5 py-2" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
                <div className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 8.5, letterSpacing: '0.12em' }}>{PEAK_LABELS[key]}</div>
                <div className="flex items-baseline gap-0.5 mt-0.5">
                  <span className="num-mono" style={{ fontSize: 14, color: 'var(--color-ink)' }}>{wkg ? shown.toFixed(1) : Math.round(shown)}</span>
                  <span className="num-mono text-[8px]" style={{ color: 'var(--color-muted)' }}>{unit}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rider-type phenotype + reserves. */}
      {data.phenotype && (
        <div className="flex items-start gap-2.5 mt-3 px-3 py-2.5 rounded-[10px]" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
          <Zap size={13} color="var(--color-amber)" style={{ marginTop: 1, flexShrink: 0 }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="num-mono text-[12px] font-semibold" style={{ color: 'var(--color-ink)' }}>
                {de ? 'FAHRERTYP' : 'RIDER TYPE'}: {data.phenotype.type}
              </span>
              <span className="num-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>
                {data.phenotype.reserves.neuromuscular_x}× · {data.phenotype.reserves.anaerobic_x}× · {data.phenotype.reserves.vo2_x}× CP
              </span>
            </div>
            <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--color-muted)' }}>{data.phenotype.note}</p>
          </div>
        </div>
      )}

      {/* Fatigue resistance. */}
      {(data.durability_avg_pct != null || data.avg_decoupling_pct != null) && (
        <div className="flex items-center gap-5 mt-3 flex-wrap">
          {data.durability_avg_pct != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.16em' }}>{de ? 'DURABILITÄT' : 'DURABILITY'}</span>
              <span className="num-mono text-[13px]" style={{ color: 'var(--color-ink)' }}>−{data.durability_avg_pct}%</span>
              <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{de ? 'Abfall n. 1500 kJ' : 'drop after 1500 kJ'}</span>
            </div>
          )}
          {data.avg_decoupling_pct != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.16em' }}>{de ? 'HF-DRIFT' : 'DECOUPLING'}</span>
              <span className="num-mono text-[13px]" style={{ color: 'var(--color-ink)' }}>{data.avg_decoupling_pct}%</span>
            </div>
          )}
          {data.total_kj != null && (
            <div className="flex items-baseline gap-1.5 ml-auto">
              <span className="num-mono text-[12px]" style={{ color: 'var(--color-ink-2)' }}>{Math.round(data.total_kj).toLocaleString()} kJ</span>
              <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{de ? 'gesamt' : 'total'}</span>
            </div>
          )}
        </div>
      )}

      {/* Per-ride science breakdown — the most granular view. */}
      {data.rides && data.rides.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowRides((v) => !v)}
            className="flex items-center gap-1.5 num-mono text-[10px]"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.1em' }}
          >
            <ChevronDown size={12} style={{ transform: showRides ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            {de ? 'PRO-FAHRT-ANALYSE' : 'PER-RIDE BREAKDOWN'} ({data.rides.length})
          </button>
          {showRides && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--color-muted)' }}>
                    {['', 'NP', 'kJ', de ? 'Drift' : 'Decpl', 'CP', "W′↓"].map((h, i) => (
                      <th key={i} className="num-mono text-[8.5px] font-normal text-left py-1" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rides.slice(0, 12).map((r) => (
                    <tr key={r.activity_id} style={{ borderTop: '1px solid var(--color-rule)' }}>
                      <td className="py-1.5 pr-2 text-[10px]" style={{ color: 'var(--color-ink-2)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span className="num-mono" style={{ color: 'var(--color-muted)' }}>{r.date?.slice(5)}</span> {r.title}
                      </td>
                      <td className="num-mono text-[11px] py-1.5" style={{ color: 'var(--color-ink)' }}>{r.np_watts != null ? Math.round(r.np_watts) : '—'}</td>
                      <td className="num-mono text-[11px] py-1.5" style={{ color: 'var(--color-ink-2)' }}>{r.total_kj != null ? Math.round(r.total_kj) : '—'}</td>
                      <td className="num-mono text-[11px] py-1.5" style={{ color: 'var(--color-ink-2)' }}>{r.decoupling_pct != null ? `${r.decoupling_pct}%` : '—'}</td>
                      <td className="num-mono text-[11px] py-1.5" style={{ color: 'var(--color-ink-2)' }}>{r.cp_watts != null ? Math.round(r.cp_watts) : '—'}</td>
                      <td className="num-mono text-[11px] py-1.5" style={{ color: r.depleted ? 'var(--color-amber)' : 'var(--color-ink-2)' }}>
                        {r.wbal_min_kj != null ? `${r.wbal_min_kj}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed mt-3" style={{ color: 'var(--color-muted)', maxWidth: '46ch' }}>
        {de
          ? 'CP = nachhaltige Leistung (Asymptote); W′ = anaerobe Reserve darüber. Durabilität = Leistungsabfall spät in langen Fahrten. Aus der Bestleistungs-Hüllkurve aller Fahrten.'
          : 'CP = sustainable power (the asymptote); W′ = the anaerobic reserve above it. Durability = power lost late in long rides. Fit from your best-effort envelope across all rides.'}
      </p>
    </div>
  )
}
