import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, MessageCircle, Send, Plus } from 'lucide-react'
import { useCrewStandings } from '../../hooks/useCrew'
import { useCrewRides } from '../../hooks/useCrewRides'
import { useCrewRideComments, usePostCrewRideComment } from '../../hooks/useCrewRideComments'
import { useToggleReaction } from '../../hooks/useCrewReactions'
import { CREW_EMOJIS, type ReactionState } from '../../api/crewReactions'
import type { CrewRide, CrewRideComment } from '../../api/crewRides'
import { T, FONT, DASH, Kicker } from './w3tokens'
import { S, lux, luxTile, hairline, TNUM } from './w3surfaces'
import { km, hm, dur, ago } from './w3rideFeed'
import { THEM_TINT, YOU_TINT } from './w3crew'
import W3FeedPost, { type W3FeedPostVm } from './W3FeedPost'

/**
 * W3 · Today "Deine Crew fährt" — the crew's real rides, and a place to say
 * something about them.
 *
 * On the wire, all of it:
 *   • GET  /crews/me/rides                      — every crew member's recent
 *     cycling activities, newest first, each with its 'ride' reaction roll-up
 *     and the size of its comment thread.
 *   • GET  /crews/me/rides/{id}/comments        — the thread, opened on demand.
 *   • POST /crews/me/rides/{id}/comments        — writing under a ride.
 *   • POST /crews/me/reactions/toggle           — the six-emoji palette.
 *   • GET  /crews/me/standings?period=week      — for the riders' FACES only.
 *     Already fetched by `W3TodayRank` two sections up, so this is a cache
 *     read rather than a second request.
 *
 * WHY IT IS ONE CARD AND NOT A STACK OF THEM. A feed of separate cards down
 * Today would be the loudest thing on a page whose subject is the rider's own
 * morning. The crew is a column inside one lit surface: rides separated by a
 * hairline, each one opening in place.
 *
 * THE ACCENT IS VIOLET, NOT ACID. House rule 4 — a chapter may take a second
 * accent, and then everything in it takes that accent. `w3crew.ts` already
 * fixes the meaning of these two tones app-wide: acid is always YOU, violet is
 * always the other rider. A crew feed is by definition about other riders, so
 * violet carries the section and acid appears only where the rider's own ride
 * or their own reaction shows up in it.
 *
 * HONESTY. Every figure is a server field. A ride imported without a power
 * meter has no TSS and no average watts, and its tiles read "—". No crew, or a
 * crew that has not ridden, renders NOTHING rather than a furnished empty
 * state — `W3TodayRank` sits directly above with the one invitation to join a
 * crew, and saying it twice in one scroll is filler.
 */

const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', padding: `0 20px ${padBottom}px`, fontFamily: FONT })
const ellipsis = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }
const bare = { border: 0, background: 'transparent', fontFamily: FONT, padding: 0, cursor: 'pointer', textAlign: 'left' as const }

const nf = new Intl.NumberFormat('de-DE')

/** How many rides the section shows before it stops being a glance. */
export const FEED_VISIBLE = 4
/** How many the feed asks the server for — enough to fill the visible window
 *  from a crew where one rider posts several rides in a row. */
export const FEED_LIMIT = 12

/** The crew screen is the feed's home, so it asks for a deeper slice than the
 *  four-row column on Today. */
export const CREW_PAGE_LIMIT = 40

// ── the face ────────────────────────────────────────────────────────────────

function Face({ url, initial, mine }: { url: string | null; initial: string; mine: boolean }) {
  const hue = mine ? YOU_TINT : THEM_TINT
  const common = { flex: 'none' as const, width: 34, height: 34, borderRadius: 100 }
  if (url) {
    return (
      <span style={{ ...common, overflow: 'hidden', background: T.heroChip, boxShadow: `0 0 0 1.5px ${hue}66` }}>
        <img src={url} alt="" aria-hidden style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
    )
  }
  return (
    <span style={{ ...common, background: T.heroChip, display: 'grid', placeItems: 'center', boxShadow: `0 0 0 1.5px ${hue}66` }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: hue }}>{initial}</span>
    </span>
  )
}

