/**
 * CoachPage — route shell for /coach. Reserved for Wave 3.
 *
 * Wave 3 will flesh this out with a full-screen inline chat view.
 * For now: placeholder directing users to the masthead "Ask coach" drawer.
 *
 * TODO(06.1 Wave 3): inline full-screen chat view lives here.
 */
import DashboardShell from '../components/dashboard/DashboardShell'
import { useLanguage } from '../contexts/LanguageContext'

export default function CoachPage() {
  const { language } = useLanguage()

  return (
    <DashboardShell>
      <div className="p-6 max-w-2xl mx-auto">
        <h1
          className="num-display leading-tight"
          style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--color-ink)' }}
        >
          {language === 'simple' ? 'Coach' : 'Ask the coach'}
        </h1>
        <p
          className="mt-4 text-[15px] leading-relaxed"
          style={{ color: 'var(--color-muted)' }}
        >
          {language === 'simple'
            ? 'Use the "Ask coach" button in the top bar to open the chat.'
            : 'Chat surface — open via the masthead "Ask coach" drawer. A full inline chat view arrives in Wave 3.'}
        </p>
        {/* TODO(06.1 Wave 3): inline full-screen chat view lives here. */}
      </div>
    </DashboardShell>
  )
}
