import { useReducedMotion } from 'motion/react'
import { T, FONT, Kicker, useInView } from './w3tokens'
import { lux, luxTile, hairline, TNUM } from './w3surfaces'
import type { PlanAdaptation } from '../../api/plan'

/**
 * W3 · DER BELEG ZU EINER ANPASSUNG.
 *
 * Wenn der Plan sich von selbst aendert, schuldet er dem Fahrer drei Dinge,
 * und zwar in dieser Reihenfolge:
 *
 *   1. WAS WAR GEPLANT   — die Einheit, die gestern hier stand
 *   2. WAS STEHT JETZT   — und um wie viel sie leichter (oder schwerer) ist
 *   3. WARUM            — die gemessenen Werte, gegen ihre eigene Basis
 *
 * `before`, `after` und `evidence` liegen seit je in JEDER
 * `plan_adaptations`-Zeile. Gerendert wurde davon nie etwas: der Dialog zeigte
 * Datum und Satz.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIE LAST IST DAS ARGUMENT, NICHT DER NAME.
 *
 * "Schwelle — 2x15 min" gegen "Grundlagenausdauer — 60 min" sagt einem Fahrer,
 * der beide Vorlagen kennt, alles -- und allen anderen nichts. `target_tss`
 * steht in jeder Zeile (64 -> 42 am 18.09., 61 -> 42 am 17.09., aber 84 -> 97
 * bei einer Verschiebung), also zeigen zwei Balken auf EINER Skala, wie viel
 * Arbeit tatsaechlich weggefallen ist. Die Laenge ist die Aussage; die Zahl
 * steht daneben, damit man sie nicht schaetzen muss.
 *
 * BEIDE RICHTUNGEN. Eine Verschiebung macht den Tag schwerer, nicht leichter.
 * Der Balken bleibt in beiden Faellen derselbe, die Prozentangabe nennt das
 * Vorzeichen -- eine Farbe fuer "mehr" und eine fuer "weniger" waere ein
 * zweites Urteil ueber etwas, das der Plan bereits entschieden hat.
 *
 * DIE SCHIENE NUR, WO ES EIN z GIBT. `driver_z` ist eine Standardabweichung,
 * also ohne Zusatzwissen verortbar. Die Signale aus R7 tragen Wert und
 * Basislinie, aber KEINE Streuung -- dort eine Schiene zu zeichnen hiesse,
 * eine Normierung zu erfinden, die niemand gemessen hat. Die bekommen eine
 * Pille mit Wert und Basis, sonst nichts.
 *
 * EIN ACID: DER JETZT-BALKEN. Der Hausstil erlaubt es dem beleuchteten Messer,
 * und der neue Zustand IST hier die Aussage. Vorher hing das Budget an einem
 * 14px-Pfeilchen zwischen zwei gleich grauen Namen.
 *
 * EINE KOMPONENTE FUER BEIDE FLAECHEN. Plan und Heute zeigen denselben Beleg.
 * Zwei Fassungen desselben Nachweises waeren zwei Fassungen der Wahrheit.
 *
 * FEHLT EIN TEIL, FAELLT ER WEG. Kein Platzhalter, keine erfundene
 * Begruendung: der Fahrer koennte ihr nicht widersprechen.
 */

/** ±2 Standardabweichungen auf die Schienenbreite, wie in `W3ReadinessDecision`. */
const RAIL_SPAN = 2

/** Die Abweichungs-Schiene: Mitte ist die eigene Basis, der Punkt ist heute. */
function Rail({ z }: { z: number }) {
  const pos = 0.5 + Math.max(-0.5, Math.min(0.5, z / (RAIL_SPAN * 2)))
  return (
    <span aria-hidden style={{ position: 'relative', width: 44, height: 12, flex: 'none' }}>
      <span style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 2,
                     borderRadius: 100, background: T.d1 }} />
      <span style={{ position: 'absolute', left: '50%', top: 2, width: 1, height: 8,
                     background: T.d2 }} />
      <span style={{ position: 'absolute', left: `${(pos * 100).toFixed(1)}%`, top: 3,
                     width: 6, height: 6, marginLeft: -3, borderRadius: 100,
                     background: T.d4 }} />
    </span>
  )
}

/** Ein Grund, als Pille: was gemessen wurde, und wogegen. */
function Pill({ label, value, basis, z }: {
  label: string; value?: string | null; basis?: string | null; z?: number | null
}) {
  return (
    <span style={{ ...luxTile(100), flexDirection: 'row', alignItems: 'center', gap: 7,
                   padding: '6px 11px', minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.mid }}>{label}</span>
      {value && (
        <span style={{ ...TNUM, fontSize: 12, fontWeight: 700, color: T.ink }}>{value}</span>
      )}
      {typeof z === 'number' && <Rail z={z} />}
      {basis && (
        <span style={{ ...TNUM, fontSize: 10.5, fontWeight: 500, color: T.quiet }}>{basis}</span>
      )}
    </span>
  )
}

