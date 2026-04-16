import { useState, type FormEvent } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

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
      return 'Please enter a valid email address.'
    }
    // Password length
    if (password.length < 8) {
      return 'Password must be at least 8 characters.'
    }
    // Password match
    if (password !== confirmPassword) {
      return 'Passwords do not match.'
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
          setError('An account with this email already exists.')
        } else if (typeof detail === 'string') {
          setError(detail)
        } else {
          setError('Registration failed. Please try again.')
        }
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Create your account</h1>
            <p className="mt-2 text-sm text-gray-500">Your personal AI cycling coach awaits</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
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
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Repeat your password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
