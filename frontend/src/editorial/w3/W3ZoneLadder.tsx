import { motion, useReducedMotion } from 'motion/react'
import { T, FONT } from './w3tokens'

/**
 * W3 · WHAT ONE NUMBER BUYS YOU.
 *
 * The onboarding screen showed an FTP and stopped. But 203 W means nothing on
 * its own — it is a threshold, and its whole job is to define the five efforts
 * a rider will actually be asked for. So the number is DRAWN as the ladder it
 * creates: six bands, each with the real watts that band starts and ends at,
 * computed from this rider's own figure.
 *
 * The old wizard had a version of this and it was six coloured bars at FIXED
 * heights — a decoration that said the same thing for every rider on earth.
 * Every bar here is a real range: change the FTP by ten watts and every number
 * on the ladder moves.
 *
 * ── WHY COLOUR IS ALLOWED HERE, WHEN IT IS NOT ELSEWHERE ─────────────────
 * The app keeps ONE accent, and the biker page just lost four foreign hues for
 * exactly that reason. Training zones are the exception, and not arbitrarily:
 * they are an ordered scale with a convention riders already know from every
 * head unit and every training app they have used. The colour is the data.
 *
 * Boundaries are Coggan's classic percentages of threshold.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'

/** [name, what it feels like, lower % of FTP, upper % or null for open-ended] */
const ZONES: [string, string, number, number | null, string][] = [
  ['Z1', 'Erholung', 0, 0.55, T.cool],
  ['Z2', 'Grundlage', 0.56, 0.75, T.training],
  ['Z3', 'Tempo', 0.76, 0.90, T.acid],
  ['Z4', 'Schwelle', 0.91, 1.05, T.warn],
  ['Z5', 'VO₂max', 1.06, 1.20, T.bad],
  ['Z6', 'Sprint', 1.21, null, T.evening],
]

export default function W3ZoneLadder({ ftp }: { ftp: number | null }) {
  const reduce = useReducedMotion()
  const ok = ftp != null && ftp > 0

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>
          DEINE BEREICHE
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>
          {ok ? 'daraus bauen wir jede Einheit' : 'sobald deine Zahl steht'}
        </span>
      </div>

      {/* THE TEXT LIVES UNDER THE BARS, NOT INSIDE THEM. Inside, the short
          low-zone bars clipped their own numbers — Z1 showed nothing at all —
          and a chart that hides the very figures it exists to show is worse
          than no chart. The bars carry the shape; the row beneath carries the
          watts. */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 54 }}>
        {ZONES.map(([z, , , , hue], i) => (
          <motion.div key={z}
            initial={reduce ? false : { scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.45, delay: reduce ? 0 : 0.06 * i, ease: [0.22, 1, 0.36, 1] }}
            style={{
              flex: 1, minWidth: 0, transformOrigin: 'bottom',
              // The ladder CLIMBS: each band taller than the last, so the shape
              // says "harder" before a single number is read.
              height: `${34 + i * 13}%`, borderRadius: 6,
              background: ok ? `linear-gradient(180deg, ${hue}, ${hue}99)` : T.d1,
              boxShadow: ok ? `0 0 12px ${hue}4D` : 'none',
            }} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 5 }}>
        {ZONES.map(([z, feel, lo, hi, hue], i) => {
          const from = ok ? Math.round(ftp! * (i === 0 ? 0 : lo)) : null
          const to = ok && hi != null ? Math.round(ftp! * hi) : null
          return (
            <div key={z} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.4, color: ok ? hue : T.quiet }}>{z}</span>
              <span style={{
                fontFamily: ARCHIVO, fontSize: 11, fontWeight: 700, color: ok ? T.ink : T.quiet,
                fontVariantNumeric: 'tabular-nums', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {!ok ? '—' : to == null ? `${from}+` : `${to}`}
              </span>
              <span style={{ fontSize: 7, fontWeight: 600, color: T.quiet, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {feel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
