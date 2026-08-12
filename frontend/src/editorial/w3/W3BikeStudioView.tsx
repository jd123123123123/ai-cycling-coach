import { motion, useReducedMotion } from 'motion/react'
import { Camera, Sparkles, RefreshCw, Check, Bike } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import './w3.css'
import W3StatusBar from './W3StatusBar'

/**
 * W3 · Bike Studio — photo of your real bike → a W3:Ride-style collectible
 * render. Pure function of props; `W3BikeStudioPage` owns the capture + the
 * `/garage/bike/render` call. Honest by construction: the analysis chips are
 * REAL vision output; the render image appears only when an image model is
 * provisioned (`status`), otherwise the card shows a styled placeholder plus
 * the exact prompt — never a faked photo. Output is a stylised, identity-
 * preserving render, not an exact 3D mesh.
 */

export interface BikeAnalysis {
  bike_type: string; frame_color: string; accent_color: string | null
  wheels: string; groupset: string | null; handlebar: string
  distinctive: string; confidence: number
}
export type StudioState = 'intro' | 'analyzing' | 'rendering' | 'reveal' | 'error'

export interface W3BikeStudioProps {
  state: StudioState
  photoUrl: string | null          // the rider's uploaded photo (data URL)
  analysis: BikeAnalysis | null
  imageUrl: string | null          // rendered collectible (data URL) or null
  renderStatus: string | null      // "ok" | "image_model_unavailable"
  prompt: string | null
  error: string | null
  onPick: () => void               // open file/camera picker
  onReset: () => void
  onSave: () => void
}

// pastel gradient card grounds keyed off the bike's colour, à la w3:browser
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

const Chip = ({ k, v }: { k: string; v: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 13px', borderRadius: 14, background: T.surface, flex: 1, minWidth: 0 }}>
    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>{k}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
  </div>
)

export default function W3BikeStudioView(p: W3BikeStudioProps) {
  const reduce = useReducedMotion()
  const grad = GRADIENTS[(p.analysis?.frame_color?.length ?? 0) % GRADIENTS.length]
  const busy = p.state === 'analyzing' || p.state === 'rendering'

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* Header */}
        <div style={{ ...band(20), padding: '10px 20px 18px', gap: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, color: T.ink }}>Bike studio</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
            Snap your real bike. We render it as your collectible — same frame, same colours, W3 finish.
          </span>
        </div>

        {/* The card */}
        <div style={{ ...band(18) }}>
          <Card grad={busy || p.state === 'reveal' ? grad : 'linear-gradient(180deg, #161616, #0F0F0F)'}>
            {/* rendered collectible */}
            {p.state === 'reveal' && p.imageUrl && <img src={p.imageUrl} alt="Your bike collectible" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}

            {/* reveal but no image model → styled placeholder over the real photo */}
            {p.state === 'reveal' && !p.imageUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                {p.photoUrl && <img src={p.photoUrl} alt="Your bike" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'saturate(1.3)' }} />}
                <Bike size={120} strokeWidth={1.2} color="#0B0B0B" style={{ opacity: 0.55, position: 'relative' }} />
                <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, padding: '9px 12px', borderRadius: 12, background: 'rgba(11,11,11,.72)', fontSize: 10.5, fontWeight: 600, color: '#fff', textAlign: 'center' }}>
                  Preview — connect an image model to render the collectible
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

        {/* Analysis chips — real vision output */}
        {(p.state === 'reveal' || p.state === 'rendering') && p.analysis && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} style={{ ...band(18), gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Chip k="Type" v={p.analysis.bike_type} />
              <Chip k="Frame" v={p.analysis.frame_color} />
              <Chip k="Wheels" v={p.analysis.wheels} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Chip k="Bars" v={p.analysis.handlebar} />
              <Chip k="Groupset" v={p.analysis.groupset ?? '—'} />
              <Chip k="Accent" v={p.analysis.accent_color ?? '—'} />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid, padding: '2px 2px 0' }}>“{p.analysis.distinctive}”</span>
          </motion.div>
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
        <div style={{ ...band(40), paddingTop: 4, gap: 10, marginTop: 'auto' }}>
          {p.state === 'intro' && (
            <button onClick={p.onPick} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: -0.2, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Camera size={19} color={T.bg} />{p.photoUrl ? 'Render this bike' : 'Take a photo'}
            </button>
          )}
          {p.state === 'reveal' && (
            <>
              <button onClick={p.onSave} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                <Check size={19} color={T.bg} strokeWidth={2.5} />Save to garage
              </button>
              <button onClick={p.onReset} style={{ height: 48, borderRadius: 100, border: 0, background: '#FFFFFF0A', color: T.ink, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
                <RefreshCw size={15} color={T.ink} />Retake
              </button>
            </>
          )}
          {(p.state === 'error') && (
            <button onClick={p.onReset} style={{ height: 54, borderRadius: 100, border: 0, background: T.acid, color: T.bg, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
          )}
        </div>
      </div>
    </div>
  )
}
