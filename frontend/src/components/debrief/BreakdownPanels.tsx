import { useLocale } from '../../contexts/LocaleContext'
import type {
  RaceDebrief, Pacing, Climb, EffortMatch, Efficiency, Matchbook, Quadrant, Fueling, WkoModel, Cda,
} from '../../api/debrief'

// Act 3 — the breakdown. A grid of small analytical cards, one per analyzer
// block. Each card returns null when its data is absent, so the grid only
// ever shows what this ride actually produced.

function fmtMmSs(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return '—'
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function durationLabel(seconds: number, de: boolean): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.round(seconds / 60)
  return de ? `${m}min` : `${m}m`
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[18px] p-4 sm:p-5 flex flex-col gap-2.5"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function StatBlock({ value, unit, label, color }: { value: string; unit?: string; label: string; color?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="num-mono" style={{ fontSize: 20, fontWeight: 600, color: color ?? 'var(--color-ink)', lineHeight: 1.1 }}>
          {value}
        </span>
        {unit && <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      <div style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

// ─── PacingCard ──────────────────────────────────────────────────────────────

function PacingCard({ pacing }: { pacing: Pacing | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!pacing) return null

  const split = pacing.split_pct
  const splitTone = split < -3 ? 'var(--color-bad)' : split < 0 ? 'var(--color-caution)' : 'var(--color-good)'

  const firstHalf = pacing.first_half_np
  const secondHalf = pacing.second_half_np
  const maxHalf = Math.max(firstHalf, secondHalf, 1)

  const zoneEntries = Object.entries(pacing.zone_time_pct ?? {}).filter(([, v]) => v > 0)

  return (
    <Card label={de ? 'PACING' : 'PACING'}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${split > 0 ? '+' : ''}${split.toFixed(1)}`} unit="%" label={de ? 'Split' : 'Split'} color={splitTone} />
        {pacing.variability_index != null && (
          <StatBlock value={pacing.variability_index.toFixed(2)} label="VI" />
        )}
        <StatBlock value={`${pacing.surge_count}`} label={de ? 'Angriffe' : 'Surges'} />
      </div>

      {/* First vs second half mini bar */}
      <div className="mt-1">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10.5, color: 'var(--color-muted)', width: 20 }}>1st</span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'var(--color-rule)' }}>
            <div style={{ width: `${(firstHalf / maxHalf) * 100}%`, height: '100%', backgroundColor: 'var(--color-ink-2)' }} />
          </div>
          <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-ink-2)', width: 32, textAlign: 'right' }}>{Math.round(firstHalf)}W</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span style={{ fontSize: 10.5, color: 'var(--color-muted)', width: 20 }}>2nd</span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'var(--color-rule)' }}>
            <div style={{ width: `${(secondHalf / maxHalf) * 100}%`, height: '100%', backgroundColor: splitTone }} />
          </div>
          <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-ink-2)', width: 32, textAlign: 'right' }}>{Math.round(secondHalf)}W</span>
        </div>
      </div>

      {zoneEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {zoneEntries.map(([zone, pct]) => (
            <div key={zone} className="flex items-center gap-1.5">
              <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{zone}</span>
              <div className="rounded-full overflow-hidden" style={{ width: 36, height: 5, backgroundColor: 'var(--color-rule)' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: 'var(--color-forest-2)' }} />
              </div>
              <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-ink-2)' }}>{Math.round(pct)}%</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── ClimbsCard ──────────────────────────────────────────────────────────────

function ClimbsCard({ climbs }: { climbs: Climb[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!climbs || climbs.length === 0) return null

  return (
    <Card label={de ? 'ANSTIEGE' : 'CLIMBS'}>
      <div className="flex flex-col gap-1.5">
        {climbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12, borderTop: i > 0 ? '1px solid var(--color-rule)' : undefined, paddingTop: i > 0 ? 6 : 0 }}>
            <span className="num-mono" style={{ color: 'var(--color-ink-2)', width: 16 }}>{i + 1}</span>
            <span
              className="rounded-full px-1.5 py-0.5 num-mono"
              style={{ fontSize: 9.5, border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}
            >
              {c.category}
            </span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
              {Math.round(c.vam_m_per_h)} <span style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>m/h</span>
            </span>
            <span className="num-mono" style={{ color: 'var(--color-ink-2)' }}>
              {c.w_per_kg != null ? `${c.w_per_kg.toFixed(1)} W/kg` : '—'}
            </span>
            <span className="num-mono" style={{ color: 'var(--color-muted)' }}>{c.avg_grade_pct.toFixed(1)}%</span>
            <span className="num-mono ml-auto" style={{ color: 'var(--color-muted)' }}>{fmtMmSs(c.duration_s)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── EffortsCard ─────────────────────────────────────────────────────────────

function EffortsCard({ efforts }: { efforts: EffortMatch[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!efforts || efforts.length === 0) return null

  return (
    <Card label={de ? 'SPITZENLEISTUNGEN' : 'PEAK EFFORTS'}>
      <div className="flex flex-col gap-1.5">
        {efforts.map((e, i) => (
          <div key={i} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 32 }}>{durationLabel(e.duration_s, de)}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', width: 44 }}>{Math.round(e.ride_watts)}W</span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'var(--color-rule)' }}>
              <div
                style={{
                  width: `${Math.min(100, e.pct_of_best ?? 0)}%`,
                  height: '100%',
                  backgroundColor: e.is_pr ? 'var(--color-good)' : 'var(--color-forest-2)',
                }}
              />
            </div>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 30, textAlign: 'right' }}>
              {e.pct_of_best != null ? `${Math.round(e.pct_of_best)}%` : '—'}
            </span>
            {e.is_pr && (
              <span
                className="rounded-full px-1.5 py-0.5 num-mono"
                style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-good)', border: '1px solid color-mix(in srgb, var(--color-good) 35%, var(--color-rule))' }}
              >
                PR
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── EfficiencyCard ──────────────────────────────────────────────────────────

function EfficiencyCard({ efficiency }: { efficiency: Efficiency | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!efficiency) return null

  const decoupling = efficiency.decoupling_pct
  const decColor = decoupling == null ? undefined : decoupling < 5 ? 'var(--color-good)' : decoupling > 10 ? 'var(--color-bad)' : 'var(--color-caution)'

  return (
    <Card label={de ? 'EFFIZIENZ' : 'EFFICIENCY'}>
      <div className="flex flex-wrap gap-4">
        {efficiency.efficiency_factor != null && (
          <StatBlock value={efficiency.efficiency_factor.toFixed(2)} label="EF" />
        )}
        {decoupling != null && (
          <StatBlock value={`${decoupling.toFixed(1)}`} unit="%" label={de ? 'HF-Drift' : 'Decoupling'} color={decColor} />
        )}
        {efficiency.avg_hr != null && (
          <StatBlock value={`${Math.round(efficiency.avg_hr)}`} unit="bpm" label={de ? 'Ø HF' : 'Avg HR'} />
        )}
      </div>
    </Card>
  )
}

// ─── MatchbookCard ───────────────────────────────────────────────────────────

function MatchbookCard({ matchbook }: { matchbook: Matchbook | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!matchbook) return null

  return (
    <Card label={de ? 'STREICHHOLZHEFT' : 'MATCHBOOK'}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${matchbook.match_count}`} label={de ? 'Streichhölzer' : 'Matches'} />
        <StatBlock value={fmtMmSs(matchbook.time_above_cp_s)} label={de ? 'Über CP' : 'Above CP'} />
        <StatBlock value={(matchbook.min_bal_j / 1000).toFixed(1)} unit="kJ" label={de ? 'Min. W-Bal' : 'Min W-bal'} />
      </div>
      {matchbook.fully_depleted && (
        <span
          className="rounded-full px-2 py-0.5 num-mono self-start"
          style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-bad)', border: '1px solid color-mix(in srgb, var(--color-bad) 35%, var(--color-rule))' }}
        >
          {de ? 'Vollständig entleert' : 'Fully depleted'}
        </span>
      )}
    </Card>
  )
}

