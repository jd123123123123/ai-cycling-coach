import { motion, useReducedMotion } from 'motion/react'
import { Camera, Sparkles, Mountain, Users, Trophy, ArrowRight, Bike, Loader2, Check } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import './w3.css'

/**
 * W3 · Avatar onboarding — full-bleed rider hero + payoff card. When the rider
 * adds a photo, the LLM pipeline (`/garage/asset/render` kind:'rider', backed by
 * `services/cyclr_studio`) turns it into the collectible figurine; the view
 * moves photo → `generating` → `revealed` ("AVATAR UNLOCKED"). If the image
 * model isn't provisioned the page falls back to the raw photo and still
 * reveals, so onboarding never dead-ends.
 */

export type AvatarStage = 'intro' | 'generating' | 'revealed'
export interface W3AvatarOnboardProps {
  heroImageUrl: string | null
  stage?: AvatarStage
  handle?: string
  onPick: () => void
  onSkip: () => void
  onTake?: () => void
}

const REASONS: { icon: typeof Mountain; title: string; body: string }[] = [
  { icon: Bike, title: 'You, on your own bike', body: 'Your real bike, restyled as a collectible you ride in every scene.' },
  { icon: Mountain, title: 'Every ride becomes a scene', body: 'Nail a threshold set and your rider is out there, hammering a climb.' },
  { icon: Users, title: 'Your crew sees the real you', body: 'A rider that’s unmistakably yours on every leaderboard and challenge.' },
  { icon: Trophy, title: 'It grows with your training', body: 'Earn parts and looks as your fitness climbs. It’s yours to build.' },
]

export default function W3AvatarOnboardView({ heroImageUrl, stage = 'intro', handle = '@rider', onPick, onSkip, onTake }: W3AvatarOnboardProps) {
  const reduce = useReducedMotion()

  // ── Reveal: "AVATAR UNLOCKED" (pen lQimK) ──
  if (stage === 'revealed') {
    return (
      <div className="w3-root">
        <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
          <div style={{ position: 'relative', height: 480, background: '#141414', overflow: 'hidden' }}>
            {/* acid bloom + confetti */}
            <div style={{ position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)', width: 340, height: 300, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}33, transparent)` }} />
            {['#C8FF00', '#7B5CFF', '#00E5FF', '#FFB020'].map((c, i) => (
              <motion.div key={i} initial={reduce ? false : { y: -20, opacity: 0 }} animate={{ y: [-20, 420], opacity: [0, 1, 0] }} transition={{ duration: 2.2, delay: i * 0.15, repeat: Infinity, repeatDelay: 1 }}
                style={{ position: 'absolute', top: 0, left: `${18 + i * 20}%`, width: 7, height: 12, borderRadius: 2, background: c }} />
            ))}
            {heroImageUrl && <img src={heroImageUrl} alt="Dein Rider" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 28%' }} />}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 160, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
            <motion.div initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
              style={{ position: 'absolute', bottom: 84, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 7, alignItems: 'center', padding: '8px 16px', borderRadius: 100, background: T.acid, boxShadow: `0 0 24px ${T.acid}88` }}>
              <Check size={14} color={T.bg} strokeWidth={3} /><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: T.bg }}>AVATAR UNLOCKED</span>
            </motion.div>
          </div>

          <div style={{ ...band(4), paddingTop: 6, gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: T.ink }}>{handle}</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5, color: T.mid, textAlign: 'center' }}>
              Dein Rider steht in der Garage. Jede Fahrt, die du loggst, levelt ihn weiter.
            </span>
          </div>

          <div style={{ ...band(38), paddingTop: 20, marginTop: 'auto' }}>
            <button onClick={onTake} style={{ height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 0 24px' }}>
              <span>Nehm ich</span>
              <div style={{ width: 40, height: 40, borderRadius: 100, background: T.bg, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.acid} /></div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const generating = stage === 'generating'
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* Cover image */}
        <div style={{ position: 'relative', height: 460, background: '#232427', overflow: 'hidden' }}>
          {heroImageUrl
            ? <img src={heroImageUrl} alt="Your collectible rider" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', filter: generating ? 'brightness(0.55)' : 'none' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.quiet }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <Bike size={72} strokeWidth={1.2} color="#3A3A3A" /><span style={{ fontSize: 12, fontWeight: 600 }}>Your rider goes here</span>
                </div>
              </div>}
          {generating && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><Loader2 size={34} color={T.acid} /></motion.div>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Dein Rider wird erstellt…</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet }}>Cycl_r Studio stylt dein Foto zum Collectible.</span>
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 160, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

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

          <div style={{ ...band(38), paddingTop: 6, marginTop: 'auto' }}>
            <button onClick={onPick} disabled={generating} style={{ height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Camera size={19} color={T.bg} />{generating ? 'Wird erstellt…' : 'Add your photo'}
            </button>
            <button onClick={onSkip} disabled={generating} style={{ height: 46, marginTop: 8, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: generating ? 'default' : 'pointer', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
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
