import type { ReactNode } from 'react'
import { MessageCircle, Plus, Share2, Zap } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { lux, TNUM } from './w3surfaces'
import { W3ElevationProfile, W3IntervalBars } from './W3FeedCharts'
import W3Eyebrow from './W3Eyebrow'

/**
 * W3 · THE FEED POST — pen frames `SpFxs`, `UQhtr` and `kFeEt`.
 *
 * ── I HAD THE RULE WRONG, AND `UQhtr` IS THE CORRECTION ──────────────────
 *
 * I built two structurally different cards and let the PHOTO choose between
 * them: with a picture you got the tall editorial card, without one a compact
 * tile of chips. `UQhtr` shows that is not the design. It is `SpFxs` with the
 * photograph simply absent — same eyebrow, same 52px headline, same sentence,
 * the same four stat columns, the same elevation chart. One structure; the
 * photo is a top on it, not a fork in it.
 *
 * So the fork is the RIDE, not the picture:
 *
 *   FULL (`SpFxs` / `UQhtr`) — a ride out in the world. It has a route, so it
 *     has an elevation profile, a distance worth setting at 52px and room for
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
  /** The acid line over the headline: what kind of ride this was. */
  eyebrow: string | null
  headline: string
  headlineUnit: string
  /** The rider's own sentence. Only a filled-in ride has one. */
  description: string | null
  photoUrl: string | null
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

/** The row every card ends on. */
function Actions({ vm, tint, compact }: { vm: W3FeedPostVm; tint: string; compact: boolean }) {
  const btn = {
    border: 0, background: 'transparent', cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
  } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 18 : 10, width: '100%' }}>
      <button type="button" onClick={vm.onReact} aria-pressed={!!vm.reacted}
        aria-label={`Reagieren (${vm.reactionCount})`}
        style={compact ? btn : {
          ...btn, padding: '9px 15px', borderRadius: 100,
          background: vm.reacted ? `${tint}1F` : T.surface2,
          boxShadow: vm.reacted ? `inset 0 0 0 1px ${tint}` : 'none',
        }}>
        <Zap size={15} color={vm.reacted ? tint : T.mid} strokeWidth={2} />
        <span style={{ ...TNUM, fontSize: 13, fontWeight: 700, color: vm.reacted ? tint : T.mid }}>
          {vm.reactionCount}
        </span>
      </button>

      <button type="button" onClick={vm.onComment} aria-label={`Kommentare (${vm.commentCount})`}
        style={compact ? btn : {
          ...btn, padding: '9px 15px', borderRadius: 100, background: T.surface2,
        }}>
        <MessageCircle size={15} color={T.mid} strokeWidth={2} />
        <span style={{ ...TNUM, fontSize: 13, fontWeight: 700, color: T.mid }}>{vm.commentCount}</span>
      </button>

      {compact && (
        <button type="button" onClick={vm.onShare} aria-label="Teilen" style={btn}>
          <Share2 size={15} color={T.mid} strokeWidth={2} />
        </button>
      )}

      {!compact && vm.alsoLine && (
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: T.quiet }}>
          {vm.alsoLine}
        </span>
      )}
    </div>
  )
}

/** Label over value, which is what stops four numbers reading as one row of
 *  noise. Used on the photo card, where there is width for it. */