// ─── QuadrantCard ────────────────────────────────────────────────────────────

function QuadrantCard({ quadrant }: { quadrant: Quadrant | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!quadrant) return null

  const cells = [
    { label: de ? 'Kraft ↑ / Kadenz ↑' : 'hi force / hi cad', pct: quadrant.q1_pct, tag: 'Q1' },
    { label: de ? 'Kraft ↑ / Kadenz ↓' : 'hi force / lo cad', pct: quadrant.q2_pct, tag: 'Q2' },
    { label: de ? 'Kraft ↓ / Kadenz ↓' : 'lo force / lo cad', pct: quadrant.q3_pct, tag: 'Q3' },
    { label: de ? 'Kraft ↓ / Kadenz ↑' : 'lo force / hi cad', pct: quadrant.q4_pct, tag: 'Q4' },
  ]

  return (
    <Card label={de ? 'QUADRANTEN' : 'QUADRANT ANALYSIS'}>
      <div className="grid grid-cols-2 gap-1.5">
        {cells.map((c) => (
          <div key={c.tag} className="rounded-[10px] px-2.5 py-2" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
            <div className="flex items-baseline justify-between">
              <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.1em' }}>{c.tag}</span>
              <span className="num-mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{Math.round(c.pct)}%</span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── FuelingCard ─────────────────────────────────────────────────────────────

function FuelingCard({ fueling }: { fueling: Fueling | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!fueling) return null

  return (
    <Card label={de ? 'VERPFLEGUNG' : 'FUELING'}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${Math.round(fueling.total_kj)}`} unit="kJ" label={de ? 'Gesamt' : 'Total'} />
        <StatBlock value={`${Math.round(fueling.total_kcal)}`} unit="kcal" label={de ? 'Kalorien' : 'Calories'} />
        <StatBlock value={`${fueling.carb_target_g_per_h[0]}–${fueling.carb_target_g_per_h[1]}`} unit="g/h" label={de ? 'Kohlenhydratziel' : 'Carb target'} />
      </div>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${Math.round(fueling.cho_g_estimate)}`} unit="g" label={de ? 'KH' : 'CHO'} />
        <StatBlock value={`${Math.round(fueling.fat_g_estimate)}`} unit="g" label={de ? 'Fett' : 'Fat'} />
      </div>
      {fueling.likely_underfueled && (
        <div className="flex items-start gap-2">
          <span
            className="rounded-full px-2 py-0.5 num-mono shrink-0"
            style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-caution)', border: '1px solid color-mix(in srgb, var(--color-caution) 35%, var(--color-rule))' }}
          >
            {de ? 'Unterversorgt' : 'Underfueled'}
          </span>
        </div>
      )}
      {fueling.note && (
        <p className="leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 12.5 }}>{fueling.note}</p>
      )}
    </Card>
  )
}

// ─── WkoCard ─────────────────────────────────────────────────────────────────

function WkoCard({ wko }: { wko: WkoModel | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!wko) return null

  return (
    <Card label={de ? 'LEISTUNGSMODELL' : 'POWER MODEL'}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${Math.round(wko.mftp_watts)}`} unit="W" label="mFTP" />
        <StatBlock value={`${Math.round(wko.cp_watts)}`} unit="W" label="CP" />
        <StatBlock value={(wko.w_prime_j / 1000).toFixed(1)} unit="kJ" label="W′/FRC" />
        <StatBlock value={`${Math.round(wko.pmax_watts)}`} unit="W" label="Pmax" />
      </div>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={fmtMmSs(wko.tte_s)} label="TTE" />
        <StatBlock
          value={wko.vo2max_estimate != null ? wko.vo2max_estimate.toFixed(1) : '—'}
          label={de ? 'VO₂max (gesch.)' : 'VO₂max (est.)'}
        />
        <StatBlock value={wko.r_squared.toFixed(2)} label="R²" />
      </div>
    </Card>
  )
}

// ─── CdaCard ─────────────────────────────────────────────────────────────────

function CdaCard({ cda }: { cda: Cda | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  if (!cda) return null

  const kmh = cda.avg_speed_ms * 3.6

  return (
    <Card label={de ? 'AERODYNAMIK' : 'AERODYNAMICS'}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={cda.cda_m2.toFixed(3)} unit="m²" label="CdA" />
        <StatBlock value={`${cda.sample_count}`} label={de ? 'Proben' : 'Samples'} />
        <StatBlock value={kmh.toFixed(1)} unit="km/h" label={de ? 'Ø Geschw.' : 'Avg speed'} />
      </div>
      <p style={{ color: 'var(--color-muted)', fontSize: 11 }}>
        {de ? 'Schätzung aus Geschwindigkeit, Leistung und Steigung.' : 'Estimate from speed, power, and grade.'}
      </p>
    </Card>
  )
}

// ─── BreakdownPanels (Act 3) ─────────────────────────────────────────────────

export default function BreakdownPanels({ report }: { report: RaceDebrief }) {
  const { locale } = useLocale()
  const de = locale === 'de'

  const hasAny =
    report.pacing || (report.climbs && report.climbs.length > 0) || (report.efforts && report.efforts.length > 0) ||
    report.efficiency || report.matchbook || report.quadrant || report.fueling || report.wko || report.cda

  if (!hasAny) return null

  return (
    <div>
      <h2 style={{ color: 'var(--color-ink)', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        {de ? 'Die Details' : 'The breakdown'}
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <PacingCard pacing={report.pacing} />
        <ClimbsCard climbs={report.climbs} />
        <EffortsCard efforts={report.efforts} />
        <EfficiencyCard efficiency={report.efficiency} />
        <MatchbookCard matchbook={report.matchbook} />
        <QuadrantCard quadrant={report.quadrant} />
        <FuelingCard fueling={report.fueling} />
        <WkoCard wko={report.wko} />
        <CdaCard cda={report.cda} />
      </div>
    </div>
  )
}
