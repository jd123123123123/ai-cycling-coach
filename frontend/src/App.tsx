import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { CelebrationProvider } from './contexts/CelebrationContext'
import W3RideCelebrationWatcher from './editorial/w3/W3RideCelebrationWatcher'
import W3AvatarGate from './editorial/w3/W3AvatarGate'
import W3WeekReviewGate from './editorial/w3/W3WeekReviewGate'
import ProtectedRoute from './components/ProtectedRoute'
import W3Guard from './editorial/w3/W3Guard'
import ScrollToTop from './components/ScrollToTop'
import ErrorBoundary from './components/ErrorBoundary'
import AppLoading from './components/AppLoading'
import PageTransition from './components/PageTransition'
import { lazyWithRetry } from './lib/lazyWithRetry'
// The five bottom-bar screens are declared next to the bar that preloads them.
import { W3BikerPage, W3GarageHome, W3RidesPage, W3TodayPage, W3WinsPage } from './editorial/w3/w3TabChunks'
import { resolveLandingPath } from './editorial/state/designSystem'

// Auth entry points stay eager so first paint is instant.

// Every other routed page is code-split into its own lazily-loaded chunk.
// V3 onboarding (pencil-new.pen · Connect / Your Numbers / Goal & Depth)
// supersedes the legacy 8-step OnboardingWizard on /onboarding.
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
// Most of the W3 destinations below are ALSO listed in
// `editorial/w3/w3TabChunks.ts`, which the tab bar uses to warm them on idle
// (the five bottom tabs first, then the screens reached through Today/Rides).
// Same module specifier → same emitted chunk → after a prefetch these
// React.lazy factories resolve straight from the ES module registry with no
// second request. Keep the two lists in step.
const W3TodayPreview = lazyWithRetry(() => import('./editorial/w3/W3TodayPreview'))
const W3SessionPage = lazyWithRetry(() => import('./editorial/w3/W3SessionPage'))
const W3SessionPreview = lazyWithRetry(() => import('./editorial/w3/W3SessionPreview'))
const W3RidesPreview = lazyWithRetry(() => import('./editorial/w3/W3RidesPreview'))
const W3GaragePage = lazyWithRetry(() => import('./editorial/w3/W3GaragePage'))
const W3GaragePreview = lazyWithRetry(() => import('./editorial/w3/W3GaragePreview'))
const W3WorkshopPreview = lazyWithRetry(() => import('./editorial/w3/W3WorkshopPreview'))
const W3GearPreview = lazyWithRetry(() => import('./editorial/w3/W3GearPreview'))
const W3GarageStagePreview = lazyWithRetry(() => import('./editorial/w3/W3GarageStagePreview'))
const W3GearScreen = lazyWithRetry(() =>
  import('./editorial/w3/W3EconomyPages').then((m) => ({ default: m.W3GearScreen })))
const W3WorkshopScreen = lazyWithRetry(() =>
  import('./editorial/w3/W3EconomyPages').then((m) => ({ default: m.W3WorkshopScreen })))
const W3ShopsScreen = lazyWithRetry(() =>
  import('./editorial/w3/W3EconomyPages').then((m) => ({ default: m.W3ShopsScreen })))
