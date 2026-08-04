import type { ReactNode } from 'react'
import MobileBottomNav from '../dashboard/MobileBottomNav'
import PageHeader from './PageHeader'

/**
 * AppShell — the frame every page shares.
 *
 * ── Why this is not DashboardShell ───────────────────────────────────────
 * DashboardShell looks like the universal shell but cannot be one. It owns
 * TodayRoad, RoadHud, AuraContext and a delegated pointer-scrub listener on
 * <main>, and it carries an UNENFORCED invariant that no card inside it may
 * paint its surface with a Tailwind `bg-*` class — a card that violates it has
 * its taps silently swallowed by the shell's pointer capture. That machinery is
 * correct for Today and actively hostile to the other 29 pages, so mounting
 * them on it would be a bug farm.
 *
 * AppShell is the thin part: the gutter, the nav, and an optional header. It
 * carries no gesture handling, so it imposes no invariant on its children.
 *
 * ── Why the layout constants are copied, not invented ────────────────────
 * `max-w-md mx-auto px-4 pb-28`, `gap-6` and `paper-grain` are lifted verbatim
 * from DashboardShell's <main>. The whole point of this component is that a
 * page looks identical whether it sits on Today's shell or this one — if these
 * two ever disagree, the app splits back into two designs. Change them
 * together or not at all.
 *
 * `pb-28` clears the fixed nav pill; without it the last card sits under the
 * bar and cannot be scrolled clear of it.
 */
export interface AppShellProps {
  children: ReactNode
  /** Renders a PageHeader above the content. Omit for pages that draw their own. */
  title?: string
  subtitle?: string
  /** Show the header's back chevron. Default true when a title is given. */
  back?: boolean
  onBack?: () => void
  /** Trailing control on the header row. */
  action?: ReactNode
  /**
   * A <Scene>, painted full-bleed behind the content. Sits below <main> in the
   * stacking order — `isolate` on <main> keeps page content above it without
   * either side needing an explicit z-index.
   */
  scene?: ReactNode
  /**
   * Hide the bottom nav. For focused flows (onboarding, a full-screen story)
   * where a nav would offer an exit the flow does not want to advertise.
   */
  nav?: boolean
  /**
   * Pin the header to the top while the content scrolls under it.
   *
   * For long working surfaces where the title and the back affordance stay
   * useful all the way down — the workout builder's block list is the case
   * this exists for. It is opt-in rather than default because a pinned header
   * costs vertical space on every screen, and most pages are read top to
   * bottom once.
   *
   * NOTE: `position: sticky` needs an opaque background or the content shows
   * through as it passes underneath, so this paints `--color-paper` and adds a
   * hairline rule. That is also why it cannot simply be a class on PageHeader:
   * the background belongs to the shell, not to the title block.
   */
  stickyHeader?: boolean
}

export default function AppShell({
  children,
  title,
  subtitle,
  back = true,
  onBack,
  action,
  scene,
  nav = true,
  stickyHeader = false,
}: AppShellProps) {
  return (
    <div className="relative min-h-dvh">
      {/*
        A backdrop is a HORIZON, not a wallpaper. Painted full-bleed across the
        whole viewport it tints every card on the page and the surface goes
        muddy — verified at 390×844, which is why this is a top band that fades
        into the page background rather than `inset-0`. The mask does the fade
        in both directions (WebKit prefix for iOS Safari, which is the target).
      */}
      {scene && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          aria-hidden
          style={{
            height: 320,
            maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
          }}
        >
          {scene}
        </div>
      )}

      <main className="paper-grain relative isolate mx-auto flex min-w-0 max-w-md flex-col gap-6 px-4 pb-28 pt-3">
        {title && (
          <div
            style={
              stickyHeader
                ? {
                    position: 'sticky',
                    // Clears the notch on iOS; 0 everywhere else.
                    top: 'env(safe-area-inset-top, 0px)',
                    zIndex: 5,
                    // Opaque, or the scrolling content shows through the title.
                    background: 'var(--color-paper)',
                    // The gutter is on <main>, so a sticky child has to reclaim
                    // it to paint edge to edge instead of leaving 16 px strips
                    // of scrolling content either side of the header.
                    marginLeft: -16,
                    marginRight: -16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 8,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--color-rule)',
                  }
                : undefined
            }
          >
            <PageHeader
              title={title}
              subtitle={subtitle}
              back={back}
              onBack={onBack}
              action={action}
            />
          </div>
        )}
        {children}
      </main>

      {nav && <MobileBottomNav />}
    </div>
  )
}
