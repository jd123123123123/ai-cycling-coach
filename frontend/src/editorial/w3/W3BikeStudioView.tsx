import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Camera, Sparkles, RefreshCw, Download, Bike, Plus, Loader2, Coins } from 'lucide-react'
import { T, FONT, EASE, band, Kicker } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3Loading from './W3Loading'
import { GhostBike } from './W3BikeHero'
import { parseBikeSpec } from '../../utils/bikeSpec'

/**
 * W3 · Bike Studio (the GARAGE tab) — photo of your real bike → a W3:Ride-style
 * collectible render. Pure function of props; `W3BikeStudioPage` owns the
 * capture + the `POST /garage/asset/render` call. Honest by construction: the
 * `description` line is the REAL vision output; the render image appears only
 * when an image model is provisioned (`renderStatus === 'ok'`), otherwise the
 * card shows an honest "studio unavailable" state plus the exact prompt — never
 * a faked photo. Output is a stylised, identity-preserving render, not a mesh.
 */

export type StudioState = 'loading' | 'intro' | 'analyzing' | 'rendering' | 'reveal' | 'error'

export interface W3BikeStudioProps {
  state: StudioState
  photoUrl: string | null          // the uploaded bike photo (data URL)
  description: string | null       // real vision analysis text
  imageUrl: string | null          // rendered collectible (data URL) or null
  renderStatus: string | null      // 'ok' | 'image_model_unavailable'
  prompt: string | null            // the prompt we'd send — surfaced when unavailable
  error: string | null
  onBack: () => void               // top-nav back
  onPick: () => void               // open the photo-library / file picker
  onReset: () => void
  onSave: () => void               // download the rendered collectible (image present only)
  bikeName?: string                // the collectible's real name, from the vision pass
  /** True only for a bike rendered JUST NOW. The unlock celebration is a
   *  one-time moment; walking into your own garage must not re-fire confetti
   *  and "BIKE UNLOCKED" for a bike you've owned for weeks. */
  celebrate?: boolean
  /** The RideCoin this unlock actually paid, straight from the server
   *  (`POST /rewards/onboarding/bike` → `{granted, balance}`).
   *  - `granted > 0` — credited just now; the screen shows that number.
   *  - `granted === 0` — the one-time bike grant was already claimed on an
   *    earlier bike. The screen says so; it never shows a fresh +150 twice.
   *  - `null` — no answer (in flight, or the call failed). Then NO RideCoin
   *    figure is shown at all, rather than a number nothing stands behind. */
  reward?: { granted: number; balance: number } | null
  rewardPending?: boolean
}

/**
 * The bike's spec sheet — the vision pass's own words, split into the sections
 * it was asked for (`utils/bikeSpec`). Nothing is inferred: when the text isn't
 * confidently structured, the whole description is printed as the sentence it
 * is. "Ganze Analyse" always gets the rider back to the unabridged text, so the
 * rows are a reading order, never an edit.
 */
