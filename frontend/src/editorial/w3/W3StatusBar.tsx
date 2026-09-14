/**
 * Top safe-area breathing room for a W3 screen. The real device chrome (clock,
 * signal, battery) is drawn by the OS — the app must never fake it, so this is
 * only the safe-area inset, not a mock "9:41 · wifi" status bar.
 * Standalone body already owns that inset; index.css then makes this zero.
 * The header supplies its own 6px breathing room.
 */
export default function W3StatusBar() {
  return <div data-w3-status-space style={{ height: 'var(--w3-header-safe-top, env(safe-area-inset-top, 0px))', flexShrink: 0 }} aria-hidden />
}
