import { useEffect, useState } from 'react'
import { T, FONT, Kicker, band } from './w3tokens'
import { lux, hairline } from './w3surfaces'
import { getAthleteStatus, setAthleteStatus, type AthleteStatus } from '../../api/athletes'

/**
 * W3 · DIE TAGESFRAGE NACH EINEM PAUSIERENDEN STATUS.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM ES DAS GIBT
 *
 * `athlete_status` wurde einmal gesetzt und nie wieder angefasst. Danach
 * unterdrueckte `illness_interlock` das Training taeglich weiter -- unbefristet
 * und ungefragt. In der Produktion gemessen: ein Fahrer stand seit dem 17.09.
 * auf "krank", waehrend seine Bereitschaft laengst wieder bei 72 lag. Der Plan
 * wartete auf eine Entwarnung, die niemand je erbeten hatte.
 *
 * Die Ursache war nicht nur fehlende Logik: es gab ueberhaupt kein GET fuer den
 * Status. Die App KONNTE nicht nachfragen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DREI ENTSCHEIDUNGEN
 *
 * EINMAL AM TAG, NICHT OEFTER. Eine zweite Frage am selben Tag ist Draengeln.
 * Auch ein "noch nicht" ist eine Antwort und setzt den Tag neu.
 *
 * DER PREIS STEHT VOR DER FRAGE. "krank gemeldet" ist eine Einstellung;
 * "seit 4 Tagen ruht dein Plan" ist eine Tatsache mit Folgen. Der Satz kommt
 * vom Server, damit es nicht zwei Fassungen derselben Aussage gibt.
 *
 * KEIN ACID. Das ist eine Frage, kein Erfolg -- und die Karte steht ganz oben,
 * wo sie ohnehin auffaellt. Die einzige Hervorhebung ist die Position.
 *
 * WAS ES NICHT TUT: automatisch auf "gesund" springen. Das waere bequem und
 * falsch -- dann liefe das volle Programm wieder an, weil eine Frist abgelaufen
 * ist, nicht weil es dem Fahrer besser geht.
 */
export default function W3StatusReask() {
  const [status, setStatus] = useState<AthleteStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [weg, setWeg] = useState(false)

  useEffect(() => {
    let lebt = true
    getAthleteStatus()
      .then(s => { if (lebt) setStatus(s) })
      .catch(() => { /* ohne Status keine Frage */ })
    return () => { lebt = false }
  }, [])

  if (weg || !status?.needs_reask || !status.prompt_de) return null

  const antworten = async (state: AthleteStatus['state']) => {
    if (busy) return
    setBusy(true)
    try {
      await setAthleteStatus(state)
      setWeg(true)
    } catch {
      setBusy(false)
    }
  }

  const knopf = (haupt: boolean) => ({
    flex: 1, minHeight: 46, borderRadius: 100, cursor: busy ? 'default' : 'pointer',
    fontFamily: FONT, fontSize: 14.5, fontWeight: 600,
    border: haupt ? 0 : `1px solid ${T.stroke}`,
    // VOLLTON STATT KACHEL. Mit `T.tile` verlor der Hauptknopf im hellen Modus
    // seine Form -- die Kachel liegt dort fast auf dem Kartenton -- waehrend
    // der berandete Nebenknopf sichtbar blieb. Die Hierarchie kippte: die
    // Nebenaktion sah mehr nach Knopf aus als die Hauptaktion. `T.ink` auf
    // `T.bg` kippt mit dem Thema und braucht kein Acid: das hier ist eine
    // Frage, kein Erfolg.
    background: haupt ? T.ink : 'transparent',
    color: haupt ? T.bg : T.mid,
    opacity: busy ? 0.6 : 1,
  })

  return (
    <div style={band(12)}>
      <section style={{ ...lux(24), padding: '16px 17px 17px', gap: 0, fontFamily: FONT }}
               aria-label="Status bestätigen">
        <Kicker>Kurz nachgefragt</Kicker>
        <p style={{ margin: '9px 0 0', fontSize: 15, fontWeight: 600, lineHeight: 1.35,
                    color: T.ink }}>
          {status.prompt_de}
        </p>
        <div style={{ ...hairline(), margin: '14px 0 13px' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={knopf(true)} disabled={busy}
                  onClick={() => void antworten('healthy')}>
            Wieder fit
          </button>
          <button type="button" style={knopf(false)} disabled={busy}
                  onClick={() => void antworten(status.state)}>
            Noch nicht
          </button>
        </div>
        <span style={{ marginTop: 10, fontSize: 11, fontWeight: 500, lineHeight: 1.4,
                       color: T.quiet }}>
          „Noch nicht" lässt alles, wie es ist — morgen fragen wir wieder.
        </span>
      </section>
    </div>
  )
}
