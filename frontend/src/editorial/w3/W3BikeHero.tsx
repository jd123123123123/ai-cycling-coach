import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Plus, Pencil, Sparkles, UserRound } from 'lucide-react'
import { T, FONT, EASE, DASH, Kicker } from './w3tokens'
import { POSE_LABEL } from './w3Pose'
import W3BikeStage from './W3BikeStage'
import type { BikeLook } from '../../utils/w3bikePaint'
import type { DayPose, SceneStatus } from '../../api/garage'

/**
 * The Today hero — the rider, ON their bike, in the scene today's
 * recommendation calls for — flowing straight into their identity card.
 *
 * Two ideas from the pen frame `GSdj0`: the hero is FULL-BLEED (an object in
 * the world, not a framed square floating on a slab), and it does not end — it
 * dissolves into a dark card carrying the rider's portrait, handle and
 * balances, so hero and identity read as one block.
 *
 * Everything shown is real or absent. The composed scene exists only once the
 * rider has explicitly asked for it (it is a slow paid image-model call, so it
 * is NEVER triggered on mount); until then the hero degrades honestly:
 *
 *   composed scene  →  the bike collectible alone  →  the labelled EXAMPLE bike
 *
 * and the missing halves say what they need: `needs_rider` sends them to the
 * avatar studio, `needs_bike` to the bike studio. Nothing in this file ever
 * fabricates a scene, a bike or a number.
 */

/** Served from `frontend/public/w3/` rather than inlined as base64: it is 54 KB,
 *  every rider without a bike loads it, and as a static file it is cached by the
 *  browser instead of riding inside the JS bundle on every deploy. */
const EXAMPLE_BIKE = '/w3/example-bike.webp'

/** The example bike shown in an empty garage slot — a real drive-side road bike
 *  on white, matching the camera the studio renders at, so the empty state
 *  previews the shape the rider's own collectible will take.
 *
 *  It is deliberately knocked back (dimmed, desaturated, blended into the dark
 *  ground) and always sits under an explicit "example" label. This screen exists
 *  BECAUSE showing a stock bike as "yours" was wrong; an example that announces
 *  itself is the opposite of that, but only while it keeps announcing itself —
 *  never brighten this to look like a real collectible. */
export function GhostBike({ opacity = 0.3 }: { opacity?: number }) {
  return (
    <img src={EXAMPLE_BIKE} alt="" aria-hidden
      style={{
        width: '100%', height: '100%', objectFit: 'contain', display: 'block',
        opacity, filter: 'grayscale(1) brightness(1.6) contrast(0.85)',
        mixBlendMode: 'screen',
      }} />
  )
}

const HERO_H = 320

export interface W3BikeHeroScene {
  /** The composed rider-on-bike image (data URL), or null when none exists. */
  image: string | null
  /** Why there is no image — drives what the hero offers instead. */
  status: SceneStatus
  /** Which pose today asks for; null before the day-state resolves. */
  pose: DayPose | null
}

export interface W3BikeHeroIdentity {
  /** @handle — real, from the account. */
  handle: string
  /** The rider's own digitalised portrait, or null (an empty seat, never a photo
   *  they didn't choose). */
  rider: string | null
  /** RideCoin balance, already localised, or null → "—". */
  coins: string | null
  /** The real forgiving streak in days, or null → "—". */
  streak: number | null
}

export interface W3BikeHeroProps {
  /** The rider's rendered bike collectible (data URL), or null when the garage slot is empty. */
  image: string | null
  /** The collectible's name — the hero's caption and the image's alt text. */
  name: string
  /** True while the garage is still loading, so we show neither state prematurely. */
  loading?: boolean
  /** Today's composed scene, or null while it is still being read. */
  scene: W3BikeHeroScene | null
  /** True while a composition is running (up to ~2 minutes). */
  composing?: boolean
  /** Explicit intent to compose today's scene. Absent → no offer is made. */
  onCompose?: () => void
  identity: W3BikeHeroIdentity
  /**
   * The RideCoin bike the rider owns, as ridden — model plus equipped parts.
   *
   * This is a DIFFERENT bike from `image`: that one is a render of their real
   * machine from a photo they uploaded, this one is the collectible they claimed
   * in onboarding and upgrade with kilometres. Every rider has the second (the
   * first-bike step cannot be skipped), which is why Today no longer has to fall
   * back to an anonymous grey example when the photo slot is empty.
   */
  collectible?: BikeLook | null
  /** The collectible's name, so it can be captioned as the rider's own. */
  collectibleName?: string | null
}

