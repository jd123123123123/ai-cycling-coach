import { useLocale } from '../../contexts/LocaleContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import type {
  RaceDebrief, Pacing, Climb, EffortMatch, Efficiency, Matchbook, Quadrant, Fueling, WkoModel, Cda,
} from '../../api/debrief'

// Act 3 — the breakdown, read as a consulting storyline rather than a wall of
// cards. Each analyzer is a "slide": a message (eyebrow + serif headline +
// so-what) on the left, the evidence (numbers / viz) on the right. Big vertical
// rhythm, one insight per row, never three graphics crammed across. Compact
// stat-only blocks pair up two-across at the end. Each piece returns null when
// its data is absent.

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

/** The segmenter splits a climb every time the grade dips below its threshold,
 * so one long climb with varying steepness comes back as many fragments. Bridge
 * consecutive climb segments separated by only a short non-climb gap back into
 * a single climb — a real descent/valley (long gap) still keeps them apart. */
function mergeClimbs(climbs: Climb[]): Climb[] {
  if (climbs.length <= 1) return climbs.slice()
  const sorted = [...climbs].sort((a, b) => a.start_s - b.start_s)
  const out: Climb[] = []
  let cur: Climb = { ...sorted[0] }
  for (let k = 1; k < sorted.length; k++) {
    const nx = sorted[k]
    const gap = nx.start_s - (cur.start_s + cur.duration_s)
    // Bridge only across a SHORT non-climb gap — a false-flat inside one climb
    // is seconds long; a real descent/valley between two passes runs minutes,
    // so an absolute cap keeps distinct climbs apart instead of snowballing the
    // whole ride into one giant "climb".
    const bridge = gap <= 90
    if (bridge) {
      const gain = cur.elev_gain_m + nx.elev_gain_m
      const dist = cur.distance_m + nx.distance_m
      const dur = nx.start_s + nx.duration_s - cur.start_s
      const wDur = (cur.w_per_kg != null ? cur.duration_s : 0) + (nx.w_per_kg != null ? nx.duration_s : 0)
      const wSum = (cur.w_per_kg != null ? cur.w_per_kg * cur.duration_s : 0) + (nx.w_per_kg != null ? nx.w_per_kg * nx.duration_s : 0)
      cur = {
        ...cur,
        duration_s: dur,
        distance_m: dist,
        elev_gain_m: gain,
        avg_grade_pct: dist > 0 ? (gain / dist) * 100 : cur.avg_grade_pct,
        vam_m_per_h: dur > 0 ? gain / (dur / 3600) : cur.vam_m_per_h,
        w_per_kg: wDur > 0 ? wSum / wDur : null,
      }
    } else {
      out.push(cur)
      cur = { ...nx }
    }
  }
  out.push(cur)
  return out
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 120px), var(--color-paper-2)',
  border: '1px solid var(--color-rule)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.85)',
}

function Eyebrow({ label, accent }: { label: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="shrink-0"
        style={{ width: 6, height: 6, borderRadius: '50%', background: accent ?? 'var(--color-muted)', boxShadow: accent ? `0 0 8px ${accent}` : undefined }}
      />
      <span className="num-mono" style={{ color: accent ?? 'var(--color-ink-2)', fontSize: 10.5, letterSpacing: '0.24em', fontWeight: 600 }}>
        {label}
      </span>
    </div>
  )
}

/** A concrete "do this next" line with a number in it. Every analyzer ends in one
 * so the debrief is prescriptive, never descriptive-only. */
function ActionLine({ text, accent }: { text: string; accent?: string }) {
  const color = accent ?? 'var(--color-forest-2)'
  return (
    <p className="flex items-start gap-1.5 mt-1" style={{ color: 'var(--color-ink)', fontSize: 13, lineHeight: 1.4, fontWeight: 500 }}>
      <span style={{ color }}>→</span>
      <span>{text}</span>
    </p>
  )
}

/** Full-width "slide": message column (eyebrow + serif headline + so-what) on
 * the left, evidence on the right. This is the McKinsey slide shape. */
function Slide({ eyebrow, headline, explain, action, accent, children }: {
  eyebrow: string; headline: string; explain?: string; action?: string; accent?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={CARD_STYLE}>
      <div className="grid md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="flex flex-col gap-3 p-6 sm:p-7 debrief-slide-msg">
          <Eyebrow label={eyebrow} accent={accent} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(21px, 2.4vw, 26px)', fontWeight: 500, lineHeight: 1.12, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>
            {headline}
          </h3>
          {explain && (
            <p className="leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 13.5 }}>{explain}</p>
          )}
          {action && <ActionLine text={action} accent={accent} />}
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-7 debrief-slide-ev">
          {children}
        </div>
      </div>
    </div>
  )
}

