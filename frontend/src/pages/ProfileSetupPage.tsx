import { useState, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile, updateGoals } from '../api/athletes'

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

  function inputClass(extraClass = '') {
    return `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${extraClass}`
  }

  function labelClass() {
    return 'block text-sm font-medium text-gray-700 mb-1'
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-gray-900">Set Up Your Profile</h1>
          <p className="mt-3 text-base text-gray-600">
            Help us personalize your training. All fields are optional — you can fill these in later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Profile section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Athlete Profile</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass()}>FTP (watts)</label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  placeholder="e.g. 250"
                  value={ftp}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFtp(e.target.value)}
                  className={inputClass()}
                />
                <p className="mt-1 text-xs text-gray-500">Functional Threshold Power</p>
              </div>

              <div>
                <label className={labelClass()}>Weight (kg)</label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="0.1"
                  placeholder="e.g. 75"
                  value={weight}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeight(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Max Heart Rate (bpm)</label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  placeholder="e.g. 185"
                  value={maxHr}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxHr(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Resting Heart Rate (bpm)</label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  placeholder="e.g. 55"
                  value={restingHr}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRestingHr(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Weekly Hours Available</label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  placeholder="e.g. 8"
                  value={weeklyHours}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeeklyHours(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Primary Sport</label>
                <select
                  value={primarySport}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setPrimarySport(e.target.value)}
                  className={inputClass('bg-white')}
                >
                  <option value="">Select a sport...</option>
                  <option value="cycling">Cycling</option>
                  <option value="running">Running</option>
                  <option value="triathlon">Triathlon</option>
                </select>
              </div>
            </div>
          </div>

          {/* Goals section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Training Goals</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass()}>Target FTP (watts)</label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  placeholder="e.g. 300"
                  value={targetFtp}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTargetFtp(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Weekly Training Hours Goal</label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  placeholder="e.g. 10"
                  value={goalWeeklyHours}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setGoalWeeklyHours(e.target.value)
                  }
                  className={inputClass()}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass()}>Target Event Name</label>
                <input
                  type="text"
                  placeholder="e.g. L'Etape du Tour 2026"
                  value={targetEventName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTargetEventName(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass()}>Target Event Date</label>
                <input
                  type="date"
                  value={targetEventDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTargetEventDate(e.target.value)}
                  className={inputClass()}
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {submitting ? 'Saving...' : 'Save and continue'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="flex-1 sm:flex-none sm:w-40 py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl border border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
            >
              Skip for now
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
