/**
 * BentoGrid — 12-column asymmetric layout container.
 *
 * Desktop: 12-col grid, 16px gap.
 * Mobile (<640px): single column, full-width cells.
 *
 * Usage:
 *   <BentoGrid>
 *     <BentoCell span={2}>...</BentoCell>   // 8 of 12 cols (2x1)
 *     <BentoCell span={1}>...</BentoCell>   // 4 of 12 cols (1x1)
 *     <BentoCell span={3} rowSpan={2}>...</BentoCell> // full-width, 2 rows
 *   </BentoGrid>
 */

interface BentoCellProps {
  /** Column span on desktop: 1=4cols, 2=8cols, 3=12cols (full) */
  span?: 1 | 2 | 3
  /** Row span */
  rowSpan?: 1 | 2
  children: React.ReactNode
  className?: string
}

const SPAN_TO_COLS: Record<1 | 2 | 3, number> = {
  1: 4,
  2: 8,
  3: 12,
}

/*
 * Mobile reflow: inject a <style> tag once into <head> so BentoCell instances
 * collapse to full-width on narrow viewports. Self-contained; no Tailwind
 * dependency for the responsive rule.
 */
if (typeof document !== 'undefined') {
  const STYLE_ID = 'bento-grid-responsive'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      @media (max-width: 639px) {
        [data-bento-cell] {
          grid-column: 1 / -1 !important;
          grid-row: auto !important;
        }
      }
    `
    document.head.appendChild(style)
  }
}

/**
 * Grid container. Accepts BentoCell children (or any React node).
 * The className prop allows callers to add additional utilities.
 */
export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        gap: '16px',
      }}
    >
      {children}
    </div>
  )
}

/**
 * A single cell inside a BentoGrid.
 *
 * span=1 → 4 of 12 columns ("1x1")
 * span=2 → 8 of 12 columns ("2x1")
 * span=3 → 12 of 12 columns (full width)
 * rowSpan=2 → occupies 2 grid rows
 *
 * On mobile (<640px) cells are forced full-width via the injected CSS rule
 * that targets [data-bento-cell].
 */
export function BentoCell({
  span = 1,
  rowSpan = 1,
  children,
  className,
}: BentoCellProps) {
  const colSpan = SPAN_TO_COLS[span]
  return (
    <div
      data-bento-cell
      className={className}
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow: rowSpan > 1 ? `span ${rowSpan}` : undefined,
        minWidth: 0, // prevent grid blowout
      }}
    >
      {children}
    </div>
  )
}