/** Compact card for stat-only blocks that pair two-across. */
function Card({ label, accent, headline, read, action, children }: {
  label: string; accent?: string; headline?: string; read?: string; action?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden h-full flex flex-col" style={CARD_STYLE}>
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-rule)' }}>
        <Eyebrow label={label} accent={accent} />
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 flex-1">
        {headline && (
          <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, lineHeight: 1.15, color: 'var(--color-ink)' }}>{headline}</h4>
        )}
        {children}
        {read && <p className="leading-relaxed" style={{ color: 'var(--color-ink-2)', fontSize: 12.5 }}>{read}</p>}
        {action && <div className="mt-auto"><ActionLine text={action} accent={accent} /></div>}
      </div>
    </div>
  )
}

function StatBlock({ value, unit, label, color, hint }: { value: string; unit?: string; label: string; color?: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500, color: color ?? 'var(--color-ink)', lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{unit}</span>}
      </div>
      <div
        className="num-mono mt-1"
        title={hint}
        style={{ color: 'var(--color-muted)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: hint ? 'help' : undefined }}
      >
        {label}
      </div>
    </div>
  )
}

function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-7 gap-y-4">{children}</div>
}

// ─── Act header ────────────────────────────────────────────────────────────────
function ActHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <div className="flex items-baseline gap-3">
        <div className="flex flex-col gap-1">
          <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.24em' }}>{kicker}</span>
          <h2 style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1 }}>{title}</h2>
        </div>
        <div className="flex-1 self-center" style={{ height: 1, background: 'var(--color-rule)' }} />
      </div>
      {subtitle && (
        <p className="mt-1.5" style={{ color: 'var(--color-ink-2)', fontSize: 13, fontStyle: 'italic' }}>{subtitle}</p>
      )}
    </div>
  )
}

// ─── Pacing (won & lost) ────────────────────────────────────────────────────────
function PacingSlide({ pacing }: { pacing: Pacing | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!pacing) return null
  const split = pacing.split_pct
  const tone = split < -8 ? 'var(--color-bad)' : split < -3 ? 'var(--color-caution)' : 'var(--color-good)'
  const firstHalf = pacing.first_half_np, secondHalf = pacing.second_half_np, maxHalf = Math.max(firstHalf, secondHalf, 1)
  const zoneEntries = Object.entries(pacing.zone_time_pct ?? {}).filter(([, v]) => v > 0)
  const headline = split < -8 ? (de ? 'Du bist in der zweiten Hälfte eingebrochen' : 'You cracked in the back half')
    : split < -3 ? (de ? 'Zum Ende etwas nachgelassen' : 'Eased off a little late')
    : (de ? 'Bis zur Linie gleichmäßig gefahren' : 'Even effort all the way to the line')
  const explain = split < -8 ? (de ? `Die zweite Hälfte lag ${Math.abs(split).toFixed(0)} % unter der ersten. Nächstes Rennen: früher rationieren, damit du tiefer in die entscheidenden Kilometer kommst.` : `Your second half ran ${Math.abs(split).toFixed(0)}% below the first — the day was lost on pacing, not fitness. Next race, ration earlier and hold form into the decisive kilometres.`)
    : split < -3 ? (de ? 'Leichter Abfall zum Ende — im Rahmen, aber Luft nach oben bei der Einteilung.' : 'A slight taper at the end — within reason, but there is room to pace it flatter.')
    : (de ? 'Sehr saubere Einteilung — Leistung über die volle Distanz gehalten.' : 'Textbook distribution — you held power across the whole distance.')
  return (
    <Slide eyebrow={de ? 'PACING · GEWONNEN & VERLOREN' : 'PACING · WON & LOST'} headline={headline} explain={explain} accent={tone}>
      <StatRow>
        <StatBlock value={`${split > 0 ? '+' : ''}${split.toFixed(1)}`} unit="%" label={de ? 'Split' : 'Split'} color={tone} />
        {pacing.variability_index != null && <StatBlock value={pacing.variability_index.toFixed(2)} label="VI"
          hint={de ? 'Variabilitäts-Index — 1,0 = gleichmäßig, höher = wechselhaft' : 'Variability Index — 1.0 = even, higher = surgier'} />}
        <StatBlock value={`${pacing.surge_count}`} label={de ? 'Angriffe' : 'Surges'} />
      </StatRow>
      <div className="mt-1">
        {[[de ? '1.' : '1st', firstHalf, 'var(--color-ink-2)'], [de ? '2.' : '2nd', secondHalf, tone]].map(([lbl, val, col], i) => (
          <div key={i} className={`flex items-center gap-3 ${i ? 'mt-2' : ''}`}>
            <span className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)', width: 26 }}>{lbl as string}</span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: 'var(--color-rule)' }}>
              <div style={{ width: `${((val as number) / maxHalf) * 100}%`, height: '100%', backgroundColor: col as string, transition: 'width 600ms var(--ease-apple-default)' }} />
            </div>
            <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-ink)', width: 44, textAlign: 'right' }}>{Math.round(val as number)}W</span>
          </div>
        ))}
      </div>
      {zoneEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
          {zoneEntries.map(([zone, pct]) => (
            <div key={zone} className="flex items-center gap-1.5">
              <span className="num-mono" style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{zone.replace('zone', 'Z')}</span>
              <div className="rounded-full overflow-hidden" style={{ width: 40, height: 5, backgroundColor: 'var(--color-rule)' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: 'var(--color-forest-2)' }} />
              </div>
              <span className="num-mono" style={{ fontSize: 10, color: 'var(--color-ink-2)' }}>{Math.round(pct)}%</span>
            </div>
          ))}
        </div>
      )}
    </Slide>
  )
}

