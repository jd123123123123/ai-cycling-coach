/**
 * CelebrationContext — the app-wide "micro-dopamine" reward engine.
 *
 * Mounted once high in the tree (App.tsx). Exposes an imperative `celebrate`
 * API plus `celebrateOnce` (localStorage-deduped, so a real achievement fires
 * exactly once, ever). Renders a single full-screen CelebrationOverlay and
 * fires the CSP-safe canvas confetti + optional haptic. A sibling
 * <CelebrationTriggers/> watches global signals (streak, weekly rhythm) so most
 * celebrations need zero changes to feature code.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { AnimatePresence } from 'motion/react'
import { Zap, Flame, Target, TrendingUp, Trophy, type LucideProps } from 'lucide-react'
import CelebrationOverlay, {
  type CelebrationKind,
  type CelebrationPayload,
} from '../components/celebration/CelebrationOverlay'
import CelebrationTriggers from '../components/celebration/CelebrationTriggers'
import { fireConfetti } from '../lib/confetti'
import { hapticCelebrate } from '../lib/haptics'
import { hasCelebrated, markCelebrated } from '../lib/celebration'
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
  /** Auto-dismiss after N ms. Default 5200. Pass 0 to disable. */
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

interface CelebrationContextValue {
  /** Fire a celebration now (no dedup — caller owns gating). */
  celebrate: (kind: CelebrationKind, opts?: CelebrateOptions) => void
  /** Fire once ever for `dedupKey`; a re-render/revisit with the same key no-ops. */
  celebrateOnce: (dedupKey: string, kind: CelebrationKind, opts?: CelebrateOptions) => void
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null)

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [payload, setPayload] = useState<CelebrationPayload | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelConfetti = useRef<(() => void) | null>(null)

  const clearTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }

  const close = useCallback(() => {
    clearTimer()
    cancelConfetti.current?.()
    cancelConfetti.current = null
    setPayload(null)
  }, [])

  const celebrate = useCallback(
    (kind: CelebrationKind, opts: CelebrateOptions = {}) => {
      const def = KIND_DEFAULTS[kind]
      const accent = opts.accent ?? def.accent
      const full: CelebrationPayload = {
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

      clearTimer()
      cancelConfetti.current?.()
      setPayload(full)

      if (opts.confetti !== false) {
        cancelConfetti.current = fireConfetti({
          colors: [accent, '#FFD166', '#16E08A', '#38B6FF', '#8B5CF6', '#FFFFFF'],
        })
      }
      if (opts.haptic !== false) hapticCelebrate()

      const ms = opts.autoDismissMs ?? 5200
      if (ms > 0) {
        dismissTimer.current = setTimeout(() => close(), ms)
      }
    },
    [de, close],
  )

  const celebrateOnce = useCallback(
    (dedupKey: string, kind: CelebrationKind, opts?: CelebrateOptions) => {
      if (hasCelebrated(dedupKey)) return
      markCelebrated(dedupKey)
      celebrate(kind, opts)
    },
    [celebrate],
  )

  const value = useMemo<CelebrationContextValue>(
    () => ({ celebrate, celebrateOnce }),
    [celebrate, celebrateOnce],
  )

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <CelebrationTriggers />
      <AnimatePresence>
        {payload && <CelebrationOverlay key="celebration" payload={payload} onClose={close} />}
      </AnimatePresence>
    </CelebrationContext.Provider>
  )
}

export function useCelebrate(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext)
  if (!ctx) {
    // Tolerant no-op outside the provider (e.g. isolated component tests) so a
    // missing provider never crashes a feature surface.
    return { celebrate: () => {}, celebrateOnce: () => {} }
  }
  return ctx
}