/** One floating circular action, the pen's top-right cluster. */
function HeroAction({ label, onClick, acid, children }: {
  label: string; onClick: () => void; acid?: boolean; children: ReactNode
}) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 42, height: 42, borderRadius: 100, flex: 'none', cursor: 'pointer', fontFamily: FONT,
      display: 'grid', placeItems: 'center',
      background: acid ? T.acid : '#000000A6',
      border: `1px solid ${acid ? T.acid : T.stroke}`,
      boxShadow: acid ? `0 0 26px ${T.acid}4D` : '0 8px 20px #00000066',
      backdropFilter: 'blur(8px)',
    }}>
      {children}
    </button>
  )
}

/** The branded wait, inline. `components/AppLoading` is a full-screen treatment
 *  (100dvh) and cannot live inside the hero, so this reuses its exact language —
 *  the same acid bloom, arc and mark, driven by the same global keyframes, which
 *  already honour `prefers-reduced-motion` in the stylesheet. */
function ComposingScene({ label }: { label: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 40px' }}>
      <div style={{ position: 'relative', width: 76, height: 76, display: 'grid', placeItems: 'center' }}>
        <div className="app-loading-bloom" style={{ position: 'absolute', width: 76, height: 76, borderRadius: 100, background: T.acid, filter: 'blur(20px)' }} />
        <svg className="app-loading-arc" width={76} height={76} viewBox="0 0 76 76" style={{ position: 'absolute' }}>
          <circle cx={38} cy={38} r={32} fill="none" stroke={T.rule} strokeWidth={4} />
          <path d="M38 6 a32 32 0 0 1 32 32" fill="none" stroke={T.acid} strokeWidth={4} strokeLinecap="round" />
        </svg>
        <span className="app-loading-mark" style={{ fontSize: 26, fontWeight: 800, color: T.acid, letterSpacing: -1 }}>✱</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet }}>Das dauert bis zu zwei Minuten.</span>
      </div>
    </div>
  )
}

/** The identity card the hero flows into (GSdj0): portrait, handle, and the two
 *  read-outs the app can actually pay out. Every value real or "—". */
