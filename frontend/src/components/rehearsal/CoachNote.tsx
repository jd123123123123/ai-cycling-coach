import { Sparkles } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useDailyDecision } from '../../hooks/useDailyDecision'

/**
 * CoachNote — one sentence tying today's readiness to THIS route.
 *
 * Everything else on the page describes the road. This is the only block that
 * connects the road to the rider on the morning they are looking at it: a
 * 1,300 m day is a different proposition at 82% recovery than at 48%, and the
 * numbers above cannot say that because none of them know about the athlete's
 * night.
 *
 * ── Deterministic, and honest about it ───────────────────────────────────
 * This is NOT the LLM coach. It is a stated rule over two measured values —
 * readiness and the route's own demand — so it works with no API key and can
 * never hallucinate a reason. It says less than the chat coach would, and what
 * it says is checkable.
 *
 * Renders nothing without readiness. A note that opened "Recovery is at —%"
 * would be worse than silence, and the whole point of the block is the link
 * between the two numbers; with one missing there is no link to state.
 */
export default function CoachNote({
  ascentM,
  distanceM,
  blowUps,
}: {
  ascentM: number
  distanceM: number
  blowUps: number
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { decision } = useDailyDecision()
  const readiness = decision?.readiness?.score ?? null

  if (readiness == null) return null

  const km = distanceM / 1000
  // Metres of climbing per kilometre — the one number that separates a long
  // flat day from a short brutal one, and the thing readiness has to be
  // weighed against.
  const climbRate = km > 0 ? ascentM / km : 0
  const hard = climbRate >= 20 || ascentM >= 1000
  const r = Math.round(readiness)

  const body = (() => {
    if (readiness >= 70) {
      return hard
        ? de
          ? `Erholung bei ${r}% — diese Strecke passt heute. Halte dich am längsten Anstieg zurück, dann bleibt am Ende noch etwas übrig.`
          : `Recovery is at ${r}% — this route fits today. Hold back on the longest climb and there will be something left at the end.`
        : de
          ? `Erholung bei ${r}% — für diese Runde bist du gut aufgestellt. Das Profil verlangt nichts, was du heute nicht hast.`
          : `Recovery is at ${r}% — you are well set up for this loop. The profile asks for nothing you do not have today.`
    }
    if (readiness >= 50) {
      return hard
        ? de
          ? `Erholung bei ${r}% — die Strecke ist machbar, aber nicht zum Draufhalten. Fahre die Anstiege eine Stufe ruhiger als du könntest.`
          : `Recovery is at ${r}% — the route is doable but not one to attack. Ride the climbs a notch easier than you could.`
        : de
          ? `Erholung bei ${r}% — passt. Bleib im Grundlagenbereich, dann kostet dich die Runde nichts, was du morgen brauchst.`
          : `Recovery is at ${r}% — fine. Stay endurance-paced and this loop costs nothing you need tomorrow.`
    }
    return hard
      ? de
        ? `Erholung bei ${r}% — ${Math.round(ascentM)} Höhenmeter sind heute viel verlangt. Wenn du fährst, dann bewusst langsam.`
        : `Recovery is at ${r}% — ${Math.round(ascentM)} m of climbing is a lot to ask today. If you ride it, ride it deliberately slowly.`
      : de
        ? `Erholung bei ${r}% — flach genug, um trotzdem zu fahren, solange es locker bleibt.`
        : `Recovery is at ${r}% — flat enough to ride anyway, as long as it stays easy.`
  })()

  const note =
    blowUps > 0
      ? body +
        (de
          ? ' Die Vorhersage sieht eine Stelle, an der es reißen kann — sie ist oben markiert.'
          : ' The forecast sees one place this can come apart — it is marked above.')
      : body

  return (
    <section
      className="rounded-[18px] flex items-start"
      style={{ background: '#8B5CF614', padding: 14, gap: 12 }}
    >
      <span
        className="shrink-0 grid place-items-center rounded-full"
        style={{
          width: 38,
          height: 38,
          background: 'linear-gradient(135deg, #8B5CF6, #59C3FF)',
        }}
      >
        <Sparkles size={20} style={{ color: '#FFFFFF' }} />
      </span>
      <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
        <span
          className="eyebrow"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-violet)' }}
        >
          {de ? 'DER COACH SAGT' : 'COACH SAYS'}
        </span>
        <p style={{ fontSize: 13, lineHeight: 1.45, color: '#FFFFFFF2', margin: 0 }}>{note}</p>
      </div>
    </section>
  )
}
