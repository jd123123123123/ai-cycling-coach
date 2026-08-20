import { motion, useReducedMotion } from 'motion/react'
import { Asterisk, ChevronsUp, Flame, Settings, Star, UserRound } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import W3StageRail from './W3StageRail'
import type { Stage } from '../../api/garage'
import { GhostBike } from './W3BikeHero'
import W3NavMenu from './W3NavMenu'
import { W3CoachFab } from './W3CoachChat'

/**
 * W3 · Today — THE STAGE. A 1:1 rebuild of pen frames `YIU3g` / `qv4Aw`
 * (read 2026-08-19), which replace the old stacked hero + identity card.
 *
 * WHAT THE PEN CHANGED, and why it is better. The previous hero composed the
 * rider ONTO the bike through `cyclr_studio.compose_scene` — a slow, paid
 * image-model call carrying a long defensive anatomy block, sitting on the most
 * visited screen in the app. The pen separates them: the rider is a bust in a
 * lit circle, the bike stands alone below it. Both are renders the rider
 * ALREADY has (`_isolated_prompt` produces exactly these two), so this screen
 * composes nothing, pays for nothing, and cannot fail on a mangled limb.
 *
 * THE FLOOR IS THE IDEA. A single linear sweep that gets LIGHTER toward the
 * bottom (`T.heroFloor`), so the bike reads as standing in a lit studio rather
 * than floating on a void. Everything else on the stage is transparent and
 * floats over it — which is why the chips are pills on the ground and not cards.
 *
 * ONE ADDITION BEYOND THE PEN: a soft radial pool centred under the bike. The
 * pen's floor is a flat top-to-bottom ramp, so the bike sits on an even wash
 * with no sense of a light source. The pool costs nothing, needs no asset, and
 * is what makes the sweep read as lit rather than merely graded.
 *
 * HONEST BY CONSTRUCTION. No bike renders the labelled example (`GhostBike`,
 * which announces itself and must never be brightened into looking real); no
 * rider renders the empty seat. Every chip shows a real figure or an em dash.
 */

/** Pen geometry, 390 wide. Kept as named constants because the vertical rhythm
 *  here is deliberate and easy to destroy by nudging one value: the handle pill
 *  OVERLAPS the avatar by 14px, which is what fuses bust and name into one
 *  object instead of two stacked ones. */
// RESIZED 2026-08-20 against the reference screen: the bust was 176 on a 390
// frame — 45% of the width — which made the avatar the subject and left the
// bike a strip at the bottom. In the reference the proportion is the other way
// round: the face identifies the rider, the machine is the hero.
const AVATAR = 130
const GLOW = 178
const HANDLE_OVERLAP = -12
// The bike's minimum height, and the reason it is a floor rather than a size:
// the stage is a flex column and the bike takes what the avatar block leaves.
// At 268 that remainder was a letterbox in the middle of the screen.
const BIKE_H = 300

/**
 * The bike art is a RECTANGLE with a light studio ground baked into it —
 * `cyclr_studio.ISOLATED_BIKE_STYLE` renders every bike on "a clean, soft,
 * neutral light-grey studio backdrop", and the example WebP is a photo on
 * white. Dropped straight onto the dark floor that reads as a pale slab with
 * four hard edges sitting on the stage, which is the one thing this layout
 * cannot have: the bike must stand ON the floor, not on a card.
 *
 * Two properties fix it together, and neither works alone:
 *  · `screen` blend makes the light ground ADD to the floor instead of
 *    replacing it, so the art's own studio light becomes the stage's light.
 *  · the radial mask dissolves the rectangle's edges, so there is no seam.
 *
 * Applies to the rider's real render and to the example alike — both arrive in
 * the same shape, so both need the same treatment.
 */
const BIKE_ART = {
  // 118%, was 103%. The radial mask eats the outer ~15% of the box, so a bike
  // drawn at container width lost its wheels to the falloff and read smaller
  // than the space it was given. Overdrawing puts the machine back at the size
  // of the stage and lets the mask dissolve only the empty ground around it.
  width: '118%',
  maxHeight: '100%',
  height: '100%',
  display: 'block' as const,
  mixBlendMode: 'screen' as const,
  maskImage: 'radial-gradient(72% 66% at 50% 56%, #000 52%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(72% 66% at 50% 56%, #000 52%, transparent 100%)',
}