// ─── Peak efforts (the engine) ───────────────────────────────────────────────────
function EffortsSlide({ efforts, weightKg }: { efforts: EffortMatch[]; weightKg: number | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!efforts || efforts.length === 0) return null
  const wkg = weightKg && weightKg > 0
  const prs = efforts.filter((e) => e.is_pr).length
  const KEY_DURATIONS = new Set([5, 30, 60, 300, 1200, 3600])
  const shown = efforts.filter((e) => KEY_DURATIONS.has(e.duration_s) || e.is_pr)
  const rows = shown.length > 0 ? shown : efforts
  const headline = prs
    ? (de ? `${prs} neue Leistungs­rekorde` : `${prs} new power record${prs > 1 ? 's' : ''}`)
    : (de ? 'Deine Leistung über die Dauer' : 'Your power across every duration')
  const explain = prs
    ? (de ? 'Die Beine hatten echten Punch, als es zählte — die Rekorde beweisen, dass die Form da ist.' : 'The legs had real punch when it counted — these records show the fitness is there to build on.')
    : (de ? 'Balken zeigen % deiner 90-Tage-Bestleistung je Dauer. Grün = neuer Rekord.' : 'Each bar is % of your 90-day best at that duration. Green marks a new record.')
  // No PR: point at the single duration closest to a record so the next block has a target.
  const closest = prs ? undefined : [...efforts].filter((e) => e.pct_of_best != null).sort((a, b) => (b.pct_of_best ?? 0) - (a.pct_of_best ?? 0))[0]
  const action = prs
    ? (de ? 'Neue Bestwerte hochladen und FTP/Zonen prüfen.' : 'Log the records and recheck your FTP and zones.')
    : closest
      ? (de ? `Am nächsten dran: ${durationLabel(closest.duration_s, de)} bei ${Math.round(closest.pct_of_best ?? 0)}% — dieses Energiesystem im nächsten Block priorisieren (Ziel ≥${Math.round(closest.ride_watts) + 1} W).`
            : `Closest to a record: ${durationLabel(closest.duration_s, de)} at ${Math.round(closest.pct_of_best ?? 0)}% — prioritise that energy system next block (target ≥${Math.round(closest.ride_watts) + 1} W).`)
      : undefined
  return (
    <Slide eyebrow={de ? 'SPITZENLEISTUNGEN · DER MOTOR' : 'PEAK EFFORTS · THE ENGINE'} headline={headline} explain={explain} action={action} accent={prs ? 'var(--color-good)' : undefined}>
      <div className="flex flex-col gap-2.5">
        {rows.map((e, i) => (
          <div key={i} className="flex items-center gap-3" style={{ fontSize: 12 }}>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 34 }}>{durationLabel(e.duration_s, de)}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', width: 48 }}>{Math.round(e.ride_watts)}W</span>
            {wkg && <span className="num-mono" style={{ color: 'var(--color-muted)', width: 54 }}>{(e.ride_watts / (weightKg as number)).toFixed(1)} W/kg</span>}
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 7, backgroundColor: 'var(--color-rule)' }}>
              <div style={{ width: `${Math.min(100, e.pct_of_best ?? 0)}%`, height: '100%', backgroundColor: e.is_pr ? 'var(--color-good)' : 'var(--color-forest-2)', transition: 'width 600ms var(--ease-apple-default)' }} />
            </div>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 34, textAlign: 'right' }}>{e.pct_of_best != null ? `${Math.round(e.pct_of_best)}%` : '—'}</span>
            {e.is_pr
              ? <span className="rounded-full px-1.5 py-0.5 num-mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-good)', border: '1px solid color-mix(in srgb, var(--color-good) 35%, var(--color-rule))' }}>PR</span>
              : <span style={{ width: 22 }} />}
          </div>
        ))}
      </div>
    </Slide>
  )
}

