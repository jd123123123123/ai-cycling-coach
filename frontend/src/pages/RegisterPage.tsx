import { useState, type FormEvent } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'

const ACTIVE_STEP = 0

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth()
  const { locale } = useLocale()
  const navigate = useNavigate()

  // Onboarding flow: Register (Account) → Consent → Profile Setup (Goals)
  const steps = [
    { label: locale === 'de' ? 'Konto' : 'Account' },
    { label: locale === 'de' ? 'Einwilligung' : 'Consent' },
    { label: locale === 'de' ? 'Ziele' : 'Goals' },
  ]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // If already authenticated, redirect to dashboard
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  function validateForm(): string | null {
    // Email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return locale === 'de'
        ? 'Bitte gib eine gültige E-Mail-Adresse ein.'
        : 'Please enter a valid email address.'
    }
    // Password length
    if (password.length < 8) {
      return locale === 'de'
        ? 'Das Passwort muss mindestens 8 Zeichen lang sein.'
        : 'Password must be at least 8 characters.'
    }
    // Password match
    if (password !== confirmPassword) {
      return locale === 'de' ? 'Die Passwörter stimmen nicht überein.' : 'Passwords do not match.'
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)

    try {
      await register({ email, password })
      // New users must complete GDPR consent before accessing the app
      navigate('/consent', { replace: true })
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: string } } }
      if (axiosError.response?.status === 400) {
        const detail = axiosError.response.data?.detail
        if (typeof detail === 'string' && detail.toLowerCase().includes('already registered')) {
          setError(
            locale === 'de'
              ? 'Es existiert bereits ein Konto mit dieser E-Mail-Adresse.'
              : 'An account with this email already exists.',
          )
        } else if (typeof detail === 'string') {
          setError(detail)
        } else {
          setError(
            locale === 'de'
              ? 'Registrierung fehlgeschlagen. Bitte versuche es erneut.'
              : 'Registration failed. Please try again.',
          )
        }
      } else {
        setError(
          locale === 'de'
            ? 'Etwas ist schiefgelaufen. Bitte versuche es erneut.'
            : 'Something went wrong. Please try again.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-md">
        <div
          className="paper-grain rounded-[20px] p-6 sm:p-7"
          style={{
            background: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)' }} />
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest-2)', letterSpacing: '0.22em' }}
            >
              {locale === 'de' ? 'Konto erstellen' : 'Create account'}
            </span>
          </div>

          {/* Headline */}
          <h1
            className="num-display leading-[0.95]"
            style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--color-ink)' }}
          >
            {locale === 'de' ? 'Erstelle dein Konto.' : 'Create your account.'}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            {locale === 'de'
              ? 'Dein persönlicher KI-Radsport-Coach wartet auf dich.'
              : 'Your personal AI cycling coach awaits.'}
          </p>

          {/* 3-dot progress strip */}
          <div className="flex items-center gap-3 my-4">
            {steps.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center gap-1">
                <span
                  style={{
                    display: 'block',
                    width: 16,
                    height: 16,
                    borderRadius: 9999,
                    background: i === ACTIVE_STEP ? 'var(--color-ink)' : 'var(--color-rule)',
                    border: '1px solid var(--color-rule)',
                  }}
                />
                <span className="eyebrow text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div
              className="mb-4 rounded-xl px-3 py-3"
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <FormField
              id="email"
              type="email"
              label={locale === 'de' ? 'E-Mail' : 'Email'}
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              disabled={submitting}
            />

            <FormField
              id="password"
              type="password"
              label={locale === 'de' ? 'Passwort' : 'Password'}
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder={locale === 'de' ? 'Mind. 8 Zeichen' : 'Min. 8 characters'}
              disabled={submitting}
              minLength={8}
            />

            <FormField
              id="confirmPassword"
              type="password"
              label={locale === 'de' ? 'Passwort bestätigen' : 'Confirm password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder={locale === 'de' ? 'Passwort wiederholen' : 'Repeat your password'}
              disabled={submitting}
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full text-[14px] font-medium transition-colors disabled:opacity-50"
              style={{
                background: 'var(--color-ink)',
                color: 'var(--color-paper)',
                minHeight: 44,
                marginTop: 4,
              }}
            >
              {submitting
                ? locale === 'de'
                  ? 'Konto wird erstellt…'
                  : 'Creating account…'
                : locale === 'de'
                  ? 'Konto erstellen'
                  : 'Create account'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-[13px] mt-5 text-center" style={{ color: 'var(--color-muted)' }}>
            {locale === 'de' ? 'Du hast bereits ein Konto?' : 'Already have an account?'}{' '}
            <Link
              to="/login"
              className="underline underline-offset-2"
              style={{ color: 'var(--color-forest-2)' }}
            >
              {locale === 'de' ? 'Anmelden' : 'Sign in'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function FormField({
  id,
  type,
  label,
  autoComplete,
  value,
  onChange,
  placeholder,
  disabled,
  minLength,
}: {
  id: string
  type: 'email' | 'password'
  label: string
  autoComplete: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled?: boolean
  minLength?: number
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
        {label.toUpperCase()}
      </span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-[14px] rounded-md focus:outline-none focus:ring-1"
        style={{
          background: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
          color: 'var(--color-ink)',
          caretColor: 'var(--color-forest-2)',
        }}
      />
    </label>
  )
}