/**
 * A COMPOSED bike — wearing its parts, standing in the place the rider chose —
 * is a photograph of a scene, not a cut-out on a studio sweep, so it gets the
 * exact opposite treatment to `BIKE_ART`.
 *
 * No `screen` blend: that exists to make a white studio ground ADD to the dark
 * floor, and applied to a night road it washes the whole scene into grey. No
 * radial mask either: the mask dissolves a rectangle's edges because the studio
 * art has edges that must not read as a card — a scene is meant to reach the
 * frame, and dissolving it would put a vignette over the landscape the rider
 * just paid for.
 *
 * It fills the width and crops vertically (`cover`), because the plates are
 * composed square and the stage is not: the interest is in the middle band
 * where the road and the bike are, and the sky is what can afford to go.
 */
const SCENE_ART = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
  display: 'block' as const,
}

export interface W3StageVm {
  handle: string
  /** True when `bike` is a COMPOSED render — the machine wearing its parts,
   *  standing in a real place — rather than the isolated studio collectible.
   *  The two need opposite treatment; see `BIKE_ART`. */
  bikeInScene?: boolean
  /** Where the bike is standing, and everywhere else the rider owns. Absent
   *  (or a single stage) draws no rail — see `W3StageRail`. */
  stages?: Stage[]
  stage?: string
  onSelectStage?: (id: string) => void
  /** True while a stage the rider just picked is being composed. */
  rendering?: boolean
  /** The tier line under the handle ("FUNSEEKER" in the pen). Null → no pill,
   *  rather than a role the rider never earned. */
  role: string | null
  /** The rider's digitalised portrait, or null → the empty seat. */
  rider: string | null
  /** The rider's own bike render, or null → the labelled example. */
  bike: string | null
  bikeName: string
  /** RideCoin balance, already localised. Null → "—". */
  coins: string | null
  /** The real forgiving streak in days. Null → "—". */
  streak: number | null
  /** The earn multiplier, e.g. "1.75". Null → "—". */
  bonus: string | null
}

/** A floating pill on the stage ground. Never a card — it has no border and no
 *  gradient, because it is sitting ON the floor, not lifted off it. */
