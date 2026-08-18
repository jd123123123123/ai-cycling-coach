import type { ReactNode } from 'react'
import { T } from './w3tokens'
import W3BikeFigure from './W3BikeFigure'
import type { BikeLook } from '../../utils/w3bikePaint'

/**
 * W3 · The lit stage a bike stands on.
 *
 * WHY IT IS ONE COMPONENT. The garage, the shop row, the item sheet and the
 * first-bike screen all show a bike, and until this existed they showed it four
 * different ways — three of them photographs and one a drawing, so the same
 * Rostlaube looked like a different object depending on which tab you were on.
 * That inconsistency was more damaging than either style on its own.
 *
 * WHY IT IS LIGHT. The drawing is near-black in places every rider will own: a
 * standard saddle, a matte frame, deep carbon rims. On the app's dark ground
 * those parts do not read at all. The photographs only ever worked because each
 * one carried its own studio backdrop baked in; this gives the drawing the same
 * light, from the palette rather than invented per call site.
 */
export default function W3BikeStage({ look, pad = '10%', shadow = true, children, style }: {
  look: BikeLook
  /** Inset around the figure. Thumbnails want less than a hero does. */
  pad?: string
  shadow?: boolean
  /** Overlays that belong INSIDE the stage — the hour's light, road grime. */
  children?: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, ...style }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(120% 100% at 50% 38%, ${T.stageHi} 0%, ${T.stageMid} 58%, ${T.stageLo} 100%)`,
      }} />
      <div style={{ position: 'absolute', inset: 0, padding: pad }}>
        <W3BikeFigure look={look} />
      </div>
      {/* The contact shadow — without it the bike floats instead of standing. */}
      {shadow && (
        <div aria-hidden style={{
          position: 'absolute', left: '12%', right: '12%', bottom: '17%', height: 16,
          background: `radial-gradient(50% 50% at 50% 50%, ${T.shadowSoft}, transparent 70%)`,
        }} />
      )}
      {children}
    </div>
  )
}
