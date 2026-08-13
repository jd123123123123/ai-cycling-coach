import { useEffect, useState } from 'react'
import { STARTER_BIKE } from './starterBike'
import { renderScene, type SceneSpec } from './w3scene'
import { T, FONT } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * TEMP preview — demonstrates the LAYERED scene composer (`w3scene.ts`).
 * Toggling the helmet swaps ONLY the `head` layer; the backdrop and bike layers
 * are byte-for-byte identical across toggles. Route /e/w3-scene-preview.
 */

const W = 1080, H = 1080

function backdrop(night: boolean) {
  return (ctx: CanvasRenderingContext2D, b: { w: number; h: number }) => {
    const sky = ctx.createLinearGradient(0, 0, 0, b.h)
    if (night) { sky.addColorStop(0, '#241A54'); sky.addColorStop(1, '#6B3A8C') }
    else { sky.addColorStop(0, '#6A4BC4'); sky.addColorStop(1, '#C56BA6') }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, b.w, b.h)
    const mtn = (baseY: number, amp: number, seed: number, color: string) => {
      ctx.beginPath(); ctx.moveTo(0, b.h); ctx.lineTo(0, baseY)
      for (let i = 0; i <= 7; i++) ctx.lineTo((i / 7) * b.w, baseY - Math.abs(Math.sin(i * 1.3 + seed)) * amp)
      ctx.lineTo(b.w, b.h); ctx.closePath(); ctx.fillStyle = color; ctx.fill()
    }
    mtn(b.h * 0.6, 190, 0.4, night ? '#4A2E7A' : '#7A4FB0')
    mtn(b.h * 0.74, 150, 2.1, night ? '#37225C' : '#5B3A90')
    mtn(b.h * 0.86, 120, 4.0, night ? '#241645' : '#3C2568')
  }
}

function helmet(ctx: CanvasRenderingContext2D, b: { w: number; h: number }) {
  const cx = b.w * 0.5, cy = b.h * 0.3, r = b.w * 0.11
  ctx.save()
  ctx.fillStyle = '#C8FF00'
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#8FBF00'; ctx.fillRect(cx - r, cy - 2, r * 2, r * 0.28) // brim
  ctx.strokeStyle = '#0B0B0B33'; ctx.lineWidth = 4
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * r * 0.35, cy - r * 0.9); ctx.lineTo(cx + i * r * 0.5, cy); ctx.stroke() }
  ctx.restore()
}

export default function W3ScenePreview() {
  const [hasHelmet, setHasHelmet] = useState(true)
  const [night, setNight] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const spec: SceneSpec = {
      width: W, height: H, background: '#0B0B0B',
      layers: [
        { slot: 'backdrop', draw: backdrop(night) },
        { slot: 'bike', src: STARTER_BIKE, anchor: { x: 0.5, y: 0.62 }, scale: 0.72 },
        ...(hasHelmet ? [{ slot: 'head' as const, draw: helmet }] : []),
      ],
    }
    let alive = true
    renderScene(spec).then((o) => { if (alive) setUrl(o.dataUrl || null) })
    return () => { alive = false }
  }, [hasHelmet, night])

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ flex: 1, padding: '12px 0', borderRadius: 16, border: `1px solid ${on ? T.acid : T.stroke}`, background: on ? T.acidDim : 'transparent', color: on ? T.acid : T.mid, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
  )

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3TopBar title="Scene · Layer-Test" onBack={() => history.back()} />
        <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.mid, lineHeight: 1.5 }}>
            Ein Helm-Kauf tauscht nur den <b style={{ color: T.acid }}>head</b>-Layer — Hintergrund und Bike bleiben identisch. Kein Neu-Rendern der ganzen Szene.
          </span>
          <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 24, overflow: 'hidden', background: T.surface, border: `1px solid ${T.stroke}` }}>
            {url && <img src={url} alt="Layered scene" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>HEAD-LAYER (KOSMETIK)</span>
            <div style={{ display: 'flex', gap: 8 }}>{chip(hasHelmet, 'Mit Helm', () => setHasHelmet(true))}{chip(!hasHelmet, 'Ohne Helm', () => setHasHelmet(false))}</div>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.quiet, marginTop: 6 }}>BACKDROP-LAYER (KONTEXT)</span>
            <div style={{ display: 'flex', gap: 8 }}>{chip(!night, 'Tag', () => setNight(false))}{chip(night, 'Nacht', () => setNight(true))}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