function Chip({ icon, value, tone = T.ink }: { icon: React.ReactNode; value: string; tone?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, height: 34,
      padding: '0 14px 0 7px', borderRadius: 100, background: T.heroChip,
      fontFamily: FONT, flex: 'none',
    }}>
      {icon}
      <span style={{ fontSize: 15, fontWeight: 600, color: tone, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

/** The same pill, but with the icon in a dark disc — the pen uses this form for
 *  the rating, where the mark needs to read as a badge rather than a glyph. */
function DiscChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 34,
      padding: '0 14px 0 5px', borderRadius: 100, background: T.heroChip,
      fontFamily: FONT, flex: 'none',
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 100, background: T.heroBg,
        display: 'grid', placeItems: 'center', flex: 'none',
      }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

export default function W3TodayStage({ vm }: { vm: W3StageVm }) {
  const reduce = useReducedMotion()

  const floor = `linear-gradient(180deg, ${T.heroFloor[0]} 0%, ${T.heroFloor[1]} 40%, ${T.heroFloor[2]} 76%, ${T.heroFloor[3]} 100%)`

  return (
    <div style={{
      position: 'relative', width: '100%', flex: '1 1 auto', minHeight: 0,
      overflow: 'hidden', background: floor, fontFamily: FONT,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>

      {/* The pool of light the bike stands in. Beyond the pen, and the reason
          the sweep reads as a lit room rather than a gradient. */}
      <div aria-hidden style={{
        position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)',
        width: '135%', height: BIKE_H + 90, pointerEvents: 'none',
        background: 'radial-gradient(52% 58% at 50% 76%, #FFFFFF16 0%, #FFFFFF08 42%, #FFFFFF00 74%)',
      }} />

      {/* ── the corner chips: real figures, floating on the floor ── */}
      <div style={{
        position: 'absolute', top: 8, left: 16, zIndex: 2,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
      }}>
        <DiscChip icon={<Star size={12} color={T.ink} fill={T.ink} />} value={vm.bonus ?? DASH} />
        {/* The pen's gear. It opens the SAME nav sheet the old header burger
            did — plan, goal, crew, challenges and referrals are reachable from
            nowhere else, and a lookalike button here would have stranded them. */}
        <W3NavMenu size={44} iconSize={20} background={T.heroChip} Icon={Settings} />
        {/* The coach, moved off the floating FAB that was landing on the dock. */}
        <W3CoachFab variant="chip" background={T.heroChip} iconColor={T.acid} />
      </div>

      <div style={{
        position: 'absolute', top: 8, right: 16, zIndex: 2,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
      }}>
        <Chip icon={<Asterisk size={20} color={T.lilac} />} value={vm.coins ?? DASH} />
        <Chip
          icon={<Flame size={20} color={T.acid} />}
          value={vm.streak != null ? String(vm.streak) : DASH} />
      </div>

      {/* ── the rider: a bust in a lit circle, the name fused to its lower edge ── */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          alignItems: 'center', paddingTop: 8, zIndex: 1, flex: 'none',
        }}>

        <div style={{ position: 'relative', width: AVATAR, height: AVATAR, display: 'grid', placeItems: 'center' }}>
          {/* The glow is wider than the bust and sits behind it — it is the
              light the rider stands in, not a ring around them. */}
          <div aria-hidden style={{
            position: 'absolute', width: GLOW, height: GLOW, borderRadius: '50%',
            background: 'radial-gradient(circle, #FFFFFF14 0%, #FFFFFF08 50%, #FFFFFF00 100%)',
          }} />
          {vm.rider ? (
            <img src={vm.rider} alt="Dein Rider"
              style={{
                position: 'relative', width: AVATAR, height: AVATAR, borderRadius: '50%',
                objectFit: 'cover', display: 'block',
              }} />
          ) : (
            <div aria-label="Noch kein Rider" style={{
              position: 'relative', width: AVATAR, height: AVATAR, borderRadius: '50%',
              display: 'grid', placeItems: 'center', background: '#FFFFFF08',
              border: `1.5px dashed ${T.acid}59`,
            }}>
              <UserRound size={54} strokeWidth={1.4} color={T.acid} />
            </div>
          )}
        </div>

        {/* The handle pill overlaps the bust. That overlap is the whole trick —
            it makes the two read as one object. */}
        <div style={{
          marginTop: HANDLE_OVERLAP, display: 'flex', alignItems: 'center', gap: 10,
          height: 44, padding: '0 20px 0 6px', borderRadius: 100,
          background: T.acid, position: 'relative', maxWidth: '100%',
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 100, background: T.heroBg,
            display: 'grid', placeItems: 'center', flex: 'none',
          }}>
            <ChevronsUp size={17} color={T.acid} />
          </span>
          <span style={{
            fontFamily: 'Archivo, "Inter Tight", sans-serif', fontSize: 22, fontWeight: 700,
            color: T.heroInk, minWidth: 0, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{vm.handle}</span>
        </div>

        {/* Null, not "—": a rider with no tier gets no pill at all rather than
            a badge with a dash in it. */}
        {vm.role && (
          <span style={{
            marginTop: 10, height: 26, padding: '0 14px', borderRadius: 100,
            background: T.heroChip, display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: T.ink,
          }}>{vm.role}</span>
        )}
      </motion.div>

      {/* ── the bike: standing on the floor, nothing behind it ── */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
        style={{
          position: 'relative', zIndex: 1, width: '100%', flex: '1 1 auto',
          // `minHeight: BIKE_H` rather than 0: the bike is the subject of this
          // screen and must never be squeezed below a readable size by whatever
          // sits above it. `paddingTop: 8` (was 21) buys that space back.
          minHeight: BIKE_H, display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center', paddingTop: 8,
        }}>
        {vm.bike ? (
          // ONE TREATMENT, NOT TWO. This was gated on `bikeInScene` — full
          // bleed for a composed render, a masked, screen-blended cut-out for
          // the plain garage one — and the gate was the bug: a rider with no
          // composed build (every rider, until they equip something) got the
          // small treatment, so the machine sat in the middle of the screen as
          // a card while the stage around it stayed empty. The bike is the
          // subject either way. It fills the stage either way.
          //
          // The screen-blend and the radial mask stay for the studio render
          // ONLY because that art has a pale ground baked in and needs its
          // edges dissolved; the scene render already reaches its own frame.
          <img
            src={vm.bike}
            alt={vm.bikeName}
            style={vm.bikeInScene ? SCENE_ART : { ...BIKE_ART, objectFit: 'contain' }}
          />
        ) : (
          <div style={{ position: 'relative', width: '103%', height: '100%', display: 'grid', placeItems: 'end center' }}>
            <div style={BIKE_ART}><GhostBike /></div>
            <span style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.quiet,
            }}>BEISPIEL · NOCH KEIN RAD</span>
          </div>
        )}
      </motion.div>

      {/* ── where it is standing ── */}
      {vm.stages && vm.stage && vm.onSelectStage && (
        <W3StageRail vm={{
          stages: vm.stages,
          current: vm.stage,
          onSelect: vm.onSelectStage,
          rendering: vm.rendering,
        }} />
      )}
    </div>
  )
}
