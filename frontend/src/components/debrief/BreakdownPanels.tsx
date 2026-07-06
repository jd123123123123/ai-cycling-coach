import { useLocale } from '../../contexts/LocaleContext'
import type {
  RaceDebrief, Pacing, Climb, EffortMatch, Efficiency, Matchbook, Quadrant, Fueling, WkoModel, Cda,
} from '../../api/debrief'

// Act 3 — the breakdown. A grid of analytical cards, one per analyzer block.
// Every card carries a status accent + a plain-language read line so no number
// sits without meaning. Each returns null when its data is absent.

function fmtMmSs(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return '—'
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}
function durationLabel(seconds: number, de: boolean): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.round(seconds / 60)
  return de ? `${m}min` : `${m}m`
}

function Card({ label, accent, read, children }: { label: string; accent?: string; read?: string; children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-[18px] p-4 sm:p-5 flex flex-col gap-2.5 overflow-hidden"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      {accent && <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: accent }} />}
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em', paddingLeft: accent ? 4 : 0 }}>
        {label}
      </span>
      <div className="flex flex-col gap-2.5" style={{ paddingLeft: accent ? 4 : 0 }}>
        {children}
      </div>
      {read && (
        <p className="leading-relaxed mt-0.5" style={{ color: 'var(--color-ink-2)', fontSize: 12.5, paddingLeft: accent ? 4 : 0 }}>{read}</p>
      )}
    </div>
  )
}

