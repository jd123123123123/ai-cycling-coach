import { useState, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCircle2 } from 'lucide-react'
import { updateProfile, updateGoals } from '../api/athletes'

// Onboarding flow: Register (Account) → Consent → Profile Setup (Goals)
const steps = [
  { label: 'Account' },
  { label: 'Consent' },
  { label: 'Goals' },
]
const ACTIVE_STEP = 2

export default function ProfileSetupPage() {
  const navigate = useNavigate()

  // Profile fields
  const [ftp, setFtp] = useState('')
  const [weight, setWeight] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [restingHr, setRestingHr] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('')
  const [primarySport, setPrimarySport] = useState('')

  // Goal fields
  const [targetFtp, setTargetFtp] = useState('')
  const [targetEventName, setTargetEventName] = useState('')
  const [targetEventDate, setTargetEventDate] = useState('')
  const [goalWeeklyHours, setGoalWeeklyHours] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function numOrUndefined(val: string): number | undefined {
    const n = parseFloat(val)
    return isNaN(n) ? undefined : n
  }

  function intOrUndefined(val: string): number | undefined {
    const n = parseInt(val, 10)
    return isNaN(n) ? undefined : n
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // Build profile update (only include fields that have values)
      const profileData: Record<string, number | string> = {}
      if (ftp) profileData.ftp_watts = intOrUndefined(ftp)!
      if (weight) profileData.weight_kg = numOrUndefined(weight)!
      if (maxHr) profileData.max_heart_rate = intOrUndefined(maxHr)!
      if (restingHr) profileData.resting_heart_rate = intOrUndefined(restingHr)!
      if (weeklyHours) profileData.weekly_hours_available = numOrUndefined(weeklyHours)!
      if (primarySport) profileData.primary_sport = primarySport

      await updateProfile(profileData)

      // Build goals update (only include fields that have values)
      const goalsData: Record<string, number | string> = {}
      if (targetFtp) goalsData.target_ftp = intOrUndefined(targetFtp)!
      if (targetEventName) goalsData.target_event_name = targetEventName
      if (targetEventDate) goalsData.target_event_date = targetEventDate
      if (goalWeeklyHours) goalsData.weekly_hours = numOrUndefined(goalWeeklyHours)!

      if (Object.keys(goalsData).length > 0) {
        await updateGoals(goalsData)
      }

      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      console.error('Profile save failed:', err)
      setError('Failed to save your profile. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSkip() {
    navigate('/dashboard', { replace: true })
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
            <UserCircle2 size={14} strokeWidth={1.8} style={{ color: 'var(--color-forest-2)' }} />
            <span
              className="eyebrow"
              style={{ color: 'var(--color-forest-2)', letterSpacing: '0.22em' }}
            >
              Profile
            </span>
          </div>

          {/* Headline */}
          <h1
            className="num-display leading-[0.95]"
            style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--color-ink)' }}
          >
            Tell us about you.
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
            Help us personalize your training. All fields are optional — fill them in later if you
            prefer.
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

          <form onSubmit={handleSubmit} className="mt-2 space-y-5">
            {/* Athlete Profile section */}
            <div
              className="rounded-xl p-5"
              style={{
                border: '1px solid var(--color-rule)',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <h2
                className="text-[13px] font-semibold mb-4 eyebrow"
                style={{ color: 'var(--color-muted)', letterSpacing: '0.12em' }}
              >
                Athlete Profile
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberField
                  label="FTP (watts)"
                  min={0}
                  max={2000}
                  placeholder="e.g. 250"
                  value={ftp}
                  onChange={setFtp}
                  hint="Functional Threshold Power"
                />
                <NumberField
                  label="Weight (kg)"
                  min={0}
                  max={500}
                  step={0.1}
                  placeholder="e.g. 75"
                  value={weight}
                  onChange={setWeight}
                />
                <NumberField
                  label="Max Heart Rate (bpm)"
                  min={0}
                  max={300}
                  placeholder="e.g. 185"
                  value={maxHr}
                  onChange={setMaxHr}
                />
                <NumberField
                  label="Resting Heart Rate (bpm)"
                  min={0}
                  max={200}
                  placeholder="e.g. 55"
                  value={restingHr}
                  onChange={setRestingHr}
                />
                <NumberField
                  label="Weekly Hours Available"
                  min={0}
                  max={168}
                  step={0.5}
                  placeholder="e.g. 8"
                  value={weeklyHours}
                  onChange={setWeeklyHours}
                />

                {/* Sport select */}
                <label className="flex flex-col gap-1.5">
                  <span
                    className="eyebrow"
                    style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
                  >
                    Primary Sport
                  </span>
                  <select
                    value={primarySport}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setPrimarySport(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] rounded-md focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--color-paper)',
                      border: '1px solid var(--color-rule)',
                      color: primarySport ? 'var(--color-ink)' : 'var(--color-muted)',
                    }}
                  >
                    <option value="" style={{ background: 'var(--color-paper-2)' }}>
                      Select a sport...
                    </option>
                    <option value="cycling" style={{ background: 'var(--color-paper-2)' }}>
                      Cycling
                    </option>
                    <option value="running" style={{ background: 'var(--color-paper-2)' }}>
                      Running
                    </option>
                    <option value="triathlon" style={{ background: 'var(--color-paper-2)' }}>
                      Triathlon
                    </option>
                  </select>
                </label>
              </div>
            </div>

            {/* Goals section */}
            <div
              className="rounded-xl p-5"
              style={{
                border: '1px solid var(--color-rule)',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <h2
                className="text-[13px] font-semibold mb-4 eyebrow"
                style={{ color: 'var(--color-muted)', letterSpacing: '0.12em' }}
              >
                Training Goals
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberField
                  label="Target FTP (watts)"
                  min={0}
                  max={2000}
                  placeholder="e.g. 300"
                  value={targetFtp}
                  onChange={setTargetFtp}
                />
                <NumberField
                  label="Weekly Training Hours Goal"
                  min={0}
                  max={168}
                  step={0.5}
                  placeholder="e.g. 10"
                  value={goalWeeklyHours}
                  onChange={setGoalWeeklyHours}
                />

                <div className="sm:col-span-2">
                  <label className="flex flex-col gap-1.5">
                    <span
                      className="eyebrow"
                      style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
                    >
                      Target Event Name
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. L'Etape du Tour 2026"
                      value={targetEventName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setTargetEventName(e.target.value)
                      }
                      className="w-full px-3 py-2.5 text-[14px] rounded-md focus:outline-none focus:ring-1"
                      style={{
                        background: 'var(--color-paper)',
                        border: '1px solid var(--color-rule)',
                        color: 'var(--color-ink)',
                        caretColor: 'var(--color-forest-2)',
                      }}
                    />
                  </label>
                </div>

                <div>
                  <label className="flex flex-col gap-1.5">
                    <span
                      className="eyebrow"
                      style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}
                    >
                      Target Event Date
                    </span>
                    <input
                      type="date"
                      value={targetEventDate}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setTargetEventDate(e.target.value)
                      }
                      className="w-full px-3 py-2.5 text-[14px] rounded-md focus:outline-none focus:ring-1"
                      style={{
                        background: 'var(--color-paper)',
                        border: '1px solid var(--color-rule)',
                        color: 'var(--color-ink)',
                        caretColor: 'var(--color-forest-2)',
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

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
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: 'var(--color-alert)' }}
                >
                  {error}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-full text-[14px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--color-ink)',
                  color: 'var(--color-paper)',
                  minHeight: 44,
                }}
              >
                {submitting ? 'Saving…' : 'Save and continue'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={submitting}
                className="flex-none sm:w-40 rounded-full text-[14px] font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-rule)',
                  color: 'var(--color-ink-2)',
                  minHeight: 44,
                }}
              >
                Skip for now
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  min,
  max,
  step,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow" style={{ color: 'var(--color-muted)', letterSpacing: '0.22em' }}>
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-[14px] rounded-md focus:outline-none focus:ring-1"
        style={{
          background: 'var(--color-paper)',
          border: '1px solid var(--color-rule)',
          color: 'var(--color-ink)',
          caretColor: 'var(--color-forest-2)',
        }}
      />
      {hint && (
        <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}
