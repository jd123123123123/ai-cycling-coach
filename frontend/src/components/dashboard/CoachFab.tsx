/**
 * CoachFab — always-visible floating button that opens the AI coach chat.
 *
 * The coach was previously only reachable via the Cmd+K command palette
 * (desktop keyboard) — so on mobile, once the day's session card was gone
 * (e.g. after training) there was no way in. This sits above the bottom nav,
 * bottom-right, on every dashboard surface.
 */
import { Sparkles } from 'lucide-react'
import { useLocale } from '../../contexts/LocaleContext'

export default function CoachFab({ onOpen }: { onOpen: () => void }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={de ? 'KI-Coach fragen' : 'Ask the AI coach'}
      title={de ? 'KI-Coach fragen' : 'Ask the AI coach'}
      className="fixed z-40 inline-flex items-center justify-center rounded-full active:scale-95 transition-transform lg:hidden"
      style={{
        right: 16,
        // Sit clear above the floating bottom-nav pill (+ the iOS safe area).
        bottom: 'calc(env(safe-area-inset-bottom) + 84px)',
        width: 52,
        height: 52,
        background: 'var(--color-accent)',
        color: '#0A0C0F',
        boxShadow: '0 8px 24px -4px color-mix(in srgb, var(--color-accent) 55%, transparent)',
      }}
    >
      <Sparkles size={22} strokeWidth={2.4} />
    </button>
  )
}
