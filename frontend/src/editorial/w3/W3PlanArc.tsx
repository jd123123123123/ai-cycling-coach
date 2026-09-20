import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { T, FONT, Display, HeadRow, Kicker, useInView } from './w3tokens'
import { lux, hairline, TNUM } from './w3surfaces'
import type { WeekBar, PhaseSeg } from './w3plan'
import type { PlanDaySession } from './W3PlanView'

/**
 * W3 · DER BOGEN — der Plan als ein Aufstieg, nicht als Liste von Wochen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WAS VORHER FALSCH WAR
 *
 * Die Planseite zeigte acht Gefaesse nebeneinander, darunter eine getrennte
 * Phasenleiste, darunter eine Tagestabelle. Drei Darstellungen desselben
 * Plans, die nichts voneinander wussten: Man konnte ablesen, dass Woche 5
 * laeuft, aber nicht SEHEN, wo Woche 5 im Ganzen liegt, worauf sie zulaeuft
 * und was danach kommt. Dazu war der Wochentag in der Tabelle doppelt
 * ("Mo" und "Mo, 14. Sep."), und kein einziges Element liess sich anfassen.
 *
 * DER BOGEN IST EINE AUSSAGE, KEIN DIAGRAMM. Ein Plan ist ein Aufstieg mit
 * einem Gipfel. Die Linie steigt, faellt zur Erholung ab und laeuft auf das
 * Ziel zu; der Fahrer steht irgendwo darauf. Alles andere haengt an dieser
 * Linie -- die Phasen als typografische Unterschrift, die Woche als Band
 * darunter, die Einheit als einzige Karte.
 *
 * ACID GENAU EINMAL: der Punkt, auf dem man steht. Vorher hingen fuenf Pfeile,
 * drei Gefaesse, eine Ueberschrift und der CTA am Acid -- wenn alles leuchtet,
 * fuehrt nichts. Phasen werden hier durch GEWICHT und HOEHE unterschieden,
 * nicht durch Farbe.
 *
 * KEINE KARTE UM DEN BOGEN. Er liegt direkt auf dem Grund. Die Seite war ein
 * Stapel gerahmter Kaesten gleichen Radius; ein Rahmen um die Hauptsache macht
 * sie zu einem Kasten unter Kaesten.
 */

const H = 92          // Hoehe der Bogenflaeche
const PAD = 14        // Innenabstand, damit Punkte am Rand nicht anschneiden

export interface W3PlanArcProps {
  weeks: WeekBar[]
  phases: PhaseSeg[]
  /** Index der laufenden Woche. */
  currentIndex: number
  /** Index der ANGESEHENEN Woche -- scrubben aendert nur diesen. */
  selectedIndex: number
  onSelectWeek: (idx: number) => void
  days: PlanDaySession[]
  selectedDay: number
  onSelectDay: (i: number) => void
  /** Tausch zweier Tage. Fehlt er, sind die Tafeln nicht ziehbar. */
  onSwapDays?: (aISO: string, bISO: string) => Promise<void> | void
  /** Was unten IN der Einheitskarte steht: Intervallprofil, Messwerte, CTA.
   *  Als Slot und nicht als fuenf weitere Eigenschaften -- und vor allem, damit
   *  es nur EINE Einheitskarte auf der Seite gibt. Vorher stand die heutige
   *  Einheit zweimal da: hier und in `w3-plan-session`, jede mit eigener
   *  Tagesreihe. Zwei Darstellungen derselben Einheit sind zwei Gelegenheiten,
   *  sich zu widersprechen. */
  unitFooter?: ReactNode
}

/** Die Hoehe eines Wertes, auf min..max gespreizt.
 *
 *  GEGEN NULL GEMESSEN WAERE DER BOGEN FLACH. Wochenlasten schwanken zwischen
 *  etwa 140 und 305 TSS; misst man sie gegen 0, nutzt die Kurve nur das obere
 *  Drittel der Flaeche und ein Aufbau von 180 auf 305 liest sich waagerecht.
 *  Gespreizt auf die tatsaechliche Spanne wird die Bewegung sichtbar, um die
 *  es geht -- der Anstieg, der Erholungseinschnitt, der Gipfel, der Taper.
 *  Die Achse ist damit relativ, nicht absolut; deshalb steht die Zahl
 *  daneben im Text und nicht an der Achse. */
