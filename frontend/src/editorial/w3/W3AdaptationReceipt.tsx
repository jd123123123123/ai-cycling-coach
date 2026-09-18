import { T, FONT, Kicker } from './w3tokens'
import { lux, luxTile, hairline, TNUM } from './w3surfaces'
import type { PlanAdaptation } from '../../api/plan'

/**
 * W3 · DER BELEG ZU EINER ANPASSUNG.
 *
 * Wenn der Plan sich von selbst aendert, schuldet er dem Fahrer drei Dinge,
 * und zwar in dieser Reihenfolge:
 *
 *   1. WAS steht jetzt da          — die neue Einheit, als Objekt
 *   2. WELCHER Wert hat es bewegt  — sein eigener, gegen seine eigene Basis
 *   3. WARUM ist das vertretbar    — der Grundsatz dahinter
 *
 * `before`, `after` und `evidence` liegen seit je in JEDER
 * `plan_adaptations`-Zeile. Gerendert wurde davon nie etwas: der Dialog zeigte
 * Datum und Satz. Diese Komponente ist das Gegenstueck dazu.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIE NEUE EINHEIT IST DIE UEBERSCHRIFT, nicht der Tausch.
 *
 * Vorher stand hier eine Zeile "VO2max 5x4 → Grundlage 60 min": beide Namen
 * gleich gross, gleich grau, dazwischen ein Pfeil in Acid. Der Fahrer musste
 * lesen, um zu erkennen, was er heute faehrt -- und das Acid-Budget hing an
 * einem 14px-Pfeilchen, waehrend der gemessene Wert als 11px-Fussnote endete.
 * Die Hierarchie stand auf dem Kopf.
 *
 * Jetzt ist die neue Einheit das Objekt und die alte die Fussnote. Das ist
 * dieselbe Umkehrung, die `W3ReadinessDecision` fuer sich beansprucht: die
 * Anweisung ist der Gegenstand, die Zahl liegt als Beleg darunter.
 *
 * DER GEGENENTWURF ENTFAELLT, WENN ER SICH WIEDERHOLT. `counterfactual_de`
 * ("Ohne diese Werte: VO2max.") sagt dasselbe wie "statt VO2max 5x4". Zwei
 * Formulierungen derselben Tatsache lesen sich wie zwei Tatsachen. Er steht
 * nur noch dort, wo die Vorher-Einheit fehlt.
 *
 * EIN ACID, UND ZWAR FUER DEN ZUSTAND. Nicht der Pfeil, nicht die Zahl: das
 * Wort, das sagt, DASS hier etwas passiert ist. Alles andere laeuft ueber die
 * drei Textstufen.
 *
 * EINE KOMPONENTE FUER BEIDE FLAECHEN. Plan und Heute zeigen denselben Beleg.
 * Zwei Fassungen desselben Nachweises waeren zwei Fassungen der Wahrheit.
 *
 * FEHLT EIN TEIL, FAELLT ER WEG. Kein Platzhalter, keine erfundene
 * Begruendung: der Fahrer koennte ihr nicht widersprechen.
 */
export default function W3AdaptationReceipt({
  a, compact = false, kicker, when, tone = 'tile',
}: {
  a: PlanAdaptation
  /** Auf Heute steht der Beleg neben der Einheit: enger gesetzt, aber mit
   *  demselben Inhalt. Ob eine Begruendung sichtbar ist, darf nicht davon
   *  abhaengen, wie viel Platz sie hat. */
  compact?: boolean
  /** Der Zustand, in Acid. Nur wo die Flaeche nicht schon eine Ueberschrift
   *  traegt -- auf der Planseite steht Datum und Satz bereits darueber. */
  kicker?: string
  when?: string
  /** 'card' steht als eigene Flaeche im Seitenfluss (Heute), 'tile' liegt in
   *  einer fremden Karte (der Plan-Dialog). Vorher trug Heute BEIDES: eine
   *  Karte und darin eine getoente Flaeche -- Kasten im Kasten, und genau das
   *  hat den Beleg fremd aussehen lassen. */
  tone?: 'card' | 'tile'
}) {
  const ev = (a.evidence ?? {}) as Record<string, unknown>
  const txt = (k: string) => (typeof ev[k] === 'string' && ev[k] ? String(ev[k]) : null)
  const num = (k: string) => (typeof ev[k] === 'number' ? (ev[k] as number) : null)

  const was = txt('was') ?? (a.before?.title as string | undefined) ?? null
  const wird = txt('wird') ?? (a.after?.title as string | undefined) ?? null
  const treiber = txt('driver_text_de')
  const wert = num('readiness_score')
  const grundsatz = txt('principle_de')
  // Nur wenn er nicht bloss "statt {was}" wiederholt.
  const sonst = was ? null : txt('counterfactual_de')

  if (!was && !wird && !treiber && wert == null) return null

  const flaeche = tone === 'card' ? lux(22) : luxTile(18)
  const pad = tone === 'card' ? '16px 17px' : compact ? '12px 13px' : '14px 16px'
  const gap = compact ? 9 : 11

  return (
    <section
      style={{ ...flaeche, padding: pad, display: 'flex',
               flexDirection: 'column', gap, fontFamily: FONT }}
    >
      {(kicker || when) && (
        <header style={{ display: 'flex', alignItems: 'baseline',
                         justifyContent: 'space-between', gap: 8 }}>
          {kicker && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1,
                           textTransform: 'uppercase', color: T.acid }}>
              {kicker}
            </span>
          )}
          {when && (
            <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet }}>{when}</span>
          )}
        </header>
      )}

      {wird && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: compact ? 15.5 : 16.5, fontWeight: 700,
                         letterSpacing: -0.3, lineHeight: 1.22, color: T.ink }}>
            {wird}
          </span>
          {/* KEIN DURCHSTRICH. "statt" sagt bereits, dass diese Einheit weg ist;
              eine Linie obendrauf sagt dasselbe ein zweites Mal. Leise genug,
              um nicht zu schreien, war sie bei 20 % Deckkraft ohnehin
              unsichtbar -- also Dekoration, die sich als Struktur ausgibt. */}
          {was && (
            <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>
              statt {was}
            </span>
          )}
        </div>
      )}

      {(treiber || wert != null || sonst) && <div style={hairline()} />}

      {treiber && (
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500,
                    lineHeight: 1.45, color: T.mid }}>
          {treiber}
        </p>
      )}
      {sonst && (
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500,
                    lineHeight: 1.45, color: T.quiet }}>
          {sonst}
        </p>
      )}

      {wert != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <Kicker>Bereitschaft</Kicker>
          <span style={{ ...TNUM, fontSize: 15, fontWeight: 700,
                         letterSpacing: -0.4, color: T.ink }}>
            {wert}
          </span>
        </div>
      )}

      {/* Der Grundsatz steht ruhiger als der Treiber: der Treiber ist DEIN
          Wert, der Grundsatz die allgemeine Regel dahinter. */}
      {grundsatz && (
        <>
          <div style={hairline()} />
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500,
                      lineHeight: 1.5, color: T.quiet }}>
            {grundsatz}
          </p>
        </>
      )}
    </section>
  )
}
