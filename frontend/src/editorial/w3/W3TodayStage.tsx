import { motion, useReducedMotion } from 'motion/react'
import { Asterisk, ChevronsUp, Flame, Settings, Star, UserRound } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import type { Stage } from '../../api/garage'
import { GhostBike } from './W3BikeHero'
import W3NavMenu from './W3NavMenu'
import { W3CoachFab } from './W3CoachChat'
import W3SyncChip from './W3SyncChip'

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
/**
 * Where the floor is, as a fraction of the stage.
 *
 * MEASURED, NOT GUESSED. `stage-studio.webp` is a graphic set — a flat wall
 * meeting a flat floor — and the row where its mean brightness jumps IS the
 * horizon: 1171 of 1536 px, 76.2%. Every attempt before this one placed the bike
 * by eye and it floated, because the plate was `cover`-cropped and its horizon
 * moved with the viewport. The plate is stretched to the stage now, which a
 * flat two-plane gradient takes without showing it, so this number holds on
 * every device and the tyres land ON the line rather than near it.
 *
 * Re-measure if the plate is ever re-rendered: the row of the largest jump in
 * mean brightness, divided by the height.
 */
const FLOOR = 0.762

/** The room. Exported so the screen around the stage can read the colour this
 *  picture ends in and carry on in it — see `useGroundColour`. */
export const STAGE_PLATE = '/w3/stage-studio.webp'

const AVATAR = 130
const GLOW = 178
const HANDLE_OVERLAP = -12

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
  // SIZED BY WIDTH, and that is the whole point of it.
  //
  // Every earlier version constrained the HEIGHT — a square render in a box
  // shorter than it is wide, with `objectFit: contain`, is limited by its
  // height, so the machine drew at about half the width with empty floor either
  // side. That was the letterbox, then it was the small bike, then it was the
  // small bike one level down inside its own wrapper. A phone screen has width
  // to fill and height to spare; the picture follows the width.
  //
  // It sits on its wrapper's bottom edge, which IS the floor line. The cut-out
  // is trimmed to the machine (`services/cutout.py`), so the bottom of the
  // picture is the bottom of the wheels: nothing to subtract, nothing to guess.
  //
  // No screen blend and no mask. Both existed to hide the pale studio ground the
  // art used to arrive on, and the blend cost real contrast — it lifted every
  // dark part of the machine toward grey. There is nothing left to hide.
  width: '94%',
  height: 'auto' as const,
  display: 'block' as const,
}

/**
 * THE CONTACT SHADOWS — one per tyre, and the thing that makes the machine
 * weigh something.
 *
 * A `drop-shadow` filter traces the whole silhouette, so every spoke gets its
 * own halo and the result reads as a glow rather than as weight on a floor.
 * A bicycle touches the ground in TWO SMALL PLACES and the floor between them
 * stays clean, so that is what is drawn.
 *
 * MEASURED, AFTER GETTING IT WRONG. The previous version said "one per tyre" in
 * a comment and then placed two copies of the single-plinth ellipse — 72 % wide
 * each — at 19 % and 81 %. On a 390 px screen that is two 281 px smears running
 * 66 px off BOTH edges of the frame and overlapping across the middle, sitting
 * 11 px above the wheels. Not a shadow: a wash.
 *
 * TWO LAYERS PER WHEEL, because one ellipse cannot be both. A contact shadow is
 * a tight, dark core exactly where the rubber meets the floor, plus a much
 * wider and far softer pool of ambient occlusion around it. One gradient doing
 * both jobs is either a hard smudge or a faint cloud; the pair is what product
 * renders use and what the eye reads as contact.
 *
 * It is worth checking they can be SEEN. A black shadow on a black floor is
 * nothing — measured at the contact line the plate is #353C47 (luminance 59),
 * which is genuinely lit, so there is light here to take away. If the stage
 * plate is ever re-rendered darker under the wheels, these stop reading and the
 * alphas below are the wrong lever — the plate is.
 */