const W3BikeStudioPage = lazyWithRetry(() => import('./editorial/w3/W3BikeStudioPage'))
const W3BikeStudioPreview = lazyWithRetry(() => import('./editorial/w3/W3BikeStudioPreview'))
const W3RideDetailPage = lazyWithRetry(() => import('./editorial/w3/W3RideDetailPage'))
const W3RideMapPage = lazyWithRetry(() => import('./editorial/w3/W3RideMapPage'))
const W3RideMapPreview = lazyWithRetry(() => import('./editorial/w3/W3RideMapPreview'))
const W3NitroPreview = lazyWithRetry(() => import('./editorial/w3/W3NitroPreview'))
const W3MatchPreview = lazyWithRetry(() => import('./editorial/w3/W3MatchPreview'))
const W3RankPreview = lazyWithRetry(() => import('./editorial/w3/W3RankPreview'))
const W3GarageHeroPreview = lazyWithRetry(() => import('./editorial/w3/W3GarageHeroPreview'))
const W3HeroRoute = lazyWithRetry(() => import('./editorial/w3/W3HeroRoute'))
const W3RoomPreview = lazyWithRetry(() => import('./editorial/w3/W3RoomPreview'))
const W3RideDetailPreview = lazyWithRetry(() => import('./editorial/w3/W3RideDetailPreview'))
const W3ConnectCelebratePage = lazyWithRetry(() => import('./editorial/w3/W3ConnectCelebratePage'))
const W3ConnectCelebratePreview = lazyWithRetry(() => import('./editorial/w3/W3ConnectCelebratePreview'))
const W3AvatarOnboardPage = lazyWithRetry(() => import('./editorial/w3/W3AvatarOnboardPage'))
const W3AvatarOnboardPreview = lazyWithRetry(() => import('./editorial/w3/W3AvatarOnboardPreview'))
const W3BikerPreview = lazyWithRetry(() => import('./editorial/w3/W3BikerPreview'))
const W3RideCelebratePage = lazyWithRetry(() => import('./editorial/w3/W3RideCelebratePage'))
const W3RideCelebratePreview = lazyWithRetry(() => import('./editorial/w3/W3RideCelebratePreview'))
const W3WeekReviewPage = lazyWithRetry(() => import('./editorial/w3/W3WeekReviewPage'))
const W3WeekReviewPreview = lazyWithRetry(() => import('./editorial/w3/W3WeekReviewPreview'))
const W3OnboardWelcomePage = lazyWithRetry(() => import('./editorial/w3/W3OnboardWelcomePage'))
const W3OnboardWelcomePreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardWelcomePreview'))
const W3OnboardDevicesPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardDevicesPage'))
const W3OnboardNumbersPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardNumbersPage'))
const GarminConnectPage = lazyWithRetry(() => import('./pages/GarminConnectPage'))
const W3OnboardDevicesPreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardDevicesPreview'))
const W3OnboardRewardsPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardRewardsPage'))
const W3OnboardRewardsPreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardRewardsPreview'))
const W3ReferralsPage = lazyWithRetry(() => import('./editorial/w3/W3ReferralsPage'))
const W3ReferralsPreview = lazyWithRetry(() => import('./editorial/w3/W3ReferralsPreview'))
const W3ReferralUserPage = lazyWithRetry(() => import('./editorial/w3/W3ReferralUserPage'))
const W3ReferralUserPreview = lazyWithRetry(() => import('./editorial/w3/W3ReferralUserPreview'))
const W3CrewPage = lazyWithRetry(() => import('./editorial/w3/W3CrewPage'))
const W3CrewPreview = lazyWithRetry(() => import('./editorial/w3/W3CrewPreview'))
const W3CrewMemberPage = lazyWithRetry(() => import('./editorial/w3/W3CrewMemberPage'))
const W3CrewMemberPreview = lazyWithRetry(() => import('./editorial/w3/W3CrewMemberPreview'))
const W3OnboardPlanPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardPlanPage'))
const W3OnboardPlanPreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardPlanPreview'))
const W3OnboardGoalsPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardGoalsPage'))
const W3OnboardGoalsPreview = lazyWithRetry(() => import('./editorial/w3/W3OnboardGoalsPreview'))
const W3OnboardRiderPage = lazyWithRetry(() => import('./editorial/w3/W3OnboardRiderPage'))
const W3PlanPage = lazyWithRetry(() => import('./editorial/w3/W3PlanPage'))
const W3PlanPreview = lazyWithRetry(() => import('./editorial/w3/W3PlanPreview'))
const W3GoalPage = lazyWithRetry(() => import('./editorial/w3/W3GoalPage'))
const W3GoalPreview = lazyWithRetry(() => import('./editorial/w3/W3GoalPreview'))
const W3LoadForecastPage = lazyWithRetry(() => import('./editorial/w3/W3LoadForecastPage'))
const W3LoadForecastPreview = lazyWithRetry(() => import('./editorial/w3/W3LoadForecastPreview'))
const W3SharePage = lazyWithRetry(() => import('./editorial/w3/W3SharePage'))
const W3SharePreview = lazyWithRetry(() => import('./editorial/w3/W3SharePreview'))
const W3ReadinessPage = lazyWithRetry(() => import('./editorial/w3/W3ReadinessPage'))
const W3ReadinessPreview = lazyWithRetry(() => import('./editorial/w3/W3ReadinessPreview'))
const W3LoginPage = lazyWithRetry(() => import('./editorial/w3/W3LoginPage'))
const W3RegisterPage = lazyWithRetry(() => import('./editorial/w3/W3RegisterPage'))
const W3AuthPreview = lazyWithRetry(() => import('./editorial/w3/W3AuthPreview'))
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
// (hooks can't run in <App> — that renders <BrowserRouter> itself).
// <PageTransition>, keyed on the pathname, gives every navigation a quick,
// subtle crossfade. ScrollToTop still resets scroll per route, and the
// CelebrationProvider overlay + all fixed chrome stay OUTSIDE this wrapper (or
// are position:fixed and untouched by an opacity-only fade).
//
// ── Why <Suspense> sits OUTSIDE <PageTransition>, not inside it ────────────
// It used to wrap only the <Routes>, i.e. it lived INSIDE the pathname-keyed
// <motion.div>. React's "hold the old screen instead of showing the fallback"
// behaviour — which react-router v7 already opts us into, since BrowserRouter
// wraps every location update in startTransition — only applies to a Suspense
// boundary that is ALREADY MOUNTED and has already revealed content. A boundary
// that mounts fresh has revealed nothing, so it paints its fallback
// immediately. Because the key changed on every navigation, every navigation
// tore down the old boundary and mounted a brand-new one, which is exactly why
// tapping a tab flashed the fallback even between two already-visited screens.
// Hoisting the boundary above the key makes it stable for the app's lifetime:
// React now keeps the outgoing screen on-screen until the incoming chunk has
// arrived, and the crossfade runs on ready content. The fallback is left with
// the only job it was written for — the cold first paint.
//
// That fallback is <AppLoading>, the SAME branded acid-bloom loader every W3
// screen uses (editorial/w3/W3Loading re-exports it). The old light-themed
// "Coach" splash is gone: it flashed white in a black app and was the only
// place in the product that still introduced itself as "Coach".
/**
 * Which ROOM a path belongs to — the unit the app-level crossfade keys on.
 *
 * It used to key on the pathname, and that quietly made a persistent layout
 * impossible anywhere in the app: a changed key unmounts the whole routed tree,
 * so a layout route shared by two paths was rebuilt on every navigation along
 * with everything under it. Screens that share a room share a key, so the tree
 * survives and the room animates its own swap (`W3HeroShell`). Everything else
 * still keys on its own path and fades exactly as before.
 */
