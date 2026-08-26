import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Flag, Gauge, PenLine, Timer, FileUp } from 'lucide-react'
import { T, FONT, DASH, band, card, grow, Reveal } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * W3 · TRAININGSPLAN, when there isn't one. Route /e/w3-plan.
 *
 * The plan screen used to render its full apparatus at a rider with no plan:
 * a countdown to "Kein Ziel gesetzt", a phase rail with no phase lit, a
 * twelve-week chart of nothing. Every one of those is a real component doing
 * its job on empty inputs, and together they say the opposite of the truth —
 * they say the coaching is running and simply has nothing to report today.
 *
 * So without a plan this route is not a plan screen with holes in it. It is
 * ONE PAGE whose only job is to be worth reading and to end in a first plan.
 *
 * It follows the house structure: opening, ledger, three numbered chapters
 * that are DIFFERENTLY SHAPED (a rail, a list, three tiles), one acid pill.
 *
 * WHAT IT IS NOT ALLOWED TO DO: show a sample plan. A drawn-up week the rider
 * has not been given is the same lie as the empty apparatus, told the other
 * way round. The chapters describe the MECHANISM — the four phases the
 * periodisation engine actually builds, the three signals that actually move a
 * week — and the ledger prints the rider's own real season. The only invented
 * thing on this page would be a plan, and there isn't one on it.
 */

export interface W3PlanEmptyVm {
  /** This season so far, from the athlete's real activities. `null` ⇒ DASH. */
  rides: number | null
  hours: number | null
  tss: number | null
  /** "seit 1. Januar" — the ledger's own footnote, so the three numbers are
   *  never read as all-time. */
  since: string
}

export interface W3PlanEmptyActions {
  onBack: () => void
  /** The three ways in — all land on the goal screen, which is where a goal
   *  becomes a plan. The key travels so the caller can open the right editor
   *  once that screen learns to take one. */
  onStart: (key: 'event' | 'ftp' | 'hours') => void
  onBuilder: () => void
  onImport: () => void
}

const WAYS: { key: 'event' | 'ftp' | 'hours'; label: string; sub: string; icon: typeof Flag }[] = [
  { key: 'event', label: 'Ein Event vorbereiten', sub: 'Rückwärts geplant vom Tag X', icon: Flag },
  { key: 'ftp', label: 'FTP steigern', sub: 'Eine Zahl, auf die alles einzahlt', icon: Gauge },
  { key: 'hours', label: 'Mehr Stunden fahren', sub: 'Der Plan passt sich deiner Woche an', icon: Timer },
]

/** The four phases the periodisation engine builds — named here as mechanism,
 *  not as a plan. Widths are the engine's typical shares of a season, which is
 *  why Grundlage is the wide one and Taper the sliver. */
const PHASES: { name: string; weeks: number; text: string }[] = [
  { name: 'Grundlage', weeks: 6, text: 'Lange, ruhige Stunden. Der Motor wird größer, nicht lauter.' },
  { name: 'Aufbau', weeks: 4, text: 'Die Schwelle wandert nach oben — Tempo wird zu Grundlage.' },
  { name: 'Spezifisch', weeks: 3, text: 'Die Einheiten sehen aus wie dein Ziel: dieselben Rampen, dieselbe Dauer.' },
  { name: 'Taper', weeks: 1, text: 'Last runter, Schärfe drin. Die Form kommt nach oben.' },
]

/** The three signals that actually move a planned week in this app. Each one
 *  is a mechanism that exists — readiness gating, the adaptation feed, the
 *  weather window — so the chapter is a description, not a promise. */
const ADAPTS: { k: string; t: string }[] = [
  { k: 'BEREITSCHAFT', t: 'Schlecht geschlafen, HRV im Keller — die harte Einheit rutscht, statt dich zu überfahren.' },
  { k: 'VERPASST', t: 'Zwei Tage nicht gefahren? Die Woche wird neu verteilt, nicht nachgeholt.' },
  { k: 'WETTER', t: 'Regen am Intervalltag: der Plan tauscht ihn mit dem Tag, an dem es trocken ist.' },
]

const NEEDS: { n: string; v: string }[] = [
  { n: 'EIN ZIEL', v: 'Ein Renntag, eine FTP-Zahl oder einfach mehr Stunden' },
  { n: 'DEINE TAGE', v: 'An welchen Wochentagen du überhaupt fahren kannst' },
  { n: 'DEINE STUNDEN', v: 'Wie viel Zeit die Woche realistisch hergibt' },
]

/** `NN —` over the chapter's title. Numbering is the page's spine: it tells
 *  the rider there are three of these and that they are going somewhere. */
function Chapter({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <div style={{ ...band(28), gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.quiet, fontVariantNumeric: 'tabular-nums' }}>{n} —</span>
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.15, color: T.ink }}>{title}</span>
        </div>
        {children}
      </div>
    </Reveal>
  )
}

