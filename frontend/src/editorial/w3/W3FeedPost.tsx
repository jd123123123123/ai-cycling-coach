import type { ReactNode } from 'react'
import { Flame, MessageCircle, Plus, Share2, Zap } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { lux, TNUM } from './w3surfaces'
import { W3ElevationProfile, W3IntervalBars } from './W3FeedCharts'
import W3Eyebrow from './W3Eyebrow'
import W3RideMedia from './W3RideMedia'

/**
 * W3 · THE FEED POST — pen frames `SpFxs`, `UQhtr` and `kFeEt`.
 *
 * ── I HAD THE RULE WRONG, AND `UQhtr` IS THE CORRECTION ──────────────────
 *
 * I built two structurally different cards and let the PHOTO choose between
 * them: with a picture you got the tall editorial card, without one a compact
 * tile of chips. `UQhtr` shows that is not the design. It is `SpFxs` with the
 * photograph simply absent — same eyebrow, same 58px headline, same sentence,
 * the same four stat columns, the same elevation chart. One structure; the
 * photo is a top on it, not a fork in it.
 *
 * So the fork is the RIDE, not the picture:
 *
 *   FULL (`SpFxs` / `UQhtr`) — a ride out in the world. It has a route, so it
 *     has an elevation profile, a distance worth setting at 58px and room for
 *     the rider's own sentence. The photo sits on top when there is one.
 *
 *   COMPACT (`kFeEt`) — a session on a trainer. No route means no profile and
 *     no landscape; what it has is the shape of the intervals, which is a
 *     picture of a different kind. Header, the session's own name for itself,
 *     bars, chips.
 *
 * ── AND THE NAME MOVES WHEN THE PHOTO GOES ───────────────────────────────
 *
 * On `SpFxs` the author rides in a pill ON the photograph. `UQhtr` has no
 * photograph and the frame shows no author at all — but that frame is a
 * component demo sitting directly under the same ride, not a feed state: in a
 * real column of other people's rides a card with no author is unreadable. So
 * the full card grows a header row exactly when it loses its photo, which is
 * the one deviation here from what the pen literally draws.
 *
 * ── SO DOES THE HEADLINE, AND THAT IS THE WHOLE OF `SpFxs` ───────────────
 *
 * The card used to stack: art on top, then a dark panel holding the eyebrow,
 * the big distance and the sentence. That is not the pen. `SpFxs` stands the
 * identity pill AND the entire headline block ON the picture — 330 of the
 * card's 528 points are photograph, and the type is lying on it. Stacked, the
 * same card ran 715 points tall in the feed and read as a picture with a
 * caption underneath; on the stage it reads as one object.
 *
 * Only the placement moves. When there is no picture and no track there is
 * nothing to stand on, and the same blocks fall back onto the card's own dark
 * ground — which is `UQhtr`, and is why that frame is not a second design.
 */

export interface W3FeedStat { l: string; v: string; u?: string }

export interface W3FeedPostVm {
  id: number
  handle: string
  /** "vor 42 Min · Alpenvorland" — already composed. */
  meta: string
  avatarUrl: string | null
  avatarInitial: string
  mine: boolean
  /** The full editorial card (`SpFxs` / `UQhtr`) versus the compact trainer
   *  tile (`kFeEt`). Decided by the caller from the ride itself, because it
   *  has the payload and this component does not. */
  full: boolean
  /** The acid line over the headline: what kind of ride this was. */
  eyebrow: string | null
  headline: string
  headlineUnit: string
  /** The rider's own sentence. Only a filled-in ride has one. */
  description: string | null
  /** WHAT THE RIDE MEANT TO THE PERSON WHO DID IT — "Längste Fahrt seit Mai".
   *  Strava ranks a ride against other people; this ranks it against the rider
   *  themselves, which is the one comparison a crew of three can make and a
   *  network of thousands cannot. Null on most posts by design. */
  contextLine: string | null
  /** Every picture on the ride, in the rider's own order. */
  photoUrls: string[]
  /** The GPS track, so the slot has an image even with no photograph. */
  route: [number, number][] | null
  distanceM: number
  /** Top-right chip on a photo card — a record, a personal best. */
  badge: string | null
  stats: W3FeedStat[]
  elevationProfile: number[] | null
  powerProfile: number[] | null
  reactionCount: number
  commentCount: number
  /** "Auch Tom & 3 andere" — composed, or null when nobody has reacted. */
  alsoLine: string | null
  onOpen?: () => void
  onReact?: () => void
  onComment?: () => void
  onShare?: () => void
  reacted?: boolean
  /**
   * ADD A PICTURE, IN THE PLACE THE PICTURE WOULD GO.
   *
   * Only on your own ride, and only while it has none. The prompt further up
   * the feed asks once and can be dismissed; this is the affordance that is
   * simply always there — a rider who thinks of a photo three days later has
   * somewhere obvious to put it, in the frame where they can already see the
   * shape of what it would become.
   */
  onAddPhoto?: () => void
}

