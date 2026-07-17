import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'

// ExpandableCard — the "two-way" card: a scannable summary you read at a glance,
// tap to expand into the full detail (like WHOOP / Runna). Collapsed by default
// so a screen stays skimmable; the whole header is the tap target.
//
// `summary` is always visible. `children` is the detail, revealed on expand.
// Pass `accent` to tint the left rail / chevron for the card's channel.

export default function ExpandableCard({
  summary,
  children,
  defaultExpanded = false,
  accent = 'var(--color-accent)',
  className = '',
}: {
  summary: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  accent?: string
  className?: string
}) {
  const [open, setOpen] = useState(defaultExpanded)
  const reduce = useReducedMotion()

  return (
    <div
      className={`rounded-[24px] overflow-hidden ${className}`}
      style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-5 text-left min-h-[44px]"
      >
        <div className="flex-1 min-w-0">{summary}</div>
        <ChevronDown
          size={20}
          strokeWidth={2.2}
          style={{ color: accent, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 220ms cubic-bezier(.22,1,.36,1)', flexShrink: 0 }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 pb-5 pt-0 flex flex-col gap-4" style={{ borderTop: '1px solid var(--color-rule)' }}>
              <div className="pt-4">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