/** Ein Lastbalken. `frac` ist der Anteil an der groesseren der beiden Lasten.
 *
 *  OHNE SPUR, und das ist der Punkt. Mit grauer Hintergrundschiene lagen in
 *  beiden Zeilen gleich lange graue Balken -- der geplante Wert sah aus wie
 *  die leere Spur des neuen, und der Vergleich, um den es geht, verschwand.
 *  Jetzt ist die Laenge die Aussage: zwei Balken, eine Skala. */
function LoadBar({ frac, lit }: { frac: number; lit: boolean }) {
  const reduce = useReducedMotion()
  const { ref, inView, instant } = useInView(0.2)
  const still = reduce || instant
  const shown = still || inView
  return (
    <span ref={ref} aria-hidden
          style={{ display: 'block', height: 8, width: '100%' }}>
      <span style={{
        display: 'block', height: '100%', borderRadius: 100,
        width: `${(shown ? frac : 0) * 100}%`,
        background: lit
          ? `linear-gradient(90deg, ${T.acidDeep} 0%, ${T.acid} 100%)`
          : T.d2,
        transition: still ? undefined : 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
      }} />
    </span>
  )
}

function Seite({ kicker, titel, tss, max, lit, delta, gross }: {
  kicker: string; titel: string | null; tss: number | null; max: number
  lit: boolean; delta?: string | null; gross: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Kicker>{kicker}</Kicker>
      {titel && (
        <span style={{ fontSize: gross ? 16.5 : 13.5, fontWeight: gross ? 700 : 500,
                       letterSpacing: gross ? -0.3 : -0.1, lineHeight: 1.22,
                       color: gross ? T.ink : T.mid }}>
          {titel}
        </span>
      )}
      {tss != null && max > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <LoadBar frac={tss / max} lit={lit} />
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, flex: 'none' }}>
            <span style={{ ...TNUM, fontSize: gross ? 15 : 13, fontWeight: 700,
                           letterSpacing: -0.3, color: gross ? T.ink : T.mid }}>
              {tss}
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.5,
                           color: T.quiet }}>TSS</span>
          </span>
        </div>
      )}
      {delta && (
        <span style={{ ...TNUM, fontSize: 11, fontWeight: 600, color: T.mid }}>{delta}</span>
      )}
    </div>
  )
}