function anteil(v: number, min: number, max: number): number {
  return max - min < 1 ? 0.5 : (v - min) / (max - min)
}

/** Ein glatter Pfad durch die Wochenlasten. */
function pfad(werte: number[], w: number, h: number): string {
  if (werte.length < 2) return ''
  const max = Math.max(...werte)
  const min = Math.min(...werte)
  const dx = (w - PAD * 2) / (werte.length - 1)
  const pt = (i: number) => [
    PAD + i * dx,
    PAD + (h - PAD * 2) * (1 - anteil(werte[i], min, max)),
  ] as const
  // Catmull-Rom zu Bezier: eine Linie, die steigt und faellt, soll nicht
  // knicken -- ein Plan ist eine Bewegung, kein Balkendiagramm.
  let d = `M ${pt(0)[0]} ${pt(0)[1]}`
  for (let i = 0; i < werte.length - 1; i++) {
    const [x0, y0] = pt(Math.max(0, i - 1))
    const [x1, y1] = pt(i)
    const [x2, y2] = pt(i + 1)
    const [x3, y3] = pt(Math.min(werte.length - 1, i + 2))
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`
  }
  return d
}

function Bogen({ weeks, currentIndex, selectedIndex, onSelectWeek }: {
  weeks: WeekBar[]; currentIndex: number; selectedIndex: number
  onSelectWeek: (i: number) => void
}) {
  const reduce = useReducedMotion()
  const { ref, inView, instant } = useInView(0.25)
  const still = reduce || instant
  const gezeigt = still || inView
  const box = useRef<HTMLDivElement | null>(null)
  const [zieht, setZieht] = useState(false)

  const W = 320
  const werte = weeks.map(w => w.planned)
  const d = pfad(werte, W, H)
  const max = Math.max(...werte)
  const min = Math.min(...werte)
  const dx = weeks.length > 1 ? (W - PAD * 2) / (weeks.length - 1) : 0
  const punkt = (i: number) => [
    PAD + i * dx,
    PAD + (H - PAD * 2) * (1 - anteil(werte[i], min, max)),
  ] as const

  // SCRUBBEN. Der Finger waehlt die Woche direkt -- kein Blaettern, kein
  // Seitenwechsel. Das ist der Unterschied zwischen "durch einen Plan
  // navigieren" und "einen Plan ueberblicken".
  const waehleAus = (clientX: number) => {
    const el = box.current
    if (!el || weeks.length < 2) return
    const r = el.getBoundingClientRect()
    const rel = ((clientX - r.left) / r.width) * W
    const i = Math.round((rel - PAD) / dx)
    const geklemmt = Math.max(0, Math.min(weeks.length - 1, i))
    if (geklemmt !== selectedIndex) onSelectWeek(geklemmt)
  }

  const runter = (e: RPointerEvent<HTMLDivElement>) => {
    // ERST WAEHLEN, DANN FANGEN. `setPointerCapture` wirft bei einem Zeiger,
    // den der Browser nicht (mehr) als aktiv fuehrt -- und ein Wurf hier hat
    // den Handler abgebrochen, BEVOR die Woche ueberhaupt gewaehlt war. Ein
    // Antippen des Bogens tat dann gar nichts.
    setZieht(true)
    waehleAus(e.clientX)
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId) } catch { /* ohne Fang geht es auch */ }
  }

  return (
    <div
      ref={el => { box.current = el; (ref as { current: HTMLDivElement | null }).current = el }}
      role="slider"
      aria-label="Woche im Plan"
      aria-valuemin={1}
      aria-valuemax={weeks.length}
      aria-valuenow={selectedIndex + 1}
      tabIndex={0}
      onPointerDown={runter}
      onPointerMove={e => { if (zieht) waehleAus(e.clientX) }}
      onPointerUp={() => setZieht(false)}
      onPointerCancel={() => setZieht(false)}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') onSelectWeek(Math.max(0, selectedIndex - 1))
        if (e.key === 'ArrowRight') onSelectWeek(Math.min(weeks.length - 1, selectedIndex + 1))
      }}
      style={{ touchAction: 'pan-y', cursor: zieht ? 'grabbing' : 'grab', outline: 'none' }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden
           style={{ display: 'block', overflow: 'visible' }}>
        {/* Die Grundlinie: wo "nichts" waere. Sie gibt dem Aufstieg einen Boden. */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={T.d1} strokeWidth={1} />
        {/* Der Bogen zeichnet sich EINMAL beim Ankommen. */}
        <path
          d={d} fill="none" stroke={T.d3} strokeWidth={1.5}
          strokeLinecap="round"
          style={{
            strokeDasharray: 1200,
            strokeDashoffset: gezeigt ? 0 : 1200,
            transition: still ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
        {weeks.map((_w, i) => {
          const [x, y] = punkt(i)
          const ist = i === selectedIndex
          const vorbei = i < currentIndex
          return (
            <g key={i}>
              {/* Vergangene Wochen sind gefuellt, kommende hohl: der Weg, der
                  schon unter den Raedern liegt, sieht anders aus als der,
                  der noch kommt. */}
              <circle
                cx={x} cy={y} r={ist ? 5 : 3}
                fill={ist ? T.acid : vorbei ? T.d3 : 'none'}
                stroke={ist ? T.acid : T.d3}
                strokeWidth={1.5}
                style={{ opacity: gezeigt ? 1 : 0, transition: still ? undefined : `opacity 0.4s linear ${0.5 + i * 0.03}s` }}
              />
              {/* Die laufende Woche bekommt eine Marke, auch wenn man
                  woanders hinschaut -- sonst verliert man beim Scrubben den
                  eigenen Standort. */}
              {i === currentIndex && !ist && (
                <line x1={x} y1={H - PAD} x2={x} y2={y + 6} stroke={T.d2} strokeWidth={1} />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Die Phasen als typografische Unterschrift unter dem Bogen -- keine Farbe,
 *  nur Gewicht. Vorher war das eine eigene Leiste mit eigenen Regeln. */
function Phasen({ phases }: { phases: PhaseSeg[] }) {
  if (!phases.length) return null
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
      {phases.map(p => {
        const [a, b] = p.weeks.replace('W', '').split('–').map(Number)
        return (
          <span key={p.name}
                style={{
                  flex: (b || a) - a + 1, minWidth: 0,
                  paddingTop: 7, borderTop: `1px solid ${p.active ? T.d3 : T.d1}`,
                  fontSize: 9.5, fontWeight: p.active ? 700 : 500,
                  letterSpacing: 0.8, textTransform: 'uppercase',
                  color: p.active ? T.ink : T.quiet,
                  overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap',
                }}>
            {/* NUR DIE AKTIVE PHASE NENNT IHREN NAMEN.
                Die Breite kommt hier aus der DAUER der Phase -- eine
                einwoechige Erholung bekommt ein Achtel der Zeile und konnte
                ihren Namen nie zeigen: erst "ERHOL…", nach einem Versuch mit
                Umbruch "ERHOLU/NG". Beides liest sich als Fehler.
                Die Zeitspanne passt dagegen IMMER, und sie sagt etwas, das
                der Name nicht sagt: wie lang die Phase ist.
                Den Namen liefert der Bogen ohnehin -- seine Ueberschrift
                zeigt beim Scrubben die Phase der gewaehlten Woche. */}
            {p.active ? p.name : p.weeks}
          </span>
        )
      })}
    </div>
  )
}

/**
 * DAS WOCHENBAND. Sieben Tafeln, deren HOEHE die Last traegt -- die Form der
 * Woche ist damit in einem Blick lesbar, was eine Tabelle nie leistet.
 *
 * ZIEHEN TAUSCHT. Das ist die Geste, die der Seite gefehlt hat: Wer Donnerstag
 * keine Zeit hat, zieht die Einheit auf Freitag. Serverseitig werden beide
 * Tage `user_modified` -- eine geschuetzte Quelle, die die Automatik nicht
 * wieder umraeumt.
 */
function Wochenband({ days, selectedDay, onSelectDay, onSwapDays }: {
  days: PlanDaySession[]; selectedDay: number
  onSelectDay: (i: number) => void
  onSwapDays?: (a: string, b: string) => Promise<void> | void
}) {
  const [zieht, setZieht] = useState<number | null>(null)
  const [ueber, setUeber] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const band = useRef<HTMLDivElement | null>(null)
  const lasten = days.map(d => Number(d.tss) || 0)
  const max = Math.max(...lasten, 1)

  const ziehbar = !!onSwapDays && !busy

  // DAS ZIEL WIRD GESUCHT, NICHT GEMELDET.
  //
  // Zuerst hing das Ablegen an `onPointerEnter` der Nachbartafeln. Mit Maus
  // funktioniert das; auf einem Telefon NIE: Sobald ein Finger auf einer
  // Tafel liegt, faengt diese Tafel den Zeiger, und keine andere bekommt je
  // ein Enter-Ereignis. Die Geste waere auf genau dem Geraet tot gewesen, fuer
  // das diese App gebaut ist.
  //
  // Stattdessen sucht der Bewegungs-Handler das Ziel selbst: welche Tafel
  // liegt unter dem Finger? Das funktioniert mit Finger, Maus und Stift
  // gleichermassen.
  const ueberFinden = (clientX: number) => {
    const el = band.current
    if (!el) return null
    const tafeln = [...el.querySelectorAll('button')]
    for (let i = 0; i < tafeln.length; i++) {
      const r = tafeln[i].getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right) return i
    }
    return null
  }

  const loslassen = async () => {
    const von = zieht, nach = ueber
    setZieht(null); setUeber(null)
    if (von == null || nach == null || von === nach || !onSwapDays) return
    const a = days[von]?.dateISO, b = days[nach]?.dateISO
    if (!a || !b) return
    setBusy(true)
    try { await onSwapDays(a, b) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div ref={band}
           style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 96,
                    opacity: busy ? 0.55 : 1, transition: 'opacity .2s linear' }}
           onPointerMove={e => { if (zieht !== null) setUeber(ueberFinden(e.clientX)) }}
           /* NUR HIER, NICHT AUCH AUF DER TAFEL. Das Ereignis blubbert von
              der Tafel zum Band; haengt der Handler an beiden, laeuft er
              zweimal und tauscht den Tag sofort wieder zurueck -- die Geste
              sah dann aus, als haette sie nichts getan. */
           onPointerUp={loslassen}
           onPointerCancel={() => { setZieht(null); setUeber(null) }}>
        {days.map((d, i) => {
          const last = lasten[i]
          const hat = !!d.title
          const ist = i === selectedDay
          const h = hat ? Math.max(20, Math.round((last / max) * 100)) : 4
          const gezogen = zieht === i
          const ziel = ueber === i && zieht !== null && zieht !== i
          return (
            <button
              key={d.dateISO ?? i}
              type="button"
              aria-label={`${d.weekday} ${d.dateLabel}: ${d.title ?? 'Ruhetag'}${hat ? `, ${d.tss} TSS` : ''}`}
              aria-pressed={ist}
              onClick={() => onSelectDay(i)}
              onPointerDown={e => {
                if (!ziehbar || !hat) return
                setZieht(i)
                setUeber(i)
                // Der Zeiger wird BEWUSST gefangen: so laufen alle weiteren
                // Bewegungen ueber diese Tafel, und `ueberFinden` kann das
                // Ziel zuverlaessig aus der Position lesen.
                try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* auch ohne */ }
              }}
              onPointerMove={e => { if (zieht !== null) setUeber(ueberFinden(e.clientX)) }}
              style={{
                flex: 1, minWidth: 0, height: '100%', padding: 0, border: 0,
                background: 'none', cursor: ziehbar && hat ? 'grab' : 'pointer',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', gap: 7, touchAction: 'none',
                transform: gezogen ? 'translateY(-3px)' : 'none',
                transition: 'transform .16s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span aria-hidden
                    style={{
                      width: '100%', height: `${h}%`, borderRadius: 7,
                      // Ausgewaehlt = Tinte, nicht Acid. Das Acid-Budget ist
                      // am Bogen ausgegeben; ein zweites Leuchten hier wuerde
                      // die Frage "wo stehe ich?" mit "was schaue ich an?"
                      // ueberlagern.
                      // `T.d4` und NICHT `T.ink`: reines Weiss war heller als
                      // der Acid-Punkt am Bogen und drehte damit die Fuehrung
                      // um -- der Blick landete auf "was schaue ich an?" statt
                      // auf "wo stehe ich?".
                      background: ziel ? T.d3 : ist ? T.d4 : hat ? T.d2 : T.d1,
                      outline: ziel ? `1px dashed ${T.d4}` : 'none',
                      outlineOffset: 2,
                      transition: 'background .18s linear',
                    }} />
              <span style={{ fontSize: 9.5, fontWeight: ist ? 700 : 500,
                             letterSpacing: 0.6, color: ist ? T.ink : T.quiet }}>
                {d.weekday.slice(0, 2).toUpperCase()}
              </span>
            </button>
          )
        })}
      </div>
      {ziehbar && (
        <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>
          Einheit gedrückt halten und auf einen anderen Tag ziehen — der Plan
          merkt sich deine Anordnung.
        </span>
      )}
    </div>
  )
}

export default function W3PlanArc({
  weeks, phases, currentIndex, selectedIndex, onSelectWeek,
  days, selectedDay, onSelectDay, onSwapDays, unitFooter,
}: W3PlanArcProps) {
  if (!weeks.length) return null
  const gewaehlt = days[selectedDay]
  const woche = weeks[selectedIndex]
  const phase = phases.find(p => p.active)?.name ?? null

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: FONT }}>
      {/* ── Kopf: die Zahl traegt die Orientierung, nicht ein Satz ──────── */}
      <HeadRow label={phase ?? 'Plan'} counter={`von ${String(weeks.length).padStart(2, '0')}`}>
        <Display>WOCHE {String(selectedIndex + 1).padStart(2, '0')}</Display>
      </HeadRow>

      <div>
        <Bogen weeks={weeks} currentIndex={currentIndex}
               selectedIndex={selectedIndex} onSelectWeek={onSelectWeek} />
        <Phasen phases={phases} />
      </div>

      <div style={hairline()} />

      {/* ── Die Woche als Form, nicht als Tabelle ───────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Kicker>Die Woche</Kicker>
          {woche && (
            <span style={{ ...TNUM, fontSize: 11, fontWeight: 600, color: T.quiet }}>
              {woche.planned} TSS geplant
            </span>
          )}
        </div>
        <Wochenband days={days} selectedDay={selectedDay}
                    onSelectDay={onSelectDay} onSwapDays={onSwapDays} />
      </div>

      {/* ── Die Einheit: die EINZIGE Karte auf dieser Seite ─────────────── */}
      {gewaehlt && (
        <div style={{ ...lux(26), padding: '18px 17px', gap: 13 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <Kicker>{gewaehlt.isToday ? 'Heute' : gewaehlt.weekday}</Kicker>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet }}>{gewaehlt.dateLabel}</span>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5,
                         lineHeight: 1.12, color: T.ink }}>
            {gewaehlt.title ?? 'Raum für Erholung.'}
          </span>
          {gewaehlt.title && (
            <div style={{ display: 'flex', gap: 22 }}>
              {[['Dauer', gewaehlt.dur ?? '—'], ['Last', `${gewaehlt.tss} TSS`]].map(([k, v]) => (
                <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1,
                                 textTransform: 'uppercase', color: T.quiet }}>{k}</span>
                  <span style={{ ...TNUM, fontSize: 16, fontWeight: 700,
                                 letterSpacing: -0.3, color: T.ink }}>{v}</span>
                </span>
              ))}
            </div>
          )}
          {gewaehlt.rationale && (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: T.mid }}>
              {gewaehlt.rationale}
            </p>
          )}
          {unitFooter}
        </div>
      )}
    </section>
  )
}
