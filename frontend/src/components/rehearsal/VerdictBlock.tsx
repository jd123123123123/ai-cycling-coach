import type { RehearsalBand } from '../../api/rehearsal'
import { formatHm } from './rehearsalMath'

/**
 * VerdictBlock — the headline of a route rehearsal.
 *
 * The one rule this component exists to enforce: the answer is a RANGE. p50
 * is never rendered, not even smaller or greyer, because a single confident
 * time is the specific trust wound this feature could cause — an athlete who
 * reads "5:10" and finishes in 5:40 concludes the coach is wrong, when the
 * projection was in fact right about the spread and honest about it.
 *
 * The same instinct drives the disclosure lines: when the aero number or the
 * durability fade is a default rather than a measurement, the screen says so
 * in words, next to the number it affects. Both are defaults for every real
 * athlete today (no CdA estimate and no durability measurement are stored),
 * so the athlete sees the whole truth about how much of this is assumed.
 */
export default function VerdictBlock({
  band,
  blowUpKm,
  blowUpClimb,
  blowUpWatts,
  cdaIsDefault,
  durabilityIsDefault,
  wPrimeIsDefault,
  weatherUsed,
  bandSamples = 0,
  de,
  missing,
}: {
  band?: RehearsalBand
  blowUpKm: number | null
  blowUpClimb: string | null
  /** The wattage ceiling on the climb before the blow-up, when derivable. */
  blowUpWatts?: number | null
  cdaIsDefault: boolean
  durabilityIsDefault?: boolean
  /**
   * True when no measured W′ backs this rider. There is then no ceiling in
   * the model at all, so the absence of a blow-up is an absence of evidence —
   * and the block says exactly that rather than letting silence imply safety.
   */
  wPrimeIsDefault?: boolean
  weatherUsed: boolean
  /** How many of the athlete's own completed rides the band width was
   *  measured against. 0 means it is the reasoned default. */
  bandSamples?: number
  de: boolean
  /** Names of the profile inputs that make a prediction impossible. */
  missing?: string[]
}) {
  const notes: string[] = []
  if (cdaIsDefault) {
    notes.push(
      de
        ? 'Aerodynamik geschätzt (Standardwert) — die Spanne ist entsprechend breiter.'
        : 'Aero is a default estimate — the range is wider to match.',
    )
  }
  if (durabilityIsDefault) {
    notes.push(
      de
        ? 'Ermüdungsverlust unbekannt — die Vorhersage nimmt an, dass du bei km 180 so stark bist wie bei km 5.'
        : "No durability data yet — this assumes you're as strong at km 180 as at km 5.",
    )
  }
  if (wPrimeIsDefault) {
    notes.push(
      de
        ? 'Kein W′ hinterlegt — wir können dir nicht sagen, wo du einbrichst.'
        : 'No W′ on file — we cannot tell you where you blow up.',
    )
  }
  // Where the RANGE came from. Without this the width reads as a measurement
  // in both cases, and one of them is a set of reasoned assumptions.
  if (bandSamples > 0) {
    notes.push(
      de
        ? `Spanne an ${bandSamples} deiner gefahrenen Strecken geeicht.`
        : `Range calibrated against ${bandSamples} of your own completed rides.`,
    )
  }
  if (weatherUsed) {
    notes.push(
      de
        ? 'Wind und Temperatur aus der Vorhersage.'
        : 'Wind and temperature from the forecast.',
    )
  }

  const noteList = notes.length > 0 && (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
      {notes.map((n) => (
        <li key={n} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-muted)' }}>
          {n}
        </li>
      ))}
    </ul>
  )

  // ── No band: say what is missing, show no time at all. Not an error state —
  // the terrain below this block is still entirely real. ──
  if (!band) {
    const reasons: string[] = []
    if (missing?.includes('cp')) {
      reasons.push(
        de
          ? 'Ohne FTP oder CP können wir keine Zeit schätzen — nur das Profil.'
          : 'Without an FTP or CP we cannot estimate a time — only the profile.',
      )
    }
    if (missing?.includes('weight')) {
      reasons.push(
        de
          ? 'Ohne dein Körpergewicht können wir keine Zeit schätzen — am Berg entscheidet W/kg.'
          : 'Without your body weight we cannot estimate a time — climbing is decided by W/kg.',
      )
    }
    if (reasons.length === 0) {
      reasons.push(
        de
          ? 'Für eine Zeitvorhersage fehlen noch Angaben in deinem Profil — das Streckenprofil siehst du trotzdem.'
          : 'Your profile is still missing what a time prediction needs — the route profile is below regardless.',
      )
    }
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span
          className="eyebrow"
          style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
        >
          {de ? 'KEINE ZEITVORHERSAGE' : 'NO TIME PREDICTION'}
        </span>
        {reasons.map((r) => (
          <p key={r} style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-ink)', margin: 0 }}>
            {r}
          </p>
        ))}
      </section>
    )
  }

  const blowUp = blowUpKm != null ? blowUpSentence(de, blowUpKm, blowUpClimb, blowUpWatts) : null

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--color-ink-2)' }}
      >
        {de ? 'VORAUSSICHTLICHE ZEIT' : 'PREDICTED TIME'}
      </span>
      <span
        className="num-display"
        style={{ fontSize: 40, lineHeight: 1.05, color: 'var(--color-ink)', letterSpacing: '-0.02em' }}
      >
        {`${formatHm(band.p10_s)} – ${formatHm(band.p90_s)}`}
      </span>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-ink-2)', margin: 0 }}>
        {de
          ? `Spanne aus ${band.draws} Simulationen — 8 von 10 Fahrten landen darin.`
          : `Range across ${band.draws} simulations — 8 rides in 10 land inside it.`}
      </p>
      {blowUp && (
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-ink)', margin: 0, fontWeight: 500 }}>
          {blowUp}
        </p>
      )}
      {noteList}
    </section>
  )
}

/** The blow-up sentence, built from the data: the distance, the climb it
 *  happens on, and the wattage that would have prevented it. Each piece is
 *  dropped rather than faked when the projection doesn't carry it. */
function blowUpSentence(
  de: boolean,
  km: number,
  climb: string | null,
  watts?: number | null,
): string {
  const at = Math.round(km)
  const w = watts != null ? Math.round(watts) : null
  if (de) {
    const where = climb ? `Bei km ${at} am ${climb}` : `Bei km ${at}`
    return w != null
      ? `${where} geht das Licht aus — halte den Anstieg davor unter ${w} W.`
      : `${where} geht das Licht aus — den Anstieg davor deutlich zurückhaltender angehen.`
  }
  const where = climb ? `You blow up at km ${at} on the ${climb}` : `You blow up at km ${at}`
  return w != null
    ? `${where} unless you hold the climb before it under ${w} W.`
    : `${where} unless you take the climb before it noticeably easier.`
}
