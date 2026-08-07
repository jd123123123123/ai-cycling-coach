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

export interface CassetteProps {
  activeIndex: number | null
  bestIndex?: number | null
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
export default function Cassette({ activeIndex, bestIndex = null, idSuffix }: CassetteProps) {
  // SVG filter ids are document-global. `useId()` guarantees two mounted
  // cassettes never collide even when no explicit `idSuffix` is passed;
  // callers that need a stable id (e.g. `idSuffix="today"`) still can.
  const autoId = useId()
  const glowId = `cassette-glow-${idSuffix ?? autoId}`
  const clampedActiveIndex = activeIndex == null ? null : clampIndex(activeIndex)
  const clampedBestIndex = bestIndex == null ? null : clampIndex(bestIndex)
  const activeY = clampedActiveIndex == null ? 0 : cogY(clampedActiveIndex)
  const activeHalf = clampedActiveIndex == null ? 0 : cogHalfWidth(clampedActiveIndex)

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
