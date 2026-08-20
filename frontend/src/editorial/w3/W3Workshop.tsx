import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Asterisk, Camera, Check, HelpCircle, Trophy, Wrench, Zap } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import { WHEN_CHIPS, daysAgoISO, readPhoto } from './workshopPhoto'
import type { MethodOption, ServiceResult, Workshop, WorkshopComponent } from '../../api/workshop'

/**
 * W3 · GARAGE — the workshop. Where the bike economy is actually played.
 *
 * THE SCREEN HAS ONE JOB: make the rider want to press a button that pays them.
 * Everything on it is arranged around the unharvested Service Bonus, which is
 * the headline number and the reason to open the tab at all.
 *
 * WHAT THIS SCREEN MUST NEVER DO, and the reason the copy is written the way it
 * is. There is no penalty here, no lockout, no scold and no red. A component
 * past its interval is not failing — it is holding a bigger payout. "overdue"
 * renders in the SAME warm accent as "due", one step quieter, because the only
 * thing that has actually happened is that the pile stopped growing.
 *
 * The watts line is the one place a downside is named, and it is named as a
 * measured fact rather than a game penalty: a dirty chain really does cost
 * about 3-5 W. A cyclist respects that; an invented debuff insults them.
 *
 * Pure function of `vm`. `W3WorkshopPage` owns the fetch and the mutation.
 */

const nf = (n: number) => n.toLocaleString('de-DE')
const km = (n: number) => `${Math.round(n).toLocaleString('de-DE')} km`

/** Days, said the way a person says them. 45 days is "6 Wochen", not "45 Tage",
 *  and 400 is "über ein Jahr" — the precision the app HAS is not the precision
 *  the rider gave us, and printing it back implies a measurement nobody made. */
function age(days: number): string {
  if (days <= 1) return 'heute'
  if (days < 14) return `vor ${days} Tagen`
  if (days < 60) return `vor ${Math.round(days / 7)} Wochen`
  if (days < 365) return `vor ${Math.round(days / 30)} Monaten`
  return days < 550 ? 'vor über einem Jahr' : `vor ${Math.floor(days / 365)} Jahren`
}

/** The meter's caption, in the unit of whichever clock is actually running.
 *  Printing "1 200 / — km" against sealant is the confusion the two-clock model
 *  exists to remove, so the label follows `clock` and never the other way. */
function scaleLabel(c: WorkshopComponent): string {
  if (c.clock === 'days' && c.interval_days) {
    const every = c.interval_days >= 365
      ? 'jährlich'
      : `alle ${Math.round(c.interval_days / 30)} Monate`
    return c.days_since == null ? every : `${age(c.days_since)} · ${every}`
  }
  return c.interval_km ? `${km(c.km_since)} / ${km(c.interval_km)}` : DASH
}

/** Status → how loud. Never red: nothing here is an error.
 *  `fresh` is the acid, because a fresh drivetrain is EARNING the bonus.
 *  `due` and `overdue` are warm — an invitation to collect, not a warning. */
const TONE: Record<WorkshopComponent['status'], string> = {
  fresh: T.acid,
  due: T.warn,
  overdue: T.mid,
  // Not a severity at all — the absence of a claim. Quiet as the meta text,
  // because "we have not asked yet" must not compete with a real job.
  unknown: T.quiet,
}
const STATUS_DE: Record<WorkshopComponent['status'], string> = {
  fresh: 'FRISCH',
  due: 'FÄLLIG',
  overdue: 'ÜBERFÄLLIG',
  unknown: 'UNBEKANNT',
}

