import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, TrendingDown, Zap } from 'lucide-react'
import {
  useAcceptThreshold,
  useDismissThreshold,
  useThresholdProposal,
} from '../../hooks/useThresholdProposal'
import { T, FONT, EASE, band } from './w3tokens'
import { lux, luxTile, TNUM } from './w3surfaces'

/**
 * W3 · TODAY — "your threshold moved. Here's why. Shall we?"
 *
 * FTP is the unit every other number in this app is measured in: the zones, the
 * TSS on every ride, CTL, and the watts of every interval the plan prescribes.
 * The engine may NOTICE it has moved and must SHOW its working — but the number
 * belongs to the rider, and only a rider pressing accept ever changes it.
 *
 * WHY IT IS A CELEBRATION. Getting stronger is the entire point of the training,
 * and it usually arrives as nothing at all: no screen, no moment, just a number
 * in a settings page that stays wrong for months. When the evidence says a
 * threshold went up, that is the best news this app ever has, and it should read
 * like it — the new figure at hero size, in acid, with the watts gained beside
 * it.
 *
 * AND WHY A DROP IS NOT ONE. Thresholds fall after illness, after a break, after
 * a hard block. A rider whose zones are set too high is training wrong every day
 * until somebody fixes it, so this has to be surfaced — but in amber, calmly,
 * explaining why it happens. It is a correction, never a telling-off.
 *
 * THE EVIDENCE IS THE POINT, not decoration. Each line states the arithmetic
 * that produced the claim — the 20-minute effort and its 0.95 coefficient, the
 * model and how many rides it rests on. A rider asked to change the foundation
 * of their training deserves to see the working, and "high" confidence means two
 * independent estimators agreed rather than a bigger font.
 *
 * Renders nothing on the days there is nothing true to say, which is nearly all
 * of them — the same rule `W3WorkshopNudge` and `W3RecoveryNudge` follow. A
 * permanent strip becomes furniture within a week and is then invisible on the
 * morning it finally matters.
 */
export default function W3ThresholdProposal() {
  const reduce = useReducedMotion()
  const { data } = useThresholdProposal()
  const accept = useAcceptThreshold()
  const dismiss = useDismissThreshold()
  const [done, setDone] = useState(false)

  if (!data?.available || !data.proposed_watts) return null

  const up = data.direction === 'up'
  // The acid budget: a rise spends it on the new number and the accept pill. A
  // fall is not an achievement and does not get the brand's celebration colour.
  const accent = up ? T.acid : T.warn
  const busy = accept.isPending || dismiss.isPending

  if (done) return null

  return (
    <motion.div
      style={{ ...band(20) }}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div style={{ ...lux(28), padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 100, display: 'grid', placeItems: 'center',
            background: up ? T.acidDim : `${T.warn}1F`,
          }}>
            {up ? <Zap size={14} color={accent} /> : <TrendingDown size={14} color={accent} />}
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>
            {up ? 'NEUE SCHWELLE' : 'SCHWELLE PRÜFEN'}
          </span>
        </div>

        {/* The two-weight headline: the sentence in ink, the number it is about
            carried below at hero size. */}
        <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.08, color: T.ink }}>
          {data.headline}
        </span>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontSize: 60, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.86,
            color: accent, ...TNUM,
          }}>
            {data.proposed_watts}
          </span>
          <span style={{ fontSize: 19, fontWeight: 700, color: accent }}>W</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.mid, ...TNUM }}>
            {data.delta_watts != null && `${data.delta_watts > 0 ? '+' : ''}${data.delta_watts} W`}
            {data.current_watts != null && ` · bisher ${data.current_watts} W`}
          </span>
        </div>

        <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>
          {data.body}
        </span>

        {/* ── THE WORKING ─────────────────────────────────────────────────
             Each line is the arithmetic behind the claim, not a reassurance
             about it. */}
        {!!data.evidence?.length && (
          <div style={{ ...luxTile(20), padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>
              {data.confidence === 'high' ? 'ZWEI UNABHÄNGIGE BELEGE' : 'WORAUF DAS BERUHT'}
            </span>
            {data.evidence.map((e) => (
              <span key={e.kind} style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.mid }}>
                {e.text}
              </span>
            ))}
            {/* Deliberately NOT in the accent colour. The acid budget on this
                card is already spent twice — the hero numeral and the pill you
                press — and a third accent turns a card into a colour scheme. */}
            {data.confidence === 'high' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.ink }}>
                Beide kommen auf dieselbe Zahl.
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <button
            onClick={() => {
              accept.mutate(data.proposed_watts!, { onSuccess: () => setDone(true) })
            }}
            disabled={busy}
            style={{
              flex: 1, height: 50, borderRadius: 100, border: 0, background: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: FONT, fontSize: 14.5, fontWeight: 700, color: T.heroInk,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
            }}>
            <Check size={16} color={T.heroInk} />
            {accept.isPending ? 'Einen Moment…' : 'Übernehmen'}
          </button>
          <button
            onClick={() => {
              dismiss.mutate(data.proposed_watts!, { onSuccess: () => setDone(true) })
            }}
            disabled={busy}
            style={{
              flex: 'none', height: 50, padding: '0 18px', borderRadius: 100, border: 0,
              background: T.tile, fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
              color: T.mid, cursor: busy ? 'default' : 'pointer',
            }}>
            Später
          </button>
        </div>
      </div>
    </motion.div>
  )
}
