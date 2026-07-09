import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { getGoals, updateGoals, updateProfile } from '../../api/athletes'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useLocale } from '../../contexts/LocaleContext'

type EventType = 'race' | 'fondo' | 'audax' | 'maintenance'
type Priority = 'A' | 'B' | 'C'

// Add / edit the athlete's target event. Saving updates the profile goals; the
// mesocycle generator + trajectory then periodize toward this date off the
// athlete's real CTL and metrics. A past date reads as "no active goal".
export default function TargetEventEditor() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const qc = useQueryClient()
  const { data: profile } = useAthleteProfile()
  const { data: goals } = useQuery({ queryKey: ['athlete', 'goals'], queryFn: getGoals })

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState<EventType>('fondo')
  const [priority, setPriority] = useState<Priority>('A')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (goals?.target_event_name != null) setName(goals.target_event_name)
    if (profile?.target_event_date) setDate(String(profile.target_event_date).slice(0, 10))
    if (profile?.target_event_type) setType(profile.target_event_type as EventType)
    if (profile?.target_priority) setPriority(profile.target_priority as Priority)
  }, [goals?.target_event_name, profile?.target_event_date, profile?.target_event_type, profile?.target_priority])

  const save = useMutation({
    mutationFn: async () => {
      await updateGoals({ target_event_name: name || undefined, target_event_date: date || undefined })
      await updateProfile({
        target_event_date: date || undefined,
        target_event_type: type,
        target_priority: priority,
      })
    },
    onSuccess: async () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      // Everything that periodizes off the event: plan, trajectory, reports.
      await qc.invalidateQueries()
    },
  })

  const isPast = date && new Date(date) < new Date(new Date().toDateString())
  const daysOut = date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null

  const labelStyle = { color: 'var(--color-muted)', fontSize: 10.5, letterSpacing: '0.14em' } as const
  const inputStyle = {
    backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)',
    color: 'var(--color-ink)', borderRadius: 10, padding: '9px 12px', fontSize: 14, width: '100%',
  } as const

  const TYPES: { v: EventType; en: string; de: string }[] = [
    { v: 'race', en: 'Race', de: 'Rennen' },
    { v: 'fondo', en: 'Gran Fondo', de: 'Gran Fondo' },
    { v: 'audax', en: 'Audax / Ultra', de: 'Audax / Ultra' },
    { v: 'maintenance', en: 'Maintenance', de: 'Erhaltung' },
  ]

  return (
    <section className="rounded-[16px] p-5 sm:p-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="mb-4">
        <span className="eyebrow" style={{ color: 'var(--color-forest-2)', fontSize: 10.5, letterSpacing: '0.2em' }}>
          {de ? 'ZIELWETTKAMPF' : 'TARGET EVENT'}
        </span>
        <p className="mt-1" style={{ color: 'var(--color-ink-2)', fontSize: 13 }}>
          {de
            ? 'Setz dein nächstes Ziel — dein Plan periodisiert automatisch darauf hin, basierend auf deiner Fitness und deinen Werten.'
            : 'Set your next goal — your plan periodizes toward it automatically from your fitness and metrics.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="eyebrow" style={labelStyle}>{de ? 'NAME' : 'NAME'}</span>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)}
            placeholder={de ? 'z. B. Ötztaler Radmarathon' : 'e.g. Étape du Tour'} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow" style={labelStyle}>{de ? 'DATUM' : 'DATE'}</span>
          <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow" style={labelStyle}>{de ? 'TYP' : 'TYPE'}</span>
          <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {TYPES.map((tp) => <option key={tp.v} value={tp.v}>{de ? tp.de : tp.en}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="eyebrow" style={labelStyle}>{de ? 'PRIORITÄT' : 'PRIORITY'}</span>
          <div className="flex gap-2">
            {(['A', 'B', 'C'] as Priority[]).map((p) => (
              <button key={p} type="button" onClick={() => setPriority(p)}
                className="flex-1 rounded-[10px] py-2 transition-colors"
                style={{
                  border: `1px solid ${priority === p ? 'var(--color-forest-2)' : 'var(--color-rule)'}`,
                  background: priority === p ? 'color-mix(in srgb, var(--color-forest-2) 12%, transparent)' : 'var(--color-paper)',
                  color: priority === p ? 'var(--color-forest-2)' : 'var(--color-ink-2)',
                  fontSize: 13, fontWeight: 600,
                }}>
                {p}{p === 'A' ? (de ? ' · Hauptziel' : ' · Main') : ''}
              </button>
            ))}
          </div>
        </label>
      </div>

      {date && (
        <p className="mt-3" style={{ fontSize: 12.5, color: isPast ? 'var(--color-caution)' : 'var(--color-ink-2)' }}>
          {isPast
            ? (de ? '⚠ Dieses Datum liegt in der Vergangenheit — setz ein zukünftiges Ziel.' : '⚠ That date is in the past — pick a future goal.')
            : (de ? `Noch ${daysOut} Tage bis zum Ziel.` : `${daysOut} days until your goal.`)}
        </p>
      )}

      <button type="button" disabled={save.isPending || !date}
        onClick={() => save.mutate()}
        className="mt-4 rounded-full px-5 py-2.5 text-[14px] font-medium min-h-[44px] transition-opacity disabled:opacity-50"
        style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-ink)' }}>
        {save.isPending
          ? (de ? 'Speichere…' : 'Saving…')
          : saved
            ? (de ? '✓ Plan aktualisiert' : '✓ Plan updated')
            : (de ? 'Ziel speichern' : 'Save goal')}
      </button>
    </section>
  )
}