function StatColumn({ s }: { s: W3FeedStat }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <W3Eyebrow>{s.l}</W3Eyebrow>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ ...TNUM, fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>{s.v}</span>
        {s.u && <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{s.u}</span>}
      </span>
    </div>
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

function PhotoPost({ vm, tint, slots }: { vm: W3FeedPostVm; tint: string; slots: W3FeedPostSlots }) {
  const canAdd = vm.mine && !vm.photoUrl && !!vm.onAddPhoto

  return (
    <div style={{ ...lux(26), padding: 0, overflow: 'hidden', minWidth: 0 }}>
      {/* THE AUTHOR RIDES ON THE PHOTO, OR ABOVE IT.
          With a picture the name sits in a pill over it, which is `SpFxs`.
          Without one there is nowhere to put a pill, so it becomes a header
          row — a card in a column of other people's rides has to say whose it
          is. */}
      {!vm.photoUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 0' }}>
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
              padding: '6px 11px', borderRadius: 100, background: T.acid,
              fontSize: 10, fontWeight: 700, letterSpacing: 0.7, color: T.bg,
            }}>
              <Zap size={11} color={T.bg} strokeWidth={2.6} />{vm.badge}
            </span>
          )}
        </div>
      )}

      {/* ── ADD A PICTURE, WHERE THE PICTURE GOES ──────────────────────────
          Your own ride, no photo yet: the space the photograph would occupy
          becomes the way to put one there. Not a menu item and not a second
          screen — a plus in the frame, so it takes a tap and a moment. It is
          160px rather than the photo's full height because an empty invitation
          should not cost as much of the feed as a real picture. */}
      {canAdd && (
        <button type="button" onClick={vm.onAddPhoto}
          aria-label="Foto zu dieser Fahrt hinzufügen"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 9, width: '100%', height: 160, margin: '14px 0 0', border: 0,
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

      <button type="button" onClick={vm.onOpen}
        style={{
          position: 'relative', width: '100%', border: 0, padding: 0, background: 'transparent',
          cursor: vm.onOpen ? 'pointer' : 'default', display: 'block', textAlign: 'left',
        }}>
        {vm.photoUrl && (
          <>
            <img src={vm.photoUrl} alt="" style={{
              display: 'block', width: '100%', height: CARD_W * 1.24,
              objectFit: 'cover', background: T.surface2,
            }} />

            <div style={{
              position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 9,
              padding: '6px 14px 6px 6px', borderRadius: 100, background: `${T.bg}A6`,
              backdropFilter: 'blur(12px)', maxWidth: 'calc(100% - 130px)',
            }}>
              <Face url={vm.avatarUrl} initial={vm.avatarInitial} tint={tint} size={30} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{vm.handle}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 500, color: T.mid, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{vm.meta}</span>
              </span>
            </div>

            {vm.badge && (
              <span style={{
                position: 'absolute', top: 14, right: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 13px', borderRadius: 100, background: T.acid,
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.bg,
              }}>
                <Zap size={12} color={T.bg} strokeWidth={2.6} />{vm.badge}
              </span>
            )}
          </>
        )}

        {/* The headline. Over the photo's own floor when there is one, on the
            card's ground when there is not — same type, same order either way,
            which is what `UQhtr` is showing. */}
        <div style={vm.photoUrl
          ? {
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: '76px 18px 16px',
              background: `linear-gradient(180deg, transparent, ${T.bg}D9 58%, ${T.bg} 100%)`,
              display: 'flex', flexDirection: 'column', gap: 4,
            }
          : { padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 4 }
        }>
          {vm.eyebrow && <W3Eyebrow kind="title">{vm.eyebrow}</W3Eyebrow>}
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ ...TNUM, fontSize: 52, fontWeight: 700, letterSpacing: -2.4, lineHeight: 0.92, color: T.ink }}>
              {vm.headline}
            </span>
            <span style={{ fontSize: 17, fontWeight: 600, color: T.mid }}>{vm.headlineUnit}</span>
          </span>
          {vm.description && (
            <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35, color: T.ink, paddingTop: 2 }}>
              {vm.description}
            </span>
          )}
        </div>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 18px 0' }}>
        {vm.stats.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            {vm.stats.slice(0, 4).map((s) => <StatColumn key={s.l} s={s} />)}
          </div>
        )}
        {vm.elevationProfile && (
          <W3ElevationProfile series={vm.elevationProfile} w={CARD_W - 36} h={72} />
        )}
      </div>

      <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
  // THE RIDE DECIDES, NOT THE PICTURE. A ride with a route earns the full card
  // whether or not anyone photographed it — that is what `UQhtr` is. A trainer
  // session has no route, no landscape and no profile, and gets the compact
  // one.
  const outdoors = !!vm.elevationProfile || !!vm.description || !!vm.photoUrl
  return outdoors
    ? <PhotoPost vm={vm} tint={tint} slots={slots} />
    : <PlainPost vm={vm} tint={tint} slots={slots} />
}

export { DASH as W3_FEED_DASH }
