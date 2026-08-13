import { motion, useReducedMotion } from 'motion/react'
import { User, Bike, HardHat, Plus, Loader2, Check, RefreshCw, Sparkles } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding — Rider studio. The rider uploads three real photos (self,
 * bike, helmet); the cyclr_studio pipeline composes ONE W3 collectible rider
 * (them, on their bike, wearing their helmet). Pure function of props — the
 * Page owns file state, the compose call, and navigation.
 */

export type RiderSlot = 'self' | 'bike' | 'helmet'
export type RiderPhase = 'pick' | 'generating' | 'result' | 'unavailable'

const SLOTS: { key: RiderSlot; label: string; hint: string; icon: typeof User }[] = [
  { key: 'self', label: 'You', hint: 'A clear face photo', icon: User },
  { key: 'bike', label: 'Your bike', hint: 'Side-on works best', icon: Bike },
  { key: 'helmet', label: 'Your helmet', hint: 'Any angle', icon: HardHat },
]

export interface W3OnboardRiderProps {
  thumbs: Record<RiderSlot, string | null>
  phase: RiderPhase
  resultImage: string | null
  onPick: (slot: RiderSlot) => void
  onCreate: () => void
  onAccept: () => void
  onRetry: () => void
  onSkip: () => void
}

export default function W3OnboardRiderView(p: W3OnboardRiderProps) {
  const reduce = useReducedMotion()
  const ready = SLOTS.every((s) => p.thumbs[s.key])

  return (
    <div className="w3-root">
      <div style={{ position: 'relative', fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3OnboardTopBar onSkip={p.onSkip} />

        {/* Result state — the composed rider */}
        {p.phase === 'result' && p.resultImage ? (
          <>
            <div style={{ ...band(10), gap: 10, paddingTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.acid }}>YOUR RIDER</span>
              <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1, color: T.ink }}>Meet <span style={{ color: T.acid }}>you.</span></h1>
            </div>
            <div style={{ ...band(20), alignItems: 'center' }}>
              <motion.img
                src={p.resultImage} alt="Your rider"
                initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: EASE }}
                style={{ width: '100%', borderRadius: 28, background: T.surface, border: `1px solid ${T.stroke}` }} />
            </div>
            <div style={{ ...band(28), marginTop: 'auto', gap: 10 }}>
              <W3OnboardCta label="This is my rider" onClick={p.onAccept} icon={<Check size={18} />} />
              <button onClick={p.onRetry} style={{ height: 46, background: 'transparent', border: 0, color: T.mid, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 7, justifyContent: 'center', alignItems: 'center' }}>
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Pitch */}
            <div style={{ ...band(22), gap: 12, paddingTop: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: T.acid }}>BRING YOURSELF IN</span>
              <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1.02, color: T.ink }}>
                Your photo, your bike,<br />your helmet — <span style={{ color: T.acid }}>your rider.</span>
              </h1>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
                We sculpt the three into one collectible rider that grows with you.
              </p>
            </div>

            {/* Three upload slots */}
            <div style={{ ...band(24), gap: 12 }}>
              {SLOTS.map((s) => {
                const thumb = p.thumbs[s.key]
                const Ic = s.icon
                return (
                  <button key={s.key} onClick={() => p.onPick(s.key)} disabled={p.phase === 'generating'}
                    style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 14, borderRadius: 20, background: T.surface, border: `1px solid ${thumb ? T.acid : T.stroke}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, flex: 'none', overflow: 'hidden', background: T.surface2, display: 'grid', placeItems: 'center', position: 'relative' }}>
                      {thumb
                        ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Ic size={26} color={T.quiet} />}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{s.label}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>{thumb ? 'Tap to change' : s.hint}</span>
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 100, flex: 'none', display: 'grid', placeItems: 'center', background: thumb ? T.acid : T.surface2 }}>
                      {thumb ? <Check size={16} color={T.bg} /> : <Plus size={16} color={T.mid} />}
                    </div>
                  </button>
                )
              })}
            </div>

            {p.phase === 'unavailable' && (
              <div style={{ ...band(16) }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.warn, lineHeight: 1.4 }}>The rider studio isn’t available right now. You can add your photo later from your profile.</span>
              </div>
            )}

            {/* Create CTA */}
            <div style={{ ...band(28), marginTop: 'auto', gap: 14 }}>
              <W3OnboardDots step={1} total={5} />
              {p.phase === 'generating' ? (
                <div style={{ height: 56, borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}`, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                  <Loader2 size={18} color={T.acid} className="w3-spin" />
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.acid }}>Sculpting your rider…</span>
                </div>
              ) : (
                <button onClick={p.onCreate} disabled={!ready}
                  style={{ height: 56, borderRadius: 100, border: 0, background: ready ? T.acid : T.surface2, color: ready ? T.bg : T.quiet, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: ready ? 'pointer' : 'default', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
                  <Sparkles size={18} /> Create my rider
                </button>
              )}
              <button onClick={p.onSkip} style={{ height: 40, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Skip for now</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
