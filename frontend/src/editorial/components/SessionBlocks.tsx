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
 * visual pattern, not bound to any real per-second data). This component
 * transcribes the row typography and the main-set accent treatment (index
 * colour, watts colour, "{n}×" marker) faithfully but renders intensity as
 * ONE proportional bar per row (relative to the session's own peak watts)
 * instead of the pen's fixed 16-segment graphic — the segment count is
 * decorative, not data, so reproducing it exactly would be pixel-matching a
 * mock rather than transcribing real content.
 *
 * AUDIT (a3, 2026-08-06) against `MnBvu`, found and fixed:
 *  - `Col Head` (`j3uhOg`: a 26px spacer + "STEP"/"TIME"/"WATTS" 8px column
 *    labels above the row list, with its own rule) was entirely unbuilt.
 *    Added below as `colStep`/`colTime`/`colWatts`.
 *  - The Marker column (`vvcve`, the main set's own left index) is TWO
 *    stacked texts — the row's plain "03" position number (8.5px, `$e-lo`,
 *    same as every other row) AND, only for the reps>1 main-set row, a
 *    separate 19px Sora "4×" marker in the accent colour. The row's plain
 *    index number was previously REPLACING itself with the reps marker
 *    (wrong size, wrong font family, wrong colour — the index text is never
 *    accent-tinted in the pen, only the separate "N×" text is) instead of
 *    sitting above it. Fixed below.
 *  - `Set Caption` (`Wt3Mr`: "THE MAIN SET" in the accent colour, a thin
 *    accent rule, "{time} TOTAL" in `$e-lo`) prints once above the main-set
 *    row. The pen also wraps the whole main-set family (the work row +
 *    its recovery row) in a left-ruled, 12px-indented `Set Body` sitting to
 *    the right of one shared Marker spanning both rows — this component
 *    keeps its existing flat one-row-per-`ProgrammeBlock` structure instead
 *    (each block, including any recovery block, already renders as its own
 *    full-width row elsewhere in this list), so the indent/shared-marker
 *    wrapper is not reproduced; only the caption's own content (which was
 *    missing outright — `mainSetLabel`/`mainSetTotal` existed in `copy.ts`
 *    unused) is added.
 *  - `Time` text (`zTJvF` etc.) carries `letterSpacing: 0.2`, previously
 *    unset (defaulting to 0). Fixed below.
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
      <SecHead index="01" title={t('sectionTheBlocks')} chip={t('chipParts', { n: blocks.length })} kicker />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '16px 0 22px 0' }}>
        <p style={{ margin: 0, fontFamily: 'var(--e-display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.22, color: 'var(--e-ink)' }}>
          {t('blocksStatementA')}
        </p>
        <p style={{ margin: 0, fontFamily: 'var(--e-display)', fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.22, color: 'var(--e-quiet)' }}>
          {t('blocksStatementB')}
        </p>
      </div>

      <div data-programme style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '0 0 9px 0' }}>
          <div style={{ width: 26, height: 8 }} />
          <span style={{ flex: 1, fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-quiet)' }}>
            {t('colStep')}
          </span>
          <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-quiet)' }}>
            {t('colTime')}
          </span>
          <span style={{ width: 52, textAlign: 'right', fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, letterSpacing: 1.4, color: 'var(--e-quiet)' }}>
            {t('colWatts')}
          </span>
        </div>
        <div style={{ width: '100%', height: 1, background: 'var(--d-2)' }} />
        {blocks.map((b, i) => {
          const barPct = isPresent(b.watts) && maxWatts > 0 ? Math.max(4, Math.round((b.watts.value / maxWatts) * 100)) : 4
          const startsMainSet = b.isMain && b.reps > 1 && (i === 0 || !blocks[i - 1].isMain)
          return (
            <div key={b.key} data-block-row="">
              {startsMainSet && (
                <div style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', padding: '12px 0 3px 0' }}>
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 1.4, color: 'var(--st-active)' }}>
                    {t('mainSetLabel')}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--st-a16)' }} />
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 1.1, color: 'var(--e-lo)' }}>
                    {t('mainSetTotal', { time: formatMinSec(mainMinutes) })}
                  </span>
                </div>
              )}
              <div style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0' }}>
                <div style={{ width: 26, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 8.5, fontWeight: 800, letterSpacing: 1, color: 'var(--e-lo)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {b.reps > 1 && (
                    <span style={{ fontFamily: 'var(--e-display)', fontSize: 19, fontWeight: 800, letterSpacing: -0.8, color: 'var(--st-active)' }}>
                      {b.reps}×
                    </span>
                  )}
                </div>
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
                <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--e-body)', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, color: 'var(--e-mid)' }}>
                  {formatMinSec(b.minutes)}
                </span>
                <div style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: b.isMain ? 18 : 15, fontWeight: 800, letterSpacing: -0.5, color: b.isMain ? 'var(--st-active)' : 'var(--e-quiet)' }}>
                    {isPresent(b.watts) ? b.watts.value : '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 8, fontWeight: 800, color: 'var(--e-lo)' }}>W</span>
                </div>
              </div>
              <div style={{ width: '100%', height: 1, background: i === blocks.length - 1 ? 'var(--d-2)' : 'var(--d-1)' }} />
            </div>
          )
        })}
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