export default function W3AdaptationReceipt({
  a, compact = false, kicker, when, tone = 'tile',
}: {
  a: PlanAdaptation
  /** Auf Heute steht der Beleg neben der Einheit: enger gesetzt, aber mit
   *  demselben Inhalt. Ob eine Begruendung sichtbar ist, darf nicht davon
   *  abhaengen, wie viel Platz sie hat. */
  compact?: boolean
  kicker?: string
  when?: string
  /** 'card' steht als eigene Flaeche im Seitenfluss (Heute), 'tile' liegt in
   *  einer fremden Karte (der Plan-Dialog). */
  tone?: 'card' | 'tile'
}) {
  const ev = (a.evidence ?? {}) as Record<string, unknown>
  const txt = (k: string) => (typeof ev[k] === 'string' && ev[k] ? String(ev[k]) : null)
  const num = (k: string) => (typeof ev[k] === 'number' ? (ev[k] as number) : null)
  const tssOf = (side: Record<string, unknown> | null) =>
    side && typeof side.target_tss === 'number' ? (side.target_tss as number) : null

  const was = txt('was') ?? (a.before?.title as string | undefined) ?? null
  const wird = txt('wird') ?? (a.after?.title as string | undefined) ?? null
  const treiber = txt('driver_text_de')
  const treiberZ = num('driver_z')
  const wert = num('readiness_score')
  const grundsatz = txt('principle_de')
  const sonst = was ? null : txt('counterfactual_de')

  const tssVor = tssOf(a.before)
  const tssNach = tssOf(a.after)
  const max = Math.max(tssVor ?? 0, tssNach ?? 0)
  // Nur wo BEIDE Seiten eine Last tragen, ist eine Prozentangabe eine Aussage.
  const delta = tssVor != null && tssNach != null && tssVor > 0
    ? `${tssNach >= tssVor ? '+' : '−'}${Math.abs(Math.round(((tssNach - tssVor) / tssVor) * 100))} % Last`
    : null

  // Die gemessenen Signale aus R7 -- Wert und eigene Basis, ohne Streuung.
  const signale = Array.isArray(ev.signals) ? (ev.signals as Record<string, unknown>[]) : []
  const NAMEN: Record<string, string> = {
    rhr: 'Ruhepuls', hrv: 'HRV', respiration: 'Atemfrequenz',
    spo2: 'SpO₂', sleep_score: 'Schlaf',
  }
  // Wortgleich mit `readiness_decision._SINGLE_NIGHT_SIGNALS`: zwei Namen fuer
  // dieselbe Messgroesse lesen sich wie zwei Messgroessen.
  const TREIBER: Record<string, string> = {
    resting_hr: 'Ruhepuls', rhr: 'Ruhepuls', hrv: 'HRV',
    sleep_score: 'Schlaf', sleep_duration: 'Schlafdauer', sleep_deep: 'Tiefschlaf',
    body_battery_wake: 'Body Battery', stress_wake: 'Stress', tsb: 'Form (TSB)',
  }
  const treiberName = TREIBER[String(ev.driver_key ?? '')] ?? null
  const zahl = (v: unknown) =>
    typeof v === 'number' ? String(Math.round(v * 10) / 10).replace('.', ',') : null

  // Die Verschiebung traegt keinen Treiber und keinen Score -- ihr Grund ist
  // ein Datum: der Tag, an dem die Einheit ausfiel. Der stand bisher nur im
  // Satz auf der Planseite; auf Heute blieb das "Warum" dieser Regel leer,
  // obwohl `missed_date` in jeder solchen Zeile steht.
  const verpasst = typeof ev.missed_date === 'string' ? String(ev.missed_date) : null
  const tag = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : `${d.getDate()}.${d.getMonth() + 1}.`
  }
  const verpasstTag = verpasst ? tag(verpasst) : null

  const hatGrund = treiber || wert != null || signale.length > 0 || sonst || verpasstTag

  if (!was && !wird && !treiber && wert == null && !signale.length) return null

  const flaeche = tone === 'card' ? lux(22) : luxTile(18)
  const pad = tone === 'card' ? '16px 17px' : compact ? '12px 13px' : '14px 16px'

  return (
    <section style={{ ...flaeche, padding: pad, display: 'flex',
                      flexDirection: 'column', gap: compact ? 11 : 13, fontFamily: FONT }}>
      {(kicker || when) && (
        <header style={{ display: 'flex', alignItems: 'baseline',
                         justifyContent: 'space-between', gap: 8 }}>
          {kicker && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1,
                           textTransform: 'uppercase', color: T.quiet }}>{kicker}</span>
          )}
          {when && (
            <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet }}>{when}</span>
          )}
        </header>
      )}

      {was && (
        <Seite kicker="War geplant" titel={was} tss={tssVor} max={max} lit={false} gross={false} />
      )}
      {wird && (
        <Seite kicker="Steht jetzt" titel={wird} tss={tssNach} max={max} lit
               delta={delta} gross />
      )}

      {hatGrund && <div style={hairline()} />}

      {hatGrund && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker>Warum</Kicker>
          {treiber && (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500,
                        lineHeight: 1.45, color: T.mid }}>{treiber}</p>
          )}
          {sonst && (
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500,
                        lineHeight: 1.45, color: T.quiet }}>{sonst}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {signale.map((s, i) => (
              <Pill key={i}
                    label={NAMEN[String(s.metric)] ?? String(s.metric)}
                    value={zahl(s.value)}
                    basis={zahl(s.baseline) ? `Ø ${zahl(s.baseline)}` : null} />
            ))}
            {/* DAS z GEHOERT DEM TREIBER, NICHT DEM SCORE. `driver_z` ist die
                Abweichung DES TREIBERS (hier: Tiefschlaf) von seiner eigenen
                Basis -- an die Bereitschafts-Pille gehaengt behauptete es, der
                Score selbst laege 1,2 Streuungen daneben. Das misst niemand. */}
            {/* KEIN SIGMA. "−1,2 σ" ist praezise und im Register dieses Hauses
                trotzdem falsch: der Satz darueber sagt bereits "Tiefschlaf
                0,5 h, dein Schnitt ist 1,2 h" in echten Einheiten. Die Schiene
                zeigt, WIE WEIT daneben; das Woertchen sagt, auf welcher Seite.
                Eine Standardabweichung als Zahl haette hier niemandem etwas
                gesagt, was er nicht schon gelesen hat. */}
            {treiberName && treiberZ != null && (
              <Pill label={treiberName} z={treiberZ}
                    basis={treiberZ < 0 ? 'unter Ø' : 'über Ø'} />
            )}
            {wert != null && <Pill label="Bereitschaft" value={String(wert)} />}
            {verpasstTag && <Pill label="Ausgefallen am" value={verpasstTag} />}
          </div>
        </div>
      )}

      {/* Der Grundsatz steht ruhiger als die Werte: die Werte sind DEINE, der
          Grundsatz die allgemeine Regel dahinter. */}
      {grundsatz && (
        <>
          <div style={hairline()} />
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500,
                      lineHeight: 1.5, color: T.quiet }}>{grundsatz}</p>
        </>
      )}
    </section>
  )
}
