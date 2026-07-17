/**
 * SettingsPage — route shell for /settings.
 *
 * Language toggle + Garmin connection link + placeholder sections.
 * TODO(06.1 Wave 3): explicit sync-status pill details.
 * TODO(06.2): density toggle.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import DashboardShell from '../components/dashboard/DashboardShell'
import LanguageToggle from '../components/dashboard/LanguageToggle'
import TargetEventEditor from '../components/dashboard/TargetEventEditor'
import PushIntensityEditor from '../components/dashboard/PushIntensityEditor'
import { useLanguage } from '../contexts/LanguageContext'
import { useLocale } from '../contexts/LocaleContext'
import { useWahooStatus } from '../hooks/useWahooStatus'
import { getWahooConnectUrl, disconnectWahoo } from '../api/wahoo'

export default function SettingsPage() {
  const { language } = useLanguage()
  const { locale } = useLocale()
  const navigate = useNavigate()

  const goBack = () => {
    // Return to wherever they came from; fall back to the dashboard so mobile
    // users are never trapped on this page with no way back.
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard?tab=today')
  }

  return (
    <DashboardShell>
      <div className="p-6 max-w-2xl mx-auto flex flex-col gap-8">
        {/* Back / close — mobile users need an explicit way out */}
        <div className="flex items-center justify-between -mb-2">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 min-h-[40px] transition-colors"
            style={{ fontSize: 13, color: 'var(--color-ink-2)', border: '1px solid var(--color-rule)', backgroundColor: 'var(--color-paper-2)' }}
          >
            <ArrowLeft size={15} strokeWidth={2} />
            {locale === 'de' ? 'Zurück' : 'Back'}
          </button>
          <button
            type="button"
            onClick={goBack}
            className="rounded-full px-4 py-1.5 min-h-[40px] text-[13px] font-medium transition-opacity"
            style={{ color: 'var(--color-paper)', backgroundColor: 'var(--color-ink)' }}
          >
            {locale === 'de' ? 'Fertig' : 'Done'}
          </button>
        </div>
        <div>
          <span className="eyebrow" style={{ color: 'var(--color-amber)', letterSpacing: '0.2em' }}>
            {locale === 'de' ? 'Einstellungen' : 'Settings'}
          </span>
          <h1
            className="num-display mt-2 leading-tight"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--color-ink)' }}
          >
            {locale === 'de'
              ? 'Einstellungen'
              : (language === 'simple' ? 'Preferences' : 'Settings')}
          </h1>
        </div>

        {/* Target event — drives the whole plan */}
        <TargetEventEditor />

        {/* How hard to push — modulates the adaptive engine's upside */}
        <PushIntensityEditor />

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
              {locale === 'de'
                ? (language === 'simple' ? 'COACH-STIL' : 'COACH-SPRACHE')
                : (language === 'simple' ? 'COACH VOICE' : 'COACH LANGUAGE')}
            </span>
            <p className="text-[14px]" style={{ color: 'var(--color-ink-2)' }}>
              {locale === 'de'
                ? (language === 'simple'
                    ? 'Wechsle zwischen einfachem Deutsch und technischen Trainingsbegriffen.'
                    : 'Wechsle zwischen einfachem Deutsch und vollem Coggan/Seiler-Vokabular.')
                : (language === 'simple'
                    ? 'Switch between plain English and technical training terms.'
                    : 'Switch between plain-English and full Coggan/Seiler vocabulary.')}
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
              {locale === 'de'
                ? (language === 'simple'
                    ? 'Verwalte deine Garmin-Verbindung, um Workouts und Körperdaten zu synchronisieren.'
                    : 'Garmin-Connect-Integration — synchronisiert HRV, Body Battery, Schlaf und Aktivitäten.')
                : (language === 'simple'
                    ? 'Manage your Garmin connection for syncing workouts and body data.'
                    : 'Garmin Connect integration — syncs HRV, body battery, sleep, and activities.')}
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
            {locale === 'de'
              ? (language === 'simple' ? 'Garmin-Einstellungen' : 'Garmin-Verbindung verwalten')
              : (language === 'simple' ? 'Garmin settings' : 'Manage Garmin connection')}
          </Link>
        </section>

        {/* Wahoo connection */}
        <WahooConnectSection />

        {/* Placeholder sections */}
        {/* TODO(06.1 Wave 3): explicit sync-status pill details here */}
        {/* TODO(06.2): density toggle (comfortable / compact) */}
      </div>
    </DashboardShell>
  )
}

/**
 * WahooConnectSection — mirrors the Garmin affordance for Wahoo devices.
 *
 * Real states only:
 *   - connected      → shows "Connected" + a Disconnect button
 *   - disconnected   → a "Connect Wahoo" button that opens the OAuth authorize URL
 *   - not configured → 409 from /wahoo/connect → a clear "unavailable" note
 */
function WahooConnectSection() {
  const { language } = useLanguage()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const { data: status } = useWahooStatus()
  const [busy, setBusy] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)

  const connected = status?.connected === true

  const handleConnect = async () => {
    setBusy(true)
    try {
      const url = await getWahooConnectUrl()
      // Full navigation to Wahoo's OAuth consent screen; it redirects back to
      // /wahoo/callback → /settings?wahoo=connected when done.
      window.location.href = url
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 409) setNotConfigured(true)
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    try {
      await disconnectWahoo()
      await queryClient.invalidateQueries({ queryKey: ['wahoo', 'status'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="flex flex-col gap-3 p-5 rounded-[16px]"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>
          WAHOO
        </span>
        <p className="text-[14px]" style={{ color: 'var(--color-ink-2)' }}>
          {locale === 'de'
            ? (language === 'simple'
                ? 'Verbinde dein Wahoo-Gerät, um Workouts automatisch zu synchronisieren.'
                : 'Wahoo-Cloud-Integration — synchronisiert Workouts (Leistung, Herzfrequenz, Distanz) von deinem ELEMNT/KICKR.')
            : (language === 'simple'
                ? 'Connect your Wahoo device to sync workouts automatically.'
                : 'Wahoo Cloud integration — syncs workouts (power, heart rate, distance) from your ELEMNT/KICKR.')}
        </p>
      </div>

      {notConfigured ? (
        <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          {locale === 'de'
            ? 'Wahoo ist auf diesem Server nicht konfiguriert.'
            : 'Wahoo is not configured on this server.'}
        </p>
      ) : connected ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: 'var(--color-ink)' }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--color-amber)' }}
            />
            {locale === 'de' ? 'Verbunden' : 'Connected'}
          </span>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium self-start"
            style={{
              border: '1px solid var(--color-rule)',
              color: 'var(--color-ink-2)',
              backgroundColor: 'var(--color-paper)',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {locale === 'de' ? 'Trennen' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium self-start"
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-paper)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {locale === 'de' ? 'Wahoo verbinden' : 'Connect Wahoo'}
        </button>
      )}
    </section>
  )
}
