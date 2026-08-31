import { useCallback, useEffect, useState } from 'react'
import { useShareInvite } from './useShareInvite'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Sparkles, Users, Trophy, ArrowRight, ArrowLeft, Loader2, Plus, BadgeCheck, Share2, Check, ScanFace, Wand2, Bike, Mountain, Route as RouteIcon } from 'lucide-react'
import { T, FONT, EASE, DASH, band } from './w3tokens'
import { renderAvatarCard, sharePoster, shareTextOrCopy } from './w3share'
import './w3.css'

/**
 * W3 · Avatar onboarding + "AVATAR UNLOCKED" reveal (pen `lQimK`, reworked).
 *
 * The LLM pipeline (`/garage/asset/render` kind:'rider') turns the photo into
 * the collectible figurine; the reveal shows it with the rider's REAL lifetime
 * stats, a real LEVEL (everyone starts at 1, grows with lifetime riding) with
 * its progress bar, a ShareCard-style handle chip, and dopamine insight tiles
 * that contextualise the raw numbers ("≈ 7× Mount Everest", "12% um die Erde").
 *
 * The reveal is shareable: the CARD (rider + @handle + role/LVL + the headline
 * stat) is composed on a canvas by `w3share.renderAvatarCard` and handed to the
 * same share plumbing the ride poster uses — native sheet with the PNG file,
 * else a PNG download, else a copied link. The bitmap is rendered ahead of the
 * tap so `navigator.share` still runs inside the user gesture (Safari).
 */

/** `unavailable` = the studio could not produce a real figurine (no image model,
 *  or the call failed). It is its own stage on purpose: the alternative was
 *  navigating away silently, which read as the app skipping the whole flow. */
export type AvatarStage = 'intro' | 'generating' | 'revealed' | 'unavailable'
export type InsightKey = 'elevation' | 'longest' | 'speed' | 'burned'
export interface AvatarFact {
  icon: 'distance' | 'climb' | 'rides'
  /** Already formatted, or the em dash. Never a padded zero. */
  value: string
  label: string
  /** What the figure MEANS, in a unit a person owns. */
  caption: string
}

const FACT_ICON: Record<AvatarFact['icon'], typeof Bike> = {
  distance: RouteIcon, climb: Mountain, rides: Bike,
}

export interface AvatarInsight { key: InsightKey; label: string; value: string; caption: string }
export interface AvatarReveal {
  avatarUrl: string | null
  handle: string
  role: string
  level: number
  levelPct: number          // 0..1 progress to the next level
  xpNote: string            // "120 XP bis Level 13"
  headline: string          // "4.812 km — 12 % um die Erde"
  /** What this upload just paid, in RideCoin. Null when nothing was granted —
   *  a rider who re-renders their avatar does not earn it twice, and a fake
   *  celebration is worse than none. */
  photoBonusRc: number | null
  /** THREE facts, and only three. The pen's reveal (`Z2ryuL`) fits the whole
   *  moment above the fold, and a reward you have to scroll through stops being
   *  one. These are the three a rider says out loud — how far, how high, how
   *  many — each with the human translation as its caption. */
  facts: [AvatarFact, AvatarFact, AvatarFact]
  secondary: AvatarInsight[]
  syncNote: string
}
export interface W3AvatarOnboardProps {
  heroImageUrl: string | null
  stage?: AvatarStage
  reveal?: AvatarReveal
  /** Why the studio stage failed, in plain language. Shown on `unavailable` so
   *  the rider (and whoever they report it to) can tell an unreadable photo
   *  apart from a server that didn't answer. */
  failure?: string | null
  onPick: () => void
  onSkip: () => void
  onTake?: () => void
}

/**
 * The four reasons, folded into one 44px proof strip. They used to be four
 * stacked cards (~272px) — the intro has to be a true one-pager at 390×844, and
 * a promise the rider has to scroll to reach is worth less than the hero above
 * it. Icon + two words each is enough to carry the same four ideas.
 */
