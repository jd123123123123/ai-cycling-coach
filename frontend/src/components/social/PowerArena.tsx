import { TrendingUp, Flame, Zap } from 'lucide-react'
import type { Locale } from '../../i18n/strings'
import type { PowerProfile } from '../../hooks/usePowerProfile'

// PowerArena — the competitive heart of Social. This is where you stack yourself
// against every other cyclist, honestly: your racing Category (A/B/C/D), your
// percentile vs trained riders, and a power profile that exposes whether you're a
// sprinter or a diesel. No fabricated rivals — the "others" are the real, public
// benchmark ladders (Zwift categories + Coggan power profiling). Fair AND fierce.
//
// Sources: Zwift category thresholds (zwiftinsider.com), Coggan/Allen power
// profiling (trainingpeaks.com), amateur W/kg distributions (roadmancycling.com).

// Classic community racing categories by FTP W/kg (recognisable everywhere).
function racingCat(wkg: number): { c: string; color: string; nextAt: number | null; nextC: string | null } {
  if (wkg >= 4.0) return { c: 'A', color: '#FFD60A', nextAt: null, nextC: null }
  if (wkg >= 3.2) return { c: 'B', color: 'var(--color-forest-2)', nextAt: 4.0, nextC: 'A' }
  if (wkg >= 2.5) return { c: 'C', color: 'var(--color-ink-blue)', nextAt: 3.2, nextC: 'B' }
  return { c: 'D', color: 'var(--color-muted)', nextAt: 2.5, nextC: 'C' }
}

// % of trained cyclists you'd out-rank at this FTP W/kg (piecewise, interpolated).
function percentile(wkg: number): number {
  const pts: [number, number][] = [
    [1.5, 3], [2.0, 10], [2.5, 25], [3.0, 42], [3.5, 60], [4.0, 76], [4.5, 88], [5.0, 95], [5.5, 98], [6.0, 99],
  ]
  if (wkg <= pts[0][0]) return pts[0][1]
  if (wkg >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 1; i < pts.length; i++) {
    if (wkg <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
      return Math.round(y0 + ((wkg - x0) / (x1 - x0)) * (y1 - y0))
    }
  }
  return 50
}

function tier(frac: number, de: boolean): string {
  if (frac >= 0.82) return de ? 'Elite' : 'Elite'
  if (frac >= 0.66) return de ? 'Stark' : 'Strong'
  if (frac >= 0.52) return de ? 'Wettkampf' : 'Competitive'
  if (frac >= 0.38) return de ? 'Fitness' : 'Fitness'
  return de ? 'Einsteiger' : 'Beginner'
}

// "Pro/world-class" W/kg reference per duration — the top of each bar.
const DURATIONS = [
  { s: '5', pro: 22.5, en: 'Sprint · 5s', de: 'Sprint · 5s' },
  { s: '60', pro: 11.5, en: 'Attack · 1min', de: 'Antritt · 1min' },
  { s: '300', pro: 7.6, en: 'VO₂ · 5min', de: 'VO₂ · 5min' },
  { s: '1200', pro: 6.4, en: 'Threshold · 20min', de: 'Schwelle · 20min' },
]

function lookup(curve: Record<string, number> | null | undefined, sec: string): number | null {
  if (!curve) return null
  if (curve[sec] != null) return curve[sec]
  // Tolerate near-miss keys (e.g. 1200 vs 1207).
  const target = Number(sec)
  let best: number | null = null, bestDiff = Infinity
  for (const k of Object.keys(curve)) {
    const diff = Math.abs(Number(k) - target)
    if (diff < bestDiff && diff <= target * 0.12) { bestDiff = diff; best = curve[k] }
  }
  return best
}

