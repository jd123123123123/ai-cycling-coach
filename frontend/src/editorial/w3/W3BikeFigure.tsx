import { useId } from 'react'
import {
  MATERIAL,
  type BarStyle, type BikeLook, type SaddleStyle, type WheelStyle,
} from '../../utils/w3bikePaint'

/**
 * W3 · The bike, drawn instead of photographed.
 *
 * WHY THIS EXISTS. The catalogue art is 26 independent AI renders, each with
 * its own geometry and its own baked-in studio backdrop, and the part art is 24
 * separate objects each shot on its own camera. There is no shared skeleton, so
 * a saddle PNG has nowhere to land: equipping a part could never change the
 * picture, and every cosmetic in the shop was a purchase with no visible
 * effect. That is the bug this file fixes at the root.
 *
 * ONE SKELETON, SWAPPABLE LAYERS. Everything is drawn in a single 600×360 space
 * with fixed anchors — the bottom bracket, both hubs, the seat and head tube
 * tops. Every part is a function of those anchors, so any combination
 * composites correctly by construction. Zwift gets this from a 3D frame and
 * wheelset on one rig; as vectors it costs no engine, no download and no
 * render, and stays crisp from a 56px thumbnail to a full-bleed hero.
 *
 * TUBES ARE TAPERED QUADS, NOT STROKES. The first pass drew the frame with
 * uniform `strokeWidth` lines and it read as a wiring diagram — a real frame is
 * fat at the bottom bracket and thin at the dropouts. `tube()` builds a
 * four-point polygon between two anchors with a width at each end, which is
 * what turns the drawing from a schematic into an object.
 *
 * IT MUST BE SHOWN ON A LIGHT STAGE. Standard saddles, matte-black frames and
 * carbon rims are near-black; on the app's dark ground the first render came
 * out as a blue "Z" with no saddle at all. Callers put it on a light backdrop,
 * exactly as every photographed bike carries its own.
 */

/**
 * The skeleton — scaled from a real 56cm road bike rather than eyeballed.
 * At 96px per 336mm wheel radius: wheelbase 995mm, chainstay 410, front centre
 * 590, reach 390, stack 570, head angle 73°, seat angle 73.5°, BB drop 66.
 *
 * The BB drop is the one that matters most. v1 put the bottom bracket on the
 * hub line, which no bicycle does, and the whole drawing read as a toy because
 * of it. Every part positions itself off these anchors.
 */
const A = {
  rearHub: { x: 158, y: 250 },
  frontHub: { x: 443, y: 250 },
  bb: { x: 274, y: 269 },
  seatTop: { x: 227, y: 110 },
  headTop: { x: 385, y: 106 },
  headBot: { x: 398, y: 147 },
  wheelR: 96,
} as const

type P = { x: number; y: number }

/** A tapered tube between two anchors: a quad, wide end to narrow end. This is
 *  the difference between a drawn bicycle and a wiring diagram. */
function tube(a: P, b: P, wa: number, wb: number): string {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len   // unit normal
  const p = (pt: P, w: number, s: 1 | -1) => `${pt.x + nx * w * s * 0.5} ${pt.y + ny * w * s * 0.5}`
  return `M${p(a, wa, 1)} L${p(b, wb, 1)} L${p(b, wb, -1)} L${p(a, wa, -1)} Z`
}

/** The five painted tubes, in draw order. Named once because the splatter
 *  finish clips itself to exactly this shape. */
const FRAME_TUBES = [
  tube(A.bb, A.rearHub, 14, 6),        // chainstay
  tube(A.seatTop, A.rearHub, 9, 5),    // seatstay
  tube(A.bb, A.headBot, 17, 13),       // down tube
  tube(A.seatTop, A.headTop, 12, 10),  // top tube
  tube(A.bb, A.seatTop, 15, 11),       // seat tube
  tube(A.headTop, A.headBot, 17, 17),  // head tube
]

/** Fixed, not random: the same bike must look the same on every render. Points
 *  sit on the tube runs, since the clip throws away everything that misses. */
