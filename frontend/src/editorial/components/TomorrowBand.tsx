import { ArrowUpRight } from 'lucide-react'
import { isPresent, type Value } from '../data/value'

/**
 * Transcribed from Rest's "Tomorrow Band Wrap" (FKp6r → K5LLS "Band",
 * `RYP0r`): fill #FFFFFF0A, cornerRadius 22, width fill_container. Col
 * (vertical, gap 6): Kicker "TOMORROW · UNLOCKS 05:00" (10/800 ls1.6, the
 * state accent) then Title "Threshold · 4 × 8 @ 285 W" (22/800 ls-0.9
 * lh1.1, $e-ink). Arrow icon (24x24, state accent) sits to the right —
 * "arrow_forward" in the tree, `ArrowUpRight` (already this file's
 * substitution family, see `DayRail.tsx`) stands in.
 *
 * Training's own equivalent (d3JkYD → tnfx3, `x4AxA5`) is the SAME band
 * shape showing TODAY's own session instead of tomorrow's — its Kicker
 * reads "TODAY · STARTS 17:30", not "TOMORROW · …" — because on a training
 * day the upcoming session is today's, not tomorrow's. `kicker` (new prop,
 * not on the canonical component) lets the caller swap that leading word;
 * the rest of the kicker string ("· UNLOCKS 05:00" / "· STARTS 17:30") is
 * real only when a time source exists (`tomorrow.unlockLabel` is honestly
 * missing everywhere in this app today — see `useTodayModel.ts` — and
 * `session` carries no start-of-day field either), so this component omits
 * that clause entirely rather than inventing a time, matching the
 * "frame + labels stay, no invented data" rule.
 */
export default function TomorrowBand({
  session,
  kicker = 'TOMORROW',
}: {
  session: Value<{ title: string; unlockLabel: string }>
  kicker?: string
}) {
  const present = isPresent(session)
  return (
    <div data-tomorrow-band style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--e-glass)', borderRadius: 22, padding: 20, gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--e-body)', fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: 'var(--st-active)' }}>
          {kicker}{present && session.value.unlockLabel ? ` · ${session.value.unlockLabel}` : ''}
        </span>
        <span style={{ fontFamily: 'var(--e-display)', fontSize: 22, fontWeight: 800, letterSpacing: -0.9, lineHeight: 1.1, color: 'var(--e-ink)' }}>
          {present ? session.value.title : '—'}
        </span>
        {!present && (
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 12, fontWeight: 600, color: 'var(--e-quiet)', margin: 0 }}>
            {session.missing}
          </p>
        )}
      </div>
      <ArrowUpRight size={24} color="var(--st-active)" aria-hidden="true" />
    </div>
  )
}
