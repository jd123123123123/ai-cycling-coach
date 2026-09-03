import { motion, useReducedMotion } from 'motion/react'
import { Trophy } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { lux, TNUM } from './w3surfaces'
import W3Eyebrow from './W3Eyebrow'

/**
 * W3 · NEUE BESTLEISTUNG — the crew's headline record, pen frame `dly9G`.
 *
 * ── WHY GOLD, ON A SCREEN THAT SPENDS ITS ACCENT ON ACID ─────────────────
 *
 * The feed already has two colours doing work: acid for the rider's own things
 * and violet for the crew as a body. A third is only justified if it means a
 * third thing, and this does — it is the one card that is not about what
 * somebody DID today but about what they have never done before. Gold is the
 * obvious word for that and it is used exactly once per feed.
 *
 * ── IT APPEARS ONCE, FOR THE BIGGEST ────────────────────────────────────
 *
 * Any ride that set a record already wears a chip on its own post. This card
 * is not that chip repeated at full size: it is the single most significant
 * record in the feed's window, raised to a headline. Two cards making the same
 * claim at two weights is the restatement this feed keeps deleting.
 *
 * ── AND IT SHOWS WHAT FELL ──────────────────────────────────────────────
 *
 * Two rails, old and new, drawn against the NEW value so the shorter one is
 * visibly shorter and both are labelled with their real numbers and the real
 * month the old one was set. A comparison whose bars are not printed is the
 * shape that flatters; this one has nothing to flatter, and the gain is small
 * on purpose — a record is a few watts, and drawing it as a doubling would be
 * a lie in the rider's favour.
 */

export interface W3RecordCardVm {
  /** "@jannis" or "Du". */
  handle: string
  /** "20-Minuten" — the server's word for the duration. */
  label: string
  valueW: number
  priorW: number
  /** "MÄRZ" — already localised, or null when the holding ride aged out. */
  priorWhen: string | null
  onOpen?: () => void
}

const nf = new Intl.NumberFormat('de-DE')

export default function W3RecordCard({ vm }: { vm: W3RecordCardVm }) {
  const reduce = useReducedMotion()
  // Against the NEW value, so the old rail is visibly the shorter one. Floored
  // at 55 % so a two-watt record still reads as two bars rather than one bar
  // and a stub — the point is the gap, not the ratio.
  const priorFrac = Math.max(0.55, Math.min(1, vm.priorW / (vm.valueW || 1)))

  return (
    <button
      type="button" onClick={vm.onOpen}
      style={{
        ...lux(26), width: '100%', padding: '18px 18px 16px', gap: 14,
        border: 0, textAlign: 'left', cursor: vm.onOpen ? 'pointer' : 'default',
        fontFamily: FONT,
        background: `linear-gradient(155deg, ${T.goldDim}, ${T.surface} 58%)`,
        boxShadow: `inset 0 0 0 1px ${T.goldEdge}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%' }}>
        <span style={{
          flex: 'none', width: 46, height: 46, borderRadius: 100, display: 'grid', placeItems: 'center',
          background: T.goldDim, boxShadow: `inset 0 0 0 1px ${T.goldEdge}`,
        }}>
          <Trophy size={20} color={T.gold} strokeWidth={1.9} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <W3Eyebrow tone={T.gold}>
            Neue Bestleistung · {vm.handle.replace('@', '')}
          </W3Eyebrow>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ ...TNUM, fontSize: 32, fontWeight: 700, letterSpacing: -1.3, lineHeight: 1, color: T.ink }}>
              {nf.format(vm.valueW)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>W · {vm.label}</span>
          </span>
        </span>
      </div>

      {/* what fell — both rails labelled, because a comparison whose numbers
          are not printed is the shape that flatters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
        {[
          { k: 'alt', tag: vm.priorWhen ? `ALT · ${vm.priorWhen}` : 'BISHER', w: vm.priorW, frac: priorFrac, lit: false },
          { k: 'neu', tag: 'NEU · HEUTE', w: vm.valueW, frac: 1, lit: true },
        ].map((r, i) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <span style={{
              width: 74, flex: 'none', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9,
              color: r.lit ? T.gold : T.quiet,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{r.tag}</span>
            <span style={{ flex: 1, height: 9, borderRadius: 100, background: `${T.ink}0F`, overflow: 'hidden' }}>
              <motion.span
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.round(r.frac * 100)}%` }}
                transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : i * 0.1 }}
                style={{
                  display: 'block', height: '100%', borderRadius: 100,
                  background: r.lit ? T.gold : T.d2,
                }} />
            </span>
            <span style={{
              width: 46, flex: 'none', textAlign: 'right', ...TNUM,
              fontSize: 12.5, fontWeight: 700, color: r.lit ? T.ink : T.mid,
            }}>{nf.format(r.w)} W</span>
          </div>
        ))}
      </div>
    </button>
  )
}