/**
 * Slots, so this component owns the SHAPE and not the plumbing.
 *
 * The crew feed already has working reactions and a comment thread — real
 * optimistic state, a real POST, a real refetch. Re-implementing them inside
 * the card to make the two frames pixel-exact would have replaced tested
 * behaviour with a redraw of it. The card renders whatever it is handed and
 * falls back to its own quiet controls when it is handed nothing, which is
 * what the previews need.
 */
export interface W3FeedPostSlots {
  actions?: ReactNode
  thread?: ReactNode
}

const CARD_W = 350
/**
 * The stage is 330 of the pen's 358-wide card. Kept as a RATIO rather than the
 * pen's own number, because the card is 350 here (390 minus the page's 20pt
 * gutters) and a hard 330 would change the crop instead of the scale.
 */
const STAGE_RATIO = 330 / 358

function Face({ url, initial, tint, size = 34 }: {
  url: string | null; initial: string; tint: string; size?: number
}) {
  return url ? (
    <img src={url} alt="" width={size} height={size}
      style={{ width: size, height: size, borderRadius: 100, objectFit: 'cover', flex: 'none' }} />
  ) : (
    <span style={{
      width: size, height: size, borderRadius: 100, flex: 'none', display: 'grid', placeItems: 'center',
      background: T.surface2, color: tint, fontSize: size * 0.4, fontWeight: 700,
    }}>{initial}</span>
  )
}

/** The row every card ends on — `qUu5p`, 31pt chips, 12/700 counts. */
function Actions({ vm, tint, compact }: { vm: W3FeedPostVm; tint: string; compact: boolean }) {
  const btn = {
    border: 0, background: 'transparent', cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
  } as const
  // The pen draws the flame chip LIT. That is the reacted state, not the
  // resting one — a feed where every card's first chip glows acid spends the
  // budget on furniture, so the colour arrives when the rider taps.
  const chip = { ...btn, height: 31, padding: '0 13px', borderRadius: 100, gap: 7 } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 18 : 8, width: '100%' }}>
      <button type="button" onClick={vm.onReact} aria-pressed={!!vm.reacted}
        aria-label={`Reagieren (${vm.reactionCount})`}
        style={compact ? btn : {
          ...chip, background: vm.reacted ? `${tint}1F` : T.d1,
        }}>
        <Flame size={14} color={vm.reacted ? tint : T.mid} strokeWidth={2} />
        <span style={{ ...TNUM, fontSize: 12, fontWeight: 700, color: vm.reacted ? tint : T.mid }}>
          {vm.reactionCount}
        </span>
      </button>

      <button type="button" onClick={vm.onComment} aria-label={`Kommentare (${vm.commentCount})`}
        style={compact ? btn : { ...chip, background: T.d1 }}>
        <MessageCircle size={14} color={T.mid} strokeWidth={2} />
        <span style={{ ...TNUM, fontSize: 12, fontWeight: 700, color: T.mid }}>{vm.commentCount}</span>
      </button>

      {compact && (
        <button type="button" onClick={vm.onShare} aria-label="Teilen" style={btn}>
          <Share2 size={15} color={T.mid} strokeWidth={2} />
        </button>
      )}

      {/* "Auch Tom & 3 andere" only when somebody is actually named. The wire
          carries per-emoji COUNTS and nothing else (`ReactionState`), so this
          stays empty on the real feed rather than printing a placeholder. */}
      {!compact && vm.alsoLine && (
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: T.quiet }}>
          {vm.alsoLine}
        </span>
      )}
    </div>
  )
}

