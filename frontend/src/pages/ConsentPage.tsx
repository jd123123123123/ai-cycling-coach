import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Shield } from 'lucide-react'
import { CONSENT_TYPES } from '../types/consent'
import { grantConsent } from '../api/consent'
import { useLocale } from '../contexts/LocaleContext'

const ACTIVE_STEP = 1

export default function ConsentPage() {
  const navigate = useNavigate()
  const { locale } = useLocale()

  // Onboarding flow: Register (Account) → Consent → Profile Setup (Goals)
  const steps = [
    { label: locale === 'de' ? 'Konto' : 'Account' },
    { label: locale === 'de' ? 'Einwilligung' : 'Consent' },
    { label: locale === 'de' ? 'Ziele' : 'Goals' },
  ]

  // Track which consent types are checked
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(CONSENT_TYPES.map((c) => [c.type, c.required])),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleToggle(type: string, required: boolean) {
    if (required) return // Required consents cannot be unchecked
    setChecked((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const canSubmit = CONSENT_TYPES.filter((c) => c.required).every((c) => checked[c.type])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!canSubmit) {
      setError(
        locale === 'de'
          ? 'Du musst die erforderlichen Einwilligungen erteilen, um fortzufahren.'
          : 'You must grant the required consents to continue.',
      )
      return
    }

    setSubmitting(true)

    try {
      // POST each checked consent
      const grants = CONSENT_TYPES.filter((c) => checked[c.type])

      for (const consent of grants) {
        await grantConsent({
          consent_type: consent.type,
          consent_version: '1.0',
          granted: true,
          consent_text: consent.description,
        })
      }

      navigate('/profile-setup', { replace: true })
    } catch (err: unknown) {
      console.error('Consent submission failed:', err)
      setError(
        locale === 'de'
          ? 'Einwilligungen konnten nicht gespeichert werden. Bitte versuche es erneut.'
          : 'Failed to save consents. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-2xl">
        <div
          className="paper-grain rounded-[20px] p-6 sm:p-7"
          style={{
            background: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
          }}
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)' }} />
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest-2)', letterSpacing: '0.22em' }}
            >
              {locale === 'de' ? 'Einwilligung' : 'Consent'}
            </span>
          </div>

          {/* Headline */}
          <h1
            className="num-display leading-[0.95]"
            style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--color-ink)' }}
          >
            {locale === 'de' ? 'Deine Daten, deine Entscheidung.' : 'Your data, your call.'}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            {locale === 'de'
              ? 'Gemäß DSGVO musst du jede Einwilligung einzeln und bewusst erteilen.'
              : 'Under GDPR, you must grant each consent separately and deliberately.'}
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
                    background:
                      i < ACTIVE_STEP
                        ? 'var(--color-muted)'
                        : i === ACTIVE_STEP
                          ? 'var(--color-ink)'
                          : 'var(--color-rule)',
                    border: '1px solid var(--color-rule)',
                  }}
                />
                <span className="eyebrow text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-2 space-y-3">
            {CONSENT_TYPES.map((consent) => {
              const isChecked = !!checked[consent.type]
              return (
                <div
                  key={consent.type}
                  className="rounded-xl p-4 transition-colors"
                  style={{
                    border: `1px solid ${isChecked ? 'var(--color-forest-2)' : 'var(--color-rule)'}`,
                    background: isChecked
                      ? 'rgba(52, 199, 89, 0.04)'
                      : 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Custom checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggle(consent.type, consent.required)}
                      disabled={consent.required}
                      className="flex-shrink-0 mt-0.5 relative flex items-center justify-center transition-colors disabled:cursor-default"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: `1.5px solid ${isChecked ? 'var(--color-forest-2)' : 'var(--color-rule)'}`,
                        background: isChecked ? 'var(--color-forest-2)' : 'transparent',
                      }}
                      aria-checked={isChecked}
                      role="checkbox"
                    >
                      {isChecked && (
                        <Check
                          size={11}
                          strokeWidth={2.5}
                          style={{ color: 'var(--color-paper)' }}
                        />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-[14px] font-medium"
                          style={{ color: 'var(--color-ink)' }}
                        >
                          {consent.title}
                        </span>
                        {consent.required ? (
                          <span
                            className="eyebrow text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(52, 199, 89, 0.12)',
                              color: 'var(--color-forest-2)',
                            }}
                          >
                            {locale === 'de' ? 'Erforderlich' : 'Required'}
                          </span>
                        ) : (
                          <span
                            className="eyebrow text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              color: 'var(--color-muted)',
                            }}
                          >
                            Optional
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[13px] leading-relaxed"
                        style={{ color: 'var(--color-ink-2)' }}
                      >
                        {consent.description}
                      </p>
                      {consent.required && (
                        <p className="mt-1.5 text-[12px]" style={{ color: 'var(--color-muted)' }}>
                          {locale === 'de'
                            ? 'Diese Einwilligung ist erforderlich, um den Dienst zu nutzen.'
                            : 'This consent is required to use the service.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Error */}
            {error && (
              <div
                className="rounded-xl px-3 py-3"
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

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full rounded-full text-[14px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--color-ink)',
                  color: 'var(--color-paper)',
                  minHeight: 44,
                }}
              >
                {submitting
                  ? locale === 'de'
                    ? 'Auswahl wird gespeichert…'
                    : 'Saving your choices…'
                  : locale === 'de'
                    ? 'Weiter zur Profileinrichtung'
                    : 'Continue to profile setup'}
              </button>

              {!canSubmit && (
                <p className="mt-2 text-center text-[12px]" style={{ color: 'var(--color-muted)' }}>
                  {locale === 'de'
                    ? 'Du musst die erforderliche Einwilligung "Health Data Processing" erteilen, um fortzufahren.'
                    : 'You must grant the required "Health Data Processing" consent to continue.'}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
