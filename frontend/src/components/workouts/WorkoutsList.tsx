import { useWorkouts } from '../../hooks/useWorkouts'
import { useT } from '../../contexts/LocaleContext'

const TONE_COLOR: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'var(--color-good)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-muted)',
}

export default function WorkoutsList({ onOpen }: { onOpen: (key: string) => void }) {
  const t = useT()
  const { data, isLoading, isError } = useWorkouts()

  if (isLoading) return <div style={{ color: 'var(--color-muted)' }}>{t('loading')}</div>
  if (isError) return <div style={{ color: 'var(--color-bad)' }}>{t('workouts_not_found')}</div>
  if (!data || data.length === 0) {
    return (
      <div className="rounded-[14px] p-6" style={{ border: '1px dashed var(--color-rule)', color: 'var(--color-ink-2)' }}>
        {t('workouts_empty')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[22px]" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic', color: 'var(--color-ink)' }}>
        {t('workouts_title')}
      </h1>
      {data.map((w) => {
        // sparkline of the first trend that has ≥2 points (efficiency preferred)
        return (
          <button
            key={w.key}
            type="button"
            onClick={() => onOpen(w.key)}
            className="text-left rounded-[14px] p-4 flex items-center gap-4 transition-transform hover:-translate-y-[1px]"
            style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="truncate" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{w.title}</div>
              <div className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {w.count}{t('workouts_times')} · {w.first_date} → {w.last_date}
              </div>
            </div>
            <span className="num-mono whitespace-nowrap" style={{ fontSize: 13, color: TONE_COLOR[w.headline.tone] }}>
              {w.headline.text}
            </span>
          </button>
        )
      })}
    </div>
  )
}
