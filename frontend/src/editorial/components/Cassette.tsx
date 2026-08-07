// frontend/src/editorial/components/Cassette.tsx
import { useId } from 'react'
import { COG_TEETH, cogHalfWidth } from './cassetteScale'

export const CASSETTE_WIDTH = 390
export const CASSETTE_HEIGHT = 268

const CX = 195
const TOP = 22
const PITCH = 26
const LAST_INDEX = COG_TEETH.length - 1

/** Cogs below the chain are available; the ramp makes them read as a ladder. */
const AVAILABLE_RAMP = ['#FFFFFF7A', '#FFFFFF6B', '#FFFFFF5C', '#FFFFFF4D', '#FFFFFF3D', '#FFFFFF2E']
const OUT_OF_REACH = '#FFFFFF1F'

/** The `cassette-best` marker's own label (its name is historical — it now
 *  marks the athlete's typical/median cog, not a best). Sized to sit beside
 *  the tiny sibling labels elsewhere in this tree (8-9px/700-800), in the
 *  accent colour at the marker's own opacity so label and line read as one
 *  annotation, never as loud as the chain. */
const TYPICAL_LABEL_FONT_SIZE = 8
const TYPICAL_LABEL_LETTER_SPACING = 1
const TYPICAL_LABEL_GAP = 6
const TYPICAL_LABEL_RIGHT_MARGIN = 4
/** Deliberately flat across glyphs — including the narrow ones (I, T, the
 *  space) — so this OVER-estimates real Inter Bold uppercase advance width
 *  rather than under, the same conservative-by-construction spirit as
 *  `numeralFit.ts`'s own GLYPH_RATIO. Underestimating here is the failure
 *  mode that would let the label run past the 390-wide frame on the widest
 *  cog; overestimating only costs a little unused margin. */
const TYPICAL_LABEL_GLYPH_RATIO = 0.6

function estimateLabelWidth(label: string): number {
  const glyphs = [...label].length
  if (glyphs === 0) return 0
  return (
    glyphs * TYPICAL_LABEL_GLYPH_RATIO * TYPICAL_LABEL_FONT_SIZE +
    Math.max(glyphs - 1, 0) * TYPICAL_LABEL_LETTER_SPACING
  )
}

export interface CassetteProps {
  activeIndex: number | null
  bestIndex?: number | null
  /** Copy for the `cassette-best` marker, e.g. "DEIN SCHNITT" — owned by the
   *  composing component (`CassetteHero`'s `useCopy()`), never this file:
   *  presentational SVG stays free of the copy system, like every sibling
   *  in this tree. */
  typicalLabel?: string
  idSuffix?: string
}

function cogY(index: number): number {
  return TOP + index * PITCH
}

/** Keeps every derived value (cogY, cogHalfWidth, the filter region) agreeing
 * on the same in-range cog, instead of each silently clamping (or not)
 * on its own. */
function clampIndex(index: number): number {
  return Math.min(LAST_INDEX, Math.max(0, index))
}

/**
 * The cassette in side profile. Dumb by design: it is handed a cog index and
 * draws it. All mapping lives in `cassetteScale.ts`, all timing in
 * `motion/useChainShift.ts` — so this file can be read in one screen.
 */
export default function Cassette({ activeIndex, bestIndex = null, typicalLabel, idSuffix }: CassetteProps) {
  // SVG filter ids are document-global. `useId()` guarantees two mounted
  // cassettes never collide even when no explicit `idSuffix` is passed;
  // callers that need a stable id (e.g. `idSuffix="today"`) still can.
  const autoId = useId()
  const glowId = `cassette-glow-${idSuffix ?? autoId}`
  const clampedActiveIndex = activeIndex == null ? null : clampIndex(activeIndex)
  const clampedBestIndex = bestIndex == null ? null : clampIndex(bestIndex)
  const activeY = clampedActiveIndex == null ? 0 : cogY(clampedActiveIndex)
  const activeHalf = clampedActiveIndex == null ? 0 : cogHalfWidth(clampedActiveIndex)

  // Clamped so the label never overflows the 390-wide frame: it prefers to
  // sit `TYPICAL_LABEL_GAP` past the marker line's own end, but on the
  // widest cog (index 9, the bottom one) that would push the estimated
  // glyphs past the right edge, so it slides left just far enough to fit —
  // converging on sitting flush against the line only in that worst case.
  const bestLineEnd = clampedBestIndex == null ? 0 : CX + cogHalfWidth(clampedBestIndex)
  const typicalLabelWidth = estimateLabelWidth(typicalLabel ?? '')
  const typicalLabelX = Math.min(
    bestLineEnd + TYPICAL_LABEL_GAP,
    CASSETTE_WIDTH - TYPICAL_LABEL_RIGHT_MARGIN - typicalLabelWidth,
  )

  return (
    <svg
      data-testid="cassette"
      width={CASSETTE_WIDTH}
      height={CASSETTE_HEIGHT}
      viewBox={`0 0 ${CASSETTE_WIDTH} ${CASSETTE_HEIGHT}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <filter
          id={glowId}
          filterUnits="userSpaceOnUse"
          x={CX - 160}
          y={activeY - 26}
          width={320}
          height={52}
        >
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={CX - 9} y={TOP - 8} width={18} height={PITCH * 9 + 16} rx={4} fill="#FFFFFF0A" />

      {COG_TEETH.map((teeth, i) => {
        const half = cogHalfWidth(i)
        const y = cogY(i)
        const belowChain = clampedActiveIndex != null && i > clampedActiveIndex
        const stroke = belowChain
          ? AVAILABLE_RAMP[Math.min(i - (clampedActiveIndex ?? 0) - 1, AVAILABLE_RAMP.length - 1)]
          : OUT_OF_REACH
        return (
          <line
            key={teeth}
            data-testid="cassette-cog"
            x1={CX - half}
            y1={y}
            x2={CX + half}
            y2={y}
            stroke={stroke}
            strokeWidth={5}
            strokeLinecap="round"
          />
        )
      })}

      {clampedBestIndex != null && (
        <>
          <line
            data-testid="cassette-best"
            x1={CX - cogHalfWidth(clampedBestIndex)}
            y1={cogY(clampedBestIndex)}
            x2={CX + cogHalfWidth(clampedBestIndex)}
            y2={cogY(clampedBestIndex)}
            stroke="var(--st-active)"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.5}
          />
          {typicalLabel && (
            <text
              data-testid="cassette-typical-label"
              x={typicalLabelX}
              y={cogY(clampedBestIndex) + 3}
              fontFamily="var(--e-body)"
              fontSize={TYPICAL_LABEL_FONT_SIZE}
              fontWeight={700}
              letterSpacing={TYPICAL_LABEL_LETTER_SPACING}
              fill="var(--st-active)"
              opacity={0.5}
            >
              {typicalLabel}
            </text>
          )}
        </>
      )}

      {clampedActiveIndex != null && (
        <>
          <path
            d={`M312 4 L312 ${activeY - 26} Q312 ${activeY} ${CX + activeHalf + 30} ${activeY} L${CX - activeHalf} ${activeY}`}
            stroke="var(--st-active)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.3}
            fill="none"
          />
          <g filter={`url(#${glowId})`}>
            <rect
              data-testid="cassette-chain"
              x={CX - activeHalf}
              y={activeY - 5.5}
              width={activeHalf * 2}
              height={11}
              rx={5.5}
              fill="var(--st-active)"
            />
          </g>
        </>
      )}
    </svg>
  )
}
