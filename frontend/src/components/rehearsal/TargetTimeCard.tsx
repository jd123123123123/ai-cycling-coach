import type { Rehearsal } from '../../api/rehearsal'
import { formatHm } from './rehearsalMath'
import { glassCardStyle, GLASS_CARD_MARKER } from '../dashboard/glassCard'
import { accentBloom, accentEdge, eyebrow } from '../dashboard/surfaces'

/**
 * TargetTimeCard — the answer to "I want to finish inside X".
 *
 * Three outcomes, and the whole value of the card is that it never blurs them
 * together:
 *
 *  • REACHABLE — here is the intensity it demands, ride it.
 *  • REACHABLE BUT COSTLY — the clock allows it, W′ does not. That is a
 *    warning, not a pacing plan, and it gets the strain colour rather than a
 *    green tick, because a rider who reads "yes" here and blows up at km 84
 *    was failed by this card and not by their legs.
 *  • OUT OF REACH — say so, and say what IS possible. The alternative is the
 *    failure the solver was written to avoid: clamping at the ceiling and
 *    reporting the ceiling's time as though the request had been met.
 *
 * The intensity is expressed as a percentage of the athlete's chosen effort
 * setting, not in watts, because it applies across the whole route: the watts
 * differ on every pitch, and one number claiming to be "your target" would be
 * wrong everywhere except the flat.
 */
export default function TargetTimeCard({ data, de }: { data: Rehearsal; de: boolean }) {
  const target = data.target_time_s
  if (target == null) return null

  const reachable = data.target_reachable === true
  const costly = data.target_costs_blow_up === true
  const fastest = data.fastest_possible_s ?? null
  const intensity = data.target_intensity_pct ?? null

  const tone = !reachable
    ? 'var(--color-strain)'
    : costly
      ? 'var(--color-amber)'
      : 'var(--color-recovery)'

  const headline = !reachable
    ? de
      ? 'Diese Zeit liegt nicht drin'
      : 'That time is out of reach'
    : costly
      ? de
        ? 'Machbar — aber es kostet dich alles'
        : 'Reachable — but it empties you'
      : de
        ? 'Das geht'
        : 'That works'

  return (
    <section
      {...GLASS_CARD_MARKER}
      style={{
        ...glassCardStyle,
        borderRadius: 20,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* State arrives as an EDGE, not a wash: the card stays near-black so
          several accented cards can sit on one screen without fighting. */}
      <span aria-hidden style={accentBloom(tone)} />
      <span aria-hidden style={accentEdge(tone)} />

      <span
        className="eyebrow"
        style={eyebrow('var(--color-ink-2)')}
      >
        {de ? `ZIELZEIT ${formatHm(target)}` : `TARGET ${formatHm(target)}`}
      </span>

      <span className="num-display" style={{ fontSize: 19, fontWeight: 700, color: tone }}>
        {headline}
      </span>

      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-ink-2)', margin: 0 }}>
        {!reachable
          ? fastest != null
            ? de
              ? `Alles gegeben kommst du auf ${formatHm(fastest)}. Das ist keine Frage der Tagesform — die Physik gibt mehr nicht her.`
              : `Flat out you come in at ${formatHm(fastest)}. This is not a question of form — the physics does not go further.`
            : de
              ? 'Auch mit allem, was du hast, reicht es nicht.'
              : 'Even with everything you have, it does not get there.'
          : costly
            ? de
              ? 'Die Uhr sagt ja, dein W′ sagt nein: In diesem Tempo bist du vor dem Ziel leer. Nimm die Zeit als Obergrenze, nicht als Plan.'
              : "The clock says yes, your W′ says no: at this pace you run empty before the finish. Treat the time as a ceiling, not a plan."
            : de
              ? 'Die Wattvorgaben oben sind auf diese Zeit gerechnet — das Profil zeigt, wo sie wehtun.'
              : 'The target watts above are solved for this time — the profile shows where they hurt.'}
      </p>

      {reachable && intensity != null && (
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {de
            ? `${Math.round(intensity)} % deiner gewählten Fahrweise`
            : `${Math.round(intensity)}% of your chosen effort`}
        </span>
      )}
    </section>
  )
}
