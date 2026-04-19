import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'

interface ConnectResponse {
  activities_synced: number
  metrics_days: number
  message: string
}

export default function GarminConnectPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiClient.post<ConnectResponse>('/garmin/connect', { email, password })
      // Refresh cached Garmin status + metric data so dashboard picks up the new state
      await qc.invalidateQueries({ queryKey: ['garmin', 'status'] })
      await qc.invalidateQueries({ queryKey: ['daily-metrics'] })
      await qc.invalidateQueries({ queryKey: ['activities'] })
      await qc.invalidateQueries({ queryKey: ['pmc'] })
      const { activities_synced, metrics_days } = res.data
      navigate('/dashboard', {
        replace: true,
        state: { garminJustConnected: { activities_synced, metrics_days } },
      })
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: string } } }
      if (axiosError.response?.status === 401) {
        setError('Garmin authentication failed. Check your email and password.')
      } else if (axiosError.response?.status === 409) {
        setError('Garmin account is already connected. Disconnect first.')
      } else if (axiosError.response?.data?.detail) {
        setError(axiosError.response.data.detail)
      } else {
        setError('Something went wrong connecting Garmin. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Connect Garmin</h1>
            <p className="mt-2 text-sm text-gray-500">
              Sign in with your Garmin Connect credentials to sync activities and biometrics
            </p>
          </div>

          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              Your credentials are encrypted before storage. Initial sync pulls the last 90 days of
              activities and 30 days of metrics — this may take up to a minute.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Garmin email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Garmin password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {submitting ? 'Connecting and syncing (up to 60s)...' : 'Connect Garmin'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/dashboard" className="text-blue-600 hover:text-blue-700 font-medium">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
