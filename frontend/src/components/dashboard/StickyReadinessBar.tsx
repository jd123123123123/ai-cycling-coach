/**
 * StickyReadinessBar — 56px bar that appears when the user scrolls past
 * the ReadinessHero. Provides a persistent at-a-glance readiness summary.
 *
 * Visibility: IntersectionObserver on [data-testid="readiness-hero"].
 * When the hero is NOT intersecting → bar fades in (user has scrolled past it).
 * When the hero re-intersects → bar fades out.
 *
 * NOTE: The data-testid="readiness-hero" attribute is added to ReadinessHero
 * in Task 2. Until then this component mounts silently (no target = no bar,
 * no console warnings). This is the correct Task 1 state.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { subDays } from 'date-fns'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useLanguage } from '../../contexts/LanguageContext'
import { useLocale } from '../../contexts/LocaleContext'
import { computeReadiness, latestWithData, readinessTier, TIER_META } from '../../utils/metrics'
import { readinessFreshness } from '../../utils/readinessGate'
import { localDayKey } from '../../utils/loadMetrics'
import { springs, prefersReducedMotion } from '../../utils/motion'

/**
 * Simple inline scroll-to-top — no hook dependency needed.
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export default function StickyReadinessBar() {
  const { language } = useLanguage()
  const { locale } = useLocale()
  const [heroVisible, setHeroVisible] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const reducedMotion = prefersReducedMotion()

  // Data — same queries ReadinessHero uses; React Query deduplicates the fetch.
  const today = useRef(new Date()).current
  const thirtyDaysAgo = useRef(subDays(today, 30)).current
  const { data: metricsData } = useDailyMetrics(thirtyDaysAgo, today)
  const { data: briefData } = useCoachBrief()

  // Derived readiness
  const metrics = metricsData?.metrics ?? []
  const latest =
    latestWithData(metrics, 'sleep_score') ??
    latestWithData(metrics, 'hrv_status') ??
    latestWithData(metrics, 'body_battery')
  // `latestWithData` is a positional reverse scan — it returns the newest row
  // that HAS the field, whatever its date. On a watch that stopped syncing that
  // is a week-old night, and this bar would print a confident readiness number
  // and tier while the Today hero directly above it withholds the score as not
  // today's. Same gate as the hero: no fresh overnight record, no number.
  const freshness = readinessFreshness(metrics, localDayKey(today))
  const readiness = latest && freshness.gate === 'fresh'
    ? computeReadiness(latest.hrv_status, latest.body_battery, latest.sleep_score)
    : null
  const tier = readinessTier(readiness)
  const meta = tier ? TIER_META[tier] : null

  // Workout one-liner from the coach brief
  const prescribedWorkout = briefData?.prescribed_workout ?? null
  const workoutTitle = prescribedWorkout?.title ?? null
  const workoutDuration = prescribedWorkout
    ? language === 'simple'
      ? `${prescribedWorkout.duration_minutes} min`
      : `${prescribedWorkout.duration_minutes} min · ${Math.round(prescribedWorkout.predicted_tss)} TSS`
    : null

  // IntersectionObserver on [data-testid="readiness-hero"]
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    // Find the hero element (added in Task 2). If absent, silently do nothing.
    const heroEl = document.querySelector('[data-testid="readiness-hero"]')
    if (!heroEl) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        setHeroVisible(entry.isIntersecting)
      },
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' }, // offset for sticky masthead
    )
    obs.observe(heroEl)
    observerRef.current = obs

    return () => {
      obs.disconnect()
      observerRef.current = null
    }
  }, []) // run once on mount; the attribute lands in Task 2

  // Show once the hero has scrolled out, as long as the bar has SOMETHING true
  // to carry. It used to require a readiness score, which meant gating the
  // score above would have silently deleted the bar on stale-wearable days —
  // taking the day's session with it, even though the session is still known.
  // The score block below already renders conditionally.
  const show = !heroVisible && (readiness != null || workoutTitle != null)

  const barContent = (
    <div
      style={{
        position: 'sticky',
        top: 64, // below the masthead (z-40)
        zIndex: 30,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        gap: 12,
        backgroundColor: 'rgba(243, 236, 220, 0.85)',
        backdropFilter: `blur(var(--blur-thin)) saturate(160%)`,
        WebkitBackdropFilter: `blur(var(--blur-thin)) saturate(160%)`,
        borderBottom: '1px solid var(--color-rule)',
      }}
    >
      {/* Readiness score */}
      {readiness != null && meta && (
        <>
          <span
            className="num-display leading-none"
            style={{ fontSize: 17, color: meta.color }}
          >
            {Math.round(readiness)}
          </span>
          <span
            className="eyebrow"
            style={{ color: meta.color, fontSize: 10, letterSpacing: '0.2em' }}
          >
            {meta.label.toUpperCase()}
          </span>

          {/* Divider */}
          <span
            style={{
              width: 1,
              height: 20,
              backgroundColor: 'var(--color-rule)',
              flexShrink: 0,
            }}
            aria-hidden
          />
        </>
      )}

      {/* Workout one-liner */}
      {workoutTitle && (
        <span
          className="num-mono text-[12px] truncate flex-1 min-w-0"
          style={{ color: 'var(--color-ink-2)' }}
        >
          {workoutTitle}
          {workoutDuration && (
            <span style={{ color: 'var(--color-muted)' }}> · {workoutDuration}</span>
          )}
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Jump to top */}
      <button
        type="button"
        onClick={scrollToTop}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium"
        style={{
          color: 'var(--color-ink-2)',
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          flexShrink: 0,
        }}
        aria-label={locale === 'de'
          ? (language === 'simple' ? 'Nach oben' : 'Zu heute springen')
          : (language === 'simple' ? 'Back to top' : 'Jump to today')}
      >
        {locale === 'de'
          ? (language === 'simple' ? 'Nach oben' : 'Zu heute springen')
          : (language === 'simple' ? 'Back to top' : 'Jump to today')}
      </button>
    </div>
  )

  if (reducedMotion) {
    return show ? barContent : null
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="sticky-bar"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springs.snappy}
        >
          {barContent}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