/** Label over value, which is what stops four numbers reading as one row of
 *  noise. Used on the photo card, where there is width for it. */
function StatColumn({ s }: { s: W3FeedStat }) {
  // A span, not a div: this row renders inside the button that opens the ride,
  // and a block element inside a <button> is invalid content.
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <W3Eyebrow>{s.l}</W3Eyebrow>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ ...TNUM, fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{s.v}</span>
        {s.u && <span style={{ fontSize: 9, fontWeight: 600, color: T.quiet }}>{s.u}</span>}
      </span>
    </span>
  )
}

/** The same facts as chips, for the compact card where a column grid would
 *  waste the width the chart needs. */
function StatChip({ s }: { s: W3FeedStat }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 6, flex: 'none',
      padding: '7px 12px', borderRadius: 100, background: T.surface2,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{s.l}</span>
      <span style={{ ...TNUM, fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>
        {s.v}{s.u ? <span style={{ fontSize: 10, fontWeight: 600, color: T.mid }}> {s.u}</span> : null}
      </span>
    </span>
  )
}

// ── the filled-in ride ──────────────────────────────────────────────────────

/**
 * `j1n3i` — the kicker, the figure, the rider's sentence.
 *
 * ONE COMPONENT FOR BOTH FRAMES. `SpFxs` stands this on a photograph and
 * `UQhtr` stands it on the card's own ground, and that is the only difference
 * between them: two copies of these forty lines would drift the first time one
 * of them was tuned.
 */
function Headline({ vm, tint, clamp = false }: { vm: W3FeedPostVm; tint: string; clamp?: boolean }) {
  return (
    <>
      {/* ACID, NOT THE CREW'S TINT. The pen sets this line in the brand colour
          on every card; tinting it per crew would make the accent mean "whose
          feed is this" rather than "this is a ride".
          AND IN THE RIDER'S OWN CASE — the pen uppercases it, `W3Eyebrow` does
          not, and that argument is settled in `W3Eyebrow` itself: German
          compounds lose their shape in caps. */}
      {vm.eyebrow && <W3Eyebrow kind="title">{vm.eyebrow}</W3Eyebrow>}
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          ...TNUM, fontSize: 58, fontWeight: 700, letterSpacing: -2.8,
          lineHeight: 1.02, color: T.ink,
        }}>{vm.headline}</span>
        {/* The unit does not sit ON the baseline: measured off `SpFxs`, its own
            baseline is 5pt above the figure's, which tucks it under the number
            rather than parking it alongside. */}
        <span style={{
          fontSize: 17, fontWeight: 600, color: T.mid, transform: 'translateY(-5px)',
        }}>{vm.headlineUnit}</span>
      </span>
      {/* IT SITS UNDER THE FIGURE, NOT BESIDE IT. The number says how much;
          this says how much THAT IS, for this rider — so it reads as the
          figure's caption rather than as a second, competing claim. Quiet on
          purpose: it is a fact, not a trophy, and the card already spends its
          accent on the eyebrow. */}
      {vm.contextLine && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          padding: '5px 10px', borderRadius: 100, background: `${tint}1F`,
          fontSize: 11.5, fontWeight: 600, letterSpacing: -0.1, color: tint,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
        }}>{vm.contextLine}</span>
      )}
      {vm.description && (
        <span style={{
          fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: `${T.ink}CC`,
          // The pen's sentence is one line. A rider's can be a paragraph, and
          // on the stage an unbounded one climbs the picture and runs out of
          // the top of it — so there it is held to two. On the card's own
          // ground it simply makes the card taller, which is fine.
          ...(clamp ? {
            display: '-webkit-box' as const, WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          } : { paddingTop: 2 }),
        }}>{vm.description}</span>
      )}
    </>
  )
}

