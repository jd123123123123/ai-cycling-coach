/**
 * ChapterHero — the one number or verdict a chapter is about, given room.
 *
 * Deliberately the only element above the fold that carries a headline, so
 * every chapter answers its own question before anything else competes.
 */
export interface ChapterHeroProps {
  headline: string
  support?: string | null
  figure?: React.ReactNode
  children?: React.ReactNode
}

export default function ChapterHero({ headline, support, figure, children }: ChapterHeroProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {figure}
      <h2 className="num-display" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--color-ink)' }}>{headline}</h2>
      {support ? <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>{support}</p> : null}
      {children}
    </div>
  )
}