const ROOMS: Record<string, string> = {
  '/e/w3-today': 'w3-room',
  '/e/w3-rides': 'w3-room',
  '/e/w3-garage': 'w3-room',
}
function roomKey(pathname: string): string {
  // The preview route nests its own screens, so it is a room by prefix rather
  // than by table — and it has to be one, or the preview would test a
  // different mechanism than the app ships.
  if (pathname.startsWith('/e/w3-room-preview')) return 'w3-room-preview'
  return ROOMS[pathname] ?? pathname
}

/**
 * A retired route, forwarded to the screen that replaced it.
 *
 * `replace` so the dead URL does not sit in history and send the rider back
 * into it with one swipe. The SEARCH IS CARRIED OVER: `/register?ref=CODE` is
 * the shape of link the referral feature asks riders to share, and dropping the
 * query here would quietly un-invite everybody who followed an older one.
 */
function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function AppRoutes() {
  const location = useLocation()
  return (
    <>
    <W3RideCelebrationWatcher />
    <W3AvatarGate />
    <W3WeekReviewGate />
    <Suspense fallback={<AppLoading />}>
      <PageTransition routeKey={roomKey(location.pathname)}>
        <Routes location={location}>
          {/* ── THE OLD WAY IN IS CLOSED ────────────────────────────────────
               Sign-up, consent, profile setup, the v4 wizard and the v4
               dashboard all have W3 answers now, and a rider who reached one of
               these by an old bookmark, an old share, or a stale service worker
               was shown a different app than the one they signed up for.
               They REDIRECT rather than 404, because these URLs are out in the
               world and a dead link is worse than an old one. The query string
               survives the hop — `/register?ref=CODE` is exactly the link the
               referral feature asks people to share, and dropping the search
               would silently un-invite them. ── */}
          <Route path="/login" element={<LegacyRedirect to="/e/w3-login" />} />
          <Route path="/register" element={<LegacyRedirect to="/e/w3-register" />} />
          <Route path="/consent" element={<LegacyRedirect to="/e/w3-onboard-numbers" />} />
          <Route path="/profile-setup" element={<LegacyRedirect to="/e/w3-onboard-numbers" />} />
          <Route path="/onboarding" element={<LegacyRedirect to="/e/w3-onboard-welcome" />} />
          <Route path="/dashboard" element={<LegacyRedirect to="/e/w3-today" />} />
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

          <Route path="/e/w3-today-preview" element={<W3TodayPreview />} />
          <Route path="/e/w3-session" element={<ProtectedRoute checkOnboarding><W3SessionPage /></ProtectedRoute>} />
          <Route path="/e/w3-session/:id" element={<ProtectedRoute checkOnboarding><W3SessionPage /></ProtectedRoute>} />
          <Route path="/e/w3-session-preview" element={<W3SessionPreview />} />
          <Route path="/e/w3-rides-preview" element={<W3RidesPreview />} />
          {/* The GARAGE tab: the bike you ride + the shop you buy it from. The
              bike-studio photo upload stays reachable by URL but is no longer a
              tab — see W3GarageView's header for why the ladder replaced it. */}
          {/* The garage is the bike economy's hub now: the built bike, the five
              loadout slots and what they bring, with the shop and the workshop
              as their own screens. The old catalogue garage (`W3GaragePage`)
              still answers `/e/w3-garage-old` until the shop it depends on is
              removed — see docs/superpowers/specs/2026-08-19-own-bike-customisation-design.md */}
          {/* ── ONE ROOM, TWO QUESTIONS ────────────────────────────────
              Today, the rides and the garage are the same bike in the same
              room, asked three questions. Nested
              under one layout they SHARE the mounted stage: navigating between
              them swaps the panel over the floor and the content beneath, and
              the machine itself never flashes out and back in. See
              `W3HeroShell`. Adding a screen here means writing its panel, not
              another copy of the room. ── */}
          <Route element={<ProtectedRoute checkOnboarding><W3Guard><W3HeroRoute /></W3Guard></ProtectedRoute>}>
            <Route path="/e/w3-today" element={<W3TodayPage />} />
            <Route path="/e/w3-rides" element={<W3RidesPage />} />
            <Route path="/e/w3-garage" element={<W3GarageHome />} />
          </Route>
          <Route path="/e/w3-gear" element={<ProtectedRoute checkOnboarding><W3Guard><W3GearScreen /></W3Guard></ProtectedRoute>} />
          <Route path="/e/w3-workshop" element={<ProtectedRoute checkOnboarding><W3Guard><W3WorkshopScreen /></W3Guard></ProtectedRoute>} />
          <Route path="/e/w3-shops" element={<ProtectedRoute checkOnboarding><W3Guard><W3ShopsScreen /></W3Guard></ProtectedRoute>} />
          <Route path="/e/w3-garage-old" element={<ProtectedRoute checkOnboarding><W3Guard><W3GaragePage /></W3Guard></ProtectedRoute>} />
          <Route path="/e/w3-garage-preview" element={<W3GaragePreview />} />
          <Route path="/e/w3-workshop-preview" element={<W3WorkshopPreview />} />
          <Route path="/e/w3-gear-preview" element={<W3GearPreview />} />
          <Route path="/e/w3-garage-stage-preview" element={<W3GarageStagePreview />} />
          {/* The old catalogue shop is retired — its collectible bikes are
              read from `useGarageCollection` by the hero and the garage, but
              nobody buys one any more. Kept as a redirect rather than a 404 so
              a bookmark lands in the shop that exists. */}
          <Route path="/e/w3-shop" element={<Navigate to="/e/w3-gear" replace />} />
          {/* The places are a section of the shop now — see `W3GearScreen`. */}
          <Route path="/e/w3-places" element={<Navigate to="/e/w3-gear" replace />} />
          <Route path="/e/w3-bike-studio" element={<ProtectedRoute checkOnboarding><W3BikeStudioPage /></ProtectedRoute>} />
          <Route path="/e/w3-bike-studio-preview" element={<W3BikeStudioPreview />} />
          <Route path="/e/w3-ride/:id" element={<ProtectedRoute checkOnboarding><W3RideDetailPage /></ProtectedRoute>} />
          <Route path="/e/w3-ride-preview" element={<W3RideDetailPreview />} />
          {/* The route, full screen and pannable. Separate from the summary
              because the summary's map is deliberately inert — see
              `W3RideMapPage` on why an embedded map must not eat a scroll. */}
          <Route path="/e/w3-ride-map/:id" element={<ProtectedRoute checkOnboarding><W3RideMapPage /></ProtectedRoute>} />
          <Route path="/e/w3-ride-map-preview" element={<W3RideMapPreview />} />
          <Route path="/e/w3-nitro-preview" element={<W3NitroPreview />} />
          <Route path="/e/w3-match-preview" element={<W3MatchPreview />} />
          <Route path="/e/w3-rank-preview" element={<W3RankPreview />} />
          <Route path="/e/w3-garage-hero-preview" element={<W3GarageHeroPreview />} />
          <Route path="/e/w3-room-preview/*" element={<W3RoomPreview />} />
          {/* The launch mark on its own, so the one animation every cold start
              shows can be looked at without racing a Suspense boundary. */}
          <Route path="/e/w3-loading-preview" element={<AppLoading label="Einen Moment…" />} />
          {/* No `checkOnboarding`: this IS an onboarding step. The gate is satisfied
              by the NUMBERS screen, which comes after this one — guarding it would
              bounce every mid-onboarding rider back to the welcome screen the
              moment they connected a device. */}
          <Route path="/e/w3-connected" element={<ProtectedRoute><W3ConnectCelebratePage /></ProtectedRoute>} />
          <Route path="/e/w3-connected-preview" element={<W3ConnectCelebratePreview />} />
          <Route path="/e/w3-avatar-onboard" element={<ProtectedRoute checkOnboarding><W3AvatarOnboardPage /></ProtectedRoute>} />
          <Route path="/e/w3-avatar-onboard-preview" element={<W3AvatarOnboardPreview />} />
          <Route path="/e/w3-biker" element={<ProtectedRoute checkOnboarding><W3Guard><W3BikerPage /></W3Guard></ProtectedRoute>} />
          <Route path="/e/w3-biker-preview" element={<W3BikerPreview />} />
          <Route path="/e/w3-first-bike" element={<Navigate to="/e/w3-bike-studio?next=%2Fe%2Fw3-today" replace />} />
          <Route path="/e/w3-ride-celebrate/:id" element={<ProtectedRoute checkOnboarding><W3RideCelebratePage /></ProtectedRoute>} />
          <Route path="/e/w3-ride-celebrate-preview" element={<W3RideCelebratePreview />} />
          <Route path="/e/w3-week-review" element={<ProtectedRoute checkOnboarding><W3WeekReviewPage /></ProtectedRoute>} />
          <Route path="/e/w3-week-review-preview" element={<W3WeekReviewPreview />} />
          {/* W3 first-open onboarding chain: welcome → devices → rewards → garage → today */}
          <Route path="/e/w3-onboard-welcome" element={<ProtectedRoute><W3OnboardWelcomePage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-welcome-preview" element={<W3OnboardWelcomePreview />} />
          <Route path="/e/w3-onboard-devices" element={<ProtectedRoute><W3OnboardDevicesPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-numbers" element={<ProtectedRoute><W3OnboardNumbersPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-numbers-preview" element={<W3OnboardNumbersPage />} />
          <Route path="/e/w3-onboard-devices-preview" element={<W3OnboardDevicesPreview />} />
          <Route path="/e/w3-onboard-rewards" element={<ProtectedRoute><W3OnboardRewardsPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-rewards-preview" element={<W3OnboardRewardsPreview />} />
          <Route path="/e/w3-onboard-garage" element={<Navigate to="/e/w3-bike-studio?next=%2Fe%2Fw3-today" replace />} />
          {/* Referrals: recruit riders, earn 10% for 30 days, claim on close. */}
          <Route path="/e/w3-referrals" element={<ProtectedRoute checkOnboarding><W3ReferralsPage /></ProtectedRoute>} />
          <Route path="/e/w3-referrals-preview" element={<W3ReferralsPreview />} />
          <Route path="/e/w3-referral-user/:id" element={<ProtectedRoute checkOnboarding><W3ReferralUserPage /></ProtectedRoute>} />
          <Route path="/e/w3-referral-user-preview" element={<W3ReferralUserPreview />} />
          {/* Crew */}
          <Route path="/e/w3-crew" element={<ProtectedRoute checkOnboarding><W3CrewPage /></ProtectedRoute>} />
          <Route path="/e/w3-crew-preview" element={<W3CrewPreview />} />
          <Route path="/e/w3-crew-member/:id" element={<ProtectedRoute checkOnboarding><W3CrewMemberPage /></ProtectedRoute>} />
          <Route path="/e/w3-crew-member-preview" element={<W3CrewMemberPreview />} />
          {/* Onboarding: training-plan + yearly-goals + rider studio */}
          <Route path="/e/w3-onboard-plan" element={<ProtectedRoute><W3OnboardPlanPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-plan-preview" element={<W3OnboardPlanPreview />} />
          <Route path="/e/w3-onboard-goals" element={<ProtectedRoute><W3OnboardGoalsPage /></ProtectedRoute>} />
          <Route path="/e/w3-onboard-goals-preview" element={<W3OnboardGoalsPreview />} />
          <Route path="/e/w3-onboard-rider" element={<ProtectedRoute><W3OnboardRiderPage /></ProtectedRoute>} />
          {/* Trainingsplan: periodized plan, goal detail, load forecast */}
          <Route path="/e/w3-plan" element={<ProtectedRoute checkOnboarding><W3PlanPage /></ProtectedRoute>} />
          <Route path="/e/w3-plan-preview" element={<W3PlanPreview />} />
          <Route path="/e/w3-goal" element={<ProtectedRoute checkOnboarding><W3GoalPage /></ProtectedRoute>} />
          <Route path="/e/w3-goal-preview" element={<W3GoalPreview />} />
          <Route path="/e/w3-load" element={<ProtectedRoute checkOnboarding><W3LoadForecastPage /></ProtectedRoute>} />
          <Route path="/e/w3-load-preview" element={<W3LoadForecastPreview />} />
          {/* Ride sharing */}
          <Route path="/e/w3-share" element={<ProtectedRoute checkOnboarding><W3SharePage /></ProtectedRoute>} />
          <Route path="/e/w3-share/:id" element={<ProtectedRoute checkOnboarding><W3SharePage /></ProtectedRoute>} />
          <Route path="/e/w3-share-preview" element={<W3SharePreview />} />
          <Route path="/e/w3-readiness" element={<ProtectedRoute checkOnboarding><W3ReadinessPage /></ProtectedRoute>} />
          <Route path="/e/w3-readiness-preview" element={<W3ReadinessPreview />} />
          <Route path="/e/w3-login" element={<W3LoginPage />} />
          <Route path="/e/w3-register" element={<W3RegisterPage />} />
          <Route path="/e/w3-auth-preview" element={<W3AuthPreview />} />
          <Route path="/e/w3-wins" element={<ProtectedRoute checkOnboarding><W3Guard><W3WinsPage /></W3Guard></ProtectedRoute>} />
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

          {/* Catch-all: unknown paths land in the W3 app, not the retired v4
              dashboard. ProtectedRoute + W3Guard handle auth and onboarding. */}
          <Route path="*" element={<Navigate to="/e/w3-today" replace />} />
        </Routes>
      </PageTransition>
    </Suspense>
    </>
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
