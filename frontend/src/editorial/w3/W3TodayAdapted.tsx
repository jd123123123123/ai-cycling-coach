import { usePlanAdaptations } from '../../hooks/usePlanAdaptations'
import W3AdaptationReceipt from './W3AdaptationReceipt'
import './w3TodayAdapted.css'

/**
 * W3 · "Diese Einheit wurde angepasst" — auf HEUTE, an der Einheit.
 *
 * Der Nachweis lag bisher ausschliesslich auf der Planseite, hinter einem
 * Tipp auf "Dein Plan hat sich angepasst.". Wer morgens auf Heute schaut,
 * sah eine Einheit, die nicht die war, die gestern dort stand -- und nichts,
 * was das erklaert haette. Ein Plan, der sich selbst aendert, muss das dort
 * sagen, wo der Fahrer die Aenderung SIEHT.
 *
 * NUR HEUTE, NUR AUTOMATISCH. Was der Fahrer selbst angepasst hat, weiss er;
 * dieser Hinweis gehoert dem, was ohne sein Zutun passiert ist.
 *
 * KEINE ZEILE, KEIN HINWEIS. Kein Platzhalter an einem Tag ohne Anpassung.
 */
const AUTOMATISCH = new Set(['readiness_applied', 'sleep_hrv_downgrade',
  'illness_interlock', 'missed_key_reflow', 'extra_load_trim', 'green_streak_upgrade'])

export default function W3TodayAdapted({ todayKey }: { todayKey: string }) {
  const { data } = usePlanAdaptations(3, 10)
  const heute = data?.adaptations.find(
    a => a.target_date === todayKey && AUTOMATISCH.has(a.rule),
  )
  if (!heute) return null
  return (
    <section className="w3-today-adapted" aria-label="Diese Einheit wurde angepasst">
      <header>
        <span className="w3-today-adapted-kicker">Angepasst</span>
        <span className="w3-today-adapted-when">heute früh</span>
      </header>
      <W3AdaptationReceipt a={heute} compact />
    </section>
  )
}
