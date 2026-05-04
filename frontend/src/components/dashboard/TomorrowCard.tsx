import type { TomorrowPlan, IntensityChip } from '../../api/coach'
import { formatSigned } from '../../utils/format'

// Intensity chip → human label. Matches the technical zone vocabulary on
// the prescribed-workout card (recovery / endurance / tempo / threshold /
// vo2 / race) but stays compact — one word fits inside the chip.
const CHIP_LABEL: Record<IntensityChip, string> = {
  recovery: 'Recovery',
  endurance: 'Endurance',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2: 'VO₂max',
  race: 'Race',
}

interface TomorrowCardProps {
  data: TomorrowPlan | null | undefined
}

/**
 * Compact forward-looking card: one paragraph + TSS chip + intensity chip.
 *
 * Step 7 (today-runthrough). Renders nothing when `data` is missing so the
 * brief stays visually clean for older rows / models that don't ship the
 * tomorrow_plan block.
 *
 * Whoop-grade discipline: monochrome surface, single accent on the
 * predicted-TSS chip, no decorative chrome.
 */
export default function TomorrowCard({ data }: TomorrowCardProps) {
  if (!data) return null

  const tssRounded = Math.round(data.predicted_tss || 0)
  const tssDisplay = formatSigned(tssRounded, 0)
  const chipLabel = CHIP_LABEL[data.intensity_chip] ?? data.intensity_chip

  return (
    <div
      className="rounded-[12px] p-4 flex flex-col gap-3 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className="eyebrow"
          style={{
            color: 'var(--color-muted)',
            fontSize: 10,
            letterSpacing: '0.22em',
          }}
        >
          Tomorrow
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="num-mono text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap"
            style={{
              color: 'var(--color-ink-2)',
              border: '1px solid var(--color-rule)',
            }}
          >
            {chipLabel}
          </span>
          <span
            className="num-mono text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap"
            style={{
              color: 'var(--color-forest)',
              backgroundColor: 'rgba(48, 108, 64, 0.08)',
              border: '1px solid rgba(48, 108, 64, 0.25)',
            }}
            title="Predicted training stress score"
          >
            {tssDisplay} TSS
          </span>
        </div>
      </div>
      <p
        className="text-[14px] leading-relaxed dashboard-break-words"
        style={{ color: 'var(--color-ink-2)', maxWidth: '62ch' }}
      >
        {data.description}
      </p>
    </div>
  )
}