// ─── Climbs (the terrain) ────────────────────────────────────────────────────────
function ClimbsSlide({ climbs, ftp, weightKg }: { climbs: Climb[]; ftp: number | null; weightKg: number | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!climbs || climbs.length === 0) return null
  // Bridge over-segmented fragments into whole climbs, then keep the ones worth
  // naming (≥ 300 m distance or ≥ 30 m gain), biggest first.
  const merged = mergeClimbs(climbs)
  const notable = merged
    .filter((c) => c.distance_m >= 300 || c.elev_gain_m >= 30)
    .sort((a, b) => b.elev_gain_m - a.elev_gain_m)
  const totalAscent = climbs.reduce((s, c) => s + c.elev_gain_m, 0)
  const shown = notable.slice(0, 6)
  if (shown.length === 0) return null
  const extra = notable.length - shown.length
  const km = (m: number) => (m / 1000).toFixed(m >= 9500 ? 0 : 1)
  const headline = de
    ? `${notable.length} Anstiege, ${Math.round(totalAscent).toLocaleString('de')} Hm`
    : `${notable.length} climbs, ${Math.round(totalAscent).toLocaleString()} m of climbing`
  const explain = de
    ? 'Zusammenhängende Anstiege des Tages, sortiert nach Höhenmetern — je mit Länge, Ø-Steigung, Klettertempo (VAM) und deiner Leistung.'
    : 'The day’s climbs as whole ascents, ordered by elevation — each with length, average gradient, climb rate (VAM) and your power.'
  // Target watts on the biggest climb — hold threshold-ish, ration the bottom third.
  const hardest = shown[0]
  const lo = ftp && ftp > 0 ? Math.round(0.9 * ftp) : null
  const hi = ftp && ftp > 0 ? Math.round(ftp) : null
  const didW = hardest?.w_per_kg != null && weightKg ? Math.round(hardest.w_per_kg * weightKg) : null
  const action = lo && hi
    ? (de
        ? `Auf dem längsten Anstieg ${lo}–${hi} W anpeilen${didW ? ` (heute ~${didW} W)` : ''} — das untere Drittel bewusst ruhiger angehen.`
        : `On the longest climb, target ${lo}–${hi} W${didW ? ` (you did ~${didW} W)` : ''} — start the bottom third deliberately softer.`)
    : undefined
  return (
    <Slide eyebrow={de ? 'ANSTIEGE · DAS TERRAIN' : 'CLIMBS · THE TERRAIN'} headline={headline} explain={explain} action={action} accent="var(--color-good)">
      <div className="flex flex-col">
        {/* header row */}
        <div className="num-mono flex items-center gap-2 pb-2" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.1em', borderBottom: '1px solid var(--color-rule)' }}>
          <span style={{ width: 14 }}>#</span>
          <span style={{ width: 58 }}>{de ? 'LÄNGE' : 'LENGTH'}</span>
          <span style={{ width: 46 }}>{de ? 'STG.' : 'GRADE'}</span>
          <span style={{ width: 56 }}>{de ? 'HM' : 'GAIN'}</span>
          <span style={{ width: 52 }} title={de ? 'VAM — Höhenmeter pro Stunde (Klettertempo)' : 'VAM — vertical metres climbed per hour (climb rate)'}>VAM m/h</span>
          {shown.some((c) => c.w_per_kg != null) && <span style={{ width: 52 }}>W/KG</span>}
          <span className="ml-auto">{de ? 'ZEIT' : 'TIME'}</span>
        </div>
        {shown.map((c, i) => (
          <div key={i} className="flex items-center gap-2" style={{ fontSize: 12.5, borderTop: i > 0 ? '1px solid var(--color-rule)' : undefined, paddingTop: 8, paddingBottom: 8 }}>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 14 }}>{i + 1}</span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', fontWeight: 600, width: 58 }}>{km(c.distance_m)} <span style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>km</span></span>
            <span className="num-mono" style={{ color: 'var(--color-ink)', width: 46 }}>{c.avg_grade_pct.toFixed(1)}%</span>
            <span className="num-mono" style={{ color: 'var(--color-ink-2)', width: 56 }}>{Math.round(c.elev_gain_m)} <span style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>m↑</span></span>
            <span className="num-mono" style={{ color: 'var(--color-muted)', width: 52 }}>{Math.round(c.vam_m_per_h)}</span>
            {shown.some((x) => x.w_per_kg != null) && <span className="num-mono" style={{ color: 'var(--color-ink-2)', width: 52 }}>{c.w_per_kg != null ? c.w_per_kg.toFixed(1) : '—'}</span>}
            <span className="num-mono ml-auto" style={{ color: 'var(--color-muted)' }}>{fmtMmSs(c.duration_s)}</span>
          </div>
        ))}
      </div>
      {extra > 0 && (
        <span className="num-mono" style={{ color: 'var(--color-muted)', fontSize: 10.5 }}>
          {de ? `+ ${extra} kleinere Anstiege` : `+ ${extra} smaller climbs`}
        </span>
      )}
    </Slide>
  )
}