const SPLATTER = [
  { x: 310, y: 238, r: 8, e: 1.5, a: 24 }, { x: 336, y: 208, r: 5, e: 0.8, a: -40 },
  { x: 365, y: 178, r: 10, e: 1.3, a: 12 }, { x: 250, y: 190, r: 6, e: 0.7, a: 70 },
  { x: 240, y: 150, r: 9, e: 1.6, a: -20 }, { x: 262, y: 225, r: 4, e: 1.0, a: 0 },
  { x: 250, y: 109, r: 7, e: 1.4, a: 8 }, { x: 300, y: 108, r: 4, e: 0.9, a: 55 },
  { x: 350, y: 107, r: 8, e: 1.7, a: -6 }, { x: 215, y: 260, r: 5, e: 1.2, a: 30 },
  { x: 195, y: 180, r: 7, e: 0.8, a: -55 }, { x: 392, y: 127, r: 5, e: 1.3, a: 40 },
]

const RIM: Record<WheelStyle, { depth: number; hue: string }> = {
  box: { depth: 9, hue: MATERIAL.rimSilver },
  tanwall: { depth: 10, hue: MATERIAL.rimPolished },
  deep: { depth: 36, hue: MATERIAL.rimCarbon },
  disc: { depth: 95, hue: MATERIAL.rimDisc },
  fivespoke: { depth: 28, hue: MATERIAL.rimSpoke },
  gold: { depth: 22, hue: MATERIAL.rimGold },
}

function Wheel({ cx, cy, style, tan }: { cx: number; cy: number; style: WheelStyle; tan?: boolean }) {
  const { depth, hue } = RIM[style]
  // 28mm road rubber at this scale, not the 42mm balloon v1 drew.
  const tyreW = tan ? 11 : 9
  const rimOuter = A.wheelR - tyreW
  const rimInner = Math.max(7, rimOuter - depth)
  const spokes = style === 'disc' ? 0 : style === 'fivespoke' ? 5 : 24

  return (
    <g>
      <circle cx={cx} cy={cy} r={A.wheelR - tyreW / 2} fill="none" stroke={tan ? MATERIAL.tyreTan : MATERIAL.tyre} strokeWidth={tyreW} />
      {/* Tread shadow — reads as rubber rather than a flat ring. */}
      <circle cx={cx} cy={cy} r={A.wheelR - 1} fill="none" stroke={MATERIAL.tyreShadow} strokeWidth={2} opacity={0.45} />

      {style === 'disc' ? (
        <circle cx={cx} cy={cy} r={rimOuter} fill={hue} />
      ) : (
        <>
          {Array.from({ length: spokes }).map((_, i) => {
            const ang = (i / spokes) * Math.PI * 2
            const w = style === 'fivespoke' ? 8 : 1.3
            return (
              <line key={i}
                x1={cx + Math.cos(ang) * 8} y1={cy + Math.sin(ang) * 8}
                x2={cx + Math.cos(ang) * rimInner} y2={cy + Math.sin(ang) * rimInner}
                stroke={style === 'fivespoke' ? hue : MATERIAL.spoke} strokeWidth={w} strokeLinecap="round"
              />
            )
          })}
          <circle cx={cx} cy={cy} r={(rimOuter + rimInner) / 2} fill="none" stroke={hue} strokeWidth={rimOuter - rimInner} />
        </>
      )}
      <circle cx={cx} cy={cy} r={8} fill={MATERIAL.hub} stroke={MATERIAL.metal} strokeWidth={1.6} />
    </g>
  )
}

/** Saddle height is measured along the seat tube from the BB, exactly as a
 *  rider sets it — that is what puts the saddle above and behind the bars. */
const SEAT_DIR = { x: -0.284, y: -0.959 }   // 73.5° seat angle, pointing up-back
const SADDLE = { x: A.bb.x + SEAT_DIR.x * 211, y: A.bb.y + SEAT_DIR.y * 211 }