const SHADOW_CORE = {
  position: 'absolute' as const,
  bottom: 0,
  transform: 'translate(-50%, 42%)',
  width: '9%',
  height: 9,
  borderRadius: '50%',
  background: 'radial-gradient(closest-side, rgba(0,0,0,0.78), rgba(0,0,0,0))',
  pointerEvents: 'none' as const,
}
const SHADOW_POOL = {
  ...SHADOW_CORE,
  width: '23%',
  height: 20,
  background: 'radial-gradient(closest-side, rgba(0,0,0,0.5), rgba(0,0,0,0))',
}

/** Where the wheels are, as a fraction of the bike's own box.
 *
 *  Not of the STAGE: the art is 94 % of the stage and centred, so a percentage
 *  measured off the stage lands ~8 px inboard of the tyre — which is exactly
 *  how the shadows and the machine drifted apart before. Road geometry puts the
 *  hubs at about a fifth and four fifths of the overall length (a ~100 cm
 *  wheelbase inside a ~172 cm machine on 68 cm wheels). */
const TYRE_X = ['19%', '81%'] as const

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

export default function W3TodayStage({ vm, fullBleed = false }: {
  vm: W3StageVm
  /** Fill the whole first screen and let the panel float over the floor,
   *  rather than occupying one band of a column above it. */
  fullBleed?: boolean
}) {
  const reduce = useReducedMotion()

  // A RENDERED ROOM, NOT A GRADIENT. The floor was four stops of near-black,
  // which is flat by construction: no falloff in the corners, no grain, no light
  // with a direction. `stage-studio.webp` is a GRAPHIC SET in the house style:
  // one flat wall meeting one flat floor at a crisp horizon, everything in
  // focus. The first version of that plate asked for haze and falloff and came
  // back a soft foggy room — held next to the W3 renders it was obviously the
  // wrong register: those are sharp product photographs of a toy, not moods.
  // The gradient stays underneath as the ground the image is composited onto,
  // so a slow or failed load degrades to what shipped before, not a white box.
  const floor = `linear-gradient(180deg, ${T.heroFloor[0]} 0%, ${T.heroFloor[1]} 40%, ${T.heroFloor[2]} 76%, ${T.heroFloor[3]} 100%)`

  return (
    <div style={fullBleed ? {
      position: 'absolute', inset: 0, overflow: 'hidden', background: floor,
      fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 44,
    } : {
      position: 'relative', width: '100%', flex: '1 1 auto', minHeight: 0,
      overflow: 'hidden', background: floor, fontFamily: FONT,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>

      {/* The room itself. Covers the stage, anchored to the bottom so the pool
          of light and the floor line land where the bike stands. */}
      <img aria-hidden src={STAGE_PLATE} alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          // `fill`, not `cover`: cover crops, and a cropped plate carries its
          // own horizon around with the viewport — which is exactly why the
          // bike kept floating however the percentages were nudged. Stretching
          // a flat two-plane gradient is invisible and pins the floor at
          // `FLOOR` on every screen.
          objectFit: 'fill', pointerEvents: 'none',
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
        {/* Force a Garmin pull. It lives HERE, on Today, because this is the
            screen a rider opens straight off the bike to look for a ride that
            the hourly scheduler has not fetched yet — the settings screen is
            where you go once you already know what is wrong. Draws nothing
            when no watch is connected. */}
        <W3SyncChip size={44} iconSize={20} />
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

      {/* ── the bike: standing on the floor, nothing behind it ──
          The art is a CUT-OUT, so there is no rectangle and no seam: the
          stage's own floor sweep runs continuously behind and around the
          machine, which is what the reference does and what the old
          screen-blend was faking badly. */}
      {/* ── THE MACHINE DOES NOT SLIDE IN ─────────────────────────────────
          This carried `y: 16 → 0` over 600 ms, and it is the reason the bike
          "jumps" when you change pages. Inside the room it never fired —
          today, the rides and the garage share one mounted stage, so nothing
          re-enters. But the tab bar's other two destinations are NOT nested
          under this layout, so every trip through them unmounts the room and
          the machine slides 16 px into place on the way back. Measured in the
          390x844 harness: it lands at y=401 and settles at 386 over ~800 ms.

          A fade stays, because it covers the image decode and a picture
          appearing at full opacity mid-decode is its own flicker. What goes is
          the TRANSLATION: the bike is the one object this app promises is
          always in the same room in the same place, and an object that slides
          to its position is an object that was somewhere else a moment ago. ── */}
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
        style={{
          // NOT `relative`. This block used to establish a containing block,
          // so the bike wrapper inside it resolved `bottom: 23.8%` against the
          // LEFTOVER HEIGHT under the avatar rather than against the stage —
          // measured live, that put the tyres 60px below the floor line. It is
          // `static` now, and the wrapper is positioned against the stage,
          // which is the only box whose height the floor fraction refers to.
          zIndex: 1, width: '100%',
          // FILL THE SPACE, DO NOT FIT INTO IT.
          //
          // Two goes at this, and both were half right. `flex: 1 1 auto` with
          // `contain` drew a 300x300 bike in a 390-wide stage — the letterbox.
          // `aspectRatio: 1` fixed the width and broke the height: a 390px
          // square below a 230px avatar block is taller than the stage, so the
          // wheels were cut off by the panel below.
          //
          // The box takes the room that is actually there, and the art COVERS
          // it — scaled to the width, cropped top and bottom. That crop is free
          // now that bikes render on a near-black ground (`BIKE_GROUND`): what
          // gets cut is empty studio, not machine. Before, with the pale grey
          // ground, cropping would have sliced a bright rectangle in half.
          flex: '1 1 auto', minHeight: 0,
          display: 'flex', alignItems: 'stretch',
          justifyContent: 'center', paddingTop: 0,
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
          vm.bikeInScene ? (
            <img src={vm.bike} alt={vm.bikeName} style={SCENE_ART} />
          ) : (
            // THE BIKE AND ITS SHADOWS ARE ONE OBJECT, positioned together.
            // They were two independent percentages before, which is why they
            // never agreed: the art was centred in its own box while the shadow
            // was measured off that box's bottom, so any change to either drifted
            // them apart and the machine floated. This wrapper's BOTTOM EDGE IS
            // THE FLOOR — the picture sits on it and both shadows sit on it, so
            // they cannot disagree.
            <div style={{
              position: 'absolute', left: 0, right: 0,
              bottom: `${(1 - FLOOR) * 100}%`,
              // NO FIXED HEIGHT. A height here re-introduced the original bug
              // one level down: `contain` inside a 52%-tall box is limited by
              // the HEIGHT again, so the bike drew at ~45% of the width with
              // floor either side. The wrapper takes the height its picture
              // needs, and the picture is sized by WIDTH — the one dimension
              // this screen actually has to fill.
              //
              // The plate's horizon sits at 76% now (it was 64%, which left a
              // third of the screen as empty floor and pushed the machine up
              // into the block pill). Low horizon, shallow floor band: the way
              // the reference sets are shot.
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}>
              {/* The shadows live INSIDE the bike's own box, so their
                  percentages are measured against the machine rather than
                  against the stage — the two cannot drift apart again. */}
              <div style={{ position: 'relative', width: BIKE_ART.width, display: 'flex' }}>
                {TYRE_X.map((x) => (
                  <div key={x} aria-hidden>
                    <div style={{ ...SHADOW_POOL, left: x }} />
                    <div style={{ ...SHADOW_CORE, left: x }} />
                  </div>
                ))}
                <img src={vm.bike} alt={vm.bikeName} style={{ ...BIKE_ART, width: '100%' }} />
              </div>
            </div>
          )
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

      {/* THE STAGE RAIL IS NOT HERE ANY MORE. Today is one thing — the rider
          and the machine — and a row of dots at the foot of it turned the
          screen into a carousel of pictures the rider had not rendered yet: it
          named a stage ("MORGENGRAUEN") while showing the plain studio bike,
          which is the app promising something the picture does not deliver.
          Choosing where the bike stands belongs in the garage, next to the rest
          of what a rider owns. `W3StageRail` still exists and is still wired
          there; only this mount is gone. */}
    </div>
  )
}