// ── the six-emoji palette, in W3's own tokens ───────────────────────────────
//
// `components/social/ReactionBar` does this job on the OLD design system — it
// styles itself out of `--color-accent` / `--color-surface-2`, which do not
// exist on a W3 surface. Same endpoint, same optimistic toggle, W3's tones.

function Reactions({ rideId, seed, accent }: { rideId: number; seed: ReactionState; accent: string }) {
  const toggle = useToggleReaction()
  const [state, setState] = useState<ReactionState>(seed)
  const [picking, setPicking] = useState(false)

  const flip = (emoji: string) => {
    setPicking(false)
    setState((prev) => {
      const had = prev.mine.includes(emoji)
      const counts = { ...prev.counts }
      const next = Math.max(0, (counts[emoji] ?? 0) + (had ? -1 : 1))
      if (next === 0) delete counts[emoji]
      else counts[emoji] = next
      return { counts, mine: had ? prev.mine.filter((e) => e !== emoji) : [...prev.mine, emoji] }
    })
    toggle.mutate(
      { targetType: 'ride', targetId: rideId, emoji },
      { onSuccess: (res) => setState({ counts: res.counts, mine: res.mine }) },
    )
  }

  const active = CREW_EMOJIS.filter((e) => (state.counts[e] ?? 0) > 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {active.map((emoji) => {
        // The rider's OWN reaction is the one thing here that gets lit — it is
        // the difference between reading the crew and being in it.
        const mine = state.mine.includes(emoji)
        return (
          <button key={emoji} type="button" onClick={() => flip(emoji)} aria-pressed={mine}
            aria-label={`Mit ${emoji} reagieren`}
            style={{
              ...bare, display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 9px', borderRadius: 100,
              background: mine ? `${accent}26` : T.surface2,
              boxShadow: mine ? `inset 0 0 0 1px ${accent}` : 'none',
            }}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>{emoji}</span>
            <span style={{ ...TNUM, fontSize: 11, fontWeight: 700, color: mine ? accent : T.mid }}>{state.counts[emoji]}</span>
          </button>
        )
      })}

      {picking ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 5px', borderRadius: 100, background: T.surface2 }}>
          {CREW_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => flip(emoji)} aria-label={`Mit ${emoji} reagieren`}
              style={{ ...bare, width: 28, height: 28, borderRadius: 100, display: 'grid', placeItems: 'center',
                background: state.mine.includes(emoji) ? `${accent}26` : 'transparent' }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => setPicking(true)} aria-label="Reagieren"
          style={{ ...bare, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 100, background: T.surface2 }}>
          <Plus size={12} color={T.quiet} />
          {active.length === 0 && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: T.quiet }}>REAGIEREN</span>}
        </button>
      )}
    </div>
  )
}

// ── the thread ──────────────────────────────────────────────────────────────

