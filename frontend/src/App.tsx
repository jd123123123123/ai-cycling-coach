import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { CelebrationProvider } from './contexts/CelebrationContext'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import ErrorBoundary from './components/ErrorBoundary'
import AppSplash from './components/AppSplash'
import PageTransition from './components/PageTransition'
import { lazyWithRetry } from './lib/lazyWithRetry'
import { resolveLandingPath } from './editorial/state/designSystem'

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
const DesignLabView = lazyWithRetry(() => import('./pages/DesignLabView'))
const PowerProfileView = lazyWithRetry(() => import('./pages/PowerProfileView'))
const ClimbCompanionView = lazyWithRetry(() => import('./pages/ClimbCompanionView'))
const SeasonView = lazyWithRetry(() => import('./pages/SeasonView'))
const AchievementsView = lazyWithRetry(() => import('./pages/AchievementsView'))
const ExploreRoutesView = lazyWithRetry(() => import('./pages/ExploreRoutesView'))
const PlanImportView = lazyWithRetry(() => import('./pages/PlanImportView'))
const DebriefView = lazyWithRetry(() => import('./pages/DebriefView'))
const SessionReportView = lazyWithRetry(() => import('./pages/SessionReportView'))
const RideRecapView = lazyWithRetry(() => import('./pages/RideRecapView'))
const CrewRideDetailView = lazyWithRetry(() => import('./pages/CrewRideDetailView'))
const CrewEventDetailView = lazyWithRetry(() => import('./pages/CrewEventDetailView'))
// Bike-only: the standalone Load & Form (/load-form) analysis page is archived
// (file kept on disk, route removed) — its data lives inline on Today/Recovery.
const WorkoutDetailView = lazyWithRetry(() => import('./pages/WorkoutDetailView'))
// Bike-only: Run/Lift progress + Run analysis pages are archived (files kept on
// disk, routes removed). See pen audit ESAbb 'App Map' — off-strategy.
const BikeProgressView = lazyWithRetry(() => import('./pages/BikeProgressView'))
const RecoveryTrendsView = lazyWithRetry(() => import('./pages/RecoveryTrendsView'))
const WorkoutBuilderView = lazyWithRetry(() => import('./pages/WorkoutBuilderView'))
const RouteRehearsalView = lazyWithRetry(() => import('./pages/RouteRehearsalView'))