export default function W3PlanEmptyView({ vm, onBack, onStart, onBuilder, onImport }: {
  vm: W3PlanEmptyVm
} & W3PlanEmptyActions) {
  const reduce = useReducedMotion()
  const totalWeeks = PHASES.reduce((s, p) => s + p.weeks, 0)
  const num = (v: number | null) => (v == null ? DASH : v.toLocaleString('de-DE'))

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />
        <W3TopBar title="Trainingsplan" onBack={onBack} />

        {/* ── the opening ── */}
        <div style={{ ...band(24), paddingTop: 10, gap: 14 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>NOCH KEIN PLAN</span>
          {/* The two-weight headline: the sentence in ink, the one word it
              turns on in acid, on its own line, and the full stop belongs to
              the acid word. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.05, color: T.ink }}>Du fährst schon.</span>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.05, color: T.ink }}>Daraus wird</span>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.05, color: T.acid }}>Fortschritt.</span>
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45, color: T.mid }}>
            Ohne Plan misst die App, was passiert ist. Mit Plan entscheidet sie, was als Nächstes dran ist — und ändert das, wenn dein Körper oder deine Woche etwas anderes sagen.
          </span>
        </div>

        {/* ── the ledger: the rider's own season, which is the argument ──
             Not "riders who plan improve by X". The three numbers on this page
             are the rider's own, and the point they make is theirs too: this
             much work has already happened, unguided. */}
        <div style={{ ...band(28) }}>
          <div style={{ ...card(), padding: 18, gap: 12 }}>
            <div style={{ display: 'flex' }}>
              {[
                { l: 'FAHRTEN', v: num(vm.rides) },
                { l: 'STUNDEN', v: num(vm.hours) },
                { l: 'TSS', v: num(vm.tss) },
              ].map((c, i) => (
                <div key={c.l} style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3,
                  paddingLeft: i === 0 ? 0 : 14,
                  borderLeft: i === 0 ? undefined : `1px solid ${T.rule}`,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>{c.l}</span>
                  <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{c.v}</span>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet }}>Deine Saison {vm.since} — schon gefahren, noch ungeplant.</span>
          </div>
        </div>

        {/* ── 01: a rail ── */}
        <Chapter n="01" title="Eine Saison hat vier Kapitel.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* The segment meter, sized to each phase's real share of a season.
                Nothing is lit: no phase is active, because there is no plan —
                lighting one here would be the sample plan this page refuses. */}
            <div style={{ display: 'flex', gap: 3, height: 10 }}>
              {PHASES.map((p, i) => (
                <motion.div key={p.name}
                  initial={reduce ? false : { opacity: 0, scaleY: 0.4 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={grow(i * 0.06)}
                  style={{ flex: p.weeks, height: 10, borderRadius: 3, background: T.d2 }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 2 }}>
              {PHASES.map((p) => (
                <div key={p.name} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                  <span style={{ flex: 'none', width: 84, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: T.ink }}>{p.name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet, fontVariantNumeric: 'tabular-nums' }}>{p.weeks} {p.weeks === 1 ? 'Woche' : 'Wochen'}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{p.text}</span>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, fontVariantNumeric: 'tabular-nums' }}>
              Rund {totalWeeks} Wochen — die echte Länge kommt aus deinem Zieldatum.
            </span>
          </div>
        </Chapter>

        {/* ── 02: a list ── */}
        <Chapter n="02" title="Und er ändert sich von allein.">
          <div style={{ ...card(), padding: 16, gap: 0 }}>
            {ADAPTS.map((a, i) => (
              <div key={a.k} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: i === 0 ? '0 0 12px' : i === ADAPTS.length - 1 ? '12px 0 0' : '12px 0',
                borderTop: i === 0 ? undefined : `1px solid ${T.rule}`,
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>{a.k}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: T.ink }}>{a.t}</span>
              </div>
            ))}
          </div>
        </Chapter>

        {/* ── 03: three tiles ── */}
        <Chapter n="03" title="Er braucht drei Angaben von dir.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NEEDS.map((n) => (
              <div key={n.n} style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '13px 14px', borderRadius: 16, background: T.surface2,
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, color: T.quiet }}>{n.n}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{n.v}</span>
              </div>
            ))}
          </div>
        </Chapter>

        {/* ── the way in ──
             Three doors rather than one button, because "Plan starten" is a
             commitment and "Ein Event vorbereiten" is a sentence about the
             rider's own summer. All three land on the goal screen; the first
             is the acid one because an event is the goal the engine can plan
             the most precisely against. */}
        <div style={{ ...band(20), gap: 8 }}>
          {WAYS.map((w, i) => {
            const primary = i === 0
            const Icon = w.icon
            return (
              <motion.button
                key={w.key} type="button" onClick={() => onStart(w.key)}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={grow(0.05 + i * 0.07)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '15px 16px', borderRadius: 18, border: 0, cursor: 'pointer',
                  fontFamily: FONT, textAlign: 'left',
                  background: primary ? T.acid : T.surface,
                }}>
                <span style={{
                  width: 34, height: 34, flex: 'none', borderRadius: 11,
                  background: primary ? `${T.acidTop}2E` : T.d1,
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon size={17} color={primary ? T.acidTop : T.mid} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: primary ? T.acidTop : T.ink }}>{w.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: primary ? `${T.acidTop}B8` : T.quiet,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{w.sub}</span>
                </span>
                <ArrowRight size={16} color={primary ? T.acidTop : T.mid} style={{ flex: 'none' }} />
              </motion.button>
            )
          })}
          <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet, paddingTop: 2 }}>
            Danach steht deine erste Woche. Ändern kannst du alles jederzeit.
          </span>
        </div>

        {/* ── the two doors that are not a plan ──
             A rider who already knows what they are doing should not have to
             take a plan to use this app. Both of these existed long before
             this page and are unchanged: the block editor writes the same
             workouts the app schedules, and exports them as .zwo for Zwift. */}
        <div style={{ ...band(40), gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, color: T.quiet }}>ODER OHNE PLAN</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'Workout bauen', sub: '.zwo für Zwift', icon: PenLine, on: onBuilder },
              { label: 'Plan importieren', sub: 'PDF oder Bild', icon: FileUp, on: onImport },
            ].map((s) => (
              <button key={s.label} type="button" onClick={s.on}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9,
                  padding: '12px 13px', borderRadius: 16, border: 0, background: T.surface2,
                  cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
                }}>
                <s.icon size={15} color={T.mid} style={{ flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
