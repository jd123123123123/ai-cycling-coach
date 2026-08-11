import { useReveal, MOTION_EASE, staggerDelay } from '../motion/useReveal'
import { isPresent, type Value } from '../data/value'

export interface DayTask {
  key: string
  time: string
  title: string
  /** The measurable — "20 MIN", "3.5 G/KG", "NOW". Every task carries one, so
   *  "done" is never a judgement call. */
  metric: string
  detail: string
  now?: boolean
}

/**
 * A rest day's assignment as a timeline rather than a checklist.
 *
 * The times are the point: on a day with no training, the risk is not that the
 * rider does the wrong thing but that the day dissolves. Anchoring each item to
 * a clock time turns "recover" into five things with a when and a number.
 *
 * The current item is marked, so the screen answers "what now" without reading.
 */
export default function DayTimeline({ tasks }: { tasks: Value<DayTask[]> }) {
  const { ref, on, reduced } = useReveal<HTMLDivElement>()

  if (!isPresent(tasks)) {
    return <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', color: 'var(--e-quiet)', margin: 0 }}>{tasks.missing}</p>
  }

  return (
    <div ref={ref} data-testid="day-timeline" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {tasks.value.map((t, i) => (
        <div
          key={t.key}
          data-testid="day-task"
          data-now={String(!!t.now)}
          style={{
            display: 'flex', gap: 14, padding: '18px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--e-rule)',
            opacity: on ? 1 : 0,
            transform: on ? 'none' : 'translateY(6px)',
            transition: reduced ? undefined : `opacity 420ms ${MOTION_EASE} ${staggerDelay(i)}ms, transform 420ms ${MOTION_EASE} ${staggerDelay(i)}ms`,
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flexShrink: 0, width: 46 }}>
            <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-0.02em', color: t.now ? 'var(--st-active)' : 'var(--e-mid)' }}>
              {t.time}
            </span>
            {/* the thread that makes it a day rather than a list */}
            <span style={{ flex: 1, width: 1, background: 'var(--e-rule)', minHeight: 8 }} />
          </span>

          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--e-ink)' }}>
                {t.title}
              </span>
              <span
                style={{
                  fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
                  letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
                  padding: '4px 9px', borderRadius: 'var(--radius-pill)',
                  color: t.now ? 'var(--e-ground)' : 'var(--e-mid)',
                  background: t.now ? 'var(--st-active)' : 'var(--e-glass)',
                }}
              >
                {t.metric}
              </span>
            </span>
            <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-mid)', margin: 0 }}>
              {t.detail}
            </p>
          </span>
        </div>
      ))}
    </div>
  )
}