// ─── Compact stat cards (by the numbers) ─────────────────────────────────────────
function EfficiencyCard({ efficiency, ftp }: { efficiency: Efficiency | null; ftp: number | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!efficiency) return null
  const { efficiency_factor: ef, decoupling_pct: dc, avg_hr: hr } = efficiency
  if (ef == null && dc == null && hr == null) return null
  const tone = dc == null ? undefined : dc < 5 ? 'var(--color-good)' : dc > 10 ? 'var(--color-bad)' : 'var(--color-caution)'
  const headline = dc == null ? (de ? 'Effizienz' : 'Efficiency')
    : dc < 5 ? (de ? 'Form gehalten' : 'Held your form')
    : dc > 10 ? (de ? 'Deutlicher HF-Drift' : 'Notable HR drift')
    : (de ? 'Etwas Drift zum Ende' : 'Some drift late on')
  const read = dc == null ? undefined
    : dc < 5 ? (de ? 'Kaum HF-Drift — Aerobsystem hat die Distanz getragen.' : 'Barely any drift — your aerobic system carried the distance.')
    : dc > 10 ? (de ? 'HF stieg für dieselbe Leistung — Verpflegung oder Pace prüfen.' : 'HR climbed for the same power — check fuelling or pacing.')
    : (de ? 'Leichte Entkopplung zum Ende hin.' : 'A little HR drift toward the finish.')
  // Concrete target: cap the aerobic effort + hydrate to keep drift under 5%.
  const cap = ftp && ftp > 0 ? Math.round(0.75 * ftp) : null
  const action = dc == null || dc < 5 ? undefined
    : dc > 10
      ? (cap
          ? (de ? `Erste Stunde bei ≤${cap} W deckeln und 500–750 ml/h trinken — Drift unter 5% halten.` : `Cap the first hour at ≤${cap} W and drink 500–750 ml/h to hold drift under 5%.`)
          : (de ? 'Startpace ~5% senken und 500–750 ml/h trinken, um den Drift unter 5% zu halten.' : 'Ease the opening pace ~5% and drink 500–750 ml/h to hold drift under 5%.'))
      : (de ? 'Die ersten 90 min ~5 W leichter fahren und alle 10 min trinken.' : 'Ride the first 90 min ~5 W easier and drink every 10 min.')
  return (
    <Card label={de ? 'EFFIZIENZ' : 'EFFICIENCY'} accent={tone} headline={headline} read={read} action={action}>
      <StatRow>
        {ef != null && <StatBlock value={ef.toFixed(2)} label="EF"
          hint={de ? 'Effizienzfaktor — Leistung pro Herzschlag' : 'Efficiency Factor — power per heartbeat'} />}
        {dc != null && <StatBlock value={`${dc.toFixed(1)}`} unit="%" label={de ? 'HF-Drift' : 'HR drift'} color={tone}
          hint={de ? 'HF-Drift — HF steigt bei gleicher Leistung; unter 5% ist gut' : 'HR drift — heart rate climbs at the same power; under 5% is good'} />}
        {hr != null && <StatBlock value={`${Math.round(hr)}`} unit="bpm" label={de ? 'Ø HF' : 'Avg HR'} />}
      </StatRow>
    </Card>
  )
}

