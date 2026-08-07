import { isPresent, type Value } from '../data/value'
import { useCopy } from '../i18n/useCopy'

/**
 * Task 9 — Die Kette: the streak, its break, and the week's XP bar.
 *
 * The screen's hero cassette is also the streak: thirteen days is thirteen
 * links. Rest days never break the chain — they are prescribed work, and
 * `model.missedYesterday` (Task 5) is already null on a rest day, on a
 * ridden day, and on a day with no plan at all. It is ONLY present when a
 * PLANNED session was skipped, so its presence alone is the one and only
 * "broken" signal here — no second rule is layered on top of it, and
 * nothing here ever infers a break from a low reading or a rest day.
 *
 * TONE (owner's explicit ruling, 2026-08-07): the break is not softened.
 * `ketteBroken` names the skipped session and reads as a loss — but the
 * guilt attaches only to a session the rider chose to skip, never to a
 * physiological verdict, a rest day, or a low reading. Keep it factual and
 * direct; no sympathy, no cruelty.
 *
 * XP bar: `weekLoad.spent` is planned load actually completed (never raw
 * ride volume), so junk miles cannot farm it. A missing week plan withholds
 * the bar entirely and prints its own reason — never a zero-filled bar
 * against an invented denominator. A present plan with `planned === 0` is
 * not an error either (a plan can exist with nothing prescribed yet); it
 * fills zero segments rather than dividing by zero. `planned > 0` alone
 * already rejects a non-finite or negative planned value (NaN/negative
 * fail the `> 0` test), and rounding a NaN or negative ratio naturally
 * clamps to zero filled segments below — no separate guard needed for
 * negative/non-finite `spent` or `planned` beyond that one check plus the
 * final `Math.max(0, …)` clamp.
 */

export interface KetteStripProps {
  streakDays: Value<number>
  weekLoad: Value<{ spent: number; planned: number }>
  missedYesterday: Value<{ title: string; dateIso: string }>
}

const SEGMENTS = 10

export default function KetteStrip({ streakDays, weekLoad, missedYesterday }: KetteStripProps) {
  const { t } = useCopy()
  const broken = isPresent(missedYesterday)

  // A missing target cannot be divided into; a zero or negative/non-finite
  // target is not an error either — it simply has nothing usable to fill
  // against. All three land on `filled = 0`, never a NaN and never a full
  // bar drawn against an invented denominator. An over-delivered week
  // (spent > planned) clamps at the full ten segments rather than
  // overflowing them.
  const filled = isPresent(weekLoad) && weekLoad.value.planned > 0
    ? Math.max(0, Math.min(SEGMENTS, Math.round((weekLoad.value.spent / weekLoad.value.planned) * SEGMENTS)))
    : 0

  return (
    <div
      data-testid="kette"
      style={{ border: '1px solid var(--e-rule)', borderRadius: 18, padding: '14px 16px', margin: '26px 24px 34px' }}
    >
      {broken ? (
        <p data-testid="kette-broken" style={{ fontSize: 12, color: 'var(--s-low)' }}>
          {t('ketteBroken', { title: missedYesterday.value.title })}
        </p>
      ) : isPresent(streakDays) ? (
        <p data-testid="kette-count" style={{ fontSize: 12, color: 'var(--e-mid)' }}>
          {t('ketteHolds', { days: String(streakDays.value) })}
        </p>
      ) : (
        // No streak recorded is not a streak of zero — say why, like every
        // other honest-dash surface in this tree.
        <p style={{ fontSize: 12, color: 'var(--e-quiet)' }}>{streakDays.missing}</p>
      )}

      {isPresent(weekLoad) ? (
        <>
          <div data-testid="kette-xp" style={{ fontSize: 10.5, color: 'var(--e-quiet)', marginTop: 8 }}>
            {t('ketteXp', {
              spent: weekLoad.value.spent.toLocaleString('de-DE'),
              planned: weekLoad.value.planned.toLocaleString('de-DE'),
            })}
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i
                key={i}
                data-testid="kette-segment"
                data-filled={String(i < filled)}
                style={{
                  height: 8,
                  flex: 1,
                  borderRadius: 2,
                  background: i < filled ? 'var(--st-active)' : 'var(--d-1)',
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 10.5, color: 'var(--e-quiet)', marginTop: 8 }}>{weekLoad.missing}</p>
      )}
    </div>
  )
}