function Saddle({ style, tape, tint }: { style: SaddleStyle; tape: string; tint?: string }) {
  const hue = tint ?? (style === 'leather' ? MATERIAL.leather
    : style === 'carbon' ? MATERIAL.carbonShell
    : style === 'comfort' ? MATERIAL.saddleComfort : MATERIAL.saddleStd)
  // A saddle is ~280mm long — at this scale 80px, not the 48 that made it a
  // sliver floating on the post.
  const w = style === 'comfort' ? 84 : 78
  const h = style === 'comfort' ? 17 : 12
  const cx = SADDLE.x, top = SADDLE.y
  return (
    <g>
      <path d={tube(A.seatTop, { x: SADDLE.x, y: SADDLE.y + 6 }, 9, 8)} fill={MATERIAL.post} />
      {/* Nose forward (+x), tail up and back — a saddle read from the side. */}
      <path
        d={`M${cx - w * 0.5} ${top - h * 0.6}
            q ${w * 0.14} ${h * 0.5} ${w * 0.3} ${h * 0.72}
            q ${w * 0.3} ${h * 0.2} ${w * 0.7} ${h * 0.14}
            q -${w * 0.32} ${h * 0.55} -${w * 0.72} ${h * 0.2}
            q -${w * 0.26} -${h * 0.22} -${w * 0.28} -${h * 1.06} z`}
        fill={hue}
      />
      {style === 'leather' && (
        <path d={`M${cx - w * 0.42} ${top - h * 0.3} q ${w * 0.3} ${h * 0.7} ${w * 0.9} ${h * 0.5}`} stroke={MATERIAL.leatherStitch} strokeWidth={1.2} fill="none" opacity={0.85} />
      )}
      {style === 'carbon' && (
        <path d={`M${cx - w * 0.34} ${top - h * 0.1} q ${w * 0.3} ${h * 0.55} ${w * 0.8} ${h * 0.3}`} stroke={tape} strokeWidth={1.4} fill="none" opacity={0.7} />
      )}
    </g>
  )
}

/** The bar sits FORWARD of the head tube, on the far end of the stem. v1 drew
 *  it behind, which is why the cockpit read as a mistake. */
function Bars({ style, tape }: { style: BarStyle; tape: string }) {
  const x = A.headTop.x + 29, y = A.headTop.y - 6
  const stem = <path d={tube({ x: A.headTop.x, y: A.headTop.y + 2 }, { x, y }, 11, 8)} fill={MATERIAL.post} />
  const t = (d: string, w = 9) => <path d={d} stroke={tape} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  if (style === 'flat') return <g>{stem}{t(`M${x - 16} ${y} h 26`, 9)}</g>
  if (style === 'bullhorn') return <g>{stem}{t(`M${x - 16} ${y} h 18 q 15 0 17 -19`)}</g>
  if (style === 'aero') return <g>{stem}{t(`M${x - 16} ${y} h 24 q 13 1 11 16 q -2 13 -15 15`, 10)}</g>
  // Drop bar: forward over the hood, then the hook down and back under.
  return <g>{stem}{t(`M${x - 16} ${y} h 16 q 16 1 16 17 q 0 17 -15 21`)}</g>
}

