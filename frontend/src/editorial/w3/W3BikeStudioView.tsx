import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Camera, Sparkles, RefreshCw, Download, Bike, Star, Asterisk, Share2, Plus } from 'lucide-react'
import { T, FONT, EASE, band, Kicker } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import W3Loading from './W3Loading'
import { GhostBike } from './W3BikeHero'

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

  // ── BIKE UNLOCKED celebration (pen j9jH7) — only with a real render, one page ──
  if (p.celebrate && p.state === 'reveal' && p.imageUrl && p.renderStatus === 'ok') {
    // fixture: rarity + reward chips (the reward economy has no per-unlock grant).
    const rewards: { icon: typeof Star; label: string }[] = [
      { icon: Sparkles, label: '+250' }, { icon: Star, label: '+1.75' }, { icon: Asterisk, label: '+40K' },
    ]
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

            {/* Bike card + rarity tag */}
            <motion.div initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
              style={{ width: '100%', maxWidth: 320, aspectRatio: '1 / 1', borderRadius: 24, background: grad, overflow: 'hidden', position: 'relative' }}>
              <img src={p.imageUrl} alt="Dein Bike" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 5, alignItems: 'center', padding: '5px 10px', borderRadius: 100, background: '#0B0B0BB0', backdropFilter: 'blur(3px)' }}>
                <Star size={11} color={T.acid} fill={T.acid} /><span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: T.ink }}>RARE · 16</span>
              </div>
            </motion.div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center' }}>
              <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1, color: T.ink }}>BIKE ENTSPERRT</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: T.mid }}>{p.bikeName ?? 'Allez'} · dein W3-Collectible</span>
              <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.4, color: T.quiet, maxWidth: 300 }}>Es steht in deiner Garage. Jede Fahrt, die du loggst, levelt es weiter.</span>
            </div>

            {/* Reward chips (fixture) */}
            <div style={{ display: 'flex', gap: 8 }}>
              {rewards.map((rw) => { const Ic = rw.icon; return (
                <div key={rw.label} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '9px 14px', borderRadius: 100, background: T.surface, border: `1px solid ${T.stroke}` }}>
                  <Ic size={14} color={T.acid} /><span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{rw.label}</span>
                </div>
              ) })}
            </div>

            <div style={{ width: '100%', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={p.onBack} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: '#0B0B0B', fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                In die Garage
              </button>
              <button onClick={p.onSave} style={{ height: 46, borderRadius: 100, border: 0, background: 'transparent', color: T.mid, fontFamily: FONT, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                <Share2 size={15} color={T.mid} />Moment teilen
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

        {/* Analysis — real vision description */}
        {(p.state === 'reveal' || p.state === 'rendering') && p.description && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ ...band(18), gap: 8 }}>
            <Kicker>Was wir sehen</Kicker>
            <div style={{ padding: 14, borderRadius: 16, background: T.surface }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: T.mid }}>{p.description}</span>
            </div>
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
