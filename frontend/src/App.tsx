import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { CelebrationProvider } from './contexts/CelebrationContext'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import ErrorBoundary from './components/ErrorBoundary'
import AppSplash from './components/AppSplash'
import PageTransition from './components/PageTransition'
import { lazyWithRetry } from './lib/lazyWithRetry'

// Auth entry points stay eager so first paint is instant.
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

// Every other routed page is code-split into its own lazily-loaded chunk.
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'))
const ConsentPage = lazyWithRetry(() => import('./pages/ConsentPage'))
const ProfileSetupPage = lazyWithRetry(() => import('./pages/ProfileSetupPage'))
// V3 onboarding (pencil-new.pen · Connect / Your Numbers / Goal & Depth)
// supersedes the legacy 8-step OnboardingWizard on /onboarding.
const OnboardingWizard = lazyWithRetry(() => import('./components/onboarding/OnboardingV3'))
const GarminConnectPage = lazyWithRetry(() => import('./pages/GarminConnectPage'))
const CalendarPage = lazyWithRetry(() => import('./pages/CalendarPage'))
const ActivitiesPage = lazyWithRetry(() => import('./pages/ActivitiesPage'))
const CoachPage = lazyWithRetry(() => import('./pages/CoachPage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const ProfileView = lazyWithRetry(() => import('./pages/ProfileView'))
const DashboardsPage = lazyWithRetry(() => import('./pages/DashboardsPage'))
const WeeklyRecapStory = lazyWithRetry(() => import('./pages/WeeklyRecapStory'))
const WeeklyWrapped = lazyWithRetry(() => import('./pages/WeeklyWrapped'))
const PowerProfileView = lazyWithRetry(() => import('./pages/PowerProfileView'))
const ClimbCompanionView = lazyWithRetry(() => import('./pages/ClimbCompanionView'))
const SeasonView = lazyWithRetry(() => import('./pages/SeasonView'))
const AchievementsView = lazyWithRetry(() => import('./pages/AchievementsView'))
const ExploreRoutesView = lazyWithRetry(() => import('./pages/ExploreRoutesView'))
const PlanImportView = lazyWithRetry(() => import('./pages/PlanImportView'))
const DebriefView = lazyWithRetry(() => import('./pages/DebriefView'))
const SessionReportView = lazyWithRetry(() => import('./pages/SessionReportView'))
const RideAnalysisView = lazyWithRetry(() => import('./pages/RideAnalysisView'))
const RideRecapView = lazyWithRetry(() => import('./pages/RideRecapView'))
const CrewRideDetailView = lazyWithRetry(() => import('./pages/CrewRideDetailView'))
// Bike-only: the standalone Load & Form (/load-form) analysis page is archived
// (file kept on disk, route removed) — its data lives inline on Today/Recovery.
const WorkoutDetailView = lazyWithRetry(() => import('./pages/WorkoutDetailView'))
// Bike-only: Run/Lift progress + Run analysis pages are archived (files kept on
// disk, routes removed). See pen audit ESAbb 'App Map' — off-strategy.
const BikeProgressView = lazyWithRetry(() => import('./pages/BikeProgressView'))
const RecoveryTrendsView = lazyWithRetry(() => import('./pages/RecoveryTrendsView'))
const WorkoutBuilderView = lazyWithRetry(() => import('./pages/WorkoutBuilderView'))

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <LocaleProvider>
        <CelebrationProvider>
        <ErrorBoundary>
        <AppRoutes />
        </ErrorBoundary>
        </CelebrationProvider>
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

// Routed content lives in its own component so it can read the active location
// (hooks can't run in <App> — that renders <BrowserRouter> itself). Wrapping
// the Suspense/Routes in <PageTransition> keyed on the pathname gives every
// navigation a quick, subtle crossfade. ScrollToTop still resets scroll per
// route, and the CelebrationProvider overlay + all fixed chrome stay OUTSIDE
// this wrapper (or are position:fixed and untouched by an opacity-only fade).
function AppRoutes() {
  const location = useLocation()
  return (
    <PageTransition routeKey={location.pathname}>
      <Suspense fallback={<AppSplash />}>
        <Routes location={location}>
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
            path="/activities/:id/recap"
            element={
              <ProtectedRoute checkOnboarding>
                <RideRecapView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/crew-ride/:activityId"
            element={
              <ProtectedRoute checkOnboarding>
                <CrewRideDetailView />
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

          <Route path="/recap/week" element={<ProtectedRoute checkOnboarding><WeeklyRecapStory /></ProtectedRoute>} />
          <Route path="/wrapped" element={<ProtectedRoute checkOnboarding><WeeklyWrapped /></ProtectedRoute>} />

          <Route path="/power-profile" element={<ProtectedRoute checkOnboarding><PowerProfileView /></ProtectedRoute>} />
          <Route path="/climbs" element={<ProtectedRoute checkOnboarding><ClimbCompanionView /></ProtectedRoute>} />
          <Route path="/season" element={<ProtectedRoute checkOnboarding><SeasonView /></ProtectedRoute>} />
          <Route path="/achievements" element={<ProtectedRoute checkOnboarding><AchievementsView /></ProtectedRoute>} />
          <Route path="/routes" element={<ProtectedRoute checkOnboarding><ExploreRoutesView /></ProtectedRoute>} />
          <Route path="/plan/import" element={<ProtectedRoute checkOnboarding><PlanImportView /></ProtectedRoute>} />
          <Route path="/workouts/builder" element={<ProtectedRoute checkOnboarding><WorkoutBuilderView /></ProtectedRoute>} />
          <Route path="/workouts/builder/:id" element={<ProtectedRoute checkOnboarding><WorkoutBuilderView /></ProtectedRoute>} />

          <Route path="/progress/bike" element={<ProtectedRoute checkOnboarding><BikeProgressView /></ProtectedRoute>} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Catch-all: redirect unknown paths to dashboard (ProtectedRoute handles auth check) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </PageTransition>
  )
}

export default App
