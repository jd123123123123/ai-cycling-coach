import { useState, type FormEvent } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const steps = [{ label: 'Account' }]

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // If already authenticated, redirect to dashboard
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: string } } }
      if (axiosError.response?.status === 401) {
        setError('Invalid email or password.')
      } else if (axiosError.response?.data?.detail) {
        setError(axiosError.response.data.detail)
      } else {
        setError('Something went wrong. Please try again.')
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
            <Lock size={14} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)' }} />
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest-2)', letterSpacing: '0.22em' }}
            >
              Sign in
            </span>
          </div>

          {/* Headline */}
          <h1
            className="num-display leading-[0.95]"
            style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--color-ink)' }}
          >
            Welcome back.
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            Sign in to your AI cycling coach.
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
                    background: i === 0 ? 'var(--color-ink)' : 'var(--color-rule)',
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
              label="Email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              disabled={submitting}
            />

            <FormField
              id="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
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
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-[13px] mt-5 text-center" style={{ color: 'var(--color-muted)' }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              className="underline underline-offset-2"
              style={{ color: 'var(--color-forest-2)' }}
            >
              Create one
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
}: {
  id: string
  type: 'email' | 'password'
  label: string
  autoComplete: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled?: boolean
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
