import type { BlockLike } from '../data/blocks'
import { MOTION_DURATION_MS, MOTION_EASE, staggerDelay, useReveal } from '../motion/useReveal'

/**
 * Mechanic G — pattern, not palette (roadbook, 2026-08-06).
 *
 * The session's shape as one proportional strip: planned work hatched with
 * a dashed cap, ridden work solid. One hue, two materials. It replaces the
 * two separate Bars rows the shipped screen drew — one in the hero body and
 * one in section 02, the same structure twice, 900px apart.
 *
 * On a Trainingstag nothing is ridden yet, so `doneCount` is 0 and the whole
 * strip is hatched. That is the honest reading of a session that has not
 * happened: no bar on this screen has ever claimed an achieved result.
 *
 * Motion (owner's ruling, 2026-08-06): every block grows from its baseline
 * the first time the strip enters the viewport (`useReveal`), staggered so
 * the row resolves as a wave rather than a jump — the same contract
 * WeekRail already follows, not a second idiom. `prefers-reduced-motion`
 * disables it entirely; the strip's own honest-missing rule (no blocks -> no
 * rail) means there is never a "missing" block to animate in the first
 * place, only real ones.
 */
export default function BlockStrip({ blocks, doneCount = 0 }: { blocks: BlockLike[]; doneCount?: number }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()
  if (blocks.length === 0) return null
  return (
    <div data-block-strip="" style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div ref={ref} style={{ display: 'flex', width: '100%', gap: 3, height: 26 }}>
        {blocks.map((block, i) => {
          const done = i < doneCount
          return (
            <div
              key={`${block.label}-${i}`}
              data-block=""
              {...(done ? { 'data-done': '' } : {})}
              style={{
                flexGrow: block.minutes || 1,
                flexBasis: 0,
                height: '100%',
                borderRadius: 3,
                background: done ? 'var(--e-bar-dim)' : 'var(--e-hatch)',
                borderRight: done ? 'none' : '1px dashed var(--d-2)',
                transform: on ? 'scaleX(1)' : 'scaleX(0)',
                transformOrigin: 'left',
                transition: reduced ? undefined : `transform ${MOTION_DURATION_MS}ms ${MOTION_EASE}`,
                transitionDelay: reduced ? undefined : `${staggerDelay(i)}ms`,
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', width: '100%', gap: 3 }}>
        {blocks.map((block, i) => (
          <span
            key={`${block.label}-label-${i}`}
            style={{
              flexGrow: block.minutes || 1,
              flexBasis: 0,
              minWidth: 0,
              fontFamily: 'var(--e-body)',
              fontSize: 'var(--t-micro)',
              fontWeight: 700,
              letterSpacing: 0.8,
              color: 'var(--e-lo)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {block.label}
          </span>
        ))}
      </div>
    </div>
  )
}