function StatBlock({ value, unit, label, color }: { value: string; unit?: string; label: string; color?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: color ?? 'var(--color-ink)', lineHeight: 1.05 }}>
          {value}
        </span>
        {unit && <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      <div style={{ color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

// ─── Pacing ─────────────────────────────────────────────────────────────────
function PacingCard({ pacing }: { pacing: Pacing | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!pacing) return null
  const split = pacing.split_pct
  const tone = split < -8 ? 'var(--color-bad)' : split < -3 ? 'var(--color-caution)' : 'var(--color-good)'
  const firstHalf = pacing.first_half_np, secondHalf = pacing.second_half_np, maxHalf = Math.max(firstHalf, secondHalf, 1)
  const zoneEntries = Object.entries(pacing.zone_time_pct ?? {}).filter(([, v]) => v > 0)
  const read = split < -8 ? (de ? `Zweite Hälfte ${Math.abs(split).toFixed(0)} % schwächer — du bist eingebrochen.` : `Second half faded ${Math.abs(split).toFixed(0)}% — you cracked.`)
    : split < -3 ? (de ? 'Etwas nachgelassen zum Ende.' : 'Eased off a little late.')
    : (de ? 'Sehr gleichmäßige Pace über die ganze Fahrt.' : 'Very even effort the whole way.')
  return (
    <Card label={de ? 'PACING' : 'PACING'} accent={tone} read={read}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${split > 0 ? '+' : ''}${split.toFixed(1)}`} unit="%" label="Split" color={tone} />
        {pacing.variability_index != null && <StatBlock value={pacing.variability_index.toFixed(2)} label="VI" />}
        <StatBlock value={`${pacing.surge_count}`} label={de ? 'Angriffe' : 'Surges'} />
      </div>
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
            <div style={{ width: `${(secondHalf / maxHalf) * 100}%`, height: '100%', backgroundColor: tone }} />
          </div>
          <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-ink-2)', width: 32, textAlign: 'right' }}>{Math.round(secondHalf)}W</span>
        </div>
      </div>
      {zoneEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {zoneEntries.map(([zone, pct]) => (
            <div key={zone} className="flex items-center gap-1.5">
              <span style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{zone.replace('zone', 'Z')}</span>
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

// ─── Climbs ─────────────────────────────────────────────────────────────────
function ClimbsCard({ climbs }: { climbs: Climb[] }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!climbs || climbs.length === 0) return null
  const steepest = Math.max(...climbs.map((c) => c.avg_grade_pct))
  const read = de ? `${climbs.length} Anstieg${climbs.length > 1 ? 'e' : ''}, steilster ${steepest.toFixed(1)} %.` : `${climbs.length} climb${climbs.length > 1 ? 's' : ''}, steepest at ${steepest.toFixed(1)}%.`
  return (
    <Card label={de ? 'ANSTIEGE' : 'CLIMBS'} accent="var(--color-good)" read={read}>
      <div className="flex flex-col gap-1.5">
        {climbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12, borderTop: i > 0 ? '1px solid var(--color-rule)' : undefined, paddingTop: i > 0 ? 6 : 0 }}>
            <span className="num-mono" style={{ color: 'var(--color-ink-2)', width: 16 }}>{i + 1}</span>
            <span className="rounded-full px-1.5 py-0.5 num-mono" style={{ fontSize: 9.5, border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)' }}>{c.category}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{Math.round(c.vam_m_per_h)} <span style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>m/h</span></span>
            <span className="num-mono" style={{ color: 'var(--color-ink-2)' }}>{c.w_per_kg != null ? `${c.w_per_kg.toFixed(1)} W/kg` : '—'}</span>
            <span className="num-mono" style={{ color: 'var(--color-muted)' }}>{c.avg_grade_pct.toFixed(1)}%</span>
            <span className="num-mono ml-auto" style={{ color: 'var(--color-muted)' }}>{fmtMmSs(c.duration_s)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Peak efforts ────────────────────────────────────────────────────────────
function EffortsCard({ efforts }: { efforts: EffortMatch[] }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!efforts || efforts.length === 0) return null
  const prs = efforts.filter((e) => e.is_pr).length
  const read = prs ? (de ? `${prs} neue${prs > 1 ? '' : 'r'} Leistungs-Rekord${prs > 1 ? 'e' : ''} in dieser Fahrt.` : `${prs} new power record${prs > 1 ? 's' : ''} set this ride.`)
    : (de ? 'Balken zeigen % deiner 90-Tage-Bestleistung je Dauer.' : 'Bars show % of your 90-day best at each duration.')
  return (
    <Card label={de ? 'SPITZENLEISTUNGEN' : 'PEAK EFFORTS'} accent={prs ? 'var(--color-good)' : undefined} read={read}>
      <div className="flex flex-col gap-1.5">
        {efforts.map((e, i) => (
          <div key={i} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 32 }}>{durationLabel(e.duration_s, de)}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', width: 44 }}>{Math.round(e.ride_watts)}W</span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'var(--color-rule)' }}>
              <div style={{ width: `${Math.min(100, e.pct_of_best ?? 0)}%`, height: '100%', backgroundColor: e.is_pr ? 'var(--color-good)' : 'var(--color-forest-2)' }} />
            </div>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 30, textAlign: 'right' }}>{e.pct_of_best != null ? `${Math.round(e.pct_of_best)}%` : '—'}</span>
            {e.is_pr && <span className="rounded-full px-1.5 py-0.5 num-mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-good)', border: '1px solid color-mix(in srgb, var(--color-good) 35%, var(--color-rule))' }}>PR</span>}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Efficiency ──────────────────────────────────────────────────────────────
function EfficiencyCard({ efficiency }: { efficiency: Efficiency | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!efficiency) return null
  const { efficiency_factor: ef, decoupling_pct: dc, avg_hr: hr } = efficiency
  if (ef == null && dc == null && hr == null) return null   // no HR on this ride → hide
  const tone = dc == null ? undefined : dc < 5 ? 'var(--color-good)' : dc > 10 ? 'var(--color-bad)' : 'var(--color-caution)'
  const read = dc == null ? undefined
    : dc < 5 ? (de ? 'Kaum HF-Drift — Form über die Distanz gehalten.' : 'Barely any drift — held form over the distance.')
    : dc > 10 ? (de ? 'Deutlicher HF-Drift — Verpflegung oder Pace prüfen.' : 'Notable cardiac drift — check fuelling or pacing.')
    : (de ? 'Etwas HF-Drift zum Ende.' : 'Some cardiac drift toward the end.')
  return (
    <Card label={de ? 'EFFIZIENZ' : 'EFFICIENCY'} accent={tone} read={read}>
      <div className="flex flex-wrap gap-4">
        {ef != null && <StatBlock value={ef.toFixed(2)} label="EF" />}
        {dc != null && <StatBlock value={`${dc.toFixed(1)}`} unit="%" label={de ? 'HF-Drift' : 'Decoupling'} color={tone} />}
        {hr != null && <StatBlock value={`${Math.round(hr)}`} unit="bpm" label={de ? 'Ø HF' : 'Avg HR'} />}
      </div>
    </Card>
  )
}

// ─── Matchbook ───────────────────────────────────────────────────────────────
function MatchbookCard({ matchbook }: { matchbook: Matchbook | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!matchbook) return null
  const tone = matchbook.fully_depleted ? 'var(--color-bad)' : 'var(--color-good)'
  const read = matchbook.fully_depleted
    ? (de ? 'Anaerobe Reserve komplett geleert — nichts blieb fürs Finale.' : 'Anaerobic reserve fully emptied — nothing left for the finale.')
    : (de ? 'Reserve gehalten — Antritte klug eingeteilt.' : 'Reserve held — you spent your matches wisely.')
  return (
    <Card label={de ? 'STREICHHOLZHEFT' : 'MATCHBOOK'} accent={tone} read={read}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${matchbook.match_count}`} label={de ? 'Streichhölzer' : 'Matches'} />
        <StatBlock value={fmtMmSs(matchbook.time_above_cp_s)} label={de ? 'Über CP' : 'Above CP'} />
        <StatBlock value={(matchbook.min_bal_j / 1000).toFixed(1)} unit="kJ" label={de ? 'Min. W-Bal' : 'Min W-bal'} color={tone} />
      </div>
    </Card>
  )
}

// ─── Quadrant ────────────────────────────────────────────────────────────────
function QuadrantCard({ quadrant }: { quadrant: Quadrant | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!quadrant) return null
  const cells = [
    { label: de ? 'Kraft ↑ / Kadenz ↑' : 'hi force / hi cad', pct: quadrant.q1_pct, tag: 'Q1' },
    { label: de ? 'Kraft ↑ / Kadenz ↓' : 'hi force / lo cad', pct: quadrant.q2_pct, tag: 'Q2' },
    { label: de ? 'Kraft ↓ / Kadenz ↓' : 'lo force / lo cad', pct: quadrant.q3_pct, tag: 'Q3' },
    { label: de ? 'Kraft ↓ / Kadenz ↑' : 'lo force / hi cad', pct: quadrant.q4_pct, tag: 'Q4' },
  ]
  const dom = cells.reduce((a, b) => (b.pct > a.pct ? b : a))
  const domRead: Record<string, string> = {
    Q1: de ? 'Viel Zeit im Angriff (hohe Kraft & Kadenz).' : 'A lot of time attacking (high force & cadence).',
    Q2: de ? 'Oft mit hoher Kraft bei niedriger Kadenz gedrückt.' : 'Often grinding — high force at low cadence.',
    Q3: de ? 'Überwiegend im lockeren Bereich gefahren.' : 'Mostly ridden in the easy quadrant.',
    Q4: de ? 'Meist rund getreten (hohe Kadenz, wenig Kraft).' : 'Mostly spinning — high cadence, low force.',
  }
  return (
    <Card label={de ? 'QUADRANTEN' : 'QUADRANT ANALYSIS'} read={domRead[dom.tag]}>
      <div className="grid grid-cols-2 gap-1.5">
        {cells.map((c) => {
          const isDom = c.tag === dom.tag
          return (
            <div key={c.tag} className="rounded-[10px] px-2.5 py-2" style={{ backgroundColor: 'var(--color-paper)', border: `1px solid ${isDom ? 'color-mix(in srgb, var(--color-forest-2) 40%, var(--color-rule))' : 'var(--color-rule)'}` }}>
              <div className="flex items-baseline justify-between">
                <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.1em' }}>{c.tag}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: isDom ? 'var(--color-forest-2)' : 'var(--color-ink)' }}>{Math.round(c.pct)}%</span>
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>{c.label}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Fueling ─────────────────────────────────────────────────────────────────
function FuelingCard({ fueling }: { fueling: Fueling | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!fueling) return null
  const tone = fueling.likely_underfueled === true ? 'var(--color-bad)' : fueling.likely_underfueled === false ? 'var(--color-good)' : undefined
  return (
    <Card label={de ? 'VERPFLEGUNG' : 'FUELING'} accent={tone} read={fueling.note || undefined}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${Math.round(fueling.total_kj)}`} unit="kJ" label={de ? 'Gesamt' : 'Total'} />
        <StatBlock value={`${fueling.carb_target_g_per_h[0]}–${fueling.carb_target_g_per_h[1]}`} unit="g/h" label={de ? 'Kohlenhydratziel' : 'Carb target'} color={tone} />
        <StatBlock value={`${Math.round(fueling.cho_g_estimate)}`} unit="g" label={de ? 'KH' : 'CHO'} />
        <StatBlock value={`${Math.round(fueling.fat_g_estimate)}`} unit="g" label={de ? 'Fett' : 'Fat'} />
      </div>
      {fueling.likely_underfueled && (
        <span className="rounded-full px-2 py-0.5 num-mono self-start" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-bad)', border: '1px solid color-mix(in srgb, var(--color-bad) 35%, var(--color-rule))' }}>
          {de ? 'Unterversorgt' : 'Under-fuelled'}
        </span>
      )}
    </Card>
  )
}

// ─── Power model ─────────────────────────────────────────────────────────────
function WkoCard({ wko }: { wko: WkoModel | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!wko) return null
  const read = de ? `Aus dieser Fahrt modelliert (R² ${wko.r_squared.toFixed(2)}).` : `Modelled from this ride's power-duration curve (R² ${wko.r_squared.toFixed(2)}).`
  return (
    <Card label={de ? 'LEISTUNGSMODELL' : 'POWER MODEL'} accent="var(--color-ink-blue)" read={read}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={`${Math.round(wko.mftp_watts)}`} unit="W" label="mFTP" />
        <StatBlock value={`${Math.round(wko.cp_watts)}`} unit="W" label="CP" />
        <StatBlock value={(wko.w_prime_j / 1000).toFixed(1)} unit="kJ" label="W′/FRC" />
        <StatBlock value={`${Math.round(wko.pmax_watts)}`} unit="W" label="Pmax" />
        <StatBlock value={fmtMmSs(wko.tte_s)} label="TTE" />
        <StatBlock value={wko.vo2max_estimate != null ? wko.vo2max_estimate.toFixed(1) : '—'} label={de ? 'VO₂max (gesch.)' : 'VO₂max (est.)'} />
      </div>
    </Card>
  )
}

// ─── CdA ─────────────────────────────────────────────────────────────────────
function CdaCard({ cda }: { cda: Cda | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!cda) return null
  return (
    <Card label={de ? 'AERODYNAMIK' : 'AERODYNAMICS'} accent="var(--color-ink-blue)"
      read={de ? 'Schätzung aus Geschwindigkeit, Leistung und Steigung — Richtwert, kein Windkanal.' : 'Estimate from speed, power, and grade — directional, not a wind-tunnel figure.'}>
      <div className="flex flex-wrap gap-4">
        <StatBlock value={cda.cda_m2.toFixed(3)} unit="m²" label="CdA" />
        <StatBlock value={`${cda.sample_count}`} label={de ? 'Proben' : 'Samples'} />
        <StatBlock value={(cda.avg_speed_ms * 3.6).toFixed(1)} unit="km/h" label={de ? 'Ø Geschw.' : 'Avg speed'} />
      </div>
    </Card>
  )
}

// ─── BreakdownPanels (Act 3) ─────────────────────────────────────────────────
export default function BreakdownPanels({ report }: { report: RaceDebrief }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const hasAny =
    report.pacing || (report.climbs && report.climbs.length > 0) || (report.efforts && report.efforts.length > 0) ||
    report.efficiency || report.matchbook || report.quadrant || report.fueling || report.wko || report.cda
  if (!hasAny) return null
  return (
    <div>
      <h2 className="mb-3" style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 500, letterSpacing: '-0.01em' }}>
        {de ? 'Die Details' : 'The breakdown'}
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start [grid-auto-rows:min-content]">
        <PacingCard pacing={report.pacing} />
        <MatchbookCard matchbook={report.matchbook} />
        <EfficiencyCard efficiency={report.efficiency} />
        <EffortsCard efforts={report.efforts} />
        <FuelingCard fueling={report.fueling} />
        <QuadrantCard quadrant={report.quadrant} />
        <WkoCard wko={report.wko} />
        <ClimbsCard climbs={report.climbs} />
        <CdaCard cda={report.cda} />
      </div>
    </div>
  )
}
