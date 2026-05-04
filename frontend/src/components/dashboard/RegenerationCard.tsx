interface RegenerationCardProps {
  bullets: string[] | null | undefined
}

/**
 * Compact regeneration card: 2–3 plain bullets covering sleep target, fuel
 * window, mobility / active recovery, and caffeine cutoff.
 *
 * Step 7 (today-runthrough). Renders nothing when bullets is empty / nullish
 * so older briefs without the block stay visually identical.
 *
 * Whoop-grade discipline: hairline-divided list, no icons / accents — the
 * prescribed-workout card already owns the green accent above.
 */
export default function RegenerationCard({ bullets }: RegenerationCardProps) {
  if (!bullets || bullets.length === 0) return null

  // Defensive trim — Step 7 schema caps at 4; the LLM occasionally
  // returns a stray empty string.
  const cleaned = bullets.map((b) => b?.trim()).filter((b): b is string => !!b)
  if (cleaned.length === 0) return null

  return (
    <div
      className="rounded-[12px] p-4 flex flex-col gap-3 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <span
        className="eyebrow"
        style={{
          color: 'var(--color-muted)',
          fontSize: 10,
          letterSpacing: '0.22em',
        }}
      >
        Regeneration
      </span>
      <ul className="flex flex-col">
        {cleaned.map((bullet, i) => (
          <li
            key={i}
            className="text-[13px] leading-relaxed py-2 dashboard-break-words"
            style={{
              color: 'var(--color-ink-2)',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-rule)',
              maxWidth: '62ch',
            }}
          >
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  )
}
