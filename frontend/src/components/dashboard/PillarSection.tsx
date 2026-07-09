import type { ReactNode } from 'react'

// A MECE dashboard pillar: a numbered, titled band with one line of explainer
// microcopy answering the single question this section resolves. Executive-brief
// styling — serif title, hairline rule, generous rhythm — consistent with the
// app's dark "paper" design language.
export default function PillarSection({
  index, title, question, children,
}: {
  index: string
  title: string
  question: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3" style={{ scrollMarginTop: 16 }}>
      <header className="flex items-baseline gap-3 pb-1" style={{ borderBottom: '1px solid var(--color-rule)' }}>
        <span
          className="num-mono shrink-0 grid place-items-center rounded-full"
          style={{
            width: 22, height: 22, fontSize: 11, fontWeight: 600,
            color: 'var(--color-forest-2)',
            border: '1px solid color-mix(in srgb, var(--color-forest-2) 40%, transparent)',
          }}
        >{index}</span>
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
    </section>
  )
}