const PERKS: { icon: typeof Mountain; label: string }[] = [
  { icon: Bike, label: 'DEIN BIKE' },
  { icon: Mountain, label: 'JEDE FAHRT' },
  { icon: Users, label: 'DEINE CREW' },
  { icon: Trophy, label: 'LEVELT MIT' },
]

/** Reveal confetti palette — the generating stage falls in the same colours so
 *  the wait and the unlock read as one continuous moment. */
/**
 * The burst. TWO COLOURS, ONE SHOT.
 *
 * It used to be six pieces in four colours — acid, violet, cyan, amber —
 * falling on an INFINITE loop with a 0.8s repeat delay. Confetti that never
 * stops is not a celebration, it is a screensaver: the moment never resolves,
 * and the eye keeps being pulled back to the top of the screen while the rider
 * is trying to read their own name. It also imported two accent colours that
 * appear nowhere else in W3.
 *
 * Now it falls once, in the house's own acid and lilac, and then the screen is
 * still. Twelve pieces rather than six, because a single pass needs enough of
 * them to read as a burst.
 */
const CONFETTI = Array.from({ length: 12 }, (_, i) => ({
  hue: i % 3 === 0 ? T.lilac : T.acid,
  left: 6 + i * 7.6,
  delay: (i % 5) * 0.06,
  drift: i % 2 === 0 ? 14 : -14,
}))

/**
 * The two phases the render pipeline genuinely runs, in this order: the vision
 * pass reads the photo, then the image model renders the figurine. The endpoint
 * (`/garage/asset/render`) is ONE call with no progress events, so the switch is
 * time-based (typical vision pass ≈ 10s) — copy only, never a fake percentage.
 */
const PHASES: { icon: typeof Mountain; label: string; note: string }[] = [
  { icon: ScanFace, label: 'Dein Foto wird gelesen', note: 'Gesicht, Haltung, Farben — Ridr Studio schaut genau hin.' },
  { icon: Wand2, label: 'Dein Rider wird gebaut', note: 'Das Bildmodell formt daraus deine Collectible-Figur.' },
]
const PHASE_SWITCH_S = 10
/** Anticipation, not filler — rotates so the wait never looks frozen. */
const TEASERS = [
  'Gleich fährt er deine erste Szene.',
  'Auf jedem Leaderboard steht dann dein Gesicht.',
  'Er wächst mit jedem Watt, den du trittst.',
  'Gute Sachen brauchen kurz. Fast da.',
]


/** Counts a figure up on arrival. A number that simply appears was always
 *  there; a number that counts is one the rider watched being paid. */
