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
import { enableMorningBrief, disableMorningBrief, pushSupported, sendTestPush } from '../lib/push'

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
          {/* Audit P2-14: ONE heading — the duplicated EINSTELLUNGEN eyebrow
              above the identical H1 wasted the page's first 90px. */}
          <h1
            className="num-display leading-tight"
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

        {/* Morning brief push (P1.5) */}
        <MorningBriefSection />

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

/**
 * MorningBriefSection — web-push opt-in (roadmap P1.5). Real states only:
 * unsupported browser → honest note; server unconfigured (503) → hidden
 * feature note; enabled → test-push + disable. Never advertises a dead pipe.
 */
function MorningBriefSection() {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [state, setState] = useState<'idle' | 'busy' | 'on' | 'unsupported' | 'unavailable'>(
    () => (pushSupported() ? (Notification.permission === 'granted' ? 'on' : 'idle') : 'unsupported'),
  )
  const [note, setNote] = useState<string | null>(null)

  async function enable() {
    setState('busy'); setNote(null)
    try {
      await enableMorningBrief()
      setState('on')
      setNote(de ? 'Aktiviert — jeden Morgen ein Brief, nie mehr als einer.' : 'Enabled — one brief every morning, never more.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'denied') { setState('idle'); setNote(de ? 'Benachrichtigungen wurden blockiert — erlaube sie im Browser.' : 'Notifications are blocked — allow them in your browser.') }
      else if ((e as { response?: { status?: number } })?.response?.status === 503) { setState('unavailable'); setNote(null) }
      else { setState('idle'); setNote(de ? 'Aktivierung fehlgeschlagen — versuch es nochmal.' : 'Enabling failed — try again.') }
    }
  }

  async function disable() {
    setState('busy')
    try { await disableMorningBrief() } finally { setState('idle'); setNote(de ? 'Deaktiviert.' : 'Disabled.') }
  }

  async function test() {
    setState('busy')
    try {
      const n = await sendTestPush()
      setNote(n > 0 ? (de ? 'Test gesendet — schau auf dein Gerät.' : 'Test sent — check your device.') : (de ? 'Kein aktives Gerät gefunden — aktiviere zuerst.' : 'No active device found — enable first.'))
    } catch { setNote(de ? 'Test fehlgeschlagen.' : 'Test failed.') } finally { setState('on') }
  }

  const busy = state === 'busy'
  const enabled = state === 'on'

  if (state === 'unsupported' || state === 'unavailable') {
    return (
      <section className="flex flex-col gap-2 p-5 rounded-[16px]" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>{de ? 'MORGEN-BRIEF' : 'MORNING BRIEF'}</span>
        <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          {state === 'unsupported'
            ? (de ? 'Push wird von diesem Browser nicht unterstützt.' : 'Push isn’t supported by this browser.')
            : (de ? 'Push ist auf diesem Server nicht eingerichtet.' : 'Push isn’t configured on this server.')}
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 p-5 rounded-[16px]" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex flex-col gap-1">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.18em' }}>{de ? 'MORGEN-BRIEF' : 'MORNING BRIEF'}</span>
        <p className="text-[14px]" style={{ color: 'var(--color-ink-2)' }}>
          {de
            ? 'Ein Push pro Morgen: Bereitschaft + die heutige Einheit, direkt zu Heute verlinkt. Ruhetags-bewusst — nie Druck.'
            : 'One push each morning: readiness + today’s session, deep-linked to Today. Rest-day aware — never pressure.'}
        </p>
      </div>
      <div className="flex gap-2">
        {!enabled ? (
          <button type="button" onClick={() => void enable()} disabled={busy} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium" style={{ backgroundColor: 'var(--color-accent)', color: '#0A0C0F', opacity: busy ? 0.6 : 1 }}>
            {de ? 'Aktivieren' : 'Enable'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void test()} disabled={busy} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium" style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)', opacity: busy ? 0.6 : 1 }}>
            {de ? 'Test senden' : 'Send test'}
            </button>
            <button type="button" onClick={() => void disable()} disabled={busy} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-rule)', color: 'var(--color-ink-2)', opacity: busy ? 0.6 : 1 }}>
              {de ? 'Deaktivieren' : 'Disable'}
            </button>
          </>
        )}
      </div>
      {note && <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{note}</p>}
    </section>
  )
}