/** `m7uH1q` — the acid chip for a ride that beat something. */
function RecordChip({ label, top }: { label: string; top: number }) {
  return (
    <span style={{
      position: 'absolute', top, right: 16, display: 'inline-flex', alignItems: 'center',
      gap: 5, height: 23, padding: '0 9px', borderRadius: 100, background: T.acid,
      fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.bg, whiteSpace: 'nowrap',
    }}>
      <Zap size={11} color={T.bg} strokeWidth={2.6} />{label}
    </span>
  )
}

/**
 * `SpFxs` — WHAT LIES ON THE PICTURE: the identity pill (`k418GW`) at the top
 * and the whole headline block (`j1n3i`) at the bottom.
 *
 * ── IT MUST NOT TAKE THE POINTER ─────────────────────────────────────────
 *
 * Underneath is `W3RideMedia`: a scroll-snap slider whose last slide is a map
 * the rider can scrub. An overlay that accepted pointer events would swallow
 * the horizontal swipe and the scrub both, and the failure would be silent —
 * the card would simply stop sliding. So the layer is `pointerEvents: 'none'`
 * and nothing in it is a control; what opens the ride is the block of numbers
 * BELOW the stage, which is not sitting on a gesture.
 *
 * ── AND A PHOTOGRAPH IS NOT A DARK BACKDROP ──────────────────────────────
 *
 * The pen has one hand-picked mountain road. Production has whatever the rider
 * shot into the sun, so white type here is a coin flip without help: a scrim
 * falls from the top behind the pill and rises from the bottom behind the
 * headline. Both are the app's own ground at partial alpha, so they read as
 * light leaving the picture rather than as two grey bars.
 *
 * Nothing animates, so there is no motion for a reduced-motion rider to
 * refuse — the one thing that moves in this slot is the slider they drive.
 */
function Stage({ vm, tint }: { vm: W3FeedPostVm; tint: string }) {
  const hasRoute = !!(vm.route && vm.route.length >= 2)
  const height = Math.round(CARD_W * STAGE_RATIO)
  const slides = vm.photoUrls.length + (hasRoute ? 1 : 0)
  // `W3RideMedia` parks its own "Foto" button in the top-right corner — your
  // own ride, no picture yet — which is the corner the pen gives the record
  // chip. The chip steps down a row rather than landing on a control.
  const addBtn = vm.mine && vm.photoUrls.length === 0 && !!vm.onAddPhoto
  // The same slot centres its pager along the bottom edge, where the pen (one
  // image, no slider) put the ride's own sentence. The dots reach 17pt up, so
  // the block clears them by 22 — six points off the pen, which is the cost of
  // a slider the pen never had. With one slide there are no dots and the pen's
  // own 16 stands.
  const foot = slides > 1 ? 22 : 16

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <W3RideMedia
        photoUrls={vm.photoUrls}
        route={vm.route}
        distanceM={vm.distanceM}
        width={CARD_W}
        height={height}
        tint={tint}
        onAddPhoto={vm.mine ? vm.onAddPhoto : undefined}
      />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <span aria-hidden style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 132, display: 'block',
          background: `linear-gradient(180deg, ${T.bg}A6, ${T.bg}00)`,
        }} />
        <span aria-hidden style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 210, display: 'block',
          background: `linear-gradient(0deg, ${T.bg}F0 0%, ${T.bg}A6 42%, ${T.bg}00 100%)`,
        }} />

        {/* `b1BFVn` — the author, in glass on the picture. Composed at the
            pen's own 40% rather than reaching for `T.glass` (72%): behind a
            blur that is enough to hold 13pt type, and the landscape still
            shows through the pill, which is the whole point of it. */}
        <span style={{
          position: 'absolute', top: 16, left: 16, maxWidth: addBtn ? '58%' : '62%',
          display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0,
          height: 40, padding: '0 14px 0 5px', borderRadius: 100,
          background: `${T.bg}66`, backdropFilter: 'blur(12px)',
        }}>
          <Face url={vm.avatarUrl} initial={vm.avatarInitial} tint={tint} size={30} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 700, lineHeight: 1.25, color: vm.mine ? tint : T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{vm.handle}</span>
            <span style={{
              fontSize: 10, fontWeight: 500, lineHeight: 1.3, color: T.mid,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{vm.meta}</span>
          </span>
        </span>

        {vm.badge && <RecordChip label={vm.badge} top={addBtn ? 62 : 16} />}

        {/* `j1n3i` — kicker, the figure, the rider's sentence, all on the art. */}
        <span style={{
          position: 'absolute', left: 16, right: 16, bottom: foot,
          display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
        }}>
          <Headline vm={vm} tint={tint} clamp />
        </span>
      </div>
    </div>
  )
}