function MatchbookCard({ matchbook }: { matchbook: Matchbook | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!matchbook) return null
  const tone = matchbook.fully_depleted ? 'var(--color-bad)' : 'var(--color-good)'
  const headline = matchbook.fully_depleted ? (de ? 'Tank komplett geleert' : 'Emptied the tank') : (de ? 'Reserve klug eingeteilt' : 'Matches well spent')
  const definition = de
    ? 'Ein Streichholz = eine harte Anstrengung aus der anaeroben Reserve (W′). '
    : 'A match = one hard effort spent from your anaerobic reserve (W′). '
  const read = definition + (matchbook.fully_depleted
    ? (de ? 'Reserve auf null — nichts blieb fürs Finale.' : 'Reserve drained to zero — nothing left for the finale.')
    : (de ? 'Reserve gehalten — Antritte klug dosiert.' : 'Reserve held — you spent your matches wisely.'))
  return (
    <Card label={de ? 'STREICHHOLZHEFT' : 'MATCHBOOK'} accent={tone} headline={headline} read={read}>
      <StatRow>
        <StatBlock value={`${matchbook.match_count}`} label={de ? 'Streichhölzer' : 'Matches'} />
        <StatBlock value={fmtMmSs(matchbook.time_above_cp_s)} label={de ? 'Über CP' : 'Above CP'}
          hint={de ? 'Zeit oberhalb der Kritischen Leistung (CP) — hier wird die Reserve verbraucht' : 'Time above Critical Power (CP) — where the reserve is spent'} />
        <StatBlock value={Math.max(0, matchbook.min_bal_j / 1000).toFixed(1)} unit="kJ" label={de ? 'Min. W-Bal' : 'Min W-bal'} color={tone}
          hint={de ? 'Tiefster Stand der anaeroben Reserve (W′) — niedriger = näher an leer' : 'Lowest point of the anaerobic reserve (W′) — lower = closer to empty'} />
      </StatRow>
    </Card>
  )
}

function QuadrantCard({ quadrant, ftp }: { quadrant: Quadrant | null; ftp: number | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!quadrant) return null
  const w = (frac: number) => (ftp && ftp > 0 ? `${Math.round(frac * ftp)} W` : de ? 'Tempo-Watt' : 'tempo watts')
  const cells = [
    { label: de ? 'Kraft ↑ / Kadenz ↑' : 'hi force / hi cad', pct: quadrant.q1_pct, tag: 'Q1' },
    { label: de ? 'Kraft ↑ / Kadenz ↓' : 'hi force / lo cad', pct: quadrant.q2_pct, tag: 'Q2' },
    { label: de ? 'Kraft ↓ / Kadenz ↓' : 'lo force / lo cad', pct: quadrant.q3_pct, tag: 'Q3' },
    { label: de ? 'Kraft ↓ / Kadenz ↑' : 'lo force / hi cad', pct: quadrant.q4_pct, tag: 'Q4' },
  ]
  const dom = cells.reduce((a, b) => (b.pct > a.pct ? b : a))
  const headlineByTag: Record<string, string> = {
    Q1: de ? 'Viel im Angriff' : 'A lot of time attacking',
    Q2: de ? 'Oft im schweren Gang' : 'Often grinding a big gear',
    Q3: de ? 'Meist im lockeren Bereich' : 'Mostly ridden easy',
    Q4: de ? 'Überwiegend rund getreten' : 'Mostly spinning it out',
  }
  const readByTag: Record<string, string> = {
    Q1: de ? 'Kraft & Kadenz beide hoch — das kostet W′. Für lange Bergtage sparsamer einsetzen.' : 'High force and cadence both — this spends W′. Use it sparingly on long mountain days.',
    Q2: de ? 'Schwerer Gang bei niedriger Kadenz belastet die Muskulatur. Für Anstiege leichter übersetzen und Kadenz halten.' : 'Big gear at low cadence loads the muscles. Gear down on climbs and keep the cadence up.',
    Q3: de ? 'Überwiegend locker gefahren — gut fürs Sparen, aber am Berg brauchst du auch Drehmoment.' : 'Mostly easy pedalling — good for saving energy, but climbs still demand torque.',
    Q4: de ? 'Hohe Kadenz, wenig Kraft — effizient. Für steile Rampen etwas mehr Kraftausdauer trainieren.' : 'High cadence, low force — efficient. Add strength-endurance for the steep ramps.',
  }
  const actionByTag: Record<string, string> = {
    Q1: de ? `Kraftausdauer statt Attacken: 3×12 min bei ${w(0.9)}, 1×/Woche.` : `Trade surges for strength-endurance: 3×12 min at ${w(0.9)}, once a week.`,
    Q2: de ? `Am Berg leichter übersetzen — Kadenz 85–95 bei ${w(0.9)} halten.` : `Gear down on climbs — hold 85–95 rpm at ${w(0.9)}.`,
    Q3: de ? `Drehmoment aufbauen: 3×8 min bei 50–60 rpm, ${w(0.85)} am Berg, 1×/Woche.` : `Build torque: 3×8 min at 50–60 rpm, ${w(0.85)} on a climb, once a week.`,
    Q4: de ? `Für steile Rampen Kraftausdauer ergänzen: 3×8 min bei 55–60 rpm, ${w(0.85)}.` : `Add strength-endurance for steep ramps: 3×8 min at 55–60 rpm, ${w(0.85)}.`,
  }
  return (
    <Card label={de ? 'QUADRANTEN' : 'PEDALLING STYLE'} headline={headlineByTag[dom.tag]} read={readByTag[dom.tag]} action={actionByTag[dom.tag]}>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((c) => {
          const isDom = c.tag === dom.tag
          return (
            <div key={c.tag} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--color-paper)', border: `1px solid ${isDom ? 'color-mix(in srgb, var(--color-forest-2) 45%, var(--color-rule))' : 'var(--color-rule)'}` }}>
              <div className="flex items-baseline justify-between">
                <span className="num-mono" style={{ fontSize: 9, color: 'var(--color-muted)', letterSpacing: '0.1em' }}>{c.tag}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 500, color: isDom ? 'var(--color-forest-2)' : 'var(--color-ink)' }}>{Math.round(c.pct)}%</span>
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--color-muted)' }}>{c.label}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function FuelingCard({ fueling }: { fueling: Fueling | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!fueling) return null
  const tone = fueling.likely_underfueled === true ? 'var(--color-bad)' : fueling.likely_underfueled === false ? 'var(--color-good)' : undefined
  const headline = fueling.likely_underfueled === true ? (de ? 'Wahrscheinlich unterversorgt' : 'Likely under-fuelled')
    : (de ? `${Math.round(fueling.total_kj).toLocaleString()} kJ verbrannt` : `${Math.round(fueling.total_kj).toLocaleString()} kJ burned`)
  return (
    <Card label={de ? 'VERPFLEGUNG' : 'FUELLING'} accent={tone} headline={headline} read={fueling.note || undefined}>
      <StatRow>
        <StatBlock value={`${fueling.carb_target_g_per_h[0]}–${fueling.carb_target_g_per_h[1]}`} unit="g/h" label={de ? 'KH-Ziel' : 'Carb target'} color={tone} />
        <StatBlock value={`${Math.round(fueling.cho_g_estimate)}`} unit="g" label={de ? 'KH' : 'CHO'} />
        <StatBlock value={`${Math.round(fueling.fat_g_estimate)}`} unit="g" label={de ? 'Fett' : 'Fat'} />
      </StatRow>
    </Card>
  )
}

