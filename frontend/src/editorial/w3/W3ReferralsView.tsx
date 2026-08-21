import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Users, Gift, Clock, Check } from 'lucide-react'
import { T, FONT, EASE, band } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import './w3.css'

/**
 * W3 · 10 REFERRAL OVERVIEW — 1:1 with pen `w9U9bF`. Pure function of `vm`;
 * `W3ReferralsPage` wires it to /referrals/mine. The code + the referred
 * riders' stats + accrued RideCoin are REAL; a rider with no avatar gets a
 * plain placeholder carrying their initial.
 *
 * ── PENDING VERSUS CLAIMABLE, WITHOUT A FOREIGN HUE ──────────────────────
 * The screen used to say "violet is a promise": a running window was violet
 * and a claimable one turned lime. The DISTINCTION is right and worth keeping
 * — a rider must be able to see at a glance which windows have money waiting —
 * but it was carried by a colour this design system does not have, alongside
 * five pastel avatar tints that meant nothing at all. Six foreign hues on a
 * screen whose only real signal is binary.
 *
 * It is carried the way every other state in this app is carried: UNLIT versus
 * LIT. A running window is quiet; a claimable one is acid and glows. Same
 * meaning, one accent, and it now matches the meters, the tally and the
 * monuments a rider sees everywhere else.
 */

/** A window still running. Deliberately recessive — it is not an alert. */
const PENDING = T.mid
const PLACEHOLDER = T.d1

export interface W3ReferralRow {
  id: number
  referredId: number
  handle: string
  avatarUrl: string | null
  timeLeftLabel: string      // "25d 03h" or "Ended"
  accruedLabel: string       // "+9,786" or "11.5K"
  claimable: boolean
}

export interface W3ReferralsVm {
  code: string
  blurb: string
  activeCount: number
  active: W3ReferralRow[]
  completedCount: number
  completed: W3ReferralRow[]
  howItWorks: string
}

function AvatarCard({ row, i, onTap, reduce }: { row: W3ReferralRow; i: number; onTap: () => void; reduce: boolean | null }) {
  const accent = row.claimable ? T.acid : PENDING
  return (
    <motion.button
      onClick={onTap}
      initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.06 }}
      style={{ position: 'relative', flex: 1, minWidth: 0, aspectRatio: '0.86', borderRadius: 22, overflow: 'hidden', border: 0, padding: 0, cursor: 'pointer', background: `radial-gradient(120% 90% at 50% 10%, ${row.claimable ? `${T.acid}1F` : PLACEHOLDER}, ${T.tile} 68%)`, fontFamily: FONT }}
    >
      {row.avatarUrl
        ? <img src={row.avatarUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 44, fontWeight: 800, color: '#FFFFFF55' }}>{row.handle.replace(/^@/, '').charAt(0).toUpperCase()}</div>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 7, background: 'linear-gradient(0deg, #000000CC, #00000000)' }}>
        <span style={{ alignSelf: 'center', padding: '4px 12px', borderRadius: 100, background: accent, fontSize: 11, fontWeight: 700, color: row.claimable ? T.bg : '#fff', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.handle}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 100, background: '#0B0B0BB0' }}>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, fontWeight: 700, color: T.mid }}><Clock size={11} />{row.timeLeftLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{row.accruedLabel} ✱</span>
        </div>
      </div>
    </motion.button>
  )
}

export default function W3ReferralsView({ vm, onBack, onShare, onOpenUser }: {
  vm: W3ReferralsVm; onBack?: () => void; onShare?: () => void; onOpenUser?: (referredId: number) => void
}) {
  const reduce = useReducedMotion()
  const rows = (list: W3ReferralRow[]) => {
    const out: W3ReferralRow[][] = []
    for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2))
    return out
  }

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, background: T.bg }}>
        <W3StatusBar />

        <div style={{ ...band(20), gap: 14, paddingTop: 6 }}>
          <button onClick={onBack} aria-label="Zurück" style={{ width: 44, height: 44, borderRadius: 100, background: '#fff', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={19} color="#000" /></button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, color: T.ink }}>Empfehlungen</span>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>{vm.blurb}</span>
          </div>
        </div>

        {/* Code + share */}
        <div style={{ ...band(28), gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6, color: T.ink }}>{vm.code}</span>
          <button onClick={onShare} style={{ width: '100%', height: 60, borderRadius: 100, background: T.acid, border: 0, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
            {/* Dark ink on acid, like every other primary action in the app.
                White on lime is barely legible and was only ever legible on the
                violet this button used to be. */}
            <Users size={19} color={T.heroInk} /><span style={{ fontSize: 16, fontWeight: 700, color: T.heroInk }}>Code teilen</span>
          </button>
        </div>

        {/* Active rewards */}
        {vm.active.length > 0 && (
          <div style={{ ...band(26), gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 30, height: 30, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: T.acid }}>{vm.activeCount}</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Aktive Belohnungen</span>
            </div>
            {rows(vm.active).map((pair, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 12 }}>
                {pair.map((row, ci) => <AvatarCard key={row.id} row={row} i={ri * 2 + ci} reduce={reduce} onTap={() => onOpenUser?.(row.referredId)} />)}
                {pair.length === 1 && <div style={{ flex: 1 }} />}
              </div>
            ))}
          </div>
        )}

        {/* Completed */}
        {vm.completed.length > 0 && (
          <div style={{ ...band(26), gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 30, height: 30, borderRadius: 100, background: T.surface2, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: T.mid }}>{vm.completedCount}</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Abgeschlossen</span>
            </div>
            {rows(vm.completed).map((pair, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 12 }}>
                {pair.map((row, ci) => (
                  row.claimable
                    ? (
                      <motion.button key={row.id} onClick={() => onOpenUser?.(row.referredId)} initial={reduce ? false : { scale: 0.96 }} animate={{ scale: 1 }}
                        style={{ flex: 1, minWidth: 0, aspectRatio: '0.86', borderRadius: 22, border: 0, cursor: 'pointer', background: T.acid, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', alignItems: 'center', fontFamily: FONT }}>
                        <Gift size={30} color={T.bg} />
                        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5, color: T.bg }}>JETZT HOLEN</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.bg }}>{row.accruedLabel} ✱</span>
                      </motion.button>
                    )
                    : <AvatarCard key={row.id} row={row} i={ri * 2 + ci} reduce={reduce} onTap={() => onOpenUser?.(row.referredId)} />
                ))}
                {pair.length === 1 && <div style={{ flex: 1 }} />}
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div style={{ ...band(40), gap: 12 }}>
          <div style={{ padding: 20, borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} color={T.acid} /><span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>So funktioniert's</span></div>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>{vm.howItWorks}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
