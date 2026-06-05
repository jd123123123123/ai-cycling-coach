import type React from 'react'
import { Flame, Zap, Trophy, Award } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import type { Milestone } from '../../api/report'

const ICONS: Record<string, React.ReactNode> = {
  flame: <Flame size={16} strokeWidth={2} />,
  zap: <Zap size={16} strokeWidth={2} />,
  trophy: <Trophy size={16} strokeWidth={2} />,
}

/** Badge chips for streaks / PRs / load milestones. Renders nothing when empty. */
export default function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  const { locale } = useLocale()
  if (milestones.length === 0) return null
  return (
    <div
      className="rounded-[18px] p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
    >
      <span className="eyebrow num-mono" style={{ color: 'var(--color-ink-2)', fontSize: 10, letterSpacing: '0.22em' }}>
        {locale === 'de' ? 'MEILENSTEINE' : 'MILESTONES'}
      </span>
      <div className="flex flex-wrap gap-2 mt-3">
        {milestones.map((m, i) => (
          <div
            key={i}
            title={m.detail}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-good) 12%, transparent)', color: 'var(--color-good)' }}
          >
            {ICONS[m.icon_key] ?? <Award size={16} strokeWidth={2} />}
            <span className="num-mono" style={{ fontSize: 12, color: 'var(--color-ink)' }}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