function IdentityCard({ identity, bikeName, hasBike }: {
  identity: W3BikeHeroIdentity; bikeName: string; hasBike: boolean
}) {
  const navigate = useNavigate()
  return (
    <div style={{
      background: T.surface, borderRadius: 24, border: `1px solid ${T.stroke}`,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 13,
      boxShadow: '0 18px 40px #00000073',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* The rider's own portrait — or an empty seat that invites, never a
            photo they didn't choose (same rule as W3RiderAvatar). */}
        {identity.rider ? (
          <div style={{ width: 56, height: 56, borderRadius: 16, overflow: 'hidden', background: T.surface2, flex: 'none' }}>
            <img src={identity.rider} alt="Dein Rider" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        ) : (
          <button onClick={() => navigate('/e/w3-avatar-onboard')} aria-label="Rider erstellen" style={{
            width: 56, height: 56, borderRadius: 16, flex: 'none', cursor: 'pointer', fontFamily: FONT,
            background: T.surface2, border: `1.5px dashed ${T.acid}59`, display: 'grid', placeItems: 'center',
          }}>
            <UserRound size={24} strokeWidth={1.6} color={T.acid} />
          </button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {identity.handle}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: hasBike ? T.mid : T.quiet, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hasBike ? bikeName : 'Noch kein Bike in der Garage'}
          </span>
        </div>
      </div>

      <div style={{ height: 1, background: T.rule }} />

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Kicker>RideCoin</Kicker>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {identity.coins ?? DASH}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.quiet, flex: 'none' }}>RC</span>
          </div>
        </div>
        <div style={{ width: 1, background: T.rule }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Kicker>Streak</Kicker>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {identity.streak ?? DASH}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.quiet, flex: 'none' }}>
              {identity.streak === 1 ? 'Tag' : 'Tage'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function W3BikeHero({
  image, name, loading, scene, composing, onCompose, identity, collectible, collectibleName,
}: W3BikeHeroProps) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  const sceneImage = scene?.image ?? null
  const status = scene?.status ?? null
  const pose = scene?.pose ?? null
  // The offer is made only when the server says a composition is actually
  // possible — never over a missing rider, a missing bike, or a missing model.
  const canCompose = !!onCompose && !composing && status === 'not_generated' && !!image

  // The identity card's "bike" is whichever one the rider actually has. Before
  // the collectible existed, no photo meant no bike and the card said so; now a
  // rider who owns a claimed bike must never be told their garage is empty.
  const heroName = image ? name : (collectibleName ?? name)
  const heroHasBike = !!image || !!collectible

  const frame = (children: ReactNode) => (
    <div style={{ background: T.bg }}>
      <div style={{ position: 'relative', height: HERO_H, overflow: 'hidden' }}>{children}</div>
      <div style={{ padding: '0 20px', marginTop: -34, position: 'relative', zIndex: 2 }}>
        <IdentityCard identity={identity} bikeName={heroName} hasBike={heroHasBike} />
      </div>
    </div>
  )

  // ── Loading: hold the hero's height with the ghost, so the frame breathes
  //    instead of flashing black — but claim nothing about what's coming. ──
  if (loading) {
    return frame(
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '0 44px' }}>
        <motion.div
          animate={reduce ? undefined : { opacity: [0.06, 0.14, 0.06] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '100%', maxWidth: 260, opacity: 0.1 }}>
          <GhostBike opacity={0.16} />
        </motion.div>
      </div>,
    )
  }

  // ── Composing: the branded wait, in place, for up to two minutes. ──
  if (composing) {
    return frame(<ComposingScene label="Wir setzen dich aufs Bike…" />)
  }

  // ── 1. The composed scene: rider + bike + today's pose, full-bleed. ──
  if (sceneImage) {
    return frame(
      <>
        <motion.img
          src={sceneImage} alt={`${name} — ${pose ? POSE_LABEL[pose] : 'heute'}`}
          initial={reduce ? false : { opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {/* Dissolve the picture's foot into the page, so the identity card grows
            out of the scene instead of being stapled under it. */}
        {/*  Starts low and stays gentle until the last fifth: the rider and the
             wheels sit in the lower half of a 1:1 render, and an earlier ramp
             put the bike itself in shadow. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 62%, ${T.bg}8C 84%, ${T.bg} 100%)` }} />

        <div style={{ position: 'absolute', top: 14, right: 16 }}>
          <HeroAction label="Bike bearbeiten" onClick={() => navigate('/e/w3-bike-studio')}>
            <Pencil size={16} color={T.ink} />
          </HeroAction>
        </div>

        {pose && (
          <div style={{ position: 'absolute', left: 20, bottom: 44, display: 'flex', gap: 6, alignItems: 'center', padding: '7px 12px', borderRadius: 100, background: '#000000A6', border: `1px solid ${T.stroke}`, maxWidth: 240 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, color: T.acid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              HEUTE · {POSE_LABEL[pose]}
            </span>
          </div>
        )}
      </>,
    )
  }

  // ── 2. The bike collectible alone — the rider has a bike but no scene yet. ──
  //    The studio renders a 1:1 collectible on its own pastel studio ground, so
  //    it is shown as the object it is: a card in a case, not bled to the edges.
  if (image) {
    return frame(
      <>
        {/* Ambient bloom, so the card sits in light rather than on a slab. */}
        <div aria-hidden style={{ position: 'absolute', left: '50%', top: 110, transform: 'translate(-50%, -50%)', width: 340, height: 200, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}22, transparent)` }} />

        {/* Flex, not absolute offsets: the collectible takes whatever height is
            left after the footer, so the offer below it can never be pushed
            under the picture on a short screen. */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 20px 44px' }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE }}
            style={{ flex: '1 1 auto', minHeight: 0, aspectRatio: '1 / 1', maxWidth: 236, borderRadius: 28, overflow: 'hidden', border: `1px solid ${T.stroke}`, boxShadow: '0 18px 40px #00000066' }}>
            <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </motion.div>

          {/* What the rider gets for the tap — or, honestly, why they can't. */}
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', maxWidth: 300 }}>
            {canCompose ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, lineHeight: 1.3 }}>
                  Heute: {pose ? POSE_LABEL[pose].toLowerCase() : 'deine Einheit'}. Setz dich aufs Bike.
                </span>
                <button onClick={onCompose} style={{
                  padding: '10px 18px', borderRadius: 100, cursor: 'pointer', fontFamily: FONT,
                  background: T.acid, border: 'none', display: 'flex', gap: 7, alignItems: 'center',
                  boxShadow: `0 0 30px ${T.acid}33`,
                }}>
                  <Sparkles size={14} color={T.bg} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.bg }}>Szene erstellen</span>
                </button>
              </>
            ) : status === 'needs_rider' ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, lineHeight: 1.3 }}>
                  Für die Szene fehlt noch dein Rider.
                </span>
                <button onClick={() => navigate('/e/w3-avatar-onboard')} style={{
                  padding: '10px 18px', borderRadius: 100, cursor: 'pointer', fontFamily: FONT,
                  background: T.acid, border: 'none', display: 'flex', gap: 7, alignItems: 'center',
                }}>
                  <Sparkles size={14} color={T.bg} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.bg }}>Rider erstellen</span>
                </button>
              </>
            ) : status === 'image_model_unavailable' ? (
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet, lineHeight: 1.35 }}>
                Die Szene lässt sich gerade nicht rendern. Dein Bike steht trotzdem hier.
              </span>
            ) : null}
          </div>
        </div>

        {/* Only the quiet action floats here — the acid CTA below is the one
            loud thing on this screenful, and two of them would fight. */}
        <div style={{ position: 'absolute', top: 14, right: 16 }}>
          <HeroAction label="Bike bearbeiten" onClick={() => navigate('/e/w3-bike-studio')}>
            <Pencil size={16} color={T.ink} />
          </HeroAction>
        </div>
      </>,
    )
  }

  // ── 3. No photographed bike — but the rider still owns one. ──
  //
  // This used to be a dimmed stock photo under a "BEISPIEL" label, which was
  // the honest thing to show when the rider genuinely had no bike at all. They
  // always have one now: onboarding forces a first-bike claim, and the shop
  // ladder is built on it. Showing a stranger's bike to someone who owns a bike
  // is both a worse screen and a less true one — this shows THEIRS, drawn
  // exactly as the garage draws it, and keeps the photo studio as an offer
  // rather than a prerequisite.
  if (collectible) {
    return frame(
      <>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
          style={{ position: 'absolute', inset: '18px 20px 52px', borderRadius: 26, overflow: 'hidden', border: `1px solid ${T.rule}` }}
        >
          <W3BikeStage look={collectible} pad="16px 12px 26px" />
        </motion.div>

        {/* The photo studio stays an OFFER, in the floating-action position the
            hero already uses. No caption: the identity card directly below
            prints the bike's name, and the bottom 34px of this frame is under
            it anyway. */}
        <button
          onClick={() => navigate('/e/w3-bike-studio')}
          style={{
            position: 'absolute', top: 30, right: 32, display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', fontFamily: FONT, padding: '7px 12px', borderRadius: 100,
            background: T.bg, border: `1px solid ${T.rule}`,
          }}>
          <Plus size={13} color={T.acid} strokeWidth={2.6} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: T.mid }}>Echtes Rad</span>
        </button>
      </>,
    )
  }

  // ── 3b. Genuinely nothing — the pen's spotlit example (QK4WB). ──
  // Reachable only before the garage query resolves an owned bike.
  return frame(
    <>
      {/* The studio spotlight: a soft pool of light with the example inside it. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(58% 46% at 50% 42%, #FFFFFF14, transparent 70%)' }} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '26px 20px 44px' }}>
        {/* The example, with the one affordance dead centre in the frame the
            rider's own bike will fill. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
          style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, width: '100%', maxWidth: 292, display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.34 }}>
            <GhostBike />
          </div>
          <button
            onClick={() => navigate('/e/w3-bike-studio')}
            aria-label="Bike hinzufügen"
            style={{
              position: 'relative', width: 62, height: 62, borderRadius: 100, cursor: 'pointer', fontFamily: FONT,
              background: T.bg, border: `1px solid ${T.acid}59`, boxShadow: `0 0 30px ${T.acid}26`,
              display: 'grid', placeItems: 'center',
            }}>
            <Plus size={26} color={T.acid} strokeWidth={2.6} />
          </button>
        </motion.div>

        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', maxWidth: 292 }}>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Stell dein Bike in die Garage</span>
          <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
            Ein Foto deines echten Bikes. Wir rendern es als dein Collectible — und setzen dich damit jeden Tag in die passende Szene.
          </span>
        </div>
      </div>

      {/* Says what it is. The example only stays honest while it is labelled. */}
      <span style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>
        BEISPIEL
      </span>
    </>,
  )
}
