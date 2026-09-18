import { usePlanAdaptations } from '../../hooks/usePlanAdaptations'
import { band } from './w3tokens'
import W3AdaptationReceipt from './W3AdaptationReceipt'

/**
 * W3 · "Diese Einheit wurde angepasst" — auf HEUTE, an der Einheit.
 *
 * Der Nachweis lag bisher ausschliesslich auf der Planseite, hinter einem
 * Tipp auf "Dein Plan hat sich angepasst.". Wer morgens auf Heute schaut,
 * sah eine Einheit, die nicht die war, die gestern dort stand -- und nichts,
 * was das erklaert haette. Ein Plan, der sich selbst aendert, muss das dort
 * sagen, wo der Fahrer die Aenderung SIEHT.
 *
 * EINE FLAECHE, NICHT ZWEI. Vorher malte dieser Wirt eine eigene Karte
 * (#161616, r20) und der Beleg darin noch eine getoente Flaeche -- Kasten im
 * Kasten, zwei Raender, zwei Radien. Der Beleg IST hier die Karte; dieser
 * Wirt liefert nur noch das 20px-Raster der Seite und den Zustand.
 *
 * NUR HEUTE, NUR AUTOMATISCH. Was der Fahrer selbst angepasst hat, weiss er;
 * dieser Hinweis gehoert dem, was ohne sein Zutun passiert ist.
 *
 * KEINE ZEILE, KEIN HINWEIS. Kein Platzhalter an einem Tag ohne Anpassung.
 */
// Jede Regel, die der Stundenlauf von sich aus anwendet. `morning_health_downgrade`
// (R7) fehlte hier, als die Regel dazukam: die Anpassung passierte, und Heute
// schwieg darueber -- der eine Fall, den diese Komponente ueberhaupt abdecken soll.
const AUTOMATISCH = new Set(['readiness_applied', 'sleep_hrv_downgrade',
  'illness_interlock', 'morning_health_downgrade', 'missed_key_reflow',
  'extra_load_trim', 'green_streak_upgrade'])

export default function W3TodayAdapted({ todayKey }: { todayKey: string }) {
  const { data } = usePlanAdaptations(3, 10)
  const heute = data?.adaptations.find(
    a => a.target_date === todayKey && AUTOMATISCH.has(a.rule),
  )
  if (!heute) return null
  return (
    <div style={band(12)} aria-label="Diese Einheit wurde angepasst">
      <W3AdaptationReceipt a={heute} tone="card" kicker="Angepasst" when="heute früh" />
    </div>
  )
}
