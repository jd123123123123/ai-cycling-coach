/**
 * CelebrationContext — the app-wide "micro-dopamine" reward engine.
 *
 * Mounted once high in the tree (App.tsx). Exposes an imperative `celebrate`
 * API plus `celebrateOnce` (localStorage-deduped, so a real achievement fires
 * exactly once, ever). A sibling <CelebrationTriggers/> watches global signals
 * (streak, weekly rhythm, streak-break) so most celebrations need zero changes
 * to feature code.
 *
 * QUEUE, not last-writer-wins. A single session can unlock several wins at once
 * — a ride can set a PB *and* close the weekly rhythm *and* hit a streak
 * milestone — and each fires from its own watcher in the same tick. Rather than
 * letting them collide (only the last card showing), every `celebrate` /
 * `celebrateOnce` / `enqueueStreakBreak` ENQUEUES. The overlay renders the head
 * of the queue; on its dismiss / auto-advance it plays the next, biggest-first,
 * until the queue drains. A card and the soft streak-break card share the same
 * queue, so they play in sequence and can never overlap on screen. Confetti +
 * haptic fire when a card BECOMES the head (not at enqueue time), and each card
 * still respects its localStorage dedup, prefers-reduced-motion, and CSP safety.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from 'react'
import { AnimatePresence } from 'motion/react'
import { Zap, Flame, Target, TrendingUp, Trophy, type LucideProps } from 'lucide-react'
import type {
  CelebrationKind,
  CelebrationPayload,
} from '../components/celebration/CelebrationOverlay'
import type { StreakBreakContent } from '../components/celebration/StreakBreakOverlay'

/**
 * ── THE PARTY IS NOT ON THE CRITICAL PATH ────────────────────────────────
 * These two overlays were STATIC imports on a provider that wraps the whole
 * app, so every cold start downloaded and parsed ~780 lines of confetti UI —
 * plus the icon set it draws with — before the first frame, for a moment that
 * happens after a ride and, in the break's case, almost never.
 *
 * Lazy, with NO Suspense fallback around them on purpose: a celebration that
 * arrives 80 ms late is a celebration; a spinner where a celebration should be
 * is a bug. `null` until the chunk lands, and the overlay's own entry animation
 * then plays exactly as it always did.
 *
 * The TYPES stay statically imported above — a type import is erased at build
 * time and pulls in nothing.
 */
const CelebrationOverlay = lazy(() => import('../components/celebration/CelebrationOverlay'))
const StreakBreakOverlay = lazy(() => import('../components/celebration/StreakBreakOverlay'))
import CelebrationTriggers from '../components/celebration/CelebrationTriggers'
import { fireConfetti } from '../lib/confetti'
import { hapticCelebrate } from '../lib/haptics'
import {
  hasCelebrated,
  markCelebrated,
  celebrationPriority,
  emptyQueue,
  enqueueCelebration,
  advanceCelebration,
  prefersReducedMotion,
  type QueueState,
} from '../lib/celebration'
import { useLocale } from './LocaleContext'

export interface CelebrateOptions {
  kicker?: string
  value?: string | number
  unit?: string
  detail?: string
  rarity?: string
  accent?: string
  icon?: ComponentType<LucideProps>
  onShare?: () => void
  shareLabel?: string
  dismissLabel?: string
  /** Fire the confetti burst. Default true. */
  confetti?: boolean
  /** Fire the haptic double-pop. Default true. */
  haptic?: boolean
  /** Auto-dismiss after N ms. Default 5200 (3200 under reduced motion). Pass 0 to disable. */
  autoDismissMs?: number
}

interface KindDefault {
  icon: ComponentType<LucideProps>
  accent: string
}

const KIND_DEFAULTS: Record<CelebrationKind, KindDefault> = {
  pb: { icon: Zap, accent: '#FF5A3C' },
  streak: { icon: Flame, accent: '#FFB020' },
  weekly: { icon: Target, accent: '#16E08A' },
  ftp: { icon: TrendingUp, accent: '#38B6FF' },
  generic: { icon: Trophy, accent: '#8B5CF6' },
}

// A card waiting in / playing on the queue. Celebrations carry their fire-time
// side-effects (confetti / haptic / auto-dismiss) so they trigger when the card
// reaches the head, not when it was enqueued. The soft streak-break shares the
// queue but never fires confetti/haptic and never auto-dismisses (it wants a
// deliberate tap on its CTA).
type QueueItem =
  | {
      seq: number
      priority: number
      type: 'celebration'
      payload: CelebrationPayload
      confetti: boolean
      haptic: boolean
      autoDismissMs: number
      accent: string
    }
  | {
      seq: number
      priority: number
      type: 'break'
      content: StreakBreakContent
    }