function PhotoPost({ vm, tint, slots }: { vm: W3FeedPostVm; tint: string; slots: W3FeedPostSlots }) {
  const photo = vm.photoUrls[0] ?? null
  const hasRoute = !!(vm.route && vm.route.length >= 2)
  // The slot has something to show if there is a photograph OR a track.
  const media = !!photo || hasRoute
  // Nothing to show at all, and it is yours: then the plus IS the slot.
  const emptyAdd = vm.mine && !media && !!vm.onAddPhoto

  return (
    <div style={{ ...lux(26), padding: 0, overflow: 'hidden', minWidth: 0 }}>
      {/* THE AUTHOR RIDES ON THE PICTURE, OR ABOVE IT.
          With something in the slot the name sits in a pill over it, which is
          `SpFxs`. With nothing there is nowhere to put a pill, so it becomes a
          header row — a card in a column of other people's rides has to say
          whose it is. */}
      {!media && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 0' }}>
          <Face url={vm.avatarUrl} initial={vm.avatarInitial} tint={tint} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: vm.mine ? tint : T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{vm.handle}</span>
            <span style={{
              fontSize: 11, fontWeight: 500, color: T.quiet,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{vm.meta}</span>
          </span>
          {vm.badge && (
            <span style={{
              flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 23, padding: '0 9px', borderRadius: 100, background: T.acid,
              fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: T.bg,
            }}>
              <Zap size={11} color={T.bg} strokeWidth={2.6} />{vm.badge}
            </span>
          )}
        </div>
      )}

      {/* ── THE STAGE ─────────────────────────────────────────────────────
          With no photograph the ride's own GPS track fills it, because an
          outdoor ride HAS a picture whether or not anybody took one. With a
          photograph it becomes a slider — the photo first, because a photo is
          why somebody stops scrolling, and the map second, because it is why
          they stay. Either way the headline rides on top of it. */}
      {media && <Stage vm={vm} tint={tint} />}

      {/* No photo and no track — a ride the app has only numbers for. Then the
          plus can be the slot itself, at a height that does not cost the feed
          as much as a real picture would. */}
      {emptyAdd && (
        <button type="button" onClick={vm.onAddPhoto}
          aria-label="Foto zu dieser Fahrt hinzufügen"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 9, width: '100%', height: 148, margin: '14px 0 0', border: 0,
            background: `linear-gradient(180deg, ${T.acid}0F, transparent)`,
            cursor: 'pointer', fontFamily: FONT,
            boxShadow: `inset 0 0 0 1px ${T.acid}2E`,
          }}>
          <span style={{
            width: 44, height: 44, borderRadius: 100, background: T.acidDim,
            display: 'grid', placeItems: 'center',
          }}>
            <Plus size={22} color={T.acid} strokeWidth={2.4} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.acid }}>Foto hinzufügen</span>
        </button>
      )}

      {/* `UQhtr` — the same block, on the card's own ground, for the ride with
          nothing to stand it on. */}
      {!media && (
        <button type="button" onClick={vm.onOpen}
          style={{
            width: '100%', border: 0, padding: '14px 16px 0', background: 'transparent',
            cursor: vm.onOpen ? 'pointer' : 'default', display: 'flex',
            flexDirection: 'column', gap: 4, textAlign: 'left', fontFamily: FONT,
          }}>
          <Headline vm={vm} tint={tint} />
        </button>
      )}

      {/* `SrLps` + `sSO3p`, AND THE WAY INTO THE RIDE.
          With the headline on the stage the card lost its tap target: the
          overlay cannot take the pointer without eating the slider's swipe. So
          the numbers open the ride instead — a 138pt band that is not sitting
          on a gesture. */}
      <button type="button" onClick={vm.onOpen}
        style={{
          width: '100%', border: 0, background: 'transparent', textAlign: 'left',
          cursor: vm.onOpen ? 'pointer' : 'default', fontFamily: FONT,
          display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px 0',
        }}>
        {vm.stats.length > 0 && (
          <span style={{
            display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, vm.stats.length)}, 1fr)`,
            gap: 10, width: '100%',
          }}>
            {vm.stats.slice(0, 4).map((s) => <StatColumn key={s.l} s={s} />)}
          </span>
        )}
        {vm.elevationProfile && (
          // THE CARD'S OWN TINT, not the default. `W3ElevationProfile` falls
          // back to acid, which on this screen means "you" — so a crew-mate's
          // climbing drew in the rider's own colour while the post around it
          // was violet. The compact branch of this same component already
          // passes it.
          <W3ElevationProfile series={vm.elevationProfile} w={CARD_W - 32} h={72} tint={tint} />
        )}
      </button>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slots.actions ?? <Actions vm={vm} tint={tint} compact={false} />}
        {slots.thread}
      </div>
    </div>
  )
}

// ── the ride nobody filled in ───────────────────────────────────────────────

function PlainPost({ vm, tint, slots }: { vm: W3FeedPostVm; tint: string; slots: W3FeedPostSlots }) {
  const chart = vm.powerProfile ?? vm.elevationProfile
  return (
    <div style={{ ...lux(26), padding: 0, overflow: 'hidden', minWidth: 0 }}>
      <button type="button" onClick={vm.onOpen}
        style={{
          width: '100%', border: 0, background: 'transparent', textAlign: 'left', padding: '16px 18px 0',
          cursor: vm.onOpen ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 14,
          fontFamily: FONT,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <Face url={vm.avatarUrl} initial={vm.avatarInitial} tint={tint} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: vm.mine ? tint : T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{vm.handle}</span>
            <span style={{
              fontSize: 11, fontWeight: 500, color: T.quiet,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{vm.meta}</span>
          </span>
        </div>

        {/* HEADLINE LEFT, CHART RIGHT. The chart is what the session looked
            like and the headline is what it was called; side by side they
            explain each other, and the card stays one screenful of scroll. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none', minWidth: 0 }}>
            {vm.eyebrow && <W3Eyebrow kind="title" tone={tint}>{vm.eyebrow}</W3Eyebrow>}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ ...TNUM, fontSize: 34, fontWeight: 700, letterSpacing: -1.4, lineHeight: 0.95, color: T.ink }}>
                {vm.headline}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>{vm.headlineUnit}</span>
            </span>
          </span>
          {chart && (
            <span style={{ flex: 1, minWidth: 0 }}>
              <W3IntervalBars series={chart} w={150} h={54} tint={tint} />
            </span>
          )}
        </div>

        {vm.stats.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, width: '100%', overflowX: 'auto',
            scrollbarWidth: 'none', paddingBottom: 2,
          }}>
            {vm.stats.slice(0, 3).map((s) => <StatChip key={s.l} s={s} />)}
          </div>
        )}
      </button>

      <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ height: 1, background: T.rule, width: '100%' }} />
        {slots.actions ?? <Actions vm={vm} tint={tint} compact />}
        {slots.thread}
      </div>
    </div>
  )
}

export default function W3FeedPost({ vm, tint = T.acid, slots = {} }: {
  vm: W3FeedPostVm; tint?: string; slots?: W3FeedPostSlots
}): ReactNode {
  // THE RIDE DECIDES, NOT THE PICTURE — and the caller decides which ride
  // this is, because it has the payload and this component does not.
  return vm.full
    ? <PhotoPost vm={vm} tint={tint} slots={slots} />
    : <PlainPost vm={vm} tint={tint} slots={slots} />
}

export { DASH as W3_FEED_DASH }
