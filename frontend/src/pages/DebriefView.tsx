import { useParams, Link } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'
import { useRaceDebrief } from '../hooks/useRaceDebrief'
import DebriefHero from '../components/debrief/DebriefHero'
import KeyReads from '../components/debrief/KeyReads'
import RideStory from '../components/debrief/RideStory'
import BreakdownPanels from '../components/debrief/BreakdownPanels'
import DebriefPlan from '../components/debrief/DebriefPlan'

export default function DebriefView() {
  const { id } = useParams()
  const activityId = id ? Number(id) : undefined
  const { locale } = useLocale()
  const { data, isLoading, isError } = useRaceDebrief(activityId)

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 flex flex-col gap-8">
        <Link to="/dashboard?tab=analyze" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
          {locale === 'de' ? '← Zurück' : '← Back'}
        </Link>
        {isLoading && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[20px] h-56 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
            <div className="rounded-[18px] h-72 shimmer-bg" style={{ border: '1px solid var(--color-rule)' }} />
          </div>
        )}
        {isError && (
          <p style={{ color: 'var(--color-bad)', fontSize: 14 }}>
            {locale === 'de'
              ? 'Analyse konnte nicht geladen werden. Braucht diese Fahrt Leistungsdaten?'
              : "Couldn't load this debrief. Does the ride have power data?"}
          </p>
        )}
        {data && (
          <>
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both' }}>
              <DebriefHero report={data} />
            </section>
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both', animationDelay: '80ms' }}>
              <KeyReads report={data} />
            </section>
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both', animationDelay: '160ms' }}>
              <RideStory story={data.story} />
            </section>
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both', animationDelay: '240ms' }}>
              <BreakdownPanels report={data} />
            </section>
            <section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both', animationDelay: '320ms' }}>
              <DebriefPlan plan={data.plan} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
