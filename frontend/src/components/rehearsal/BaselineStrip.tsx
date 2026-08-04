import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { usePMC } from '../../hooks/usePMC'
import { useDailyDecision } from '../../hooks/useDailyDecision'

/**
 * BaselineStrip — the four numbers the whole forecast is computed FROM.
 *
 * Every figure below this strip (time, watts, cost, training effect) is a
 * function of these four. Stating them at the top is what makes the forecast
 * arguable rather than oracular: an athlete who thinks the predicted time is
 * wrong can see immediately whether the model is using a stale FTP or last
 * month's weight, instead of having to trust or dismiss the whole page.
 *
 * The pencil icon is not decoration — it goes to the profile, because the
 * honest response to "that FTP is wrong" is to let them fix it.
 *
 * Each value renders "—" on its own when its source is missing. A baseline
 * strip that invents a weight would corrupt the reader's judgement of every
 * number underneath it, which is worse than a gap.
 */
export default function BaselineStrip({ ftpUsedW }: { ftpUsedW: number | null }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data: profile } = useAthleteProfile()
  const { data: pmc } = usePMC(90)
  const { decision } = useDailyDecision()

  // CTL from the last PMC entry — the same series every other fitness surface
  // reads, so this strip cannot disagree with them.
  const entries = pmc?.entries ?? []
  const ctl = entries.length > 0 ? entries[entries.length - 1]?.ctl ?? null : null
  const readiness = decision?.readiness?.score ?? null

  const stats: { label: string; value: string; tone?: string }[] = [
    {
      label: 'FTP',
      value: ftpUsedW != null ? `${Math.round(ftpUsedW)} W` : '—',
    },
    {
      label: de ? 'Gewicht' : 'Weight',
      value: profile?.weight_kg != null ? `${Math.round(profile.weight_kg)} kg` : '—',
    },
    {
      label: de ? 'Fitness' : 'Fitness',
      value: ctl != null ? `CTL ${Math.round(ctl)}` : '—',
    },
    {
      label: de ? 'Erholung' : 'Recovery',
      value: readiness != null ? `${Math.round(readiness)}%` : '—',
      tone: readiness != null ? 'var(--color-recovery)' : undefined,
    },
  ]

  return (
    <section
      className="rounded-[18px]"
      style={{
        background: '#14181DCC',
        padding: '12px 15px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="eyebrow"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}
        >
          {de ? 'BASIEREND AUF DEINEN WERTEN' : 'BASED ON YOUR CURRENT VALUES'}
        </span>
        <Link
          to="/profile"
          aria-label={de ? 'Werte bearbeiten' : 'Edit your values'}
          className="grid place-items-center"
          style={{ width: 20, height: 20 }}
        >
          <Pencil size={13} style={{ color: 'var(--color-muted)' }} />
        </Link>
      </div>

      <div className="flex items-start">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5" style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{s.label}</span>
            <span
              className="num-display"
              style={{ fontSize: 14, fontWeight: 700, color: s.tone ?? 'var(--color-ink)' }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
