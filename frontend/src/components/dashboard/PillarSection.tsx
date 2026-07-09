import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// A MECE dashboard pillar: a numbered, titled band with one line of explainer
// microcopy answering the single question this section resolves. Executive-brief
// styling — serif title, hairline rule, generous rhythm — consistent with the
// app's dark "paper" design language. Sections rise in with a staggered,
// spring-eased entrance keyed off `index` for a choreographed page load.
export default function PillarSection({
  index, title, question, children,
}: {
  index: string
  title: string
  question: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  const order = Math.max(0, Number(index) - 1) || 0

  return (
    <motion.section
      className="flex flex-col gap-3"
      style={{ scrollMarginTop: 16 }}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(order * 0.06, 0.3) }}
    >
      <header className="flex items-baseline gap-3 pb-1" style={{ borderBottom: '1px solid var(--color-rule)' }}>
        <motion.span
          className="num-mono shrink-0 grid place-items-center rounded-full"
          style={{
            width: 22, height: 22, fontSize: 11, fontWeight: 600,
            color: 'var(--color-forest-2)',
            border: '1px solid color-mix(in srgb, var(--color-forest-2) 40%, transparent)',
          }}
          whileHover={reduce ? undefined : { scale: 1.12, backgroundColor: 'color-mix(in srgb, var(--color-forest-2) 12%, transparent)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >{index}</motion.span>
        <h2 style={{
          color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 20,
          fontWeight: 500, letterSpacing: '-0.01em',
        }}>{title}</h2>
        <span className="ml-auto text-right hidden sm:block" style={{
          color: 'var(--color-ink-2)', fontSize: 12, fontStyle: 'italic', maxWidth: '52%',
        }}>{question}</span>
      </header>
      <p className="sm:hidden -mt-1" style={{ color: 'var(--color-ink-2)', fontSize: 12, fontStyle: 'italic' }}>{question}</p>
      <div className="flex flex-col gap-4">{children}</div>
    </motion.section>
  )
}