export default function W3BikeFigure({ look, className, style }: {
  look: BikeLook
  className?: string
  style?: React.CSSProperties
}) {
  const uid = useId().replace(/:/g, '')
  const { frame, finish } = look
  const paint = `url(#f${uid})`

  // Fork blade with real rake: it bows forward of the straight line from the
  // crown to the hub, which is what gives a bicycle its lean.
  const fork = `M${A.headBot.x - 6} ${A.headBot.y}
                C ${A.headBot.x + 4} ${A.headBot.y + 60} ${A.frontHub.x - 20} ${A.frontHub.y - 34} ${A.frontHub.x - 2} ${A.frontHub.y}
                L ${A.frontHub.x + 4} ${A.frontHub.y}
                C ${A.frontHub.x - 12} ${A.frontHub.y - 38} ${A.headBot.x + 14} ${A.headBot.y + 58} ${A.headBot.x + 7} ${A.headBot.y} Z`

  return (
    <svg viewBox="0 0 600 360" className={className} style={{ display: 'block', width: '100%', height: '100%', ...style }} role="img" aria-label="Dein Rad">
      <defs>
        <linearGradient id={`f${uid}`} x1="0" y1="0" x2="0.25" y2="1">
          {finish === 'chrome' ? (
            <><stop offset="0%" stopColor={MATERIAL.chromeHi} /><stop offset="42%" stopColor={MATERIAL.chromeMid} /><stop offset="56%" stopColor={MATERIAL.chromeHi2} /><stop offset="100%" stopColor={MATERIAL.chromeLo} /></>
          ) : finish === 'oilslick' ? (
            <><stop offset="0%" stopColor={MATERIAL.slickA} /><stop offset="48%" stopColor={MATERIAL.slickB} /><stop offset="100%" stopColor={MATERIAL.slickC} /></>
          ) : finish === 'rust' ? (
            <><stop offset="0%" stopColor={frame} /><stop offset="58%" stopColor={MATERIAL.rustMid} /><stop offset="100%" stopColor={MATERIAL.rustLo} /></>
          ) : finish === 'gloss' ? (
            <><stop offset="0%" stopColor={frame} /><stop offset="58%" stopColor={frame} /><stop offset="100%" stopColor={MATERIAL.glossShade} /></>
          ) : (
            <><stop offset="0%" stopColor={frame} /><stop offset="100%" stopColor={frame} /></>
          )}
        </linearGradient>
        <clipPath id={`c${uid}`}>
          {FRAME_TUBES.map((d, i) => <path key={i} d={d} />)}
        </clipPath>
      </defs>

      {/* Burning wheels, UNDER the wheels: fire trails a moving bike, so the
          tongues stream out behind the tyre instead of sitting on the rim. */}
      {look.flames && (
        <g>
          {[A.rearHub, A.frontHub].flatMap((h, w) =>
            [[-0.5, 86, 44], [-0.08, 122, 56], [0.38, 74, 38]].map(([a, len, ht], i) => {
              const ang = Math.PI + Number(a)
              const x = h.x + Math.cos(ang) * (A.wheelR - 10)
              const y = h.y + Math.sin(ang) * (A.wheelR - 10)
              const l = Number(len) * (w === 0 ? 1 : 0.74)
              const t = Number(ht) * (w === 0 ? 1 : 0.8)
              const tongue = (k: number) => `M${x} ${y + t * 0.42 * k}
                C ${x - l * 0.45 * k} ${y + t * 0.30 * k}, ${x - l * 0.85 * k} ${y + t * 0.18 * k}, ${x - l * k} ${y - t * 0.06 * k}
                C ${x - l * 0.78 * k} ${y - t * 0.08 * k}, ${x - l * 0.62 * k} ${y - t * 0.10 * k}, ${x - l * 0.55 * k} ${y - t * 0.20 * k}
                C ${x - l * 0.60 * k} ${y - t * 0.44 * k}, ${x - l * 0.68 * k} ${y - t * 0.58 * k}, ${x - l * 0.72 * k} ${y - t * 0.76 * k}
                C ${x - l * 0.40 * k} ${y - t * 0.52 * k}, ${x - l * 0.16 * k} ${y - t * 0.30 * k}, ${x} ${y - t * 0.40 * k} Z`
              return (
                <g key={`${w}-${i}`}>
                  <path d={tongue(1)} fill={MATERIAL.flameHot} opacity={0.9} />
                  <path d={tongue(0.58)} fill={MATERIAL.flameCool} opacity={0.95} />
                </g>
              )
            }),
          )}
        </g>
      )}

      <Wheel cx={A.rearHub.x} cy={A.rearHub.y} style={look.wheel} tan={look.tan} />
      <Wheel cx={A.frontHub.x} cy={A.frontHub.y} style={look.wheel} tan={look.tan} />

      {/* Rear triangle — stays and chainstays taper hard into the dropouts. */}
      <g fill={paint}>
        {FRAME_TUBES.map((d, i) => <path key={i} d={d} />)}
        <path d={fork} />
      </g>

      {/* Splatter paint is clipped to the tubes, so it lands ON the frame
          instead of floating in the air around it. */}
      {look.splatter && (
        <g clipPath={`url(#c${uid})`}>
          {SPLATTER.map((s, i) => (
            <g key={i} fill={i % 2 ? MATERIAL.splatterA : MATERIAL.splatterB} opacity={0.9}>
              {/* Stretched and tilted, with one thrown droplet — round dots at
                  even sizes read as polka dots, not thrown paint. */}
              <ellipse cx={s.x} cy={s.y} rx={s.r * s.e} ry={s.r} transform={`rotate(${s.a} ${s.x} ${s.y})`} />
              <circle cx={s.x + s.r * 1.9} cy={s.y - s.r * 1.2} r={Math.max(1.2, s.r * 0.28)} />
            </g>
          ))}
        </g>
      )}

      {/* A single specular run along the top tube — the cheapest cue that the
          tubes are round rather than flat ribbons. */}
      <path d={tube({ x: A.seatTop.x + 6, y: A.seatTop.y - 3 }, { x: A.headTop.x - 6, y: A.headTop.y - 3 }, 2.5, 2)} fill={MATERIAL.chromeHi} opacity={0.28} />

      {/* Drivetrain. Chainring 50t ≈ 29px radius, cassette ≈ 12px, crank 172mm
          ≈ 49px — the same scale as everything else, so it sits right. */}
      <g>
        {/* Chain: taut top run, and a bottom run that drops through the mech. */}
        <path
          d={`M${A.bb.x} ${A.bb.y - 29} L${A.rearHub.x} ${A.rearHub.y - 12}
              M${A.bb.x} ${A.bb.y + 29} L${A.rearHub.x + 16} ${A.rearHub.y + 28}
              M${A.rearHub.x + 16} ${A.rearHub.y + 28} L${A.rearHub.x + 4} ${A.rearHub.y + 12}`}
          stroke={MATERIAL.chain} strokeWidth={2.4} fill="none" strokeLinejoin="round"
        />
        <circle cx={A.rearHub.x + 16} cy={A.rearHub.y + 28} r={4.5} fill="none" stroke={MATERIAL.crank} strokeWidth={2} />
        <circle cx={A.rearHub.x} cy={A.rearHub.y} r={12} fill={MATERIAL.metal} opacity={0.55} />
        <circle cx={A.rearHub.x} cy={A.rearHub.y} r={12} fill="none" stroke={MATERIAL.metal} strokeWidth={3.5} strokeDasharray="1.4 3.2" />
        <path d={tube(A.bb, { x: A.bb.x + 12, y: A.bb.y + 47 }, 9, 7)} fill={MATERIAL.crank} />
        <circle cx={A.bb.x} cy={A.bb.y} r={29} fill={MATERIAL.metal} opacity={0.32} />
        <circle cx={A.bb.x} cy={A.bb.y} r={29} fill="none" stroke={MATERIAL.metal} strokeWidth={2.2} />
        <circle cx={A.bb.x} cy={A.bb.y} r={29} fill="none" stroke={MATERIAL.metal} strokeWidth={6} strokeDasharray="1.5 4.6" />
        <circle cx={A.bb.x} cy={A.bb.y} r={8} fill={MATERIAL.hub} />
      </g>

      {/* Brake calipers, straddling the rim just under the crown and the bridge.
          Small, but their absence is a large part of why v1 read as a toy. */}
      {[[A.frontHub.x - 2, 1], [A.rearHub.x + 3, -1]].map(([bx, dir], i) => (
        <path key={i}
          d={`M${bx - 11} ${250 - 78} q ${11 * Number(dir)} -13 22 0`}
          stroke={MATERIAL.metal} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.95}
        />
      ))}

      <Saddle style={look.saddle} tape={look.tape} tint={look.saddleTint} />
      <Bars style={look.bar} tape={look.tape} />

      {/* Basket: hung off the front of the bars, over the wheel, where one goes. */}
      {look.basket && (
        <g>
          <path d={`M${A.headTop.x + 14} ${A.headTop.y - 10} h 44 l -5 34 h -34 z`} fill={MATERIAL.wicker} />
          <g stroke={MATERIAL.hub} fill="none" opacity={0.35}>
            {[10, 21, 32].map((dx) => <path key={dx} d={`M${A.headTop.x + 14 + dx} ${A.headTop.y - 10} l -1.5 34`} strokeWidth={1.4} />)}
            <path d={`M${A.headTop.x + 15} ${A.headTop.y + 3} h 42`} strokeWidth={1.4} />
          </g>
          <path d={`M${A.headTop.x + 12} ${A.headTop.y - 11} h 48`} stroke={MATERIAL.wicker} strokeWidth={4} strokeLinecap="round" fill="none" />
        </g>
      )}

    </svg>
  )
}

export { A as BIKE_ANCHORS }
export type { BikeLook }
