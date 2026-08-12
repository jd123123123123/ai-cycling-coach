/**
 * Top safe-area breathing room for a W3 screen. The real device chrome (clock,
 * signal, battery) is drawn by the OS — the app must never fake it, so this is
 * just a small spacer, not a mock "9:41 · wifi" status bar.
 */
export default function W3StatusBar() {
  return <div style={{ height: 'max(12px, env(safe-area-inset-top))' }} aria-hidden />
}
