import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * ScrollToTop — resets scroll to the top on every route change.
 *
 * SPAs keep the previous page's scroll offset when you navigate, so a link
 * from a scrolled-down page can land the next page in the middle. This mounts
 * once inside the router and, on each pathname change, scrolls back to the top.
 * The app scrolls the window/document (DashboardShell's <main> has no inner
 * overflow); we also nudge documentElement/body defensively. useLayoutEffect
 * runs before paint so there's no visible jump. Hash links (#anchor) are left
 * alone so in-page anchors still work.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (hash) return
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    if (document.body) document.body.scrollTop = 0
  }, [pathname, hash])
  return null
}