function Thread({ rideId, accent }: { rideId: number; accent: string }) {
  const { data: comments, isLoading, isError } = useCrewRideComments(rideId)
  const post = usePostCrewRideComment(rideId)
  const [draft, setDraft] = useState('')

  const send = () => {
    const text = draft.trim()
    if (!text || post.isPending) return
    setDraft('')
    post.mutate(text)
  }

  const rows: CrewRideComment[] = comments ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {isError ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>Die Kommentare sind gerade nicht erreichbar.</span>
      ) : isLoading ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>Lädt …</span>
      ) : rows.length === 0 ? (
        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.45, color: T.quiet }}>
          Noch nichts geschrieben. Sag was dazu.
        </span>
      ) : (
        rows.map((c) => (
          <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span style={{ ...ellipsis, fontSize: 11, fontWeight: 700, color: c.is_mine ? YOU_TINT : accent }}>
                {c.is_mine ? 'Du' : `@${c.handle}`}
              </span>
              <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{ago(c.created_at)}</span>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: T.ink, wordBreak: 'break-word' }}>{c.text}</span>
          </div>
        ))
      )}

      {/* The composer. `form` rather than a bare input so the phone keyboard's
          own send key works — a comment box you can only submit by aiming at a
          28px button is a comment box nobody uses one-handed. */}
      <form
        onSubmit={(e) => { e.preventDefault(); send() }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 12px', borderRadius: 100, background: T.surface2, minWidth: 0 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Kommentieren …"
          aria-label="Kommentar schreiben"
          maxLength={2000}
          style={{
            flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
            fontFamily: FONT, fontSize: 12.5, fontWeight: 500, color: T.ink,
          }} />
        <button type="submit" aria-label="Kommentar senden" disabled={!draft.trim() || post.isPending}
          style={{
            ...bare, flex: 'none', width: 30, height: 30, borderRadius: 100, display: 'grid', placeItems: 'center',
            background: draft.trim() ? accent : T.heroChip,
            cursor: draft.trim() ? 'pointer' : 'default',
          }}>
          <Send size={13} color={draft.trim() ? T.heroInk : T.quiet} />
        </button>
      </form>
      {post.isError && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: T.bad }}>Der Kommentar ist nicht angekommen. Nochmal?</span>
      )}
    </div>
  )
}

// ── one ride ────────────────────────────────────────────────────────────────

/** A detail cell — the value, or an honest dash under the same label. */
function Cell({ label, value }: { label: string; value: string }) {
  const missing = value === DASH
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ ...ellipsis, fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: T.quiet }}>{label}</span>
      <span style={{ ...TNUM, ...ellipsis, fontSize: 14, fontWeight: 700, letterSpacing: -0.4, color: missing ? T.quiet : T.ink }}>{value}</span>
    </div>
  )
}

export function RideRow({ ride, avatar, open, onToggle, accent }: {
  ride: CrewRide
  avatar: string | null
  open: boolean
  onToggle: () => void
  accent: string
}) {
  const mine = ride.is_mine
  const name = mine ? 'Du' : `@${ride.handle}`
  const initial = (ride.handle || '?').trim().charAt(0).toUpperCase() || '?'
  const meta = [km(ride.distance_m), hm(ride.elevation_gain_m), dur(ride.duration_seconds)]
    .filter((v) => v !== DASH).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {/* The whole header opens the ride — a 12px chevron is not a tap target. */}
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ ...bare, display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
        <Face url={avatar} initial={initial} mine={mine} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* HOUSE RULE 5, THREE RUNGS, IN THE RIGHT ORDER. The first frame set
              the handle in white 12.5 and the ride's name in grey 12.5 — two
              lines of one size where the brighter one was the smaller fact.
              The person is the byline; the RIDE is what the row is about. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{ ...ellipsis, fontSize: 11, fontWeight: 700, color: mine ? YOU_TINT : T.mid }}>{name}</span>
            <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{ago(ride.started_at)}</span>
          </div>
          <span style={{ ...ellipsis, fontSize: 13.5, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>{ride.title || 'Fahrt'}</span>
          {meta && <span style={{ ...TNUM, ...ellipsis, fontSize: 10, fontWeight: 600, color: T.quiet }}>{meta}</span>}
        </div>
        <ChevronDown size={15} color={T.quiet}
          style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
      </button>

      {/* Collapsed, the row still carries the two things a rider acts on: what
          the crew already said, and how big the conversation is. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Reactions rideId={ride.id} seed={ride.reactions} accent={accent} />
        </div>
        <button type="button" onClick={onToggle} aria-label={`Kommentare öffnen (${ride.comment_count})`}
          style={{ ...bare, flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 100, background: T.surface2 }}>
          <MessageCircle size={12} color={ride.comment_count > 0 ? accent : T.quiet} />
          <span style={{ ...TNUM, fontSize: 11, fontWeight: 700, color: ride.comment_count > 0 ? accent : T.quiet }}>{ride.comment_count}</span>
        </button>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* The detail, in the unit riders talk in. Four cells and no fifth:
              this is the inside of a feed row, not a ride report. */}
          <div style={{ ...luxTile(16), padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <Cell label="TSS" value={ride.tss != null ? nf.format(ride.tss) : DASH} />
            <Cell label="Ø WATT" value={ride.avg_power_w != null ? nf.format(ride.avg_power_w) : DASH} />
            <Cell label="Ø PULS" value={ride.avg_hr != null ? nf.format(ride.avg_hr) : DASH} />
            {/* KCAL, not HÖHE. The first frame had a "HÖHE" cell printing
                "1.210 hm" directly under a meta line already printing
                "1.210 hm" — the same number twice, four millimetres apart, in
                a card whose whole job is to add what the collapsed row does
                not say. Opening a ride now tells you four NEW things. */}
            <Cell label="KCAL" value={ride.calories != null ? nf.format(ride.calories) : DASH} />
          </div>
          <Thread rideId={ride.id} accent={accent} />
        </div>
      )}
    </div>
  )
}

