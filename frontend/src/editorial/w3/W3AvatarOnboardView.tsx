import { motion, useReducedMotion } from 'motion/react'
import { Camera, Sparkles, Mountain, Users, Trophy, ArrowRight, ArrowLeft, Bike, Loader2, Route as RouteIcon, Timer, Plus, BadgeCheck, Gauge, Flame, Globe } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import './w3.css'

/**
 * W3 · Avatar onboarding + "AVATAR UNLOCKED" reveal (pen `lQimK`, reworked).
 *
 * The LLM pipeline (`/garage/asset/render` kind:'rider') turns the photo into
 * the collectible figurine; the reveal shows it with the rider's REAL lifetime
 * stats, a real LEVEL (everyone starts at 1, grows with lifetime riding) with
 * its progress bar, a ShareCard-style handle chip, and dopamine insight tiles
 * that contextualise the raw numbers ("≈ 7× Mount Everest", "12% um die Erde").
 */

export type AvatarStage = 'intro' | 'generating' | 'revealed'
export type InsightKey = 'elevation' | 'longest' | 'speed' | 'burned'
export interface AvatarInsight { key: InsightKey; label: string; value: string; caption: string }
export interface AvatarReveal {
  avatarUrl: string | null
  handle: string
  role: string
  level: number
  levelPct: number          // 0..1 progress to the next level
  xpNote: string            // "120 XP bis Level 13"
  headline: string          // "4.812 km — 12 % um die Erde"
  primary: { totalDistance: string; totalRides: string; saddleTime: string }
  secondary: AvatarInsight[]
  syncNote: string
}
export interface W3AvatarOnboardProps {
  heroImageUrl: string | null
  stage?: AvatarStage
  reveal?: AvatarReveal
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

const PRIMARY = [
  { icon: RouteIcon, label: 'TOTAL DISTANCE', key: 'totalDistance' as const },
  { icon: Bike, label: 'TOTAL RIDES', key: 'totalRides' as const },
  { icon: Timer, label: 'SADDLE TIME', key: 'saddleTime' as const },
]
const INSIGHT_META: Record<InsightKey, { icon: typeof Mountain; hue: string }> = {
  elevation: { icon: Mountain, hue: '#7B5CFF' },
  longest: { icon: RouteIcon, hue: '#00E5FF' },
  speed: { icon: Gauge, hue: '#2BE68F' },
  burned: { icon: Flame, hue: '#FFB020' },
}

export default function W3AvatarOnboardView({ heroImageUrl, stage = 'intro', reveal, onPick, onSkip, onTake }: W3AvatarOnboardProps) {
  const reduce = useReducedMotion()

  // ── Reveal: "AVATAR UNLOCKED" ──
  if (stage === 'revealed' && reveal) {
    const r = reveal
    const initial = r.handle.replace('@', '').charAt(0).toUpperCase() || '?'
    return (
      <div className="w3-root">
        <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

          {/* Cover: rider + header + confetti */}
          <div style={{ position: 'relative', height: 400, background: '#141414', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', width: 340, height: 300, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}33, transparent)` }} />
            {['#C8FF00', '#7B5CFF', '#00E5FF', '#FFB020', '#C8FF00', '#7B5CFF'].map((c, i) => (
              <motion.div key={i} initial={reduce ? false : { y: -20, opacity: 0 }} animate={{ y: [-20, 400], opacity: [0, 1, 0], rotate: [0, 180] }} transition={{ duration: 2.4, delay: i * 0.13, repeat: Infinity, repeatDelay: 0.8 }}
                style={{ position: 'absolute', top: 0, left: `${12 + i * 14}%`, width: 6, height: 12, borderRadius: 2, background: c }} />
            ))}
            {heroImageUrl && <img src={heroImageUrl} alt="Dein Rider" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 24%' }} />}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
            <div style={{ position: 'absolute', top: 12, left: 0, right: 0, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={onPick} aria-label="Neues Foto" style={{ width: 44, height: 44, borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={20} color={T.ink} /></button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '8px 12px', borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 100, background: '#0B0B0B', border: `1px solid ${T.d3}` }} />
                  <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.8, color: T.quiet }}>BASIC BLACK</span>
                </div>
                <div style={{ width: 34, height: 34, borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center' }}><Plus size={15} color={T.acid} /></div>
              </div>
            </div>
          </div>

          {/* Bottom panel */}
          <div style={{ ...band(30), paddingTop: 0, marginTop: -18, gap: 14, alignItems: 'center', position: 'relative', zIndex: 2 }}>
            <motion.div initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
              style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '8px 15px', borderRadius: 100, background: T.acid, boxShadow: `0 0 24px ${T.acid}88` }}>
              <Sparkles size={14} color="#121212" /><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#121212' }}>AVATAR UNLOCKED</span>
            </motion.div>

            {/* Handle chip — ShareCard style: avatar + @handle + role */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: 100, overflow: 'hidden', background: T.surface2, border: `2px solid ${T.acid}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                {r.avatarUrl ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18, fontWeight: 700, color: T.mid }}>{initial}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{r.handle}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>{r.role}</span>
              </div>
            </div>

            {/* Level bar — real level system, starts at 1 */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', borderRadius: 18, background: `linear-gradient(180deg, ${T.acid}14, ${T.surface})`, border: `1px solid ${T.acid}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: T.acid }}>LEVEL {r.level}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{r.xpNote}</span>
              </div>
              <div style={{ height: 8, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
                <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(r.levelPct * 100)}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
                  style={{ height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.acidDeep}, ${T.acid})`, boxShadow: `0 0 10px ${T.acid}88` }} />
              </div>
            </div>

            {/* Headline insight */}
            {r.headline && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'stretch', padding: '10px 14px', borderRadius: 14, background: T.surface }}>
                <Globe size={15} color={T.acid} /><span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>{r.headline}</span>
              </div>
            )}

            {/* Stats primary — 3 cells */}
            <div style={{ display: 'flex', width: '100%', borderRadius: 20, background: T.surface, border: `1px solid ${T.stroke}`, overflow: 'hidden' }}>
              {PRIMARY.map((p, i) => {
                const Ic = p.icon
                const v = r.primary[p.key]
                return (
                  <div key={p.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, padding: '16px 8px', alignItems: 'flex-start', borderLeft: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                    <Ic size={22} color={T.acid} />
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.6, color: T.quiet }}>{p.label}</span>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: v === '—' ? T.quiet : T.ink }}>{v}</span>
                  </div>
                )
              })}
            </div>

            {/* Secondary — dopamine insight tiles (2×2) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
              {r.secondary.map((t) => {
                const meta = INSIGHT_META[t.key]; const Ic = meta.icon
                return (
                  <div key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 18, background: `linear-gradient(180deg, ${meta.hue}12, ${T.surface})`, border: `1px solid ${meta.hue}2E` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 10, background: `${meta.hue}22`, display: 'grid', placeItems: 'center' }}><Ic size={15} color={meta.hue} /></div>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: T.quiet }}>{t.label}</span>
                    </div>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: t.value === '—' ? T.quiet : T.ink }}>{t.value}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.3, color: meta.hue }}>{t.caption}</span>
                  </div>
                )
              })}
            </div>

            <button onClick={onTake} style={{ width: '100%', height: 56, borderRadius: 100, border: 0, background: T.acid, color: '#0B0B0B', fontFamily: FONT, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
              Take it<ArrowRight size={18} color="#0B0B0B" />
            </button>

            {r.syncNote && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <BadgeCheck size={18} color={T.acid} />
                <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{r.syncNote}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const generating = stage === 'generating'
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

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
            {REASONS.map((rr, i) => {
              const Ic = rr.icon
              return (
                <motion.div key={rr.title} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.12 + i * 0.07 }}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 16, background: T.surface, border: `1px solid ${T.rule}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}><Ic size={16} color={T.acid} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{rr.title}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{rr.body}</span>
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