export default function PowerArena({
  power, improvementRate, streak, locale,
}: {
  power: PowerProfile | undefined
  improvementRate: number | null
  streak: number
  locale: Locale
}) {
  const de = locale === 'de'
  const wkgCurve = power?.wkg_curve ?? power?.peaks_wkg ?? null
  const cpWkg = power?.cp_wkg ?? (wkgCurve ? lookup(wkgCurve, '1200') : null)

  if (!cpWkg) {
    return (
      <div className="rounded-[20px] px-5 py-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          {de
            ? 'Trage FTP und Gewicht im Profil ein (oder fahre ein paar Einheiten mit Leistungsmesser), um deine Renn-Kategorie und dein Kraftprofil zu sehen.'
            : 'Add your FTP and weight in your profile (or log a few power rides) to unlock your racing category and power profile.'}
        </p>
      </div>
    )
  }

  const cat = racingCat(cpWkg)
  const pct = percentile(cpWkg)
  const toNext = cat.nextAt ? (cat.nextAt - cpWkg) : null
  const pheno = power?.phenotype?.type ?? null
  const phenoNote = power?.phenotype?.note ?? null

  return (
    <div className="flex flex-col gap-4">
      {/* ── Category medallion + percentile — the headline flex ── */}
      <div
        className="paper-grain rounded-[20px] p-5 sm:p-6 flex items-center gap-5"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          border: `1px solid color-mix(in srgb, ${cat.color} 32%, var(--color-rule))`,
          backgroundImage: `radial-gradient(90% 80% at 0% 0%, color-mix(in srgb, ${cat.color} 12%, transparent), transparent 60%)`,
        }}
      >
        <div
          className="shrink-0 grid place-items-center rounded-[18px]"
          style={{ width: 78, height: 78, border: `2px solid ${cat.color}`, boxShadow: `0 0 20px color-mix(in srgb, ${cat.color} 30%, transparent)`, background: `color-mix(in srgb, ${cat.color} 8%, transparent)` }}
        >
          <span className="num-display leading-none" style={{ fontSize: 40, color: cat.color, fontVariationSettings: '"opsz" 144, "wght" 600' }}>{cat.c}</span>
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 9.5, letterSpacing: '0.2em' }}>
            {de ? 'DEINE RENN-KATEGORIE' : 'YOUR RACING CATEGORY'}
          </span>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(17px, 4.6vw, 21px)', fontWeight: 500, color: 'var(--color-ink)', lineHeight: 1.15 }}>
            {de ? `Kategorie ${cat.c} · ${cpWkg.toFixed(1)} W/kg` : `Category ${cat.c} · ${cpWkg.toFixed(1)} W/kg`}
          </p>
          <p className="text-[12.5px]" style={{ color: 'var(--color-ink-2)' }}>
            {de
              ? `Schlägt ~${pct}% der trainierten Fahrer.${toNext ? ` Nur ${toNext.toFixed(1)} W/kg bis Kat ${cat.nextC}.` : ' Spitzenkategorie erreicht. 🐐'}`
              : `Beats ~${pct}% of trained cyclists.${toNext ? ` Just ${toNext.toFixed(1)} W/kg to Cat ${cat.nextC}.` : ' Top category reached. 🐐'}`}
          </p>
        </div>
      </div>

      {/* ── Power profile — your shape across durations (sprinter vs diesel) ── */}
      <div className="rounded-[20px] p-5 sm:p-6 flex flex-col gap-3.5" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <div className="flex items-center gap-2">
          <Zap size={14} strokeWidth={2} style={{ color: 'var(--color-amber)' }} />
          <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 9.5, letterSpacing: '0.2em' }}>
            {de ? 'KRAFTPROFIL · W/KG JE DAUER' : 'POWER PROFILE · W/KG BY DURATION'}
          </span>
        </div>
        {DURATIONS.map((d) => {
          const wkg = lookup(wkgCurve, d.s)
          const frac = wkg ? Math.max(0, Math.min(1, wkg / d.pro)) : 0
          const label = wkg ? tier(frac, de) : '—'
          const strong = frac >= 0.66
          return (
            <div key={d.s} className="flex items-center gap-3">
              <span className="num-mono shrink-0" style={{ width: 96, fontSize: 10.5, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>{de ? d.de : d.en}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: 'var(--color-rule)' }}>
                <div style={{ width: `${Math.round(frac * 100)}%`, height: '100%', backgroundColor: strong ? 'var(--color-amber)' : 'var(--color-forest-2)', borderRadius: 999, transition: 'width 700ms cubic-bezier(.22,1,.36,1)' }} />
              </div>
              <span className="num-mono shrink-0 text-right" style={{ width: 52, fontSize: 12, color: 'var(--color-ink)', fontWeight: 600 }}>{wkg ? wkg.toFixed(1) : '—'}</span>
              <span className="num-mono shrink-0 hidden sm:inline" style={{ width: 78, fontSize: 10, color: strong ? 'var(--color-amber)' : 'var(--color-muted)', textAlign: 'right' }}>{label}</span>
            </div>
          )
        })}
        {pheno && (
          <div className="flex items-start gap-2 pt-1 mt-1" style={{ borderTop: '1px solid var(--color-rule)' }}>
            <span className="mt-2" style={{ fontSize: 15 }}>🧬</span>
            <div className="pt-1.5">
              <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-ink)', fontWeight: 600 }}>{de ? 'Dein Typ: ' : 'Your type: '}{pheno}</span>
              {phenoNote && <p className="text-[11.5px] leading-snug mt-0.5" style={{ color: 'var(--color-muted)' }}>{phenoNote}</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── Mini KPI strip — momentum you can also brag about ── */}
      <div className="grid grid-cols-2 gap-3">
        <MiniKpi
          icon={TrendingUp}
          label={de ? 'FITNESS-ZUWACHS · 28T' : 'FITNESS GAIN · 28D'}
          value={improvementRate != null ? `${improvementRate >= 0 ? '+' : ''}${(improvementRate * 100).toFixed(1)}%` : '—'}
          positive={(improvementRate ?? 0) >= 0}
          quip={de ? 'dein Aufstieg, nicht der eines Profis' : 'your climb, not a pro’s'}
        />
        <MiniKpi
          icon={Flame}
          label={de ? 'SERIE' : 'STREAK'}
          value={`${streak}${de ? ' T' : 'd'}`}
          positive
          quip={de ? 'Ruhetage zählen mit' : 'rest days count'}
        />
      </div>
    </div>
  )
}

function MiniKpi({ icon: Icon, label, value, positive, quip }: { icon: typeof Flame; label: string; value: string; positive: boolean; quip: string }) {
  return (
    <div className="rounded-[16px] px-4 py-3.5 flex flex-col gap-1" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} strokeWidth={2} style={{ color: positive ? 'var(--color-forest-2)' : 'var(--color-muted)' }} />
        <span className="eyebrow num-mono" style={{ color: 'var(--color-muted)', fontSize: 9, letterSpacing: '0.14em' }}>{label}</span>
      </div>
      <span className="num-display leading-none" style={{ fontSize: 26, color: positive ? 'var(--color-forest-2)' : 'var(--color-ink)' }}>{value}</span>
      <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{quip}</span>
    </div>
  )
}