function Meter({ progress, tone, reduce }: { progress: number; tone: string; reduce: boolean | null }) {
  return (
    <div style={{ height: 6, borderRadius: 100, background: T.heroOff, overflow: 'hidden' }}>
      <motion.div
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.min(100, progress * 100)}%` }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ height: '100%', borderRadius: 100, background: tone }} />
    </div>
  )
}

/** The two-button answer to "does your bike even have this?".
 *
 *  Rendered INSTEAD of a job, never above one. A rim-brake rider shown a
 *  "Bremsflüssigkeit — FÄLLIG" row learns that this screen guesses about their
 *  bicycle, and after that they will ignore the one warning that matters. */
function HaveQuestion({ c, busy, onDeclare }: {
  c: WorkshopComponent
  busy: boolean
  onDeclare: (owned: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
        {QUESTION_DE[c.id] ?? `Hat dein Rad ${c.name_de}?`}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Chip label="Ja, hab ich" tone="on" disabled={busy} onClick={() => onDeclare(true)} />
        <Chip label="Nein" disabled={busy} onClick={() => onDeclare(false)} />
      </div>
    </div>
  )
}

/** "Wann zuletzt?" — rough answers first, an exact date underneath.
 *
 *  Nobody knows the DATE they last oiled their chain; they know "ein paar
 *  Wochen". A rough answer replayed against the real ride history beats an
 *  exact-looking date somebody guessed, and it is far likelier to be given at
 *  all — which matters more, because the alternative is the odometer staying at
 *  zero and the app telling them their four-year-old fluid is fresh. */
function WhenQuestion({ c, busy, onSeed, onCancel }: {
  c: WorkshopComponent
  busy: boolean
  onSeed: (iso: string) => void
  onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
        {c.name_de}: wann zuletzt? Grob reicht — den Rest rechnen wir aus
        deinen echten Fahrten seit dann.
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {WHEN_CHIPS.map((w) => (
          <Chip key={w.days} label={w.label} disabled={busy}
                onClick={() => onSeed(daysAgoISO(w.days))} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="date"
          max={daysAgoISO(0)}
          disabled={busy}
          onChange={(e) => e.target.value && onSeed(e.target.value)}
          aria-label={`Genaues Datum für ${c.name_de}`}
          style={{
            flex: 1, minWidth: 0, height: 32, padding: '0 10px', borderRadius: 10,
            background: T.heroChip, border: 0, color: T.mid,
            fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
          }} />
        <Chip label="Später" disabled={busy} onClick={onCancel} />
      </div>
    </div>
  )
}

function Chip({ label, tone, disabled, onClick }: {
  label: string
  tone?: 'on'
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 'none', height: 32, padding: '0 13px', borderRadius: 100, border: 0,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      background: tone === 'on' ? T.acid : T.heroChip,
      color: tone === 'on' ? T.heroInk : T.mid,
      fontFamily: FONT, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2,
    }}>{label}</button>
  )
}

/** What we actually ask, per part. Generic phrasing ("Hat dein Rad
 *  Bremsflüssigkeit?") reads like a quiz; these read like a mechanic. */
const QUESTION_DE: Record<string, string> = {
  sealant: 'Fährst du tubeless? Dann altert die Dichtmilch mit — auch wenn das Rad steht.',
  brakefluid: 'Hast du hydraulische Bremsen? Die Flüssigkeit zieht Wasser, unabhängig von den Kilometern.',
}

/** Oil, hot wax or drip wax — the same chain, three maintenance regimes.
 *
 *  Only shown for a component that HAS methods, which today is the chain alone.
 *  The interval beside each one comes from the server, so the number on screen
 *  is the number the harvest will grade against. Switching does not reset the
 *  odometer: changing lube does not clean a chain, it changes the interval those
 *  kilometres are measured against. */
function MethodPicker({ c, options, busy, onPick }: {
  c: WorkshopComponent
  options: MethodOption[]
  busy: boolean
  onPick: (method: string) => void
}) {
  const active = c.method ?? options[0]?.id
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((m) => {
        const on = m.id === active
        return (
          <button key={m.id} onClick={() => onPick(m.id)} disabled={busy || on} style={{
            flex: 1, minWidth: 0, height: 30, borderRadius: 100, border: 0,
            cursor: busy || on ? 'default' : 'pointer',
            background: on ? T.heroChip : 'transparent',
            color: on ? T.ink : T.quiet,
            fontFamily: FONT, fontSize: 10.5, fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            opacity: busy && !on ? 0.5 : 1,
          }}>
            {/* No unit: the meter line right below says km, and "Tropfwachs ·
                200 km" truncated at 390 px — losing the number, which is the
                only part that makes the choice informative. */}
            {m.name_de} · {Math.round(m.interval_km)}
          </button>
        )
      })}
    </div>
  )
}

function ComponentRow({ c, busy, methods, onService, onSeed, onDeclare, onMethod }: {
  c: WorkshopComponent
  busy: boolean
  methods: MethodOption[]
  onService: (proofImage?: string | null) => void
  onSeed: (iso: string) => void
  onDeclare: (owned: boolean) => void
  onMethod: (method: string) => void
}) {
  const reduce = useReducedMotion()
  const file = useRef<HTMLInputElement>(null)
  // `null` means FOLLOW THE DATA, and that is the whole point of the three
  // states. A `useState(undated)` initialiser only runs on mount, so answering
  // "ja, hab ich" flipped the row from a question straight to a job reading
  // FRISCH — the app asserting a four-year-old brake fluid was fine, one tap
  // after admitting it had no idea. Derived, the row asks the moment the
  // server says it is undated, and 'later' is the rider's own escape hatch.
  const [asking, setAsking] = useState<'when' | 'later' | null>(null)
  const showWhen = !c.dormant && (asking === 'when' || (asking === null && c.undated))
  const tone = TONE[c.status]
  // Nothing to collect yet — the button is still offered (servicing early is a
  // trade the rider may make) but it does not shout.
  const worth = c.bonus_rc > 0

  const pick = async (f: File | undefined) => {
    if (!f) return
    // A photo we cannot decode services WITHOUT proof rather than failing. The
    // base Service Bonus was earned by riding and must never hinge on a camera.
    onService(await readPhoto(f))
  }

  return (
    <div style={{
      background: T.heroDock, borderRadius: 20, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{c.name_de}</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: tone }}>
          {STATUS_DE[c.status]}
        </span>
        {!c.dormant && (
          <span style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 17, fontWeight: 700, color: worth ? T.ink : T.heroOff,
            fontVariantNumeric: 'tabular-nums',
          }}>
            <Asterisk size={14} color={worth ? T.lilac : T.heroOff} />
            {nf(c.bonus_rc)}
          </span>
        )}
        {c.dormant && <HelpCircle size={15} color={T.quiet} style={{ marginLeft: 'auto' }} />}
      </div>

      {c.dormant ? (
        <HaveQuestion c={c} busy={busy} onDeclare={onDeclare} />
      ) : showWhen ? (
        <WhenQuestion c={c} busy={busy}
                      onSeed={(iso) => { setAsking(null); onSeed(iso) }}
                      onCancel={() => setAsking('later')} />
      ) : (
        <>
          {methods.length > 1 && (
            <MethodPicker c={c} options={methods} busy={busy} onPick={onMethod} />
          )}

          <Meter progress={c.progress} tone={tone} reduce={reduce} />

          {/* THE META GETS ITS OWN LINE. It shared one with the action button
              until the camera arrived beside it, and three items competing for
              ~150 px truncated the lifetime figure to "· 4…" — the number
              riders care most about, reduced to an ellipsis. Text and controls
              now own a row each; the card is one line taller and everything on
              it is readable. */}
          <div style={{
            display: 'flex', gap: 6, alignItems: 'baseline',
            fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}>
            <span style={{ flex: 'none', color: T.heroMid, fontVariantNumeric: 'tabular-nums' }}>
              {scaleLabel(c)}
            </span>
            {/* The lifetime number survives every service and is the thing
                riders actually brag about, so it sits on the row permanently —
                but it is still the half that gives way when space runs out.
                NOT on a calendar part: "1.180 km gesamt" beside a sealant
                top-up implies kilometres matter to it, which is the precise
                belief the two-clock model exists to correct. */}
            {c.clock === 'km' && (
              <span style={{
                minWidth: 0, color: T.quiet, fontVariantNumeric: 'tabular-nums',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                · {km(c.km_total)} gesamt
              </span>
            )}
            {/* The clock can always be corrected. Last on the line and in the
                meta's own weight, because it is a fix and not a task — but
                present on every row, because an odometer a rider knows is wrong
                is one they stop believing entirely. */}
            <button onClick={() => setAsking('when')} style={{
              flex: 'none', marginLeft: 'auto', background: 'none', border: 0,
              padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 10.5,
              fontWeight: 600, color: T.quiet,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              richtigstellen
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Proof is a SECOND affordance beside the plain one, never a step
                in front of it. Both are one tap; the camera simply pays more. */}
            <input ref={file} type="file" accept="image/*" capture="environment"
                   onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
                   style={{ display: 'none' }} />
            <button
              onClick={() => file.current?.click()}
              disabled={busy}
              aria-label={`Mit Foto nachweisen — ${c.name_de}`}
              style={{
                flex: 1, minWidth: 0, height: 34, borderRadius: 100,
                border: `1px solid ${T.heroChip}`, background: 'transparent',
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: FONT, fontSize: 11, fontWeight: 700, color: T.lilac,
              }}>
              <Camera size={13} color={T.lilac} />Mit Foto · +40 %
            </button>
            <button
              onClick={() => onService(null)}
              disabled={busy}
              style={{
                flex: 1, minWidth: 0, height: 34, padding: '0 12px',
                borderRadius: 100, border: 0, cursor: busy ? 'default' : 'pointer',
                background: worth ? T.acid : T.heroChip,
                color: worth ? T.heroInk : T.mid,
                fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
                opacity: busy ? 0.6 : 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
              {c.action_de}
            </button>
          </div>

          {/* Stated only when true, and stated as what it is: the pile is intact,
              it has simply stopped growing. Never phrased as a loss. */}
          {c.accrual_stopped && (
            <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
              Der Bonus ist gesichert — er wächst ab hier nur nicht weiter.
            </span>
          )}
        </>
      )}
    </div>
  )
}

export interface W3WorkshopProps {
  workshop: Workshop | null
  loading: boolean
  /** The component currently being serviced, or null. */
  busyId: string | null
  /** The last service, for the celebration. Cleared by the page on dismiss. */
  lastResult: ServiceResult | null
  onService: (componentId: string, proofImage?: string | null) => void
  onSeed: (componentId: string, lastServiceOn: string) => void
  onDeclare: (componentId: string, owned: boolean) => void
  onMethod: (componentId: string, method: string) => void
  /** Maintenance regimes per component id. Absent ids simply show no picker. */
  methods: Record<string, MethodOption[]>
  onDismissResult: () => void
}

export default function W3Workshop({
  workshop, loading, busyId, lastResult, methods,
  onService, onSeed, onDeclare, onMethod, onDismissResult,
}: W3WorkshopProps) {
  const reduce = useReducedMotion()
  const [seen, setSeen] = useState(false)

  if (loading || !workshop) {
    return (
      <div style={{ padding: '0 20px 26px', fontFamily: FONT }}>
        <div style={{ background: T.heroDock, borderRadius: 24, height: 120 }} />
      </div>
    )
  }

  const total = workshop.total_bonus_rc

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '0 20px 26px', fontFamily: FONT, background: T.heroBg,
    }}>

      {/* ── the headline: what is waiting to be collected ── */}
      <div style={{
        background: T.heroDock, borderRadius: 28, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={13} color={T.acid} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.acid }}>
            WERKSTATT
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <Asterisk size={26} color={T.lilac} style={{ marginBottom: 6 }} />
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{
              fontFamily: 'Archivo, "Inter Tight", sans-serif', fontSize: 44,
              fontWeight: 700, lineHeight: 0.9, color: total > 0 ? T.ink : T.heroOff,
              fontVariantNumeric: 'tabular-nums',
            }}>{nf(total)}</motion.span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.heroMid, paddingBottom: 6 }}>
            wartet auf dich
          </span>
        </div>

        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
          Jeder Kilometer legt Bonus auf deine Teile. Warten kostet nichts —
          der Bonus bleibt liegen, bis du ihn abholst.
        </span>

        {/* The earn bonus: a thing you have, or a thing you can go and get.
            Never phrased as something you are losing. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px',
          borderRadius: 14, background: workshop.drivetrain_fresh ? T.acidDim : T.heroChip,
        }}>
          <Zap size={15} color={workshop.drivetrain_fresh ? T.acid : T.heroMid} />
          <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: workshop.drivetrain_fresh ? T.acid : T.mid, minWidth: 0 }}>
            {workshop.drivetrain_fresh
              ? '+12 % auf jede Fahrt — dein Antrieb ist frisch.'
              : 'Kette reinigen schaltet +12 % auf jede Fahrt frei.'}
          </span>
        </div>

        {/* Measured, not invented. Only rendered when there is a real figure. */}
        {workshop.drivetrain_watts != null && (
          <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
            Deine Kette kostet dich gerade rund {workshop.drivetrain_watts} Watt.
            Das ist echte Reibung, kein Spielabzug.
          </span>
        )}
      </div>

      {/* ── the record: what replaces a streak ── */}
      {workshop.chain_record_km > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          borderRadius: 20, background: T.heroDock,
        }}>
          <Trophy size={15} color={T.acid} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid, minWidth: 0 }}>
            Längste Kette: <span style={{ color: T.ink, fontWeight: 700 }}>{km(workshop.chain_record_km)}</span>
          </span>
        </div>
      )}

      {/* ── the components ── */}
      {workshop.components.map((c) => (
        <ComponentRow
          key={c.id} c={c}
          busy={busyId === c.id}
          methods={methods[c.id] ?? []}
          onService={(proof) => { setSeen(false); onService(c.id, proof) }}
          onSeed={(iso) => onSeed(c.id, iso)}
          onDeclare={(owned) => onDeclare(c.id, owned)}
          onMethod={(m) => onMethod(c.id, m)} />
      ))}

      {/* ── the payday ── */}
      {lastResult && !seen && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => { setSeen(true); onDismissResult() }}
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 'calc(104px + env(safe-area-inset-bottom))',
            maxWidth: 358, margin: '0 auto', zIndex: 60, cursor: 'pointer',
            background: T.acid, borderRadius: 20, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
          <Check size={18} color={T.heroInk} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.heroInk }}>
              {lastResult.name_de} gewartet · +{nf(lastResult.paid_rc)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#00000099' }}>
              {/* The photo's own sentence wins the line when there was one: it
                  is the part the rider just did something extra for, and it is
                  the only line that could ever surprise them. It is never
                  accusatory — see `services/service_proof`. */}
              {lastResult.proof_note
                ?? (lastResult.new_record
                  ? `Rekord! ${km(lastResult.record_km)} auf einem Satz.`
                  : `${km(lastResult.km_serviced)} abgerechnet.`)}
            </span>
            {lastResult.proof_rc > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.heroInk }}>
                Nachweis bestätigt · +{nf(lastResult.proof_rc)} extra
              </span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

/** The em dash the rest of W3 uses, re-exported so a caller rendering an empty
 *  workshop shows the same absence marker as every other surface. */
export { DASH }
