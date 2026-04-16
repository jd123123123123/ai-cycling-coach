import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function DashboardPage() {
  const { user, logout } = useAuth()

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav bar */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-gray-900">AI Cycling Coach</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Welcome, {user?.email}!
          </h1>
          <p className="text-gray-500 mb-8">
            You're signed in. This is your dashboard placeholder — the full coaching
            experience will be built in later phases.
          </p>

          {/* Profile setup CTA */}
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <h2 className="text-sm font-medium text-blue-900 mb-1">Set up your profile</h2>
            <p className="text-sm text-blue-700 mb-3">
              Add your FTP, heart rate zones, and training goals to get personalized coaching.
            </p>
            <Link
              to="/profile-setup"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Set up profile
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