// ── the crew screen's feed: one ride, one post ──────────────────────────────

/** Media width inside a full-bleed post card at 390. */
/** 4:3, not 1:1. A ride's outline is usually wider than it is tall — roads run
 *  along valleys and coasts — so a square plate spends its height on empty
 *  ground. Instagram's own landscape aspect, for the same reason. */

/**
 * THE RIDE, AS A POST.
 *
 * The crew screen asked for a feed people actually read, and the reference for
 * that is the one everybody already knows: avatar and name up top, the picture
 * at full bleed, what people did about it underneath, then the caption and the
 * conversation.
 *
 * THE PICTURE IS THE ROUTE. A ride has no photograph, and inventing one — a
 * stock landscape, a generated scene — is exactly the fabrication this app
 * refuses everywhere else. What a ride does have is its own shape, and
 * `W3RouteCard` already made the argument that the outline is the recognisable
 * thing: a rider knows their own loop, and their crew-mates know the roads it
 * runs on. That IS a photograph of the ride, drawn from its own GPS.
 *
 * A RIDE WITH NO GPS GETS NO MAP. Indoor sessions and rides recorded with the
 * satellite off come back with `route: null`, and the plate prints the ride's
 * distance instead of drawing a shape nobody rode. The post keeps its
 * proportions either way, so the column stays a column.
 *
 * WHY THE PAGE VARIANT ONLY. Today deliberately keeps the crew as a compact
 * column inside one card — a stack of full-bleed posts would make somebody
 * else's afternoon the loudest thing on the rider's own morning. The crew
 * screen is where the feed IS the subject, so that is where it gets the room.
 */
/**
 * One ride in the feed, in whichever of the two shapes it has earned.
 *
 * THE SHAPE COMES FROM `W3FeedPost`; the plumbing stays here. Reactions and the
 * comment thread are working, tested behaviour with optimistic state and a real
 * POST behind them — rebuilding them inside the card to make the pen frames
 * exact would have replaced that with a redraw of it. They are passed in as
 * slots.
 */