function SpecSheet({ description, kicker = 'Specs · aus deinem Foto gelesen', padded = true }: { description: string; kicker?: string; padded?: boolean }) {
  const rows = useMemo(() => parseBikeSpec(description), [description])
  const [full, setFull] = useState(false)
  const asRows = rows.length > 0 && !full

  const outer = padded
    ? { ...band(18), gap: 8 }
    : { display: 'flex', flexDirection: 'column' as const, width: '100%', minWidth: 0, gap: 8 }

  return (
    <div style={outer}>
      <Kicker>{kicker}</Kicker>
      <div style={{ borderRadius: 16, background: T.surface, border: `1px solid ${T.stroke}`, overflow: 'hidden' }}>
        {asRows
          ? rows.map((r, i) => (
            <div key={r.key} style={{ display: 'flex', gap: 12, padding: '11px 14px', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, alignItems: 'baseline' }}>
              <span style={{ flex: 'none', width: 74, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.quiet }}>{r.label}</span>
              <span style={{
                flex: '1 1 auto', minWidth: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.ink,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                overflowWrap: 'anywhere',
              }}>{r.value}</span>
            </div>
          ))
          : (
            <div style={{ padding: '12px 14px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: T.mid, overflowWrap: 'anywhere' }}>{description}</span>
            </div>
          )}
        {rows.length > 0 && (
          <button onClick={() => setFull((v) => !v)}
            style={{ width: '100%', height: 38, background: 'transparent', border: 0, borderTop: `1px solid ${T.rule}`, color: T.mid, fontFamily: FONT, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2, cursor: 'pointer' }}>
            {full ? 'Zurück zu den Specs' : 'Ganze Analyse'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * What the unlock actually paid. Every number here comes off the wallet
 * endpoint's response — there is no client-side arithmetic and no fallback
 * amount. When the server hasn't answered, this renders nothing.
 */
function RewardBlock({ reward, pending }: { reward?: { granted: number; balance: number } | null; pending?: boolean }) {
  if (!reward) {
    if (!pending) return null
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 100, background: T.surface, border: `1px solid ${T.stroke}` }}>
        <Loader2 size={14} color={T.quiet} className="w3-spin" />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>RideCoin wird gutgeschrieben…</span>
      </div>
    )
  }
  const balance = `${reward.balance.toLocaleString('de-DE')} RC`
  return (
    <div style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '13px 16px', borderRadius: 18,
      background: reward.granted > 0 ? `linear-gradient(180deg, ${T.acidDim}, ${T.surface})` : T.surface,
      border: `1px solid ${reward.granted > 0 ? `${T.acid}3D` : T.stroke}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: T.quiet }}>
          {reward.granted > 0 ? 'Belohnung · gutgeschrieben' : 'Belohnung · schon kassiert'}
        </span>
        {reward.granted > 0
          ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1, color: T.acid }}>
                +{reward.granted.toLocaleString('de-DE')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.acid }}>RC</span>
            </div>
          )
          : (
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: T.mid, overflowWrap: 'anywhere' }}>
              Das gibt es einmal — für dein erstes Bike.
            </span>
          )}
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: T.quiet }}>Guthaben</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Coins size={14} color={T.mid} />
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>{balance}</span>
        </div>
      </div>
    </div>
  )
}

// pastel gradient card grounds keyed off the description, à la w3:browser
const GRADIENTS = [
  'radial-gradient(120% 90% at 50% 32%, #E9D8C4, #BFA98F)',
  'radial-gradient(120% 90% at 50% 32%, #D6E4DC, #9DB6AC)',
  'radial-gradient(120% 90% at 50% 32%, #E7D2D6, #C09AA2)',
  'radial-gradient(120% 90% at 50% 32%, #D3DEE8, #9FB1C2)',
]

function Card({ children, grad }: { children?: React.ReactNode; grad: string }) {
  return (
    <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 24, background: grad, display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative' }}>
      {children}
    </div>
  )
}

export default function W3BikeStudioView(p: W3BikeStudioProps) {
  const reduce = useReducedMotion()
  const grad = GRADIENTS[(p.description?.length ?? 0) % GRADIENTS.length]
  // Reading the garage — hold the frame with the branded wait, never a blank one.
  if (p.state === 'loading') return <W3Loading label="Garage wird geöffnet…" />
  const busy = p.state === 'analyzing' || p.state === 'rendering'
  const unavailable = p.state === 'reveal' && (!p.imageUrl || p.renderStatus !== 'ok')
  // The rider's existing bike, opened from the Garage tab — same layout, but it
  // reads as "here it is" rather than "make one".
  const owned = p.state === 'reveal' && !p.celebrate && !!p.imageUrl && p.renderStatus === 'ok'

  // ── BIKE UNLOCKED celebration (pen j9jH7) — only with a real render ──
  // Everything on this screen is earned: the image is the rider's own bike, the
  // spec rows are the vision pass's words about it, and the RideCoin is what the
  // ledger actually credited. The pen's rarity tag and its `+250 / +1.75 / +40K`
  // chips were fixtures for economies that don't exist, and are gone.
  if (p.celebrate && p.state === 'reveal' && p.imageUrl && p.renderStatus === 'ok') {
    return (
      <div className="w3-root">
        <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', width: 460, height: 460, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}1F, transparent)` }} />
          {['#C8FF00', '#7B5CFF', '#00E5FF', '#FFB020', '#C8FF00', '#7B5CFF'].map((c, i) => (
            <motion.div key={i} initial={reduce ? false : { y: -20, opacity: 0 }} animate={{ y: [-20, 700], opacity: [0, 1, 0], rotate: [0, 220] }} transition={{ duration: 2.6, delay: i * 0.14, repeat: Infinity, repeatDelay: 0.8 }}
              style={{ position: 'absolute', top: 0, left: `${12 + i * 14}%`, width: 6, height: 12, borderRadius: 2, background: c, zIndex: 1 }} />
          ))}
          <W3StatusBar />

          <div style={{ padding: '0 12px 0 8px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <button onClick={p.onBack} aria-label="Zurück" style={{ width: 40, height: 40, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={20} color={T.ink} /></button>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>Garage</span>
            <div style={{ width: 40 }} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '4px 20px 28px', position: 'relative', zIndex: 2 }}>
            <motion.div initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: EASE }}
              style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 14px', borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}44` }}>
              <Sparkles size={13} color={T.acid} /><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.acid }}>NEU ENTSPERRT</span>
            </motion.div>

            {/* The collectible itself — the render, nothing stuck on top of it */}
            <motion.div initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
              style={{ width: '100%', maxWidth: 292, aspectRatio: '1 / 1', borderRadius: 24, background: grad, overflow: 'hidden', position: 'relative' }}>
              <img src={p.imageUrl} alt="Dein Bike" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </motion.div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center', minWidth: 0 }}>
              <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1, color: T.ink }}>BIKE ENTSPERRT</span>
              {/* The name is the vision pass's own read of the frame — never a
                  stand-in. Unnamed bikes simply say what they are. */}
              <span style={{ fontSize: 15, fontWeight: 500, color: T.mid, overflowWrap: 'anywhere' }}>
                {p.bikeName ? `${p.bikeName} · dein W3-Collectible` : 'Dein W3-Collectible'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.4, color: T.quiet, maxWidth: 300 }}>Es steht in deiner Garage. Jede Fahrt, die du loggst, levelt es weiter.</span>
            </div>

            {/* What it paid — real ledger numbers, or nothing at all */}
            <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.25 }}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
              <RewardBlock reward={p.reward} pending={p.rewardPending} />
            </motion.div>

            {/* The spec sheet — the reason this bike is THEIRS and not a stock one */}
            {p.description && (
              <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.35 }}
                style={{ width: '100%', minWidth: 0 }}>
                <SpecSheet description={p.description} padded={false} kicker="Was wir an deinem Bike gelesen haben" />
              </motion.div>
            )}

            <div style={{ width: '100%', marginTop: 'auto', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={p.onBack} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: '#0B0B0B', fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                In die Garage
              </button>
              {/* `onSave` downloads the render to the device — so it says that.
                  The pen's "share the moment" promised a share sheet this
                  screen has never had. */}
              <button onClick={p.onSave} style={{ height: 46, borderRadius: 100, border: 0, background: 'transparent', color: T.mid, fontFamily: FONT, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                <Download size={15} color={T.mid} />Bild speichern
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Top nav — back + screen title */}
        <div style={{ padding: '0 12px 0 8px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={p.onBack} aria-label="Zurück" style={{ width: 40, height: 40, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={20} color={T.ink} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>Garage</span>
          <div style={{ width: 40, height: 40 }} aria-hidden />
        </div>

        {/* Header */}
        <div style={{ ...band(20), padding: '4px 20px 18px', gap: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>
            {owned ? (p.bikeName ?? 'Dein Bike') : 'Bike Studio'}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
            {owned
              ? 'In deiner Garage. Jede Fahrt, die du loggst, levelt es weiter.'
              : 'Füg ein Foto deines Bikes hinzu. Wir rendern es als dein Collectible — gleicher Rahmen, gleiche Farben, W3-Finish.'}
          </span>
        </div>

        {/* The card */}
        <div style={{ ...band(18) }}>
          <Card grad={busy || p.state === 'reveal' ? grad : 'linear-gradient(180deg, #161616, #0F0F0F)'}>
            {/* rendered collectible — only with a real image */}
            {p.state === 'reveal' && p.imageUrl && (
              <img src={p.imageUrl} alt="Dein Collectible-Bike" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {/* reveal but no image model → honest "studio unavailable" over the real photo */}
            {unavailable && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                {p.photoUrl && <img src={p.photoUrl} alt="Dein Bike" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'saturate(1.3)' }} />}
                <Bike size={120} strokeWidth={1.2} color="#0B0B0B" style={{ opacity: 0.55, position: 'relative' }} />
                <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, padding: '9px 12px', borderRadius: 12, background: 'rgba(11,11,11,.72)', fontSize: 10.5, fontWeight: 600, color: '#fff', textAlign: 'center' }}>
                  Studio nicht verfügbar — kein Bildmodell verbunden
                </div>
              </div>
            )}

            {/* intro: the uploaded photo, or the empty stand — the pen's spotlit
                ghost bike (QK4WB), the same bike-shaped absence the Today hero
                shows, so the two screens speak about the empty slot the same way. */}
            {p.state === 'intro' && (
              p.photoUrl
                ? <img src={p.photoUrl} alt="Dein Bike" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(56% 44% at 50% 48%, #FFFFFF12, transparent 70%)' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '0 40px' }}>
                      <div style={{ width: '100%', opacity: 0.24 }}><GhostBike /></div>
                    </div>
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                      <button onClick={p.onPick} aria-label="Foto deines Bikes hinzufügen"
                        style={{ width: 62, height: 62, borderRadius: 100, background: T.bg, border: `1px solid ${T.acid}59`, boxShadow: `0 0 30px ${T.acid}26`, display: 'grid', placeItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
                        <Plus size={26} color={T.acid} strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>
                )
            )}

            {/* busy overlay */}
            {busy && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,11,11,.5)', backdropFilter: 'blur(2px)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <motion.div animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}>
                    <Sparkles size={34} color={T.acid} />
                  </motion.div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.state === 'analyzing' ? 'Dein Bike wird gelesen…' : 'Dein Collectible entsteht…'}</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Analysis — the real vision description, read as a spec sheet. Same
            text as before; it just stops being a grey paragraph that looks like
            a prompt dump and becomes the bike's own data sheet. */}
        {(p.state === 'reveal' || p.state === 'rendering') && p.description && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ width: '100%', minWidth: 0 }}>
            <SpecSheet description={p.description} kicker={owned ? 'Deine Specs · aus deinem Foto gelesen' : 'Was wir an deinem Bike gelesen haben'} />
          </motion.div>
        )}

        {/* Honest prompt reveal — what we'd render, when the studio is unavailable */}
        {unavailable && p.prompt && (
          <div style={{ ...band(18), gap: 8 }}>
            <Kicker>Was wir rendern würden</Kicker>
            <div style={{ padding: 14, borderRadius: 16, background: T.surface }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: T.quiet }}>{p.prompt}</span>
            </div>
          </div>
        )}

        {/* error */}
        {p.state === 'error' && (
          <div style={{ ...band(18) }}>
            <div style={{ padding: 16, borderRadius: 16, background: T.surface }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.warn }}>{p.error ?? 'Etwas ist schiefgelaufen. Versuch ein anderes Foto.'}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ ...band(24), paddingTop: 4, gap: 10 }}>
          {p.state === 'intro' && (
            <button onClick={p.onPick} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Camera size={19} color={T.bg} />{p.photoUrl ? 'Dieses Bike rendern' : 'Foto hinzufügen'}
            </button>
          )}
          {p.state === 'reveal' && (
            // Owning a bike changes what you came here to do: swapping it is
            // the primary action, saving the image the quiet one.
            owned ? (
              <>
                <button onClick={p.onReset} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                  <RefreshCw size={18} color={T.bg} strokeWidth={2.5} />Anderes Bike rendern
                </button>
                <button onClick={p.onSave} style={{ height: 48, borderRadius: 100, border: 0, background: '#FFFFFF0A', color: T.ink, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
                  <Download size={15} color={T.ink} />Bild speichern
                </button>
              </>
            ) : (
              <>
                {p.imageUrl && (
                  <button onClick={p.onSave} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                    <Download size={19} color={T.bg} strokeWidth={2.5} />Bild speichern
                  </button>
                )}
                <button onClick={p.onReset} style={{ height: 48, borderRadius: 100, border: 0, background: '#FFFFFF0A', color: T.ink, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
                  <RefreshCw size={15} color={T.ink} />{p.imageUrl ? 'Anderes Bike rendern' : 'Anderes Foto versuchen'}
                </button>
              </>
            )
          )}
          {p.state === 'error' && (
            <button onClick={p.onReset} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Nochmal versuchen</button>
          )}
        </div>

        <W3TabBar />
      </div>
    </div>
  )
}
