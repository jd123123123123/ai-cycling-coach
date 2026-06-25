import { ArrowLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useWorkout } from '../../hooks/useWorkouts'
import { useT } from '../../contexts/LocaleContext'
import type { StringKey } from '../../i18n/strings'

const METRIC_LABEL: Record<string, string> = {
  efficiency: 'workouts_metric_efficiency',
  avg_power: 'workouts_metric_avg_power',
  np: 'workouts_metric_np',
  avg_hr: 'workouts_metric_avg_hr',
  pace: 'workouts_metric_pace',
  tss: 'workouts_metric_tss',
}

export default function WorkoutDetail({ workoutKey, onBack }: { workoutKey: string; onBack: () => void }) {
  const t = useT()
  const { data, isLoading, isError } = useWorkout(workoutKey)

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-[13px] self-start" style={{ color: 'var(--color-ink-2)' }}>
        <ArrowLeft size={14} strokeWidth={2} /> {t('workouts_back')}
      </button>

      {isLoading && <div style={{ color: 'var(--color-muted)' }}>{t('loading')}</div>}
      {isError && <div style={{ color: 'var(--color-bad)' }}>{t('workouts_not_found')}</div>}

      {data && (
        <>
          <h1 className="text-[24px]" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic', color: 'var(--color-ink)' }}>
            {data.title}
          </h1>

          <div className="grid gap-4 md:grid-cols-2">
            {data.trends.filter((tr) => tr.series.length >= 2).map((tr) => (
              <div key={tr.metric} className="rounded-[14px] p-4" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10 }}>{t((METRIC_LABEL[tr.metric] ?? tr.metric) as StringKey)}</span>
                  {tr.pct != null && (
                    <span className="num-mono" style={{ fontSize: 12, color: tr.improving ? 'var(--color-good)' : 'var(--color-bad)' }}>
                      {tr.pct > 0 ? '+' : ''}{tr.pct}%
                    </span>
                  )}
                </div>
                <div style={{ height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tr.series.map((v, i) => ({ i, v }))}>
                      <XAxis dataKey="i" hide />
                      <YAxis domain={['dataMin', 'dataMax']} hide />
                      <Tooltip formatter={(v) => [v, '']} labelFormatter={() => ''} />
                      <Line type="monotone" dataKey="v" stroke="var(--color-forest-2)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>

          {/* Per-rep table */}
          <div className="rounded-[14px] overflow-x-auto" style={{ border: '1px solid var(--color-rule)' }}>
            <table className="w-full num-mono" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
              <thead>
                <tr style={{ color: 'var(--color-muted)' }}>
                  {['Date', 'Power', 'NP', 'HR', 'EF', 'Pace', 'TSS'].map((h) => (
                    <th key={h} className="text-left px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.reps.map((r) => (
                  <tr key={r.activity_id} style={{ borderTop: '1px solid var(--color-rule)' }}>
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">{r.avg_power ?? '—'}</td>
                    <td className="px-3 py-2">{r.normalized_power ?? '—'}</td>
                    <td className="px-3 py-2">{r.avg_hr ?? '—'}</td>
                    <td className="px-3 py-2">{r.efficiency_factor ?? '—'}</td>
                    <td className="px-3 py-2">{r.pace_s_per_km ? `${Math.floor(r.pace_s_per_km / 60)}:${String(Math.round(r.pace_s_per_km % 60)).padStart(2, '0')}` : '—'}</td>
                    <td className="px-3 py-2">{r.tss ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
