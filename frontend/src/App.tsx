import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import ConsentPage from './pages/ConsentPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import GarminConnectPage from './pages/GarminConnectPage'
import CalendarPage from './pages/CalendarPage'
import ActivitiesPage from './pages/ActivitiesPage'
import CoachPage from './pages/CoachPage'
import SettingsPage from './pages/SettingsPage'
import ProfileView from './pages/ProfileView'
import DashboardsPage from './pages/DashboardsPage'
import DebriefView from './pages/DebriefView'
import SessionReportView from './pages/SessionReportView'
import RideAnalysisView from './pages/RideAnalysisView'
import LoadFormView from './pages/LoadFormView'
import WorkoutDetailView from './pages/WorkoutDetailView'
import RunProgressView from './pages/RunProgressView'
import BikeProgressView from './pages/BikeProgressView'
import LiftProgressView from './pages/LiftProgressView'
import RunAnalysisView from './pages/RunAnalysisView'
import RecoveryTrendsView from './pages/RecoveryTrendsView'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Onboarding routes (protected — require auth) */}
          <Route
            path="/consent"
            element={
              <ProtectedRoute>
                <ConsentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile-setup"
            element={
              <ProtectedRoute>
                <ProfileSetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingWizard />
              </ProtectedRoute>
            }
          />

          {/* Main app routes (protected — require auth + completed onboarding) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute checkOnboarding>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/garmin/connect"
            element={
              <ProtectedRoute checkOnboarding>
                <GarminConnectPage />
              </ProtectedRoute>
            }
          />

          {/* 06.1-02 Wave 2 — new destination routes (IconRail navigation) */}
          <Route
            path="/calendar"
            element={
              <ProtectedRoute checkOnboarding>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activities"
            element={
              <ProtectedRoute checkOnboarding>
                <ActivitiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/coach"
            element={
              <ProtectedRoute checkOnboarding>
                <CoachPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute checkOnboarding>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute checkOnboarding>
                <ProfileView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboards"
            element={
              <ProtectedRoute checkOnboarding>
                <DashboardsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/activities/:id/debrief"
            element={
              <ProtectedRoute checkOnboarding>
                <DebriefView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/activities/:id/session-report"
            element={
              <ProtectedRoute checkOnboarding>
                <SessionReportView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/activities/:id/ride"
            element={
              <ProtectedRoute checkOnboarding>
                <RideAnalysisView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/activities/:id/run"
            element={
              <ProtectedRoute checkOnboarding>
                <RunAnalysisView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/load-form"
            element={
              <ProtectedRoute checkOnboarding>
                <LoadFormView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workout/today"
            element={
              <ProtectedRoute checkOnboarding>
                <WorkoutDetailView />
              </ProtectedRoute>
            }
          />

          <Route path="/recovery/trends" element={<ProtectedRoute checkOnboarding><RecoveryTrendsView /></ProtectedRoute>} />

          <Route path="/progress/run" element={<ProtectedRoute checkOnboarding><RunProgressView /></ProtectedRoute>} />
          <Route path="/progress/bike" element={<ProtectedRoute checkOnboarding><BikeProgressView /></ProtectedRoute>} />
          <Route path="/progress/lift" element={<ProtectedRoute checkOnboarding><LiftProgressView /></ProtectedRoute>} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Catch-all: redirect unknown paths to dashboard (ProtectedRoute handles auth check) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
