/**
 * SettingsPage — route shell for /settings.
 *
 * Language toggle + Garmin connection link + placeholder sections.
 * TODO(06.1 Wave 3): explicit sync-status pill details.
 * TODO(06.2): density toggle.
 */
import { Link } from 'react-router-dom'
import DashboardShell from '../components/dashboard/DashboardShell'
import LanguageToggle from '../components/dashboard/LanguageToggle'
import { useLanguage } from '../contexts/LanguageContext'

export default function SettingsPage() {
  const { language } = useLanguage()

  return (
    <DashboardShell>
      <div className="p-6 max-w-2xl mx-auto flex flex-col gap-8">
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)', letterSpacing: '0.2em' }}>
            Settings
          </span>
          <h1
            className="num-display mt-2 leading-tight"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--color-ink)' }}
          >
            {language === 'simple' ? 'Preferences' : 'Settings'}
          </h1>
        </div>

        {/* Coach language */}
        <section
          className="flex flex-col gap-3 p-5 rounded-[16px]"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
              {language === 'simple' ? 'COACH VOICE' : 'COACH LANGUAGE'}
            </span>
            <p className="text-[14px]" style={{ color: 'var(--color-ink-2)' }}>
              {language === 'simple'
                ? 'Switch between plain English and technical training terms.'
                : 'Switch between plain-English and full Coggan/Seiler vocabulary.'}
            </p>
          </div>
          <LanguageToggle />
        </section>

        {/* Garmin connection */}
        <section
          className="flex flex-col gap-3 p-5 rounded-[16px]"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
              GARMIN
            </span>
            <p className="text-[14px]" style={{ color: 'var(--color-ink-2)' }}>
              {language === 'simple'
                ? 'Manage your Garmin connection for syncing workouts and body data.'
                : 'Garmin Connect integration — syncs HRV, body battery, sleep, and activities.'}
            </p>
          </div>
          <Link
            to="/garmin/connect"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium self-start"
            style={{
              backgroundColor: 'var(--color-ink)',
              color: 'var(--color-paper)',
            }}
          >
            {language === 'simple' ? 'Garmin settings' : 'Manage Garmin connection'}
          </Link>
        </section>

        {/* Placeholder sections */}
        {/* TODO(06.1 Wave 3): explicit sync-status pill details here */}
        {/* TODO(06.2): density toggle (comfortable / compact) */}
      </div>
    </DashboardShell>
  )
}
