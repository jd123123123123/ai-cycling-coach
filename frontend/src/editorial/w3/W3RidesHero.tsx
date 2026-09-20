import { useReducedMotion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { T, FONT, HeadRow, HeroField, Kicker, useInView } from './w3tokens'
import { hairline, TNUM } from './w3surfaces'

/**
 * W3 · DER FAHRTEN-KOPF — die Kilometer als Gegenstand, nicht als Kulisse.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WAS HIER VORHER FALSCH WAR, gezaehlt statt empfunden.
 *
 * ACID-INFLATION. In einer einzigen Karte trugen Acid: die Kurvenlinie, ihre
 * Verlauffuellung, die Einheit "km", der Trendwert, der Zielbalken, das Wort
 * "Auf Kurs" und das Plus-Symbol -- sieben Elemente, dazu Avatarring und
 * Navigation am Rand. Die Heldenzahl 4 812 war WEISS. Das Budget steckte also
 * vollstaendig in der Statisterie, waehrend der Star unbeleuchtet blieb.
 * Der Hausstil gibt Acid genau einmal aus: EINE Heldenzahl je Karte, plus das
 * beleuchtete Messer. Genau zwei Stellen, hier: die Zahl und der Zielbalken.
 *
 * SECHS ACID-TOENE. Die alte CSS fuehrte #bfff3c, #c6f53c, #eaffbb, #dfffa0,
 * #ddff78 und #9dce25 nebeneinander -- Acid und Lime sind in diesem Haus
 * verschiedene Farben, und fuenf Abstufungen davon sind keine Palette, sondern
 * Verschleiss.
 *
 * GERAHMT STATT BELEUCHTET. `border:1px solid #ffffff1e`, ein Radialverlauf
 * und ein Acid-Unterstrich per ::after. Karten in diesem Haus haben keinen
 * Rand; Tiefe kommt aus Licht und einem Tonsprung.
 *
 * DREI GESTAPELTE TRENNLINIEN machten die Karte zu einem Baenderstapel --
 * das ist der "viele Whitespace", der an dieser Flaeche gemeldet wurde: nicht
 * zu viel Luft, sondern Luft ohne Rhythmus.
 *
 * VIER GRAUSTUFEN (#9ba0a6, #b9bcb2, #8b928f, #8f9690) statt der drei
 * Textstufen des Hauses.
 *
 * UND: alles davon lag in einer CSS-Datei mit festen Hex-Werten. Die
 * Isolationspruefung scannt nur .tsx, also ist es nie aufgefallen -- und im
 * hellen Modus konnte die Karte gar nicht funktionieren.
 */

const nf = new Intl.NumberFormat('de-DE')

export interface HeroLedger { label: string; value: string; unit?: string }

export interface HeroGoal {
  currentKm: number
  targetKm: number
  progress: number
  realityLabel: string
  projectionLabel: string
}

/** Die Kurve. Leise, mit genau einem hellen Punkt: dem gewaehlten. */
function Kurve({ values, labels, selected, onSelect }: {
  values: number[]
  labels: (i: number) => string
  selected: number | null
  onSelect: (i: number | null) => void
}) {
  const reduce = useReducedMotion()
  const { ref, inView, instant } = useInView(0.2)
  const still = reduce || instant
  const shown = still || inView

  const width = 280, height = 96, pad = 8
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const points = values.map((v, i) =>
    [pad + i * step, height - pad - (v / max) * (height - pad * 2)] as const)
  const line = points.length
    ? `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map((p, i) => {
        const prev = points[i], mid = (prev[0] + p[0]) / 2
        return `Q ${mid} ${prev[1]} ${p[0]} ${p[1]}`
      }).join(' ')
    : ''

  // EIN FENSTER OHNE KILOMETER HAT KEINE FORM. Bei lauter Nullen laege eine
  // flache Linie am Boden einer hohen Flaeche -- Platz, der fuer eine Aussage
  // reserviert ist, die es nicht gibt.
  const leer = !values.some(v => v > 0)

  return (
    <div ref={ref} role="group" aria-label="Kilometertrend"
         data-w3-graph data-empty={leer || undefined}
         style={{ position: 'relative', width: '100%',
                  height: leer ? 26 : 96, marginBottom: leer ? 6 : 2 }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden
           style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
        {/* KEINE FUELLUNG. Die Flaeche unter der Kurve war eine zweite
            Acid-Aussage ueber dieselbe Zahl, die darunter ohnehin gross steht. */}
        <path d={line} fill="none" stroke={T.d4} strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 1200, strokeDashoffset: shown ? 0 : 1200,
                transition: still ? undefined : 'stroke-dashoffset .9s cubic-bezier(0.22,1,0.36,1)',
              }} />
      </svg>
      {!leer && points.map(([x, y], i) => (
        <button key={i} type="button"
                aria-label={`${labels(i)}: ${nf.format(values[i])} Kilometer`}
                aria-pressed={selected === i}
                onClick={() => onSelect(selected === i ? null : i)}
                style={{
                  position: 'absolute', left: `${x / width * 100}%`, top: `${y / height * 100}%`,
                  width: 40, height: 40, padding: 0, border: 0, background: 'transparent',
                  transform: 'translate(-50%,-50%)', display: 'grid', placeItems: 'center',
                  cursor: 'pointer',
                }}>
          {/* Der letzte Punkt ist JETZT und bekommt einen Anker -- aber kein
              Acid: das Budget dieser Karte gehoert der Zahl darunter, und die
              Kurve soll sie stuetzen, nicht mit ihr konkurrieren. */}
          <i style={{
            width: selected === i ? 9 : i === points.length - 1 ? 7 : 5,
            height: selected === i ? 9 : i === points.length - 1 ? 7 : 5,
            borderRadius: '50%',
            background: selected === i ? T.acid
              : i === points.length - 1 ? T.ink : T.d2,
            transition: 'width .18s, height .18s, background .18s',
          }} />
        </button>
      ))}
    </div>
  )
}

/** Das Segmentmesser des Hauses: 22 Schritte, gewachsen statt gefuellt. */
function Messer({ pct }: { pct: number }) {
  const reduce = useReducedMotion()
  const { ref, inView, instant } = useInView(0.2)
  const still = reduce || instant
  const shown = still || inView
  const SEG = 22
  const lit = Math.round(Math.max(0, Math.min(1, pct)) * SEG)
  return (
    <div ref={ref} aria-hidden style={{ display: 'flex', gap: 3, height: 10, width: '100%' }}>
      {Array.from({ length: SEG }).map((_, i) => {
        const an = i < lit
        return (
          <span key={i} style={{
            flex: 1, height: an ? 10 : 5, alignSelf: 'center', borderRadius: 3,
            background: an ? T.acid : T.d1,
            opacity: an ? (shown ? 1 : 0.15) : 1,
            transition: still ? undefined : `opacity .26s linear ${(an ? i * 0.018 : 0).toFixed(2)}s`,
          }} />
        )
      })}
    </div>
  )
}

export default function W3RidesHero({
  periods, period, onPeriod, km, deck, counter, values, labels, selected, onSelect,
  trendLabel, trendKicker, trendPct, ledger, goal, onSetGoal, open, onToggle, details,
}: {
  periods?: { key: string; text: string }[]
  period?: string
  onPeriod?: (k: string) => void
  km: string
  deck: string
  values: number[]
  labels: (i: number) => string
  selected: number | null
  onSelect: (i: number | null) => void
  counter?: string
  trendKicker: string
  trendLabel: string
  trendPct: number
  ledger: HeroLedger[]
  goal?: HeroGoal | null
  onSetGoal?: () => void
  open: boolean
  onToggle: () => void
  details?: React.ReactNode
}) {
  return (
    /* KEINE KARTE MEHR.
       Der Kopf stand in einem `lux(28)`-Kasten und darin vier durch Haarlinien
       getrennte Baender: Zahl, Trend, Leiste, Saisonziel. Das liest sich als
       Datenblatt, nicht als Titelseite -- und neben dem Plan-Hero, der seine
       Typo direkt auf den Grund stellt, wirkte es wie ein Fremdkoerper aus
       einer anderen App.
       Auf dem Grund bekommt die Zahl die Luft, die sie traegt; die Haarlinien
       bleiben als Gliederung, aber ohne Kastenrand und ohne zweiten Ton. */
    <section aria-label="Deine Kilometer"
             style={{ display: 'flex', flexDirection: 'column', gap: 0,
                      fontFamily: FONT, padding: '2px 0 0' }}>
      {/* NUR ETIKETT, ZAHL UND KURVE STEHEN IM FELD. Trend, Leiste und
          Saisonziel sind Belege -- sie gehoeren auf den Grund, sonst ist das
          Feld wieder der alte Kasten, nur ohne Rand. */}
      <HeroField>
      <header style={{ display: 'flex', alignItems: 'center',
                       justifyContent: 'space-between', gap: 12, minHeight: 40 }}>
        {periods && period ? (
          <div role="group" aria-label="Zeitraum" style={{ display: 'flex', gap: 14 }}>
            {periods.map(p => {
              const an = period === p.key
              return (
                <button key={p.key} type="button" aria-pressed={an}
                        onClick={() => onPeriod?.(p.key)}
                        style={{
                          background: 'none', border: 0, padding: '8px 0', cursor: 'pointer',
                          fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                          color: an ? T.ink : T.quiet, position: 'relative',
                        }}>
                  {p.text}
                  {/* Der aktive Reiter traegt einen HAARSTRICH, kein Acid: die
                      Karte gibt ihr Budget an die Zahl aus, nicht an Navigation. */}
                  {an && <span aria-hidden style={{
                    position: 'absolute', left: 0, right: 0, bottom: 2,
                    height: 1.5, borderRadius: 2, background: T.ink,
                  }} />}
                </button>
              )
            })}
          </div>
        ) : (
          /* KEIN ZWEITES ETIKETT. Hier stand der Zeitraum als Kicker -- und
             seit die Zahl ihr eigenes Etikett traegt, stand "LETZTE 12 MONATE"
             zweimal untereinander. Ohne Zeitraum-Reiter bleibt die Kopfzeile
             leer und traegt nur den Schalter. */
          <span />
        )}
        <button type="button" onClick={onToggle} aria-expanded={open}
                aria-label={open ? 'Details schließen' : 'Details öffnen'}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 0, flex: 'none',
                  background: T.tile, color: T.mid, display: 'grid', placeItems: 'center',
                  cursor: 'pointer',
                }}>
          {open ? <Minus size={16} /> : <Plus size={16} />}
        </button>
      </header>

      {/* DIE ZAHL IST DER GEGENSTAND. Sie war weiss, waehrend sieben kleinere
          Dinge um sie herum leuchteten.

          DERSELBE AUFBAU WIE DER PLANSEITEN-KOPF (`HeadRow`): leises Etikett,
          lauter Wert, leiser Zaehler rechts auf der Grundlinie. ABER NICHT
          DIESELBE SCHRIFT -- Anton benennt, TNUM misst. "WOCHE 05" ist ein
          Ordnungsschild und darf die Breite wechseln; "4 812" waechst mit
          jeder Fahrt, und Anton hat keine Tabellenziffern, also wuerde die
          Zahl bei jedem Wechsel springen. */}
      {/* ETIKETT → ZAHL → KURVE, wie auf der Planseite.
          Vorher standen ZWEI Etiketten uebereinander: der Zeitraum ganz oben,
          dann die Kurve, dann "Deine gefahrenen Kilometer" ueber der Zahl.
          Eines davon beschrieb nur, was die Einheit "km" ohnehin sagt.
          Der Plan-Hero hat ein Etikett; jetzt hat dieser auch eines. */}
      <div>
        {/* OHNE ZAEHLER. Die Leiste darunter fuehrt "FAHRTEN 142" bereits, und
            neben der Ueberschrift steht es ein drittes Mal -- dieselbe Zahl
            dreimal auf einem Bildschirm ist schlechter als eine fehlende.
            `HeadRow` laesst den Zaehler deshalb weg, wenn es nichts Neues zu
            sagen gibt; auf der Planseite sagt "von 12" etwas, das sonst
            nirgends steht. */}
        <HeadRow label={deck} counter={counter}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...TNUM, fontSize: 64, fontWeight: 700, letterSpacing: -3,
                           lineHeight: 0.92, color: T.acid }}>{km}</span>
            <span style={{ fontSize: 19, fontWeight: 600, color: T.quiet }}>km</span>
          </span>
        </HeadRow>
      </div>

      <div style={{ marginTop: 14 }}>
        <Kurve values={values} labels={labels} selected={selected} onSelect={onSelect} />
      </div>
      </HeroField>

      <div style={{ ...hairline(), margin: '18px 0 14px' }} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <Kicker>{trendKicker}</Kicker>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{trendLabel}</span>
        <span style={{ ...TNUM, marginLeft: 'auto', fontSize: 12, fontWeight: 600,
                       color: T.quiet }}>
          {trendPct >= 0 ? '+' : '−'}{Math.abs(trendPct)} %
        </span>
      </div>

      <div style={{ ...hairline(), margin: '14px 0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        {ledger.map(l => (
          <div key={l.label} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <Kicker>{l.label}</Kicker>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
              <span style={{ ...TNUM, fontSize: 17, fontWeight: 700, letterSpacing: -0.4,
                             color: T.ink }}>{l.value}</span>
              {l.unit && <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{l.unit}</span>}
            </span>
          </div>
        ))}
      </div>

      {goal && (
        <>
          <div style={{ ...hairline(), margin: '16px 0 12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <Kicker>Saisonziel</Kicker>
              <span style={{ ...TNUM, fontSize: 13.5, fontWeight: 600, color: T.ink }}>
                {nf.format(goal.currentKm)} / {nf.format(goal.targetKm)} km
              </span>
            </div>
            <Messer pct={goal.progress} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{goal.realityLabel}</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>{goal.projectionLabel}</span>
            </div>
          </div>
        </>
      )}

      {!goal && onSetGoal && (
        <>
          <div style={{ ...hairline(), margin: '16px 0 12px' }} />
          <button type="button" onClick={onSetGoal}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, width: '100%', minHeight: 44, padding: 0, border: 0,
                    background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT,
                  }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Dein Saisonziel</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>
                Setze eine Marke, die zu dir gehört.
              </span>
            </span>
          </button>
        </>
      )}

      {open && details && (
        <>
          <div style={{ ...hairline(), margin: '14px 0 12px' }} />
          {details}
        </>
      )}
    </section>
  )
}
