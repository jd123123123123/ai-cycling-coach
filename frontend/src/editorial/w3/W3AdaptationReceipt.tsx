import { ArrowRight } from 'lucide-react'
import type { PlanAdaptation } from '../../api/plan'
import './w3AdaptationReceipt.css'

/**
 * W3 · DER BELEG ZU EINER ANPASSUNG.
 *
 * Wenn der Plan sich von selbst aendert, schuldet er dem Fahrer drei Dinge,
 * und zwar in dieser Reihenfolge:
 *
 *   1. WAS wurde woraus            — der Tausch, gezeigt statt erzaehlt
 *   2. WELCHER Wert hat es bewegt  — sein eigener, gegen seine eigene Basis
 *   3. WARUM ist das vertretbar    — der Grundsatz dahinter
 *
 * `before`, `after` und `evidence` liegen seit je in JEDER
 * `plan_adaptations`-Zeile. Gerendert wurde davon nie etwas: der Dialog zeigte
 * Datum und Satz. Diese Komponente ist das Gegenstueck dazu.
 *
 * EINE KOMPONENTE FUER BEIDE FLAECHEN. Plan und Heute zeigen denselben Beleg.
 * Zwei Fassungen desselben Nachweises waeren zwei Fassungen der Wahrheit.
 *
 * FEHLT EIN TEIL, FAELLT ER WEG. Kein Platzhalter, keine erfundene
 * Begruendung: der Fahrer koennte ihr nicht widersprechen.
 */
export default function W3AdaptationReceipt({ a, compact = false }: {
  a: PlanAdaptation
  /** Auf Heute steht der Beleg neben der Einheit: enger gesetzt, aber mit
   *  demselben Inhalt. Ob eine Begruendung sichtbar ist, darf nicht davon
   *  abhaengen, wie viel Platz sie hat. */
  compact?: boolean
}) {
  const ev = (a.evidence ?? {}) as Record<string, unknown>
  const txt = (k: string) => (typeof ev[k] === 'string' && ev[k] ? String(ev[k]) : null)
  const num = (k: string) => (typeof ev[k] === 'number' ? (ev[k] as number) : null)

  const was = txt('was') ?? (a.before?.title as string | undefined) ?? null
  const wird = txt('wird') ?? (a.after?.title as string | undefined) ?? null
  const treiber = txt('driver_text_de')
  const wert = num('readiness_score')
  const sonst = txt('counterfactual_de')
  const grundsatz = txt('principle_de')

  if (!was && !wird && !treiber && wert == null) return null

  return (
    <div className={`w3-receipt${compact ? ' is-compact' : ''}`}>
      {was && wird && (
        <div className="w3-receipt-swap">
          <span>{was}</span>
          <ArrowRight size={14} aria-label="wird zu" />
          <strong>{wird}</strong>
        </div>
      )}
      {treiber && <p className="w3-receipt-driver">{treiber}</p>}
      {(wert != null || sonst) && (
        <p className="w3-receipt-meta">
          {wert != null ? `Bereitschaft ${wert}` : null}
          {wert != null && sonst ? ' · ' : ''}
          {sonst}
        </p>
      )}
      {/* Der Grundsatz steht ruhiger als der Treiber: der Treiber ist DEIN
          Wert, der Grundsatz die allgemeine Regel dahinter. */}
      {grundsatz && <p className="w3-receipt-principle">{grundsatz}</p>}
    </div>
  )
}
