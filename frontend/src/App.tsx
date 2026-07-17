import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import AppSplash from './components/AppSplash'
import { lazyWithRetry } from './lib/lazyWithRetry'

// Auth entry points stay eager so first paint is instant.
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

// Every other routed page is code-split into its own lazily-loaded chunk.
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'))
const ConsentPage = lazyWithRetry(() => import('./pages/ConsentPage'))
const ProfileSetupPage = lazyWithRetry(() => import('./pages/ProfileSetupPage'))
const OnboardingWizard = lazyWithRetry(() => import('./components/onboarding/OnboardingWizard'))
const GarminConnectPage = lazyWithRetry(() => import('./pages/GarminConnectPage'))
const CalendarPage = lazyWithRetry(() => import('./pages/CalendarPage'))
const ActivitiesPage = lazyWithRetry(() => import('./pages/ActivitiesPage'))
const CoachPage = lazyWithRetry(() => import('./pages/CoachPage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const ProfileView = lazyWithRetry(() => import('./pages/ProfileView'))
const DashboardsPage = lazyWithRetry(() => import('./pages/DashboardsPage'))
const DebriefView = lazyWithRetry(() => import('./pages/DebriefView'))
const SessionReportView = lazyWithRetry(() => import('./pages/SessionReportView'))
const RideAnalysisView = lazyWithRetry(() => import('./pages/RideAnalysisView'))
const LoadFormView = lazyWithRetry(() => import('./pages/LoadFormView'))
const WorkoutDetailView = lazyWithRetry(() => import('./pages/WorkoutDetailView'))
const RunProgressView = lazyWithRetry(() => import('./pages/RunProgressView'))
const BikeProgressView = lazyWithRetry(() => import('./pages/BikeProgressView'))
const LiftProgressView = lazyWithRetry(() => import('./pages/LiftProgressView'))
const RunAnalysisView = lazyWithRetry(() => import('./pages/RunAnalysisView'))
const RecoveryTrendsView = lazyWithRetry(() => import('./pages/RecoveryTrendsView'))

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
        <ErrorBoundary>
        <Suspense fallback={<AppSplash />}>
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

          {/* Full workout detail for ANY planned day (today alias handled inside). */}
          <Route
            path="/workout/:date"
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
        </Suspense>
        </ErrorBoundary>
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
