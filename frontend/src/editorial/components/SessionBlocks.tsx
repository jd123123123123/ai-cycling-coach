import { isPresent } from '../data/value'
import type { ProgrammeBlock } from '../data/useSessionModel'
import { formatMinSec } from '../data/useSessionModel'
import SecHead from './SecHead'
import { useCopy } from '../i18n/useCopy'

/**
 * "01 The Blocks" (pen `zF5df`, `J5FV6`): `SecHead` (index "01", chip
 * "{n} PARTS"), a two-line editorial Statement (`v4djF`: Claim A 17/800
 * Sora letterSpacing -0.5 lineHeight 1.22 $e-ink, Claim B same but $e-quiet
 * — editorial framing of the structure, not a per-session computation, same
 * register as `QuotePlate`'s own static-per-state quotes), then the
 * Programme list (`MnBvu`).
 *
 * SCOPE CUT, recorded rather than silently approximated: the pen's own
 * Programme rows each carry a 16-segment decorative "Gauge" bar (a fixed
 * visual pattern, not bound to any real per-second data) and the main set
 * is wrapped in a left-ruled `Set Body` frame with its own caption row. This
 * component transcribes the row typography and the main-set accent
 * treatment (index colour, watts colour, "{n}×" prefix) faithfully but
 * renders intensity as ONE proportional bar per row (relative to the
 * session's own peak watts) instead of the pen's fixed 16-segment graphic —
 * the segment count is decorative, not data, so reproducing it exactly
 * would be pixel-matching a mock rather than transcribing real content.
 */
export default function SessionBlocks({ blocks }: { blocks: ProgrammeBlock[] }) {
  const { t } = useCopy()
  const presentWatts = blocks
    .map((b) => (isPresent(b.watts) ? b.watts.value : null))
    .filter((w): w is number => w != null)
  const maxWatts = presentWatts.length > 0 ? Math.max(...presentWatts) : 0
  const totalMinutes = blocks.reduce((sum, b) => sum + b.minutes, 0)
  const mainMinutes = blocks.filter((b) => b.isMain).reduce((sum, b) => sum + b.minutes, 0)

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '40px 24px 8px 24px' }}>
      <SecHead index="01" title={t('sectionTheBlocks')} chip={t('chipParts', { n: blocks.length })} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '16px 0 22px 0' }}>
        <p style={{ margin: 0, fontFamily: 'var(--e-display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.22, color: 'var(--e-ink)' }}>
          {t('blocksStatementA')}
        </p>
        <p style={{ margin: 0, fontFamily: 'var(--e-display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.22, color: 'var(--e-quiet)' }}>
          {t('blocksStatementB')}
        </p>
      </div>

      <div data-programme style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {blocks.map((b, i) => {
          const barPct = isPresent(b.watts) && maxWatts > 0 ? Math.max(4, Math.round((b.watts.value / maxWatts) * 100)) : 4
          return (
            <div key={b.key} data-block-row="" style={{ width: '100%' }}>
              <div style={{ width: '100%', height: 1, background: i === 0 ? 'var(--d-2)' : 'var(--d-1)' }} />
              <div style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0' }}>
                <span
                  style={{
                    width: 26,
                    fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 1,
                    color: b.isMain ? 'var(--st-active)' : 'var(--e-lo)',
                  }}
                >
                  {b.reps > 1 ? `${b.reps}×` : String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: b.isMain ? 15 : 13.5, fontWeight: 800, letterSpacing: -0.4, color: b.isMain ? 'var(--e-ink)' : 'var(--e-mid)' }}>
                    {b.name}
                  </span>
                  {isPresent(b.note) && (
                    <span style={{ fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: 'var(--e-quiet)' }}>
                      {b.note.value}
                    </span>
                  )}
                  <div style={{ width: '100%', height: 6, background: 'var(--d-1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: b.isMain ? 'var(--st-active)' : 'var(--d-3)' }} />
                  </div>
                </div>
                <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--e-body)', fontSize: 11.5, fontWeight: 600, color: 'var(--e-mid)' }}>
                  {formatMinSec(b.minutes)}
                </span>
                <div style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: b.isMain ? 18 : 15, fontWeight: 800, letterSpacing: -0.5, color: b.isMain ? 'var(--st-active)' : 'var(--e-quiet)' }}>
                    {isPresent(b.watts) ? b.watts.value : '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, color: 'var(--e-lo)' }}>W</span>
                </div>
              </div>
            </div>
          )
        })}
        <div style={{ width: '100%', height: 1, background: 'var(--d-2)' }} />
      </div>

      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '13px 0 4px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-quiet)' }}>
            {t('colophonTotalSession')}
          </span>
          <span style={{ fontFamily: 'var(--e-display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.6, color: 'var(--e-ink)' }}>
            {formatMinSec(totalMinutes)}
          </span>
        </div>
        {mainMinutes > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span style={{ fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-quiet)' }}>
              {t('colophonAtThreshold')}
            </span>
            <span style={{ fontFamily: 'var(--e-display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.6, color: 'var(--st-active)' }}>
              {formatMinSec(mainMinutes)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
