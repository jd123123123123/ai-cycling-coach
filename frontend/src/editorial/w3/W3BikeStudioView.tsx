import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Camera, Sparkles, RefreshCw, Download, Bike } from 'lucide-react'
import { T, FONT, EASE, band, Kicker } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'

/**
 * W3 · Bike Studio (the GARAGE tab) — photo of your real bike → a W3:Ride-style
 * collectible render. Pure function of props; `W3BikeStudioPage` owns the
 * capture + the `POST /garage/asset/render` call. Honest by construction: the
 * `description` line is the REAL vision output; the render image appears only
 * when an image model is provisioned (`renderStatus === 'ok'`), otherwise the
 * card shows an honest "studio unavailable" state plus the exact prompt — never
 * a faked photo. Output is a stylised, identity-preserving render, not a mesh.
 */

export type StudioState = 'intro' | 'analyzing' | 'rendering' | 'reveal' | 'error'

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
  const busy = p.state === 'analyzing' || p.state === 'rendering'
  const unavailable = p.state === 'reveal' && (!p.imageUrl || p.renderStatus !== 'ok')

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        {/* Top nav — back + screen title */}
        <div style={{ padding: '0 12px 0 8px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={p.onBack} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 100, background: 'transparent', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={20} color={T.ink} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>Garage</span>
          <div style={{ width: 40, height: 40 }} aria-hidden />
        </div>

        {/* Header */}
        <div style={{ ...band(20), padding: '4px 20px 18px', gap: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>Bike studio</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
            Add a photo of your real bike. We render it as your collectible — same frame, same colours, W3 finish.
          </span>
        </div>

        {/* The card */}
        <div style={{ ...band(18) }}>
          <Card grad={busy || p.state === 'reveal' ? grad : 'linear-gradient(180deg, #161616, #0F0F0F)'}>
            {/* rendered collectible — only with a real image */}
            {p.state === 'reveal' && p.imageUrl && (
              <img src={p.imageUrl} alt="Your bike collectible" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {/* reveal but no image model → honest "studio unavailable" over the real photo */}
            {unavailable && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                {p.photoUrl && <img src={p.photoUrl} alt="Your bike" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'saturate(1.3)' }} />}
                <Bike size={120} strokeWidth={1.2} color="#0B0B0B" style={{ opacity: 0.55, position: 'relative' }} />
                <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, padding: '9px 12px', borderRadius: 12, background: 'rgba(11,11,11,.72)', fontSize: 10.5, fontWeight: 600, color: '#fff', textAlign: 'center' }}>
                  Studio unavailable — no image model connected
                </div>
              </div>
            )}

            {/* intro: the uploaded photo, or the prompt to add one */}
            {p.state === 'intro' && (
              p.photoUrl
                ? <img src={p.photoUrl} alt="Your bike" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', color: T.quiet }}>
                    <Camera size={40} color={T.acid} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>No bike yet</span>
                  </div>
            )}

            {/* busy overlay */}
            {busy && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,11,11,.5)', backdropFilter: 'blur(2px)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <motion.div animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}>
                    <Sparkles size={34} color={T.acid} />
                  </motion.div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.state === 'analyzing' ? 'Reading your bike…' : 'Rendering your collectible…'}</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Analysis — real vision description */}
        {(p.state === 'reveal' || p.state === 'rendering') && p.description && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ ...band(18), gap: 8 }}>
            <Kicker>What we see</Kicker>
            <div style={{ padding: 14, borderRadius: 16, background: T.surface }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: T.mid }}>{p.description}</span>
            </div>
          </motion.div>
        )}

        {/* Honest prompt reveal — what we'd render, when the studio is unavailable */}
        {unavailable && p.prompt && (
          <div style={{ ...band(18), gap: 8 }}>
            <Kicker>The render we'd make</Kicker>
            <div style={{ padding: 14, borderRadius: 16, background: T.surface }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: T.quiet }}>{p.prompt}</span>
            </div>
          </div>
        )}

        {/* error */}
        {p.state === 'error' && (
          <div style={{ ...band(18) }}>
            <div style={{ padding: 16, borderRadius: 16, background: T.surface }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.warn }}>{p.error ?? 'Something went wrong. Try another photo.'}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ ...band(24), paddingTop: 4, gap: 10 }}>
          {p.state === 'intro' && (
            <button onClick={p.onPick} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Camera size={19} color={T.bg} />{p.photoUrl ? 'Render this bike' : 'Add a photo'}
            </button>
          )}
          {p.state === 'reveal' && (
            <>
              {p.imageUrl && (
                <button onClick={p.onSave} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                  <Download size={19} color={T.bg} strokeWidth={2.5} />Save image
                </button>
              )}
              <button onClick={p.onReset} style={{ height: 48, borderRadius: 100, border: 0, background: '#FFFFFF0A', color: T.ink, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
                <RefreshCw size={15} color={T.ink} />{p.imageUrl ? 'Render another' : 'Try another photo'}
              </button>
            </>
          )}
          {p.state === 'error' && (
            <button onClick={p.onReset} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
          )}
        </div>

        <W3TabBar />
      </div>
    </div>
  )
}