function RidePost({ ride, avatar, open, onToggle, accent }: {
  ride: CrewRide
  avatar: string | null
  open: boolean
  onToggle: () => void
  accent: string
}) {
  const mine = ride.is_mine
  const tint = mine ? YOU_TINT : accent
  const name = mine ? 'Du' : `@${ride.handle}`
  const initial = (ride.handle || '?').trim().charAt(0).toUpperCase() || '?'

  const hasKm = ride.distance_m > 0
  const indoor = !ride.route || ride.route.length < 2

  // ── WHAT THE RIDE WAS, IN ITS OWN WORDS ──────────────────────────────────
  // The eyebrow is the rider's title and the headline is the measurement,
  // which is the pen's arrangement and the right way round: the title says
  // what they were doing, the figure says how much of it there was.
  const vm: W3FeedPostVm = {
    id: ride.id,
    handle: name,
    meta: [ago(ride.started_at), indoor ? 'Indoor' : null].filter(Boolean).join(' · '),
    avatarUrl: avatar,
    avatarInitial: initial,
    mine,
    eyebrow: (ride.title || '').trim().toUpperCase() || null,
    headline: hasKm
      ? km(ride.distance_m).replace(' km', '')
      : nf.format(Math.round(ride.duration_seconds / 60)),
    headlineUnit: hasKm ? 'km' : 'min',
    description: ride.description,
    // The first photo is the card. The rest belong to the ride's own page.
    photoUrl: ride.photo_urls[0] ?? null,
    badge: null,
    // Watts first — the number cyclists talk about, and it was behind the
    // expand. Every column is dropped rather than padded when the ride does
    // not carry it, so a card never prints a dash where a fact should be.
    stats: [
      ...(ride.avg_power_w != null ? [{ l: 'Ø WATT', v: nf.format(ride.avg_power_w), u: 'W' }] : []),
      ...(ride.elevation_gain_m > 0 ? [{ l: 'HÖHE', v: nf.format(Math.round(ride.elevation_gain_m)), u: 'hm' }] : []),
      { l: 'ZEIT', v: dur(ride.duration_seconds) },
      ...(ride.tss != null ? [{ l: 'TSS', v: nf.format(ride.tss) }] : []),
    ],
    elevationProfile: ride.elevation_profile,
    powerProfile: ride.power_profile,
    reactionCount: Object.values(ride.reactions?.counts ?? {}).reduce((a, b) => a + b, 0),
    commentCount: ride.comment_count,
    alsoLine: null,
    onOpen: onToggle,
  }

  return (
    <W3FeedPost
      vm={vm}
      tint={tint}
      slots={{
        actions: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Reactions rideId={ride.id} seed={ride.reactions} accent={tint} />
            </div>
            <button type="button" onClick={onToggle} aria-label={`Kommentare öffnen (${ride.comment_count})`}
              style={{ ...bare, flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 100, background: T.surface2 }}>
              <MessageCircle size={13} color={ride.comment_count > 0 ? tint : T.quiet} />
              <span style={{ ...TNUM, fontSize: 11, fontWeight: 600, color: ride.comment_count > 0 ? tint : T.quiet }}>{ride.comment_count}</span>
            </button>
          </div>
        ),
        thread: open ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.md, minWidth: 0 }}>
            <div style={{ ...luxTile(16), padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Cell label="TSS" value={ride.tss != null ? nf.format(ride.tss) : DASH} />
              <Cell label="Ø WATT" value={ride.avg_power_w != null ? nf.format(ride.avg_power_w) : DASH} />
              <Cell label="Ø PULS" value={ride.avg_hr != null ? nf.format(ride.avg_hr) : DASH} />
              <Cell label="KCAL" value={ride.calories != null ? nf.format(ride.calories) : DASH} />
            </div>
            <Thread rideId={ride.id} accent={tint} />
          </div>
        ) : (
          ride.comment_count > 0 ? (
            <button type="button" onClick={onToggle}
              style={{ ...bare, alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: T.quiet }}>
              {ride.comment_count === 1 ? '1 Kommentar ansehen' : `Alle ${ride.comment_count} Kommentare ansehen`}
            </button>
          ) : null
        ),
      }}
    />
  )
}

// ── the section ─────────────────────────────────────────────────────────────