function WkoCard({ wko, weightKg }: { wko: WkoModel | null; weightKg: number | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!wko) return null
  // Confidence is driven by the power–duration fit quality. A steady mountain
  // ride is not a CP test, so an R² of ~0.74 is a rough estimate, not a measured
  // value — surface that plainly instead of implying false precision.
  const r2 = wko.r_squared
  const conf = r2 >= 0.9
    ? { c: 'var(--color-good)', t: de ? 'hohe Konfidenz' : 'high confidence' }
    : r2 >= 0.8
      ? { c: 'var(--color-caution)', t: de ? 'mittlere Konfidenz' : 'moderate confidence' }
      : { c: 'var(--color-muted)', t: de ? 'grobe Schätzung' : 'rough estimate' }
  const wkg = weightKg && weightKg > 0
  const read = de
    ? `Aus der Leistungs-Dauer-Kurve dieser Fahrt geschätzt — kein CP-Test. W′ ist deine anaerobe Reserve für kurze Attacken.`
    : `Estimated from this ride's power–duration curve — not a CP test. W′ is your anaerobic reserve for short attacks.`
  // Concrete target: extend time-to-exhaustion by riding at CP for the current TTE.
  const cp = Math.round(wko.cp_watts)
  const action = de
    ? `Schwellen-Intervalle bei CP (${cp} W) über ${fmtMmSs(wko.tte_s)} fahren, um deine TTE zu verlängern.`
    : `Ride threshold intervals at CP (${cp} W) for ${fmtMmSs(wko.tte_s)} to extend your time-to-exhaustion.`
  return (
    <Card label={de ? 'LEISTUNGSMODELL' : 'POWER MODEL'} accent="var(--color-ink-blue)" headline={de ? 'Dein aktueller Motor' : 'Your engine, modelled'} read={read} action={action}>
      <span className="num-mono self-start rounded-full px-2 py-0.5" style={{ fontSize: 9.5, fontWeight: 600, color: conf.c, border: `1px solid color-mix(in srgb, ${conf.c} 35%, var(--color-rule))` }}>
        {conf.t} · R² {r2.toFixed(2)}
      </span>
      <StatRow>
        <StatBlock value={`${Math.round(wko.cp_watts)}`} unit={wkg ? `W · ${(wko.cp_watts / (weightKg as number)).toFixed(1)} W/kg` : 'W'} label="CP"
          hint={de ? 'Kritische Leistung — die höchste Dauerleistung' : 'Critical Power — the highest power you can hold steady'} />
        <StatBlock value={(wko.w_prime_j / 1000).toFixed(1)} unit="kJ" label="W′"
          hint={de ? 'W′ — anaerobe Reserve für kurze Attacken' : "W′ — anaerobic reserve for short attacks"} />
        <StatBlock value={`${Math.round(wko.pmax_watts)}`} unit={wkg ? `W · ${(wko.pmax_watts / (weightKg as number)).toFixed(1)} W/kg` : 'W'} label="Pmax"
          hint={de ? 'Maximale Sprintleistung' : 'Maximum sprint power'} />
        <StatBlock value={fmtMmSs(wko.tte_s)} label="TTE"
          hint={de ? 'Zeit bis zur Erschöpfung an CP' : 'Time to exhaustion at CP'} />
        <StatBlock value={wko.vo2max_estimate != null ? wko.vo2max_estimate.toFixed(1) : '—'} label={de ? 'VO₂max (gesch.)' : 'VO₂max (est.)'}
          hint={de ? 'Geschätzte maximale Sauerstoffaufnahme — Maß der aeroben Ausdauer' : 'Estimated maximal oxygen uptake — a measure of aerobic capacity'} />
      </StatRow>
    </Card>
  )
}

