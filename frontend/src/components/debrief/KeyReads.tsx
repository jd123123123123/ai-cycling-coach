import { useLocale } from '../../contexts/LocaleContext'
import type { RaceDebrief } from '../../api/debrief'
import { keyReads, STATUS_COLOR, STATUS_LABEL } from './insights'

// The "what actually matters" band — the 3–4 highest-signal interpreted reads,
// color-coded, each stating what happened, what it means, and what to do.
// This is the layer that makes the debrief legible in five seconds.
export default function KeyReads({ report }: { report: RaceDebrief }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const reads = keyReads(report, de, 4)
  if (reads.length === 0) return null

  return (
    <div>
      <h2
        className="mb-3"
        style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 500, letterSpacing: '-0.01em' }}
      >
        {de ? 'Worauf es ankommt' : 'What matters'}
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {reads.map((rd, i) => {
          const color = STATUS_COLOR[rd.status]
          return (
            <div
              key={rd.key}
              className="relative rounded-[16px] p-4 sm:p-5 overflow-hidden"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                border: '1px solid var(--color-rule)',
                animation: 'card-enter 520ms var(--ease-spring) both',
                animationDelay: `${i * 60}ms`,
              }}
            >
              {/* status accent rail */}
              <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: color }} />
              {/* soft status wash */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${color} 9%, transparent), transparent 60%)` }}
              />
              <div className="relative flex flex-col gap-2 pl-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="rounded-full px-2 py-0.5 num-mono uppercase"
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                      color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
                    }}
                  >
                    {STATUS_LABEL(rd.status, de)}
                  </span>
                  <span style={{ color: 'var(--color-ink)', fontSize: 14.5, fontWeight: 600 }}>{rd.title}</span>
                  {rd.metric && (
                    <span
                      className="num-mono ml-auto"
                      style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, color, lineHeight: 1 }}
                    >
                      {rd.metric}
                    </span>
                  )}
                </div>
                <p style={{ color: 'var(--color-ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>{rd.read}</p>
                {rd.doThis && (
                  <div className="flex items-start gap-1.5 mt-0.5">
                    <span style={{ color, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>→</span>
                    <span style={{ color: 'var(--color-ink)', fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>{rd.doThis}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
