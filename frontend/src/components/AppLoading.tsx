/**
 * The app's ONE loading treatment — the branded W3 wait state.
 *
 * A softly pulsing acid bloom behind the W3 mark, over the same near-black
 * ground as every screen. Used for:
 *   · the cold first paint (App's <Suspense> fallback),
 *   · the auth / onboarding resolve in <ProtectedRoute>,
 *   · any page whose first data read has not landed yet.
 * There is deliberately no second variant: the old light-themed "Coach" splash
 * and the light-themed ProtectedRoute spinner both flashed white inside a black
 * app, and were deleted.
 *
 * ── Why this lives in components/ and not editorial/w3/ ────────────────────
 * `editorial/__tests__/isolation.test.ts` enforces a one-way dependency: only
 * App.tsx may import from editorial/. <ProtectedRoute> is outside editorial/,
 * so the shared implementation has to live here. `editorial/w3/W3Loading.tsx`
 * re-exports this file, which keeps the W3 call sites reading in their own
 * language while there is still exactly one component.
 *
 * ── Why CSS keyframes and not motion/react ────────────────────────────────
 * This renders precisely when things are slow, and it is reachable from the
 * ENTRY chunk (ProtectedRoute is eagerly imported). Pulling motion/react in
 * would put ~120 kB of animation runtime in front of the first paint to draw a
 * spinner. The keyframes below are a literal transcription of the motion
 * variants this replaced, so the design is unchanged; `prefers-reduced-motion`
 * is honoured by the stylesheet rather than by a hook.
 *
 * Colours are the W3 tokens (editorial/w3/w3tokens.tsx) written out, because
 * nothing outside editorial/ may import them. That copying is why the acid was
 * wrong: this file said `#C8FF00`, which is the ORIGINAL editorial palette's
 * acid (`--e-acid` in tokens.css), not W3's `#BFFF3C`. Every W3 screen — the
 * whole sign-up journey included — bloomed in the previous design language's
 * lime for as long as the chunk took to arrive, which is the first thing a new
 * rider ever sees. If these drift again, `w3tokens.tsx` is the truth.
 */

const BG = '#0B0B0B'
const ACID = '#BFFF3C'
const RULE = '#FFFFFF14'
const QUIET = '#6E7379'
const FONT = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'

import RidrMark from './RidrMark'

export default function AppLoading({ label }: { label?: string }) {
  return (
    <div
      style={{
        width: 390, maxWidth: '100%', margin: '0 auto', minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 22, background: BG, fontFamily: FONT,
      }}
    >
      <div style={{ position: 'relative', width: 76, height: 76, display: 'grid', placeItems: 'center' }}>
        {/* pulsing bloom */}
        <div
          className="app-loading-bloom"
          style={{ position: 'absolute', width: 76, height: 76, borderRadius: 100, background: ACID, filter: 'blur(20px)' }}
        />
        {/* spinning arc */}
        <svg className="app-loading-arc" width={76} height={76} viewBox="0 0 76 76" style={{ position: 'absolute' }}>
          <circle cx={38} cy={38} r={32} fill="none" stroke={RULE} strokeWidth={4} />
          <path d="M38 6 a32 32 0 0 1 32 32" fill="none" stroke={ACID} strokeWidth={4} strokeLinecap="round" />
        </svg>
        {/* the mark — the real one now. The ✱ that stood here was a stand-in
            from before the app had a logo, and it was the first thing every
            cold start showed. */}
        <span className="app-loading-mark" style={{ display: 'grid', placeItems: 'center' }}>
          <RidrMark size={34} color={ACID} />
        </span>
      </div>
      {label && (
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: QUIET }}>{label}</span>
      )}
    </div>
  )
}