export function W3CrewFeedView({ rides, avatars, variant = 'today' }: {
  rides: CrewRide[]
  /** user_id → their rendered rider portrait, from the standings the rank card
   *  already fetched. A member without one gets their initial. */
  avatars?: Record<number, string | null>
  /**
   * `today` — the four newest inside their own band, with the count pill and
   *   the line out to the crew screen. Today is somebody's own morning; the
   *   crew is a column on it, not the subject.
   * `page` — ALL of them, no pill, no way out. This is what the "+N weitere in
   *   der Crew" line has always promised and, until now, did not deliver: it
   *   navigated to a screen that rendered no feed at all, so the rides it
   *   counted existed nowhere the rider could reach. The crew screen supplies
   *   its own numbered chapter head, so this variant draws only the card.
   */
  variant?: 'today' | 'page'
}) {
  // One open at a time. Two expanded threads in a column push the second one's
  // composer off the bottom of a 390×844 screen, and a rider who opens a ride
  // is reading that ride.
  const [openId, setOpenId] = useState<number | null>(null)
  const navigate = useNavigate()

  if (rides.length === 0) return null

  const page = variant === 'page'
  const shown = page ? rides : rides.slice(0, FEED_VISIBLE)
  const accent = THEM_TINT

  const feedCard = (
    <div style={{ ...lux(26), padding: S.xl, gap: S.lg, minWidth: 0 }}>
      {/* On Today the card names itself under the section's eyebrow. On the
          crew screen the numbered chapter head already says "Zuletzt
          gefahren", and printing it again two lines below is the same restating
          this view deleted its highlights strip for. */}
      {!page && <Kicker>Zuletzt gefahren</Kicker>}
      {shown.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: S.lg, minWidth: 0 }}>
          {i > 0 && <div style={hairline(-S.xs)} />}
          <RideRow
            ride={r}
            avatar={avatars?.[r.user_id] ?? null}
            open={openId === r.id}
            onToggle={() => setOpenId((prev) => (prev === r.id ? null : r.id))}
            accent={accent} />
        </div>
      ))}

      {/* NO SILENT CAP. The pill counts every ride the server sent; the card
          shows four. Without this line a crew of nine rides looked like a
          crew of four that had miscounted itself. On the crew screen there is
          nothing left to cap, so the line goes away with the cap. */}
      {!page && rides.length > shown.length && (
        <button type="button" onClick={() => navigate('/e/w3-crew')}
          style={{ ...bare, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: T.mid }}>
          {`+ ${rides.length - shown.length} WEITERE IN DER CREW`}
          <ChevronRight size={13} color={T.mid} />
        </button>
      )}
    </div>
  )

  // THE CREW SCREEN IS A FEED OF POSTS, not a column inside one card. Today's
  // reasoning ("a stack of cards would be the loudest thing on the rider's own
  // morning") is about Today; here the crew IS the subject, so each ride gets
  // its own full-bleed post.
  if (page) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        {shown.map((r) => (
          <RidePost
            key={r.id}
            ride={r}
            avatar={avatars?.[r.user_id] ?? null}
            open={openId === r.id}
            onToggle={() => setOpenId((prev) => (prev === r.id ? null : r.id))}
            accent={accent} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ ...band(26), gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: T.heroMid }}>
          Deine Crew fährt
        </span>
        <div style={{ flex: 'none', padding: '7px 13px', borderRadius: 100, background: T.surface2 }}>
          <span style={{ ...TNUM, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, color: T.mid }}>
            {rides.length === 1 ? '1 FAHRT' : `${rides.length} FAHRTEN`}
          </span>
        </div>
      </div>

      {feedCard}
    </div>
  )
}

/**
 * The same feed, on the crew screen, with its own data.
 *
 * `useCrewRides` is keyed on the limit, so asking for more here is a separate
 * cache entry from Today's twelve rather than an eviction of it.
 */
export function W3CrewFeedPage() {
  const { data: rides } = useCrewRides(CREW_PAGE_LIMIT)
  const { data: standings } = useCrewStandings('week')
  const avatars: Record<number, string | null> = {}
  for (const row of standings?.standings ?? []) avatars[row.user_id] = row.avatar ?? null
  return <W3CrewFeedView rides={rides ?? []} avatars={avatars} variant="page" />
}

export default function W3CrewFeed() {
  const { data: rides } = useCrewRides(FEED_LIMIT)
  // Faces only — the same week the rank card above already asked for, so this
  // resolves out of the react-query cache instead of hitting the network.
  const { data: standings } = useCrewStandings('week')

  const avatars: Record<number, string | null> = {}
  for (const row of standings?.standings ?? []) avatars[row.user_id] = row.avatar ?? null

  return <W3CrewFeedView rides={rides ?? []} avatars={avatars} />
}
