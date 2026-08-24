/**
 * The app's ONE loading treatment — the branded wait state.
 *
 * The Ridr mark drawing itself on its lime tile, over a softly pulsing acid
 * bloom on the same near-black ground as every screen. Used for:
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
 * spinner. The bloom's keyframes are a literal transcription of the motion
 * variants this replaced; `prefers-reduced-motion` is honoured by the
 * stylesheet rather than by a hook.
 *
 * `RidrMarkAnimated` is held to the same budget and passes it for a different
 * reason: it carries no runtime at all. It is ~4 kB of shader source and a
 * hundred lines of raw WebGL setup, it falls back to the still mark wherever a
 * GL context is refused, and it honours reduced motion by rendering the last
 * frame of the loop — the finished R — rather than by animating slower.
 *
 * Colours are the W3 tokens (editorial/w3/w3tokens.tsx) written out, because
 * nothing outside editorial/ may import them. That copying is why the acid was
 * wrong: this file said `#C8FF00`, which is the ORIGINAL editorial palette's
 * acid (`--e-acid` in tokens.css), not W3's `#BFFF3C`. Every W3 screen — the
 * whole sign-up journey included — bloomed in the previous design language's
 * lime for as long as the chunk took to arrive, which is the first thing a new
 * rider ever sees. If these drift again, `w3tokens.tsx` is the truth.
 */

import RidrMarkAnimated from './RidrMarkAnimated'

const BG = '#0B0B0B'
const ACID = '#BFFF3C'
const QUIET = '#6E7379'
const FONT = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'

export default function AppLoading({ label }: { label?: string }) {
  return (
    <div
      style={{
        width: 390, maxWidth: '100%', margin: '0 auto', minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 22, background: BG, fontFamily: FONT,
      }}
    >
      {/* ── THE MARK DRAWS ITSELF ──────────────────────────────────────
           A spinning arc around a ✱ was a spinner wearing a logo's clothes: it
           said "waiting" and nothing else, and it was the first thing every
           cold start showed. The mark's own animation says the same thing —
           it takes time, and you watch it resolve — while being the app
           introducing itself rather than a progress indicator.

           The bloom stays, knocked back behind the tile: it is what keeps the
           lime square from reading as a sticker on a black page. Its glow is
           the app's acid rather than the logo's lime on purpose, because it is
           the ROOM's light falling on the mark, not part of the mark. ── */}
      <div style={{ position: 'relative', width: 132, height: 132, display: 'grid', placeItems: 'center' }}>
        <div
          className="app-loading-bloom"
          style={{
            position: 'absolute', width: 108, height: 108, borderRadius: 100,
            background: ACID, filter: 'blur(30px)', opacity: 0.5,
          }}
        />
        <RidrMarkAnimated size={112} />
      </div>
      {label && (
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: QUIET }}>{label}</span>
      )}
    </div>
  )
}
