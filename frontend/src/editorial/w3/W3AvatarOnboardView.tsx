import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Camera, Sparkles, Mountain, Users, Trophy, ArrowRight, ArrowLeft, Bike, Loader2, Route as RouteIcon, Timer, Plus, BadgeCheck, Gauge, Flame, Share2, Check, ScanFace, Wand2 } from 'lucide-react'
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
const CONFETTI = [T.acid, T.evening, '#00E5FF', T.warn, T.acid, T.evening]

/**
 * The two phases the render pipeline genuinely runs, in this order: the vision
 * pass reads the photo, then the image model renders the figurine. The endpoint
 * (`/garage/asset/render`) is ONE call with no progress events, so the switch is
 * time-based (typical vision pass ≈ 10s) — copy only, never a fake percentage.
 */
const PHASES: { icon: typeof Mountain; label: string; note: string }[] = [
  { icon: ScanFace, label: 'Dein Foto wird gelesen', note: 'Gesicht, Haltung, Farben — Cycl_r Studio schaut genau hin.' },
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

const PRIMARY = [
  { icon: RouteIcon, label: 'GESAMTDISTANZ', key: 'totalDistance' as const },
  { icon: Bike, label: 'FAHRTEN GESAMT', key: 'totalRides' as const },
  { icon: Timer, label: 'SATTELZEIT', key: 'saddleTime' as const },
]
const INSIGHT_META: Record<InsightKey, { icon: typeof Mountain; hue: string }> = {
  elevation: { icon: Mountain, hue: T.evening },
  longest: { icon: RouteIcon, hue: '#00E5FF' },
  speed: { icon: Gauge, hue: T.training },
  burned: { icon: Flame, hue: T.warn },
}

export default function W3AvatarOnboardView({ heroImageUrl, stage = 'intro', reveal, failure, onPick, onSkip, onTake }: W3AvatarOnboardProps) {
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
  const rDistance = reveal?.primary.totalDistance ?? DASH
  const rRides = reveal?.primary.totalRides ?? DASH
  const rSaddle = reveal?.primary.saddleTime ?? DASH
  const rSync = reveal?.syncNote ?? ''
  // The rendered bitmap is stamped with the payload it was drawn from, so
  // "ready" is derived — no state reset inside the effect.
  // (the avatar is a fat data: URL — key off its length + tail, not the bytes)
  const avatarKey = rAvatar ? `${rAvatar.length}:${rAvatar.slice(-24)}` : ''
  const cardKey = [avatarKey, rHandle, rRole, rLevel, rHeadline, rDistance, rRides, rSaddle, rSync].join('|')
  const [card, setCard] = useState<{ key: string; blob: Blob | null } | null>(null)
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
      stats: [
        { v: rDistance, l: 'GESAMTDISTANZ' },
        { v: rRides, l: 'FAHRTEN GESAMT' },
        { v: rSaddle, l: 'SATTELZEIT' },
      ],
      footer: rSync,
    })
      .then((out) => { if (alive) setCard({ key: cardKey, blob: out.blob }) })
      .catch(() => { if (alive) setCard({ key: cardKey, blob: null }) })
    return () => { alive = false }
  }, [revealed, cardKey, rAvatar, rHandle, rRole, rLevel, rHeadline, rDistance, rRides, rSaddle, rSync])

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
    const initial = r.handle.replace('@', '').charAt(0).toUpperCase() || '?'
    return (
      <div className="w3-root">
        <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>

          {/* Cover: rider + header + confetti */}
          <div style={{ position: 'relative', height: 264, background: '#141414', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 320, height: 240, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}33, transparent)` }} />
            {CONFETTI.map((c, i) => (
              <motion.div key={i} initial={reduce ? false : { y: -20, opacity: 0 }} animate={{ y: [-20, 264], opacity: [0, 1, 0], rotate: [0, 180] }} transition={{ duration: 2.4, delay: i * 0.13, repeat: Infinity, repeatDelay: 0.8 }}
                style={{ position: 'absolute', top: 0, left: `${12 + i * 14}%`, width: 6, height: 12, borderRadius: 2, background: c }} />
            ))}
            {heroImageUrl && <img src={heroImageUrl} alt="Dein Rider" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%' }} />}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
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

          {/* Bottom panel — compact, one page */}
          <div style={{ ...band(16), paddingTop: 0, marginTop: -14, gap: 9, alignItems: 'center', position: 'relative', zIndex: 2 }}>
            <motion.div initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
              style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 14px', borderRadius: 100, background: T.acid, boxShadow: `0 0 24px ${T.acid}88` }}>
              <Sparkles size={13} color="#121212" /><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#121212' }}>AVATAR ENTSPERRT</span>
            </motion.div>

            {/* Handle chip (ShareCard style) + LVL badge */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <div style={{ width: 42, height: 42, borderRadius: 100, overflow: 'hidden', background: T.surface2, border: `2px solid ${T.acid}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  {r.avatarUrl ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 17, fontWeight: 700, color: T.mid }}>{initial}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{r.handle}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>{r.role}</span>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: '#121212', padding: '6px 12px', borderRadius: 100, background: T.acid }}>LVL {r.level}</span>
            </div>

            {/* Slim level bar */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ height: 6, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
                <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(r.levelPct * 100)}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
                  style={{ height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.acidDeep}, ${T.acid})`, boxShadow: `0 0 8px ${T.acid}88` }} />
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet, alignSelf: 'flex-end' }}>{r.xpNote}</span>
            </div>

            {/* Stats primary — 3 cells */}
            <div style={{ display: 'flex', width: '100%', borderRadius: 18, background: T.surface, border: `1px solid ${T.stroke}`, overflow: 'hidden' }}>
              {PRIMARY.map((p, i) => {
                const Ic = p.icon
                const v = r.primary[p.key]
                return (
                  <div key={p.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 8px', alignItems: 'flex-start', borderLeft: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                    <Ic size={18} color={T.acid} />
                    <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.6, color: T.quiet }}>{p.label}</span>
                    <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: v === '—' ? T.quiet : T.ink }}>{v}</span>
                  </div>
                )
              })}
            </div>

            {/* Secondary — dopamine insight tiles (2×2) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
              {r.secondary.map((t) => {
                const meta = INSIGHT_META[t.key]; const Ic = meta.icon
                return (
                  <div key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 12px', borderRadius: 16, background: `linear-gradient(180deg, ${meta.hue}14, ${T.surface})`, border: `1px solid ${meta.hue}2E` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 8, background: `${meta.hue}22`, display: 'grid', placeItems: 'center' }}><Ic size={14} color={meta.hue} /></div>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>{t.label}</span>
                    </div>
                    <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.5, color: t.value === '—' ? T.quiet : T.ink }}>{t.value}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.25, color: meta.hue }}>{t.caption}</span>
                  </div>
                )
              })}
            </div>

            <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 2 }}>
              <button onClick={onTake} style={{ flex: 1, height: 52, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                Übernehmen<ArrowRight size={18} color={T.bg} />
              </button>
              <button onClick={onShareCard} disabled={!cardReady} aria-label="Karte teilen"
                style={{ flex: 'none', height: 52, padding: '0 18px', borderRadius: 100, background: T.surface2, border: `1px solid ${T.stroke}`, color: T.ink, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: cardReady ? 'pointer' : 'default', opacity: cardReady ? 1 : 0.55, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                {cardReady ? <Share2 size={17} color={T.acid} /> : <Loader2 size={17} color={T.quiet} className="w3-spin" />}
                Teilen
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
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 200, background: '#232427', overflow: 'hidden' }}>
          {heroImageUrl
            ? <img src={heroImageUrl} alt="Dein Collectible-Rider" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 28%' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.quiet }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <Bike size={72} strokeWidth={1.2} color="#3A3A3A" /><span style={{ fontSize: 12, fontWeight: 600 }}>Hier steht dein Rider</span>
                </div>
              </div>}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: `linear-gradient(180deg, transparent, ${T.bg})` }} />
        </div>

        <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
          style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 'none', padding: '16px 20px calc(20px + env(safe-area-inset-bottom))', background: T.bg, position: 'relative', zIndex: 2 }}>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start', padding: '5px 11px', borderRadius: 100, background: T.acidDim }}>
            <Sparkles size={11} color={T.acid} /><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.acid }}>NOCH EINE SACHE</span>
          </div>

          <span style={{ marginTop: 10, fontSize: 30, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.05, color: T.ink }}>Jetzt kommst du rein</span>
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
                style={{ position: 'absolute', top: 0, left: `${9 + i * 15}%`, width: 5, height: 11, borderRadius: 2, background: c }} />
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
            <div style={{ position: 'absolute', inset: 2, borderRadius: 24, overflow: 'hidden', background: '#232427' }}>
              {heroImageUrl
                ? <img src={heroImageUrl} alt="Dein Foto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%', filter: 'brightness(0.62) saturate(0.85)' }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Bike size={64} strokeWidth={1.2} color="#3A3A3A" /></div>}
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
