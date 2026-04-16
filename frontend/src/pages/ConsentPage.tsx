import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CONSENT_TYPES } from '../types/consent'
import { grantConsent } from '../api/consent'

export default function ConsentPage() {
  const navigate = useNavigate()

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
      setError('You must grant the required consents to continue.')
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
      setError('Failed to save consents. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-gray-900">Your Privacy Choices</h1>
          <p className="mt-3 text-base text-gray-600 max-w-lg mx-auto">
            Before you start, please review how we use your data. Under GDPR, you must grant each
            consent separately and deliberately.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {CONSENT_TYPES.map((consent) => {
            const isChecked = !!checked[consent.type]
            return (
              <div
                key={consent.type}
                className={`bg-white rounded-xl border-2 p-6 transition-colors ${
                  isChecked ? 'border-blue-500' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <div className="flex-shrink-0 mt-0.5">
                    <input
                      id={`consent-${consent.type}`}
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(consent.type, consent.required)}
                      disabled={consent.required}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-default"
                    />
                  </div>

                  {/* Content */}
                  <label
                    htmlFor={consent.required ? undefined : `consent-${consent.type}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base font-semibold text-gray-900">{consent.title}</span>
                      {consent.required ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Optional
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{consent.description}</p>
                    {consent.required && (
                      <p className="mt-2 text-xs text-blue-600">
                        This consent is required to use the service.
                      </p>
                    )}
                  </label>
                </div>
              </div>
            )
          })}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {submitting ? 'Saving your choices...' : 'Continue to profile setup'}
            </button>

            {!canSubmit && (
              <p className="mt-2 text-center text-xs text-gray-500">
                You must grant the required "Health Data Processing" consent to continue.
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
