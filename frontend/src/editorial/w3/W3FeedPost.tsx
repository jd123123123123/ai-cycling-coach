import type { ReactNode } from 'react'
import { MessageCircle, Share2, Zap } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { lux, TNUM } from './w3surfaces'
import { W3ElevationProfile, W3IntervalBars } from './W3FeedCharts'

/**
 * W3 · THE FEED POST, in its two shapes — pen frames `SpFxs` and `kFeEt`.
 *
 * ── WHY TWO SHAPES AND NOT ONE WITH A HOLE ───────────────────────────────
 *
 * A ride the rider filled in is a different object from one they did not. With
 * a photo the card is a picture with the numbers written on it, tall and
 * full-bleed, and it is the thing you stop scrolling for. Without one it is a
 * compact tile: name, the one thing the session WAS, the numbers as chips.
 *
 * The alternative — one card with a grey placeholder where the photo goes —
 * makes every unfilled ride look broken, and there are far more unfilled rides
 * than filled ones. The empty state has to be a good object in its own right,
 * not a gap.
 *
 * ── THE HEADLINE IS WHAT THE RIDE WAS ────────────────────────────────────
 *
 * Both shapes lead with an acid eyebrow and one large figure, and on the
 * trainer card that figure is the session's own name for itself ("4×8 min")
 * rather than a distance nobody rode anywhere. What the rider called it, in
 * the size that says it mattered.
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
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>{s.l}</span>
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
  return (
    <div style={{ ...lux(26), padding: 0, overflow: 'hidden', minWidth: 0 }}>
      <button type="button" onClick={vm.onOpen}
        style={{
          position: 'relative', width: '100%', border: 0, padding: 0, background: 'transparent',
          cursor: vm.onOpen ? 'pointer' : 'default', display: 'block', textAlign: 'left',
        }}>
        {/* THE PHOTO IS THE CARD. Full bleed, tall, and everything else is
            written on it — which is why the scrim below is a gradient into the
            card's own ground rather than a panel laid over the picture. */}
        <img src={vm.photoUrl ?? ''} alt="" style={{
          display: 'block', width: '100%', height: CARD_W * 1.24,
          objectFit: 'cover', background: T.surface2,
        }} />

        {/* who — in a pill, because it sits on a photograph whose brightness
            nobody controls */}
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

        {/* the headline, standing on the photo's own floor */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '76px 18px 16px',
          background: `linear-gradient(180deg, transparent, ${T.bg}D9 58%, ${T.bg} 100%)`,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {vm.eyebrow && (
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, color: T.acid }}>
              {vm.eyebrow}
            </span>
          )}
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
            {vm.eyebrow && (
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>
                {vm.eyebrow}
              </span>
            )}
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
  // The photo decides the shape, and nothing else does. A ride with a
  // description but no picture is still a plain card — the tall format exists
  // to carry a photograph, not a sentence.
  return vm.photoUrl
    ? <PhotoPost vm={vm} tint={tint} slots={slots} />
    : <PlainPost vm={vm} tint={tint} slots={slots} />
}

export { DASH as W3_FEED_DASH }
