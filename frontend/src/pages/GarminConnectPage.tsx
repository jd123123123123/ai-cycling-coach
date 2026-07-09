import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Lock, Mail, ShieldCheck, Watch } from 'lucide-react'
import { apiClient } from '../api/client'
import { prefersReducedMotion } from '../utils/motion'
import { useLocale } from '../contexts/LocaleContext'

interface ConnectResponse {
  activities_synced: number
  metrics_days: number
  message: string
}

export default function GarminConnectPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { locale } = useLocale()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Simulated progress — the real /garmin/connect call takes up to ~60s because
  // the SSO chain includes deliberate delays to bypass Cloudflare bot detection.
  // Asymptote to 92% so it never feels "stuck at 100" before the server returns,
  // then snap to 100 on success.
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!submitting) {
      setProgress(0)
      return
    }
    if (prefersReducedMotion()) {
      setProgress(50)
      return
    }
    const started = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = (now - started) / 1000
      const pct = Math.min(92, 92 * (1 - Math.exp(-elapsed / 14)))
      setProgress(pct)
      if (submitting) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [submitting])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiClient.post<ConnectResponse>('/garmin/connect', { email, password })
      setProgress(100)
      await qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
      await qc.invalidateQueries({ queryKey: ['daily-metrics'] })
      await qc.invalidateQueries({ queryKey: ['activities'] })
      await qc.invalidateQueries({ queryKey: ['pmc'] })
      const { activities_synced, metrics_days } = res.data
      setTimeout(() => {
        navigate('/dashboard', {
          replace: true,
          state: { garminJustConnected: { activities_synced, metrics_days } },
        })
      }, 250)
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: string } } }
      if (axiosError.response?.status === 401) {
        setError(
          locale === 'de'
            ? 'Garmin-Authentifizierung fehlgeschlagen. Prüfe deine E-Mail und dein Passwort.'
            : 'Garmin authentication failed. Check your email and password.',
        )
      } else if (axiosError.response?.status === 409) {
        setError(
          locale === 'de'
            ? 'Das Garmin-Konto ist bereits verbunden. Trenne zuerst die Verbindung.'
            : 'Garmin account is already connected. Disconnect first.',
        )
      } else if (axiosError.response?.status === 429) {
        setError(
          locale === 'de'
            ? 'Garmin drosselt diesen Server. Warte 15–30 Minuten oder wechsle das Netzwerk (Handy-Hotspot / VPN) und versuche es erneut.'
            : 'Garmin is rate-limiting this server. Wait 15–30 minutes or switch networks (phone hotspot / VPN) and try again.',
        )
      } else if (axiosError.response?.data?.detail) {
        setError(axiosError.response.data.detail)
      } else {
        setError(
          locale === 'de'
            ? 'Beim Verbinden mit Garmin ist etwas schiefgelaufen. Bitte versuche es erneut.'
            : 'Something went wrong connecting Garmin. Please try again.',
        )
      }
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-md">
        <div
          className="paper-grain rounded-[20px] p-6 sm:p-7 relative overflow-hidden"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
            backgroundImage:
              'radial-gradient(140% 100% at 100% 0%, color-mix(in srgb, var(--color-forest-2) 18%, transparent), transparent 60%)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Watch size={14} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)' }} />
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest-2)', letterSpacing: '0.22em' }}
            >
              {locale === 'de' ? 'Letzter Schritt · Garmin' : 'Last step · Garmin'}
            </span>
          </div>
          <h1
            className="num-display leading-[0.95]"
            style={{
              fontSize: 'clamp(28px, 4.5vw, 36px)',
              color: 'var(--color-ink)',
            }}
          >
            {locale === 'de' ? 'Verbinde dein Garmin.' : 'Connect your Garmin.'}
          </h1>
          <p
            className="mt-2 text-[14px] leading-relaxed"
            style={{ color: 'var(--color-ink-2)' }}
          >
            {locale === 'de'
              ? 'Melde dich mit deinen Garmin-Connect-Zugangsdaten an. Dein Coach benötigt Schlaf, HRV, Body Battery und deine Aktivitätshistorie, um ein genaues Bild zu erstellen.'
              : 'Sign in with your Garmin Connect credentials. Your coach needs sleep, HRV, body battery, and activity history to build an accurate picture.'}
          </p>

          {/* 3-dot progress strip — Garmin Connect is accessed post-onboarding (not part of the
              Account→Consent→Goals flow), so we show it as a standalone connection step */}
          <div className="flex items-center gap-3 my-4">
            {[
              { label: locale === 'de' ? 'Konto' : 'Account' },
              { label: locale === 'de' ? 'Einwilligung' : 'Consent' },
              { label: locale === 'de' ? 'Ziele' : 'Goals' },
            ].map((step, i) => (
              <div key={step.label} className="flex flex-col items-center gap-1">
                <span
                  style={{
                    display: 'block',
                    width: 16,
                    height: 16,
                    borderRadius: 9999,
                    background: i < 3 ? 'var(--color-muted)' : 'var(--color-rule)',
                    border: '1px solid var(--color-rule)',
                  }}
                />
                <span className="eyebrow text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-5 flex items-start gap-2.5 rounded-xl px-3 py-3"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-forest-2) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-forest-2) 18%, transparent)',
            }}
          >
            <ShieldCheck
              size={14}
              strokeWidth={1.8}
              style={{ color: 'var(--color-forest-2)', marginTop: 2 }}
            />
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
              {locale === 'de'
                ? 'Zugangsdaten werden mit einem Schlüssel verschlüsselt, den nur dein Server besitzt. Die erste Synchronisierung lädt 90 Tage Aktivitäten und 30 Tage tägliche Metriken — bis zu einer Minute.'
                : 'Credentials are encrypted with a key only your server holds. Initial sync pulls 90 days of activities and 30 days of daily metrics — up to a minute.'}
            </p>
          </div>

          {error && (
            <div
              className="mt-4 rounded-xl px-3 py-3"
              style={{
                backgroundColor: 'rgba(255, 69, 58, 0.06)',
                border: '1px solid rgba(255, 69, 58, 0.22)',
              }}
              role="alert"
            >
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-alert)' }}>
                {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <FormField
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              label={locale === 'de' ? 'Garmin-E-Mail' : 'Garmin email'}
              icon={<Mail size={14} strokeWidth={1.8} />}
              disabled={submitting}
            />

            <FormField
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              label={locale === 'de' ? 'Garmin-Passwort' : 'Garmin password'}
              icon={<Lock size={14} strokeWidth={1.8} />}
              disabled={submitting}
            />

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium min-h-[44px] transition-all overflow-hidden"
              style={{
                color: 'var(--color-paper)',
                backgroundColor: 'var(--color-ink)',
                opacity: submitting ? 0.95 : 1,
              }}
            >
              {submitting && (
                <span
                  className="absolute inset-0"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: 'var(--color-forest-2)',
                    transition: 'width 400ms ease-out',
                    opacity: 0.55,
                  }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center gap-2">
                {submitting
                  ? progress < 100
                    ? locale === 'de'
                      ? `Synchronisiere ${Math.round(progress)}%`
                      : `Syncing ${Math.round(progress)}%`
                    : locale === 'de'
                      ? 'Fertig — Weiterleitung…'
                      : 'Done — redirecting…'
                  : locale === 'de'
                    ? 'Garmin verbinden'
                    : 'Connect Garmin'}
                {!submitting && <ArrowUpRight size={14} strokeWidth={2} />}
              </span>
            </button>
          </form>

          <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--color-muted)' }}>
            <Link
              to="/dashboard"
              className="font-medium"
              style={{ color: 'var(--color-forest-2)' }}
            >
              {locale === 'de' ? '← Zurück zum Dashboard' : '← Back to dashboard'}
            </Link>
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
          <ReassuranceChip text={locale === 'de' ? 'Verschlüsselt gespeichert' : 'Encrypted at rest'} />
          <ReassuranceChip text={locale === 'de' ? 'Nie geteilt' : 'Never shared'} />
          <ReassuranceChip text={locale === 'de' ? 'Jederzeit widerrufbar' : 'Revoke anytime'} />
        </div>
      </div>
    </div>
  )
}

function FormField({
  id,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  label,
  icon,
  disabled,
}: {
  id: string
  type: 'email' | 'password'
  autoComplete: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span
        className="eyebrow"
        style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
      >
        {label.toUpperCase()}
      </span>
      <div
        className="relative flex items-center rounded-xl px-3"
        style={{
          backgroundColor: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <span
          className="flex-shrink-0 opacity-60"
          style={{ color: 'var(--color-ink-2)' }}
          aria-hidden
        >
          {icon}
        </span>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 py-2.5 pl-2 text-[14px] bg-transparent outline-none"
          style={{ color: 'var(--color-ink)' }}
        />
      </div>
    </label>
  )
}

function ReassuranceChip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center justify-center gap-1 rounded-full py-1.5 px-2 text-center"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
    >
      <ShieldCheck size={10} strokeWidth={2} />
      {text}
    </span>
  )
}