function CdaCard({ cda }: { cda: Cda | null }) {
  const { locale } = useLocale(); const de = locale === 'de'
  if (!cda) return null
  if (cda.cda_m2 < 0.18 || cda.cda_m2 > 0.55) return null
  // Aero power saved by trimming CdA 0.02 m² at 40 km/h: P = ½·ρ·CdA·v³.
  const wSaved = Math.round(0.5 * 1.225 * 0.02 * Math.pow(11.11, 3))
  const action = de
    ? `Auf Flachstücken tief bleiben — 0,02 m² weniger CdA sparen ~${wSaved} W bei 40 km/h.`
    : `Hold an aero position on the flats — trimming CdA 0.02 m² saves ~${wSaved} W at 40 km/h.`
  return (
    <Card label={de ? 'AERODYNAMIK' : 'AERODYNAMICS'} accent="var(--color-ink-blue)"
      headline={`CdA ${cda.cda_m2.toFixed(3)} m²`}
      read={de ? 'Schätzung aus Geschwindigkeit, Leistung und Steigung — Richtwert, kein Windkanal.' : 'Estimated from speed, power and grade — directional, not a wind-tunnel figure.'}
      action={action}>
      <StatRow>
        <StatBlock value={cda.cda_m2.toFixed(3)} unit="m²" label="CdA" />
        <StatBlock value={(cda.avg_speed_ms * 3.6).toFixed(1)} unit="km/h" label={de ? 'Ø Geschw.' : 'Avg speed'} />
        <StatBlock value={`${cda.sample_count}`} label={de ? 'Proben' : 'Samples'} />
      </StatRow>
    </Card>
  )
}

// ─── BreakdownPanels (Act 3) ─────────────────────────────────────────────────
export default function BreakdownPanels({ report }: { report: RaceDebrief }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const { data: profile } = useAthleteProfile()
  const weightKg = profile?.weight_kg ?? null
  const ftp = profile?.ftp_watts ?? null
  const hasEfficiency = !!report.efficiency && (report.efficiency.efficiency_factor != null || report.efficiency.decoupling_pct != null || report.efficiency.avg_hr != null)
  const cdaShown = !!report.cda && report.cda.cda_m2 >= 0.18 && report.cda.cda_m2 <= 0.55
  const hasCompact = !!report.matchbook || hasEfficiency || !!report.wko || !!report.fueling || !!report.quadrant || cdaShown
  const hasAny = report.pacing || (report.efforts && report.efforts.length > 0) || (report.climbs && report.climbs.length > 0) || hasCompact
  if (!hasAny) return null

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <PacingSlide pacing={report.pacing} />
      <EffortsSlide efforts={report.efforts} weightKg={weightKg} />
      <ClimbsSlide climbs={report.climbs} ftp={ftp} weightKg={weightKg} />

      {hasCompact && (
        <div className="flex flex-col gap-5">
          <ActHeader
            kicker={de ? 'IM DETAIL' : 'BY THE NUMBERS'}
            title={de ? 'Das Kleingedruckte' : 'The finer detail'}
            subtitle={de
              ? 'Die Zahlen hinter dem Urteil — für alle, die tiefer graben wollen.'
              : 'The numbers behind the verdict — for when you want to dig deeper.'}
          />
          <div className="grid gap-4 md:grid-cols-2 items-stretch">
            <MatchbookCard matchbook={report.matchbook} />
            <EfficiencyCard efficiency={report.efficiency} ftp={ftp} />
            <WkoCard wko={report.wko} weightKg={weightKg} />
            <FuelingCard fueling={report.fueling} />
            <QuadrantCard quadrant={report.quadrant} ftp={ftp} />
            <CdaCard cda={report.cda} />
          </div>
        </div>
      )}
    </div>
  )
}