// EDITORIAL II — a second design system, mounted alongside the first.
const EditorialTodayPage = lazyWithRetry(() => import('./editorial/pages/TodayPage'))
const EditorialSessionDetailPage = lazyWithRetry(() => import('./editorial/pages/SessionDetailPage'))
const W3TodayPage = lazyWithRetry(() => import('./editorial/w3/W3TodayPage'))
const W3TodayPreview = lazyWithRetry(() => import('./editorial/w3/W3TodayPreview'))
const W3SessionPage = lazyWithRetry(() => import('./editorial/w3/W3SessionPage'))
const W3SessionPreview = lazyWithRetry(() => import('./editorial/w3/W3SessionPreview'))
const W3RidesPage = lazyWithRetry(() => import('./editorial/w3/W3RidesPage'))
const W3RidesPreview = lazyWithRetry(() => import('./editorial/w3/W3RidesPreview'))
const W3BikeStudioPage = lazyWithRetry(() => import('./editorial/w3/W3BikeStudioPage'))
const W3BikeStudioPreview = lazyWithRetry(() => import('./editorial/w3/W3BikeStudioPreview'))
const W3RideDetailPage = lazyWithRetry(() => import('./editorial/w3/W3RideDetailPage'))
const W3RideDetailPreview = lazyWithRetry(() => import('./editorial/w3/W3RideDetailPreview'))
const W3ConnectCelebratePage = lazyWithRetry(() => import('./editorial/w3/W3ConnectCelebratePage'))
const W3ConnectCelebratePreview = lazyWithRetry(() => import('./editorial/w3/W3ConnectCelebratePreview'))
const W3AvatarOnboardPage = lazyWithRetry(() => import('./editorial/w3/W3AvatarOnboardPage'))
const W3AvatarOnboardPreview = lazyWithRetry(() => import('./editorial/w3/W3AvatarOnboardPreview'))
const W3BikerPage = lazyWithRetry(() => import('./editorial/w3/W3BikerPage'))
const W3BikerPreview = lazyWithRetry(() => import('./editorial/w3/W3BikerPreview'))
const W3FirstBikePage = lazyWithRetry(() => import('./editorial/w3/W3FirstBikePage'))
const W3FirstBikePreview = lazyWithRetry(() => import('./editorial/w3/W3FirstBikePreview'))
const W3RideCelebratePage = lazyWithRetry(() => import('./editorial/w3/W3RideCelebratePage'))
const W3RideCelebratePreview = lazyWithRetry(() => import('./editorial/w3/W3RideCelebratePreview'))
const W3OnboardWelcomePage = lazyWithRetry(() => import('./editorial/w3/W3OnboardWelcomePage'))
const W3OnboardWelcomePreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardWelcomePreview'))
const W3OnboardDevicesPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardDevicesPage'))
const W3OnboardDevicesPreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardDevicesPreview'))
const W3OnboardRewardsPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardRewardsPage'))
const W3OnboardRewardsPreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardRewardsPreview'))
const W3OnboardGaragePage = lazyWithRetry(() => import('./editorial/w3/W3OnboardGaragePage'))
const W3OnboardGaragePreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardGaragePreview'))
const W3ReferralsPage = lazyWithRetry(() => import('./editorial/w3/W3ReferralsPage'))
const W3ReferralsPreview = lazyWithRetry(() => import('./editorial/w3/W3ReferralsPreview'))
const W3ReferralUserPage = lazyWithRetry(() => import('./editorial/w3/W3ReferralUserPage'))
const W3ReferralUserPreview = lazyWithRetry(() => import('./editorial/w3/W3ReferralUserPreview'))
const W3WinsPage = lazyWithRetry(() => import('./editorial/w3/W3WinsPage'))
const W3WinsPreview = lazyWithRetry(() => import('./editorial/w3/W3WinsPreview'))
const W3ChallengesPage = lazyWithRetry(() => import('./editorial/w3/W3ChallengesPage'))
const W3ChallengesPreview = lazyWithRetry(() => import('./editorial/w3/W3ChallengesPreview'))
const EditorialTabPlate = lazyWithRetry(() => import('./editorial/pages/TabPlate'))
const EditorialArchiveDeck = lazyWithRetry(() => import('./editorial/archive/ArchiveDeckPage'))
const EditorialMorningWrap = lazyWithRetry(() => import('./editorial/pages/MorningWrapPage'))
const EditorialHistory = lazyWithRetry(() => import('./editorial/history/HistoryPage'))

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

          {/* The deep ride analysis is no longer its own screen: it is the tail
              of the recap, which was the entry point from History anyway. The
              two duplicated roughly half their content (ride header, summary
              strip, coach narrative, NP/IF hero, power curve, route, PRs), so a
              rider had to visit both and reconcile them to understand one ride.
              This path is kept as a redirect — old links, notification deep
              links and the celebration cards all point at it. */}
          <Route
            path="/activities/:id/ride"
            element={<RideRideRedirect />}
          />

          {/* The planned crew ride (pen "V3 · Ride Detail (Sunrise)"). A crew
              event previously existed only as a card inside the Social tab —
              creatable and RSVP-able, but with nowhere to actually look at the
              ride you had been invited to. */}
          <Route
            path="/crew-event/:id"
            element={
              <ProtectedRoute checkOnboarding>
                <CrewEventDetailView />
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

          {/* Shared design primitives, rendered together. Not in the nav. */}
          <Route path="/design-lab" element={<DesignLabView />} />

          <Route path="/power-profile" element={<ProtectedRoute checkOnboarding><PowerProfileView /></ProtectedRoute>} />
          <Route path="/climbs" element={<ProtectedRoute checkOnboarding><ClimbCompanionView /></ProtectedRoute>} />
          <Route path="/season" element={<ProtectedRoute checkOnboarding><SeasonView /></ProtectedRoute>} />
          <Route path="/achievements" element={<ProtectedRoute checkOnboarding><AchievementsView /></ProtectedRoute>} />
          <Route path="/routes" element={<ProtectedRoute checkOnboarding><ExploreRoutesView /></ProtectedRoute>} />
          <Route path="/plan/import" element={<ProtectedRoute checkOnboarding><PlanImportView /></ProtectedRoute>} />
          <Route path="/workouts/builder" element={<ProtectedRoute checkOnboarding><WorkoutBuilderView /></ProtectedRoute>} />
          <Route path="/workouts/builder/:id" element={<ProtectedRoute checkOnboarding><WorkoutBuilderView /></ProtectedRoute>} />

          <Route path="/progress/bike" element={<ProtectedRoute checkOnboarding><BikeProgressView /></ProtectedRoute>} />

          {/* Route rehearsal: what a specific route will do to you, as a range. */}
          <Route path="/rehearse/:id" element={<ProtectedRoute checkOnboarding><RouteRehearsalView /></ProtectedRoute>} />

          {/* EDITORIAL II — a second design system, mounted alongside the first. */}
          <Route path="/e/today" element={<ProtectedRoute checkOnboarding><EditorialTodayPage /></ProtectedRoute>} />
          <Route path="/e/w3-today" element={<ProtectedRoute checkOnboarding><W3TodayPage /></ProtectedRoute>} />
          <Route path="/e/w3-today-preview" element={<W3TodayPreview />} />
          <Route path="/e/w3-session" element={<ProtectedRoute checkOnboarding><W3SessionPage /></ProtectedRoute>} />
          <Route path="/e/w3-session/:id" element={<ProtectedRoute checkOnboarding><W3SessionPage /></ProtectedRoute>} />
          <Route path="/e/w3-session-preview" element={<W3SessionPreview />} />
          <Route path="/e/w3-rides" element={<ProtectedRoute checkOnboarding><W3RidesPage /></ProtectedRoute>} />
          <Route path="/e/w3-rides-preview" element={<W3RidesPreview />} />
          <Route path="/e/w3-bike-studio" element={<ProtectedRoute checkOnboarding><W3BikeStudioPage /></ProtectedRoute>} />
          <Route path="/e/w3-bike-studio-preview" element={<W3BikeStudioPreview />} />
          <Route path="/e/w3-ride/:id" element={<ProtectedRoute checkOnboarding><W3RideDetailPage /></ProtectedRoute>} />
          <Route path="/e/w3-ride-preview" element={<W3RideDetailPreview />} />
          <Route path="/e/w3-connected" element={<ProtectedRoute checkOnboarding><W3ConnectCelebratePage /></ProtectedRoute>} />
          <Route path="/e/w3-connected-preview" element={<W3ConnectCelebratePreview />} />
          <Route path="/e/w3-avatar-onboard" element={<ProtectedRoute checkOnboarding><W3AvatarOnboardPage /></ProtectedRoute>} />
          <Route path="/e/w3-avatar-onboard-preview" element={<W3AvatarOnboardPreview />} />
          <Route path="/e/w3-biker" element={<ProtectedRoute checkOnboarding><W3BikerPage /></ProtectedRoute>} />
          <Route path="/e/w3-biker-preview" element={<W3BikerPreview />} />
          <Route path="/e/w3-first-bike" element={<ProtectedRoute checkOnboarding><W3FirstBikePage /></ProtectedRoute>} />
          <Route path="/e/w3-first-bike-preview" element={<W3FirstBikePreview />} />
          <Route path="/e/w3-ride-celebrate/:id" element={<ProtectedRoute checkOnboarding><W3RideCelebratePage /></ProtectedRoute>} />
          <Route path="/e/w3-ride-celebrate-preview" element={<W3RideCelebratePreview />} />
          {/* W3 first-open onboarding chain: welcome → devices → rewards → garage → today */}
          <Route path="/e/w3-onboard-welcome" element={<ProtectedRoute><W3OnboardWelcomePage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-welcome-preview" element={<W3OnboardWelcomePreview />} />
          <Route path="/e/w3-onboard-devices" element={<ProtectedRoute><W3OnboardDevicesPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-devices-preview" element={<W3OnboardDevicesPreview />} />
          <Route path="/e/w3-onboard-rewards" element={<ProtectedRoute><W3OnboardRewardsPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-rewards-preview" element={<W3OnboardRewardsPreview />} />
          <Route path="/e/w3-onboard-garage" element={<ProtectedRoute><W3OnboardGaragePage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-garage-preview" element={<W3OnboardGaragePreview />} />
          {/* Referrals: recruit riders, earn 10% for 30 days, claim on close. */}
          <Route path="/e/w3-referrals" element={<ProtectedRoute checkOnboarding><W3ReferralsPage /></ProtectedRoute>} />
          <Route path="/e/w3-referrals-preview" element={<W3ReferralsPreview />} />
          <Route path="/e/w3-referral-user/:id" element={<ProtectedRoute checkOnboarding><W3ReferralUserPage /></ProtectedRoute>} />
          <Route path="/e/w3-referral-user-preview" element={<W3ReferralUserPreview />} />
          <Route path="/e/w3-wins" element={<ProtectedRoute checkOnboarding><W3WinsPage /></ProtectedRoute>} />
          <Route path="/e/w3-wins-preview" element={<W3WinsPreview />} />
          <Route path="/e/w3-challenges" element={<ProtectedRoute checkOnboarding><W3ChallengesPage /></ProtectedRoute>} />
          <Route path="/e/w3-challenges-preview" element={<W3ChallengesPreview />} />
          {/* Session Detail renders TODAY's session — `useSessionModel` takes no
              id and this backend has no id-scoped session endpoint. The bare
              path is therefore the honest one; `/:id` stays registered so an
              older link still resolves rather than 404ing. */}
          <Route path="/e/session" element={<ProtectedRoute checkOnboarding><EditorialSessionDetailPage /></ProtectedRoute>} />
          <Route path="/e/session/:id" element={<ProtectedRoute checkOnboarding><EditorialSessionDetailPage /></ProtectedRoute>} />
          <Route path="/e/morning" element={<ProtectedRoute checkOnboarding><EditorialMorningWrap /></ProtectedRoute>} />
          <Route path="/e/archive" element={<ProtectedRoute checkOnboarding><EditorialArchiveDeck /></ProtectedRoute>} />
          {/* Must precede /e/:tab, which is the catch-all stub. The TabBar's
              History tab has always pointed here; until now it landed on
              "not in this system" while the finished deck sat unlinked at
              /e/archive. */}
          <Route path="/e/history" element={<ProtectedRoute checkOnboarding><EditorialHistory /></ProtectedRoute>} />
          <Route path="/e/:tab" element={<ProtectedRoute checkOnboarding><EditorialTabPlate /></ProtectedRoute>} />

          {/* Default redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Catch-all: redirect unknown paths to dashboard (ProtectedRoute handles auth check) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </PageTransition>
  )
}

/** Preserves `/activities/:id/ride` links by sending them to the merged page. */
function RideRideRedirect() {
  const { id } = useParams()
  return <Navigate to={`/activities/${id}/recap`} replace />
}

/** Lands the athlete in whichever design system they last chose. */
function RootRedirect() {
  const location = useLocation()
  return <Navigate to={resolveLandingPath(location.search)} replace />
}

export default App
