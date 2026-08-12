import { motion, useReducedMotion } from 'motion/react'
import { Camera, Sparkles, Mountain, Users, Trophy, ArrowRight, Bike } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import './w3.css'

/**
 * W3 · Avatar onboarding — full-bleed rider hero with a content card floating
 * slightly over it (the Today-page bike-hero pattern), W3-native: dark, acid
 * accent, no purple. Sells the payoff so the rider WANTS to add a photo.
 */

export interface W3AvatarOnboardProps {
  heroImageUrl: string | null   // full-bleed collectible hero (null → placeholder)
  onPick: () => void
  onSkip: () => void
}

const REASONS: { icon: typeof Mountain; title: string; body: string }[] = [
  { icon: Bike, title: 'You, on your own bike', body: 'Your real bike, restyled as a collectible you ride in every scene.' },
  { icon: Mountain, title: 'Every ride becomes a scene', body: 'Nail a threshold set and your rider is out there, hammering a climb.' },
  { icon: Users, title: 'Your crew sees the real you', body: 'A rider that’s unmistakably yours on every leaderboard and challenge.' },
  { icon: Trophy, title: 'It grows with your training', body: 'Earn parts and looks as your fitness climbs. It’s yours to build.' },
]

export default function W3AvatarOnboardView({ heroImageUrl, onPick, onSkip }: W3AvatarOnboardProps) {
  const reduce = useReducedMotion()

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* ── Cover image (full-body figurine) ── */}
        <div style={{ position: 'relative', height: 460, background: '#232427', overflow: 'hidden' }}>
          {heroImageUrl
            ? <img src={heroImageUrl} alt="Your collectible rider" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.quiet }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <Bike size={72} strokeWidth={1.2} color="#3A3A3A" /><span style={{ fontSize: 12, fontWeight: 600 }}>Your rider goes here</span>
                </div>
              </div>}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>9:41</div>
          {/* bottom scrim → the card reads as part of the cover */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 160, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

        {/* ── Combined card: overlaps the cover and holds the headline
            (the W3 · 06 SESSION DETAIL cover+card pattern) ── */}
        <div style={{ ...band(4), paddingTop: 0, marginTop: -78, position: 'relative', zIndex: 2 }}>
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
            style={{ width: '100%', padding: '18px 18px 20px', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start', padding: '5px 11px', borderRadius: 100, background: T.acidDim }}>
              <Sparkles size={11} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>ONE LAST THING</span>
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>Bring yourself into it</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
              Add one photo and we turn you into a cute collectible rider — the face of every ride you do.
            </span>
          </motion.div>
        </div>

        {/* reasons */}
        <div>
          <div style={{ ...band(10), gap: 8, paddingTop: 16 }}>
            {REASONS.map((r, i) => {
              const Ic = r.icon
              return (
                <motion.div key={r.title} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.12 + i * 0.07 }}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 16, background: T.surface, border: `1px solid ${T.rule}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Ic size={16} color={T.acid} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{r.title}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{r.body}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* CTA */}
          <div style={{ ...band(38), paddingTop: 6, marginTop: 'auto' }}>
            <button onClick={onPick} style={{ height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Camera size={19} color={T.bg} />Add your photo
            </button>
            <button onClick={onSkip} style={{ height: 46, marginTop: 8, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
              Maybe later<ArrowRight size={14} color={T.quiet} />
            </button>
            <span style={{ display: 'block', textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: T.quiet, marginTop: 8, lineHeight: 1.4 }}>
              Your photo is used once to create your avatar, then discarded. Never shared.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