function CountUp({ to, reduce }: { to: number; reduce: boolean | null }) {
  const [n, setN] = useState(reduce ? to : 0)
  useEffect(() => {
    if (reduce) { setN(to); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    const start = window.setTimeout(() => { raf = requestAnimationFrame(tick) }, 560)
    return () => { window.clearTimeout(start); cancelAnimationFrame(raf) }
  }, [to, reduce])
  return <>{n}</>
}

/**
 * The payout, as a moment rather than a row.
 *
 * The rider just handed over a photograph of their face — the largest ask in
 * the whole flow — and the coins landed silently in a wallet nobody was looking
 * at. Sitting the figure inline on the page made it another stat among stats;
 * it has to INTERRUPT to read as a reward.
 *
 * So it arrives over the whole screen, is counted up rather than printed, and
 * leaves on its own after three seconds. Nothing to dismiss: a celebration that
 * asks for a tap is a task.
 */
function W3PayoutOverlay({ rc, onDone }: { rc: number; onDone: () => void }) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const t = window.setTimeout(onDone, 3000)
    return () => window.clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center',
        background: `radial-gradient(120% 90% at 50% 50%, ${T.bg}E6, ${T.bg}FA)`,
        pointerEvents: 'none', fontFamily: FONT,
      }}>
      {/* the bloom behind it, so the coin arrives out of light */}
      <motion.div aria-hidden
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{ position: 'absolute', width: 460, height: 460, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}2E, transparent)` }} />

      <motion.div
        initial={reduce ? false : { scale: 0.5, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 17, delay: 0.1 }}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <span style={{
          width: 74, height: 74, borderRadius: 100, display: 'grid', placeItems: 'center',
          background: T.acid, boxShadow: `0 0 46px ${T.acid}99`,
        }}>
          <Sparkles size={32} color={T.heroInk} />
        </span>
        <span style={{
          fontFamily: 'Archivo, "Inter Tight", sans-serif', fontSize: 52, fontWeight: 800,
          letterSpacing: -2, lineHeight: 1, color: T.acid,
        }}>
          +<CountUp to={rc} reduce={reduce} /> RC
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>fürs Foto von dir</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid }}>gutgeschrieben</span>
      </motion.div>
    </motion.div>
  )
}

export default function W3AvatarOnboardView({ heroImageUrl, stage = 'intro', reveal, failure, onPick, onSkip, onTake }: W3AvatarOnboardProps) {
  // The avatar card is an exported image too — it carries the invite.
  useShareInvite()
  const reduce = useReducedMotion()


  // ── Shareable reveal card ──
  // Every dep is a primitive so callers can pass an inline `reveal` literal
  // without re-triggering the render on every commit.
  const revealed = stage === 'revealed' && !!reveal
  const rAvatar = reveal?.avatarUrl ?? null
  const rHandle = reveal?.handle ?? ''
  const rRole = reveal?.role ?? ''
  const rLevel = reveal?.level ?? 1
  const rHeadline = reveal?.headline ?? ''
  // ── VALUE AND LABEL TRAVEL TOGETHER ─────────────────────────────────────
  // The card used to read its three figures out of one shape and its three
  // labels out of a hand-written list, and when the reveal's facts changed the
  // two drifted: the card printed the climbing metres under the heading
  // SATTELZEIT. They come from the same objects now, so the card cannot label a
  // number as something it is not.
  const rFacts = reveal?.facts ?? null
  const rStamp = rFacts ? rFacts.map((f) => `${f.label}:${f.value}`).join(',') : ''
  const rSync = reveal?.syncNote ?? ''
  // The rendered bitmap is stamped with the payload it was drawn from, so
  // "ready" is derived — no state reset inside the effect.
  // (the avatar is a fat data: URL — key off its length + tail, not the bytes)
  const avatarKey = rAvatar ? `${rAvatar.length}:${rAvatar.slice(-24)}` : ''
  const cardKey = [avatarKey, rHandle, rRole, rLevel, rHeadline, rStamp, rSync].join('|')
  const [card, setCard] = useState<{ key: string; blob: Blob | null } | null>(null)
  // Opens once per payout. Keyed on the amount so a second render of the same
  // reveal does not replay the celebration.
  const payoutRc = reveal?.photoBonusRc ?? null
  const [payoutSeen, setPayoutSeen] = useState<number | null>(null)
  const payoutOpen = payoutRc != null && payoutRc > 0 && payoutSeen !== payoutRc
  const setPayoutOpen = (open: boolean) => { if (!open && payoutRc != null) setPayoutSeen(payoutRc) }
  const [shareNote, setShareNote] = useState<string | null>(null)
  const cardReady = revealed && card?.key === cardKey
  const cardBlob = cardReady ? card.blob : null

  useEffect(() => {
    if (!revealed) return
    let alive = true
    renderAvatarCard({
      avatarUrl: rAvatar,
      avatarInitial: rHandle.replace('@', '').charAt(0).toUpperCase() || '?',
      handle: rHandle || '@rider',
      role: rRole,
      level: rLevel,
      headline: rHeadline,
      stats: (rFacts
        ? rFacts.map((f) => ({ v: f.value, l: f.label }))
        : [{ v: DASH, l: 'GESAMT' }, { v: DASH, l: 'HÖHENMETER' }, { v: DASH, l: 'FAHRTEN' }]
      ) as [{ v: string; l: string }, { v: string; l: string }, { v: string; l: string }],
      footer: rSync,
    })
      .then((out) => { if (alive) setCard({ key: cardKey, blob: out.blob }) })
      .catch(() => { if (alive) setCard({ key: cardKey, blob: null }) })
    return () => { alive = false }
  }, [revealed, cardKey, rAvatar, rHandle, rRole, rLevel, rHeadline, rFacts, rSync])

  const onShareCard = useCallback(() => {
    const who = rHandle || '@rider'
    const caption = [`${who} · LVL ${rLevel}${rRole ? ` ${rRole}` : ''}`, rHeadline, '#w3ride'].filter(Boolean).join(' — ')
    setShareNote(null)
    if (cardBlob) {
      // Native sheet with the PNG → else download + copied caption.
      void sharePoster(cardBlob, caption, 'w3-avatar.png').then((how) => {
        setShareNote(how === 'downloaded' ? 'Karte gespeichert · Text kopiert' : null)
      })
      return
    }
    // No bitmap at all (canvas unavailable) → text/link only.
    const link = typeof window !== 'undefined' ? window.location.origin : undefined
    void shareTextOrCopy(caption, link).then((how) => {
      setShareNote(how === 'copied' ? 'Link kopiert' : how === 'failed' ? 'Teilen geht hier nicht' : null)
    })
  }, [cardBlob, rHandle, rRole, rLevel, rHeadline])

  // ── Reveal: "AVATAR UNLOCKED" ──
  if (stage === 'revealed' && reveal) {
    const r = reveal
    return (
      <div className="w3-root">
        {/* The payout interrupts, counts, and leaves. See `W3PayoutOverlay`. */}
        <AnimatePresence>
          {payoutOpen && r.photoBonusRc != null && r.photoBonusRc > 0 && (
            <W3PayoutOverlay rc={r.photoBonusRc} onDone={() => setPayoutOpen(false)} />
          )}
        </AnimatePresence>
        <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

          {/* ── THE CHARACTER GETS THE SCREEN ─────────────────────────────
               264 px is a thumbnail. This is the moment a rider first meets the
               figure that will stand in their garage and on every ride they
               log — the app's whole promise, shown at the size of a stamp with
               the numbers taking two thirds of the page. It fills the frame
               now, the way the bike does on Today, and the reveal is docked
               over its floor. ── */}
          <div style={{ position: 'relative', height: 'calc(100dvh - 300px)', minHeight: 360, background: T.heroBg, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '6%', left: '50%', transform: 'translateX(-50%)', width: '86%', height: '54%', borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}26, transparent)` }} />
            {!reduce && CONFETTI.map((c, i) => (
              <motion.div
                key={i}
                initial={{ y: -24, x: 0, opacity: 0, rotate: 0 }}
                animate={{ y: '100vh', x: c.drift, opacity: [0, 1, 1, 0], rotate: 220 }}
                transition={{ duration: 1.9, delay: 0.15 + c.delay, ease: 'easeIn' }}
                style={{ position: 'absolute', top: 0, left: `${c.left}%`, width: 5, height: 11, borderRadius: 100, background: c.hue }}
              />
            ))}
            {heroImageUrl && <img src={heroImageUrl} alt="Dein Rider" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 24%' }} />}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 220, background: `linear-gradient(180deg, ${T.bg}00, ${T.bg}CC 58%, ${T.bg})` }} />
            <div style={{ position: 'absolute', top: 12, left: 0, right: 0, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={onPick} aria-label="Neues Foto" style={{ width: 44, height: 44, borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={20} color={T.ink} /></button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '8px 12px', borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 100, background: T.bg, border: `1px solid ${T.d3}` }} />
                  <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.8, color: T.quiet }}>BASIC BLACK</span>
                </div>
                <div style={{ width: 34, height: 34, borderRadius: 100, background: '#00000066', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center' }}><Plus size={15} color={T.acid} /></div>
              </div>
            </div>
          </div>

          {/* ── THE MOMENT, ON ONE SCREEN ─────────────────────────────────
              REBUILT to the pen (`Z2ryuL`). It had grown into a scroll: an acid
              pill, a handle block, a headline, a level bar, then four drawn
              monuments, then the buttons — a reward you have to page through
              stops being a reward. The pen says the whole thing fits above the
              fold: the character, their name on the seam, three compact facts,
              one big action. Nothing else.

              WHICH FACTS. Not the seven the page used to carry. Three, chosen
              because they are the three a rider would say out loud — how far,
              how high, how many — each one figure with its icon, and the human
              translation ("6,9× Everest") kept as the caption underneath. The
              rest lives on the profile, where there is room to draw it. ── */}
          <div style={{ ...band(18), paddingTop: 0, marginTop: -26, gap: 14, alignItems: 'center', position: 'relative', zIndex: 2 }}>

            {/* The handle rides ON the seam, the way the pen has it. */}
            <motion.div
              initial={reduce ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 18px', borderRadius: 100, background: T.heroDock }}>
              <Sparkles size={13} color={T.acid} />
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.3, color: T.ink }}>{r.handle}</span>
            </motion.div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>{r.role}</span>
              <span aria-hidden style={{ width: 3, height: 3, borderRadius: 100, background: T.quiet }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.acid }}>LEVEL {r.level}</span>
            </div>

            {/* THREE FACTS, one row, one weight. */}
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {r.facts.map((f, i) => {
                const Icon = FACT_ICON[f.icon]
                return (
                  <motion.div key={f.label}
                    initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE, delay: 0.2 + i * 0.07 }}
                    style={{
                      flex: 1, minWidth: 0, borderRadius: 20, padding: '13px 12px 14px',
                      background: `radial-gradient(120% 90% at 50% 100%, ${T.acid}14, ${T.tile} 64%)`,
                      display: 'flex', flexDirection: 'column', gap: 7,
                    }}>
                    <Icon size={15} color={T.acid} />
                    <span style={{
                      fontFamily: 'Archivo, "Inter Tight", sans-serif', fontSize: 21, fontWeight: 700,
                      letterSpacing: -0.8, color: f.value === DASH ? T.quiet : T.ink,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{f.value}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.9, color: T.quiet, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.label}
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: T.mid, lineHeight: 1.25, minWidth: 0, overflow: 'hidden' }}>
                      {f.caption}
                    </span>
                  </motion.div>
                )
              })}
            </div>

            {/* Level progress — one thin line, no label until it needs words. */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ height: 5, borderRadius: 100, background: T.d1, overflow: 'hidden' }}>
                <motion.div
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.round(r.levelPct * 100)}%` }}
                  // Slow, and AFTER the coin: the bar is the consequence, so it
                  // must not start before the cause has been shown.
                  // After the overlay has had its three seconds, so the rider is
                  // looking at the bar when it moves.
                  transition={{ duration: 2.4, ease: EASE, delay: r.photoBonusRc ? 3.3 : 0.4 }}
                  style={{ height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.acidDeep}, ${T.acid})`, boxShadow: `0 0 14px ${T.acid}66` }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, alignSelf: 'center' }}>{r.xpNote}</span>
            </div>

            <div style={{ width: '100%', display: 'flex', gap: 10 }}>
              <button onClick={onTake} style={{ flex: 1, height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.heroInk, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                Übernehmen<ArrowRight size={18} color={T.heroInk} />
              </button>
              <button onClick={onShareCard} disabled={!cardReady} aria-label="Karte teilen"
                style={{ flex: 'none', width: 54, height: 54, borderRadius: 100, background: T.surface2, border: 0, color: T.ink, fontFamily: FONT, cursor: cardReady ? 'pointer' : 'default', opacity: cardReady ? 1 : 0.55, display: 'grid', placeItems: 'center' }}>
                {cardReady ? <Share2 size={19} color={T.acid} /> : <Loader2 size={19} color={T.quiet} className="w3-spin" />}
              </button>
            </div>
            {shareNote && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>{shareNote}</span>}

            {r.syncNote && (
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <BadgeCheck size={16} color={T.acid} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{r.syncNote}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'generating') return <W3AvatarGenerating heroImageUrl={heroImageUrl} />

  // The studio couldn't render. Honest, and recoverable in place — the rider
  // stays on this screen with their photo and a retry, instead of being moved
  // on as though nothing had been attempted.
  if (stage === 'unavailable') {
    return (
      <div className="w3-root">
        <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 26px', textAlign: 'center' }}>
          {heroImageUrl && (
            <div style={{ width: 132, height: 132, borderRadius: 26, overflow: 'hidden', border: `1px solid ${T.stroke}`, opacity: 0.5 }}>
              <img src={heroImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.15, color: T.ink }}>
            Das Studio hat gerade nicht geantwortet
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid, maxWidth: 300 }}>
            Dein Foto ist noch da. Probier es nochmal — oder mach es später in der Garage.
          </span>
          {failure && (
            <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: T.quiet, maxWidth: 300, padding: '8px 12px', borderRadius: 12, background: T.surface }}>
              {failure}
            </span>
          )}
          <button onClick={onPick}
            style={{ width: '100%', maxWidth: 320, height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>
            Nochmal versuchen
          </button>
          <button onClick={onSkip}
            style={{ height: 44, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            Später
          </button>
        </div>
      </div>
    )
  }

  // ── Intro: ONE PAGE at 390×844, safe areas included, nothing scrolls ──
  // The hero is the only flexible box (`flex: 1`), so every copy-length or
  // safe-area difference is absorbed by the photo instead of pushing the CTA
  // off-screen. Fixed stack below = 408px; top inset ≈ 47px; hero ≈ 389px.
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        <div style={{ height: 'max(12px, env(safe-area-inset-top))' }} />

        {/* The hero is the only flexible box. Its image is ABSOLUTE so the box
            contributes zero intrinsic height: the flex base is 0, the fixed
            stack below is the whole content height, and the photo takes exactly
            what is left of the viewport. An in-flow `height: 100%` img would
            resolve to its intrinsic height here and push the CTA off-screen. */}
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 200, background: T.bg, overflow: 'hidden' }}>
          {heroImageUrl
            ? (
              <motion.img
                src={heroImageUrl} alt="Dein Collectible-Rider"
                initial={reduce ? false : { opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.9, ease: EASE }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 28%' }} />
            )
            : (
              /* THE EMPTY STATE IS THE SELL. This is the screen asking for a
                 photo, so what stands in for the photo has to make the rider
                 want one — a flat grey slab with a grey bicycle on it argued
                 the opposite. It is now the W3 stage: an acid bloom breathing
                 under a knocked-back silhouette, so the empty frame reads as a
                 place waiting to be filled rather than a failed image. */
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <motion.div aria-hidden
                  animate={reduce ? undefined : { opacity: [0.5, 0.85, 0.5], scale: [1, 1.06, 1] }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}2E, transparent)`, filter: 'blur(6px)' }} />
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                  {/* A PORTRAIT FRAME, NOT A LOOSE ICON. The dashed acid seat is
                      already this system's "your image belongs here" (the empty
                      rider in W3BikeHero uses it), and a frame states the offer
                      that an icon alone only hints at. It breathes so the empty
                      slot reads as waiting rather than broken. */}
                  <motion.div
                    animate={reduce ? undefined : { scale: [1, 1.035, 1] }}
                    transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      width: 168, height: 168, borderRadius: 40, display: 'grid', placeItems: 'center',
                      border: `2px dashed ${T.acid}66`, background: `${T.acid}0A`,
                      boxShadow: `0 0 60px ${T.acid}1F`,
                    }}>
                    <Bike size={72} strokeWidth={1.2} color={T.acid} />
                  </motion.div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: T.acid }}>
                    Hier steht dein Rider
                  </span>
                </div>
              </div>
            )}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

        <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
          style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 'none', padding: '16px 20px calc(20px + env(safe-area-inset-bottom))', background: T.bg, position: 'relative', zIndex: 2 }}>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start', padding: '5px 11px', borderRadius: 100, background: T.acidDim }}>
            <Sparkles size={11} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>NOCH EINE SACHE</span>
          </div>

          {/* TWO-TONE DISPLAY, the W3 idiom for a line that has to land (the
              celebration screen sets "Cobbles" against "beaten." the same way).
              One flat ink sentence was the quietest thing on the most
              persuasive screen in the product; the acid falls on "rein",
              because being in is the whole offer. */}
          <span style={{ marginTop: 10, fontSize: 34, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.02, color: T.ink }}>
            Jetzt kommst du{' '}
            <span style={{ color: T.acid, textShadow: `0 0 30px ${T.acid}59` }}>rein</span>
          </span>
          <span style={{ marginTop: 8, fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
            Ein Foto — und du wirst zum Collectible-Rider, das Gesicht jeder deiner Fahrten.
          </span>

          {/* The four reasons, folded into one strip */}
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {PERKS.map((p, i) => {
              const Ic = p.icon
              return (
                <motion.div key={p.label} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.12 + i * 0.05 }}
                  style={{ height: 44, borderRadius: 14, background: T.surface, border: `1px solid ${T.rule}`, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                  <Ic size={15} color={T.acid} />
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.4, color: T.mid, whiteSpace: 'nowrap' }}>{p.label}</span>
                </motion.div>
              )
            })}
          </div>

          <button onClick={onPick} style={{ marginTop: 16, height: 56, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
            <Camera size={19} color={T.bg} />Foto hinzufügen
          </button>
          <button onClick={onSkip} style={{ marginTop: 4, height: 44, background: 'transparent', border: 0, color: T.quiet, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            Vielleicht später<ArrowRight size={14} color={T.quiet} />
          </button>
          <span style={{ marginTop: 2, display: 'block', textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>
            Einmal für deinen Avatar genutzt, danach verworfen. Nie geteilt.
          </span>
        </motion.div>
      </div>
    </div>
  )
}

/**
 * W3 · UNLOCK 02, first half — the 10–60s render, staged as the run-up to the
 * reveal instead of a spinner apologising for the delay.
 *
 * Same vocabulary as "AVATAR UNLOCKED": the acid bloom, the falling confetti,
 * the pill kicker, the 28px display line — so the wait and the unlock read as
 * one continuous moment. The rider's own photo stays on screen the whole time,
 * because it is the thing being transformed; the acid sweep runs over it.
 *
 * Its own component so the wait clock starts at 0 on every entry (a retry from
 * the reveal's "Neues Foto" remounts it), and so the interval only exists while
 * this screen does.
 */
function W3AvatarGenerating({ heroImageUrl }: { heroImageUrl: string | null }) {
  const reduce = useReducedMotion()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const phase = elapsed < PHASE_SWITCH_S ? 0 : 1
  const teaser = TEASERS[Math.floor(elapsed / 5) % TEASERS.length]
  const CARD_W = 210, CARD_H = 264

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

        {/* Ambient acid bloom — the reveal's cover glow, held for the wait */}
        <div aria-hidden style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', width: 420, height: 420, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}26, transparent)`, pointerEvents: 'none' }} />
        {!reduce && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            {CONFETTI.map((c, i) => (
              <motion.div key={i} initial={{ y: -24, opacity: 0 }} animate={{ y: [-24, 900], opacity: [0, 0.85, 0], rotate: [0, 180] }}
                transition={{ duration: 3.6, delay: i * 0.5, repeat: Infinity, repeatDelay: 1.8, ease: 'linear' }}
                style={{ position: 'absolute', top: 0, left: `${c.left}%`, width: 5, height: 11, borderRadius: 100, background: c.hue }} />
            ))}
          </div>
        )}

        <div style={{ height: 'max(12px, env(safe-area-inset-top))' }} />

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px calc(24px + env(safe-area-inset-bottom))' }}>

          {/* Chapter kicker — the chapter the reveal lands in */}
          <motion.div initial={reduce ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.45, ease: EASE }}
            style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '6px 13px', borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}44` }}>
            <Sparkles size={11} color={T.acid} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.acid }}>W3 · UNLOCK 02</span>
          </motion.div>

          {/* The photo, being minted */}
          <div style={{ position: 'relative', width: CARD_W + 4, height: CARD_H + 4, marginTop: 20, borderRadius: 26, overflow: 'hidden', background: `${T.acid}2E`, display: 'grid', placeItems: 'center' }}>
            {!reduce && (
              <motion.div aria-hidden animate={{ rotate: 360 }} transition={{ duration: 5.5, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', width: CARD_H * 2, height: CARD_H * 2, background: `conic-gradient(from 0deg, transparent 0deg, ${T.acid} 45deg, transparent 110deg)` }} />
            )}
            <div style={{ position: 'absolute', inset: 2, borderRadius: 24, overflow: 'hidden', background: T.chip }}>
              {heroImageUrl
                ? <img src={heroImageUrl} alt="Dein Foto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%', filter: 'brightness(0.62) saturate(0.85)' }} />
                : (
                  // A PERSON, NOT A BICYCLE. This slot is the rider's own
                  // photograph being turned into their avatar, and it stood
                  // empty behind a bicycle icon — the wrong object entirely on
                  // the one screen that is asking for a face. It is now the
                  // shipped character: a W3 collectible in the kit, on the
                  // studio ground, deadpan. It shows what is about to happen
                  // instead of naming it — and at 0.5 opacity it read as a grey
                  // smudge, which sells nothing. It is the promise of the
                  // screen, so it is allowed to be seen.
                  <img src="/w3/example-rider.webp" alt="" aria-hidden
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%', opacity: 0.92 }} />
                )}
              {/* acid scan sweep — the transformation, running over their face */}
              {!reduce && (
                <motion.div aria-hidden animate={{ y: [-82, CARD_H] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 82, background: `linear-gradient(180deg, transparent, ${T.acid}26)` }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: `linear-gradient(90deg, transparent, ${T.acid}, transparent)`, boxShadow: `0 0 16px ${T.acid}` }} />
                </motion.div>
              )}
              <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, background: 'linear-gradient(180deg, transparent, #0B0B0BCC)' }} />
            </div>
          </div>

          <span style={{ marginTop: 22, fontSize: 28, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink, textAlign: 'center' }}>Dein Rider entsteht</span>
          {/* rotating anticipation line — it's copy, so it still lands under reduced motion */}
          <motion.span key={teaser} initial={reduce ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
            style={{ marginTop: 8, fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: T.acid, textAlign: 'center', minHeight: 36 }}>{teaser}</motion.span>

          {/* Honest phase copy — no percentage, because there is no progress signal */}
          <div style={{ width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PHASES.map((p, i) => {
              const Ic = p.icon
              const done = i < phase
              const active = i === phase
              return (
                <div key={p.label} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 13px', borderRadius: 16, background: active ? T.surface : 'transparent', border: `1px solid ${active ? `${T.acid}3D` : T.rule}`, opacity: done || active ? 1 : 0.55 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 10, flex: 'none', background: done || active ? T.acidDim : T.surface, display: 'grid', placeItems: 'center' }}>
                    {done ? <Check size={15} color={T.acid} strokeWidth={3} /> : <Ic size={15} color={active ? T.acid : T.quiet} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: done || active ? T.ink : T.mid }}>{p.label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.3, color: T.quiet }}>{p.note}</span>
                  </div>
                  {active && <Loader2 size={15} color={T.acid} className="w3-spin" style={{ marginLeft: 'auto', flex: 'none' }} />}
                </div>
              )
            })}
          </div>

          <span style={{ marginTop: 14, fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet, textAlign: 'center' }}>
            Dauert meist 10–60 Sekunden. Bleib kurz hier — dein Avatar wartet schon.
          </span>
        </div>
      </div>
    </div>
  )
}