interface CelebrationContextValue {
  /** Fire a celebration (no dedup — caller owns gating). Enqueues; never replaces. */
  celebrate: (kind: CelebrationKind, opts?: CelebrateOptions) => void
  /** Fire once ever for `dedupKey`; a re-render/revisit with the same key no-ops. */
  celebrateOnce: (dedupKey: string, kind: CelebrationKind, opts?: CelebrateOptions) => void
  /** Enqueue the soft "streak lost" card into the same sequential queue. */
  enqueueStreakBreak: (content: StreakBreakContent) => void
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null)

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [queue, setQueue] = useState<QueueState<QueueItem>>(() => emptyQueue<QueueItem>())
  const seqRef = useRef(0)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelConfetti = useRef<(() => void) | null>(null)

  const clearTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }

  const push = useCallback((item: QueueItem) => {
    setQueue((prev) => enqueueCelebration(prev, item))
  }, [])

  // Advance to the next queued card. Tearing down the current card's confetti +
  // timer here means side-effects never leak across cards.
  const advance = useCallback(() => {
    clearTimer()
    cancelConfetti.current?.()
    cancelConfetti.current = null
    setQueue((prev) => advanceCelebration(prev))
  }, [])

  const head = queue.head

  // Fire the head card's side-effects exactly once, when it reaches the head.
  // Keyed on seq so promoting the next card re-runs this cleanly.
  useEffect(() => {
    if (!head) return
    if (head.type === 'celebration') {
      if (head.confetti) {
        cancelConfetti.current = fireConfetti({
          colors: [head.accent, '#FFD166', '#16E08A', '#38B6FF', '#8B5CF6', '#FFFFFF'],
        })
      }
      if (head.haptic) hapticCelebrate()
      if (head.autoDismissMs > 0) {
        dismissTimer.current = setTimeout(() => advance(), head.autoDismissMs)
      }
    }
    return () => {
      clearTimer()
      cancelConfetti.current?.()
      cancelConfetti.current = null
    }
    // Only the identity of the head card matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head?.seq])

  const celebrate = useCallback(
    (kind: CelebrationKind, opts: CelebrateOptions = {}) => {
      const def = KIND_DEFAULTS[kind]
      const accent = opts.accent ?? def.accent
      const payload: CelebrationPayload = {
        kind,
        kicker: opts.kicker ?? (de ? 'GESCHAFFT' : 'ACHIEVED'),
        value: opts.value,
        unit: opts.unit,
        detail: opts.detail,
        rarity: opts.rarity,
        accent,
        icon: opts.icon ?? def.icon,
        onShare: opts.onShare,
        shareLabel: opts.shareLabel ?? (de ? 'Teilen' : 'Share'),
        dismissLabel: opts.dismissLabel ?? (de ? 'Weiter' : 'Continue'),
      }
      // Reduced-motion users get a shorter auto-advance so they're never stuck
      // tapping through a queue of static cards.
      const autoDismissMs =
        opts.autoDismissMs ?? (prefersReducedMotion() ? 3200 : 5200)
      push({
        seq: seqRef.current++,
        priority: celebrationPriority(kind),
        type: 'celebration',
        payload,
        confetti: opts.confetti !== false,
        haptic: opts.haptic !== false,
        autoDismissMs,
        accent,
      })
    },
    [de, push],
  )

  const celebrateOnce = useCallback(
    (dedupKey: string, kind: CelebrationKind, opts?: CelebrateOptions) => {
      if (hasCelebrated(dedupKey)) return
      markCelebrated(dedupKey)
      celebrate(kind, opts)
    },
    [celebrate],
  )

  const enqueueStreakBreak = useCallback(
    (content: StreakBreakContent) => {
      push({
        seq: seqRef.current++,
        priority: celebrationPriority('break'),
        type: 'break',
        content,
      })
    },
    [push],
  )

  const value = useMemo<CelebrationContextValue>(
    () => ({ celebrate, celebrateOnce, enqueueStreakBreak }),
    [celebrate, celebrateOnce, enqueueStreakBreak],
  )

  // Dev-only imperative hook so the queue can be exercised from the console
  // (e.g. fire three cards at once to see them play in sequence). Stripped in
  // production builds by the DEV guard — never a shipping surface.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __celebration?: unknown }).__celebration = value
    return () => {
      delete (window as unknown as { __celebration?: unknown }).__celebration
    }
  }, [value])

  // A "2/3" progress chip is only meaningful once a run holds more than one card.
  const progress =
    queue.total > 1 ? { index: queue.index, total: queue.total } : undefined

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <CelebrationTriggers />
      {/* One overlay slot, `mode="wait"` so card N fully exits before card N+1
          enters — a natural inter-card gap, and celebration + break can never
          overlap because only the head ever renders. */}
      <Suspense fallback={null}>
      <AnimatePresence mode="wait">
        {head && head.type === 'celebration' && (
          <CelebrationOverlay
            key={`celebration-${head.seq}`}
            payload={head.payload}
            progress={progress}
            onClose={advance}
          />
        )}
        {head && head.type === 'break' && (
          <StreakBreakOverlay
            key={`streak-break-${head.seq}`}
            content={{
              ...head.content,
              // The break's CTA runs its own action (navigate) then drains the
              // queue so any remaining cards still play.
              onCta: () => {
                head.content.onCta()
                advance()
              },
            }}
            progress={progress}
            onClose={advance}
          />
        )}
      </AnimatePresence>
      </Suspense>
    </CelebrationContext.Provider>
  )
}

export function useCelebrate(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext)
  if (!ctx) {
    // Tolerant no-op outside the provider (e.g. isolated component tests) so a
    // missing provider never crashes a feature surface.
    return { celebrate: () => {}, celebrateOnce: () => {}, enqueueStreakBreak: () => {} }
  }
  return ctx
}
