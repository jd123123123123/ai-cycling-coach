import type { RehearsalZone } from '../../api/rehearsal'
import { formatHm } from './rehearsalMath'
import { penCard, penDivider, penEyebrow, penNote, penPill } from './penCard'

/**
 * TimeInZones — where the predicted time actually goes.
 *
 * Transcribed from the pencil frame's `TimeInZones` node: concentric arcs, one
 * per zone, each carrying its own coloured glow, the total in the middle, and a
 * proportional list beside it.
 *
 * ── This reverses a documented decision, on instruction ──────────────────
 * The previous version drew stacked bars and said why: five arcs of similar
 * size are hard to rank, while bars share one baseline so the ordering is read
 * rather than estimated. That reasoning is not wrong. It was overridden on
 * 2026-08-04 by an explicit instruction to match the frame 1:1, and the
 * trade-off it named is real — ranking two middling zones by eye is harder
 * here than it was.
 *
 * Two things blunt that cost. The list beside the rings carries the exact
 * minutes AND the percentage, so nothing has to be estimated from an arc at
 * all; the rings answer "what shape was this ride", the list answers "how
 * much". And the per-arc glow keeps a 4% zone visible at 14 px of stroke,
 * which is the case a bar chart handles for free and a plain donut does not.
 *
 * Arcs are laid head to tail from twelve o'clock in zone order — these are
 * TOTALS gathered from all over the route, so the ring deliberately implies
 * proportion and not sequence.
 */

/** The frame's palette, one per Coggan zone. */
const ZONE_COLOR: Record<number, string> = {
  1: '#59C3FF',
  2: '#16E08A',
  3: '#FFB020',
  4: '#FF5A3C',
  5: '#FA1E55',
  6: '#8B5CF6',
  7: '#C01048',
}

const SIZE = 130
const STROKE = 14
const GAP_DEG = 4

export default function TimeInZones({
  zones,
  ftpUsedW,
  ftpIsCpFallback,
  de,
}: {
  zones: RehearsalZone[]
  ftpUsedW?: number | null
  ftpIsCpFallback?: boolean
  de: boolean
}) {
  if (!zones || zones.length === 0) return null
  const total = zones.reduce((s, z) => s + z.seconds, 0)
  if (total <= 0) return null

  // "Aerobic" = Z1-Z3. The single sentence a rider takes away from this card is
  // whether the route is carried by their base or by their top end.
  const aerobic = zones.filter((z) => z.zone <= 3).reduce((s, z) => s + z.fraction, 0)
  const hard = 1 - aerobic

  const shown = zones.filter((z) => z.fraction > 0)
  const r = (SIZE - STROKE) / 2
  const c = SIZE / 2
  const circumference = 2 * Math.PI * r

  let cursor = 0
  const arcs = shown.map((z) => {
    const sweep = z.fraction * 360
    // A gap only when there is more than one arc, so a single-zone ride still
    // closes into a complete ring instead of showing a mystery notch.
    const gap = shown.length > 1 ? GAP_DEG : 0
    const arc = { zone: z.zone, start: cursor, len: Math.max(0, sweep - gap) }
    cursor += sweep
    return arc
  })

  return (
    <section style={{ ...penCard, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <span style={penEyebrow('#59C3FF')}>
          {de ? 'Wo die Zeit hingeht' : 'Where the time goes'}
        </span>
        <span style={{ ...penPill, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            className="num-display"
            style={{ fontSize: 11, fontWeight: 800, color: '#FFFFFFE6', letterSpacing: -0.2 }}
          >
            {formatHm(total)}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#FFFFFF8C', letterSpacing: 0.4 }}>
            {de ? 'GESAMT' : 'MOVING'}
          </span>
        </span>
      </div>

      <div className="flex items-center" style={{ gap: 16 }}>
        <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg width={SIZE} height={SIZE} aria-hidden>
            <defs>
              {arcs.map((a) => (
                <filter
                  key={a.zone}
                  id={`tiz-glow-${a.zone}`}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feDropShadow
                    dx="0"
                    dy="0"
                    stdDeviation="3.5"
                    floodColor={ZONE_COLOR[a.zone] ?? '#16E08A'}
                    floodOpacity="0.6"
                  />
                </filter>
              ))}
            </defs>
            <circle cx={c} cy={c} r={r} fill="none" stroke="#FFFFFF0F" strokeWidth={STROKE} />
            {arcs.map((a) => (
              <circle
                key={a.zone}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={ZONE_COLOR[a.zone] ?? '#16E08A'}
                strokeWidth={STROKE}
                strokeDasharray={`${(a.len / 360) * circumference} ${circumference}`}
                // -90 puts 0° at twelve o'clock, where a reader starts.
                transform={`rotate(${a.start - 90} ${c} ${c})`}
                filter={`url(#tiz-glow-${a.zone})`}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 1 }}>
            <span
              className="num-display"
              style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', letterSpacing: -1, lineHeight: 1 }}
            >
              {formatHm(total)}
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: '#FFFFFF59' }}>
              {de ? 'FAHRZEIT' : 'MOVING TIME'}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col" style={{ gap: 7, minWidth: 0 }}>
          {shown.map((z) => {
            const color = ZONE_COLOR[z.zone] ?? '#16E08A'
            return (
              <div key={z.zone} className="flex items-center justify-between" style={{ gap: 8 }}>
                <span className="inline-flex items-center" style={{ gap: 6, minWidth: 0 }}>
                  <span style={{ width: 3, height: 11, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color }}>
                    {`Z${z.zone}`}
                  </span>
                  <span className="truncate" style={{ fontSize: 10, fontWeight: 600, color: '#FFFFFF8C' }}>
                    {de ? z.name_de : z.name_en}
                  </span>
                </span>
                <span className="inline-flex items-center" style={{ gap: 7, flexShrink: 0 }}>
                  <span
                    className="num-display"
                    style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: -0.2, color: '#FFFFFFE6' }}
                  >
                    {formatHm(z.seconds)}
                  </span>
                  <span
                    style={{ fontSize: 9.5, fontWeight: 700, color: '#FFFFFF59', width: 26, textAlign: 'right' }}
                  >
                    {`${Math.round(z.fraction * 100)}%`}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <span style={penDivider} />

      {/* The sentence FLIPS on a hard route. The frame only shows the
          base-carries-it wording, but printing that over a ride with 40% above
          tempo would be the card contradicting its own rings — so the opposite
          reading is kept from the previous version. */}
      <p style={penNote}>
        {hard <= 0.25
          ? de
            ? `Deine Grundlage trägt diese Strecke — nur ${Math.round(hard * 100)} % der Zeit liegt über Tempo.`
            : `Aerobic base carries this route — only ${Math.round(hard * 100)}% of your time sits above tempo.`
          : de
            ? `${Math.round(hard * 100)} % der Zeit über Tempo — das ist keine Grundlagenfahrt.`
            : `${Math.round(hard * 100)}% of the time above tempo — this is not a base ride.`}
        {/* And the CP disclosure: zones binned against a CP rather than a real
            FTP are a different claim, and the card says which. */}
        {ftpIsCpFallback && ftpUsedW ? (
          <>
            {' '}
            {de
              ? `Zonen gegen deine CP (${Math.round(ftpUsedW)} W) gerechnet, weil keine FTP hinterlegt ist.`
              : `Zones binned against your CP (${Math.round(ftpUsedW)} W) — no FTP on file.`}
          </>
        ) : null}
      </p>
    </section>
  )
}
