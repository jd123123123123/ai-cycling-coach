import { useEffect, useState } from 'react'
import { T, FONT, Kicker } from './w3tokens'
import { luxTile, hairline, TNUM } from './w3surfaces'
import { getProfile, updateProfile } from '../../api/athletes'
import type { WorkRhythm } from '../../types/athlete'

/**
 * W3 · DEIN ALLTAG — die Angabe, die den Pendlerfehler an der Wurzel loest.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM ES DAS GIBT
 *
 * Der Plan erfuhr von einer Pendelfahrt bisher erst, wenn sie gefahren UND
 * synchronisiert war. Er reagierte also immer nachtraeglich: Er sah eine
 * erhoehte Wochenlast, suchte ein Opfer und fand -- sobald die Grundlagentage
 * aufgebraucht waren -- die Qualitaetseinheit. Wer taeglich zur Arbeit radelt,
 * verbraucht genau diese Grundlagentage zuerst. Der Athlet sammelte Umfang und
 * verlor den einen Reiz, den Umfang nicht erzeugen kann.
 *
 * Mit Arbeitstagen, Zeiten und Pendeldauer ist diese Last VORHERSEHBAR. Sie
 * wird eingeplant, statt hinterher etwas zu verdraengen.
 *
 * `docs/2026-09-19-pendlerfehler-reizkonten.md`, Abschnitt 6.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIESER REGLER SPEICHERT SELBST — und das ist kein Detail.
 *
 * In `W3PlanView` steht die Warnung, warum zwei fruehere Regler entfernt
 * wurden: Ihre Werte erreichten `RebuildPayload` nie, also taten zwei von fuenf
 * Bedienelementen in einem Formular namens "Plan neu berechnen" still gar
 * nichts. `/plan/change/apply` kennt kein Feld fuer den Alltag und soll auch
 * keines bekommen -- der Alltag ist keine Planoption, sondern eine Tatsache
 * ueber den Fahrer. Also geht er direkt an `PATCH /athletes/me` und meldet
 * sichtbar, ob er angekommen ist.
 *
 * VIER ANGABEN, NICHT MEHR. Ein Formular, das laenger ist als eine Minute,
 * fuellt niemand aus, und ein leeres Profil ist schlechter als ein grobes.
 * Alles ist optional: Ohne Angaben verhaelt sich der Plan exakt wie bisher.
 */

const TAGE = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const KUERZEL = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO']
const NAMEN = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const MODI: { id: NonNullable<WorkRhythm['commute']>; label: string; sub: string }[] = [
  { id: 'bike', label: 'Mit dem Rad', sub: 'Jeden Arbeitstag' },
  { id: 'partly', label: 'Manchmal', sub: 'Nicht jeden Tag' },
  { id: 'none', label: 'Anders', sub: 'Kein Rad' },
]

export default function W3WorkRhythm({ onSaved }: {
  onSaved?: (w: WorkRhythm) => void
} = {}) {
  // LAEDT SICH SELBST. Den Anfangswert durch W3PlanPage -> W3PlanExperience ->
  // PlanAdjustSheet zu faedeln waere genau die Art Verdrahtung, die in diesem
  // Repo regelmaessig auf halbem Weg abreisst -- und dann stuende hier ein
  // Formular, das die gespeicherten Angaben des Fahrers nicht kennt und sie
  // beim naechsten Speichern ueberschreibt.
  const [tage, setTage] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [beginn, setBeginn] = useState('')
  const [ende, setEnde] = useState('')
  const [modus, setModus] = useState<WorkRhythm['commute']>(null)
  const [minuten, setMinuten] = useState<string>('')

  useEffect(() => {
    let lebt = true
    getProfile().then(p => {
      const w = p.work_rhythm
      if (!lebt || !w) return
      if (w.work_days?.length) setTage(w.work_days)
      if (w.start) setBeginn(w.start)
      if (w.end) setEnde(w.end)
      if (w.commute) setModus(w.commute)
      if (w.commute_minutes != null) setMinuten(String(w.commute_minutes))
    }).catch(() => { /* ohne Profil bleiben die Vorgaben stehen */ })
    return () => { lebt = false }
  }, [])
  const [busy, setBusy] = useState(false)
  const [zustand, setZustand] = useState<'offen' | 'gespeichert' | 'fehler'>('offen')

  const mitRad = modus === 'bike' || modus === 'partly'
  const min = Number(minuten)
  const minutenGueltig = !minuten || (Number.isFinite(min) && min >= 1 && min <= 120)

  // Die erwartete Wochenlast, live. Sie ist eine PLANUNGSGROESSE, keine
  // Messung -- TSS = Dauer_h · IF² · 100 mit IF 0,60 fuer lockeres Pendeln.
  // Sobald echte Fahrten vorliegen, ersetzt die gemessene Intensitaet die
  // Annahme; deshalb steht "geschätzt" daran und keine Nachkommastelle.
  //
  // DIESE FORMEL STEHT ZWEIMAL, und das soll hier offen stehen, statt still
  // auseinanderzulaufen: `work_rhythm.erwartete_pendellast_tss` im Backend
  // rechnet dasselbe. Die Doppelung ist bewusst -- eine Vorschau, die erst
  // nach dem Speichern erscheint, ist keine Vorschau, und ein Netzaufruf pro
  // Tastendruck waere der falsche Preis dafuer. Wer eine Seite aendert
  // (IF-Annahme, Hin-und-Rueckweg), MUSS die andere mitaendern; der Test
  // `test_erwartete_wochenlast_ist_eine_planungsgroesse` haelt die Zahl fest.
  const erwartet = mitRad && min >= 1 && tage.length
    ? Math.round(((min * 2) / 60) * tage.length * 0.6 * 0.6 * 100)
    : null

  const speichern = async () => {
    if (busy || !minutenGueltig) return
    setBusy(true)
    setZustand('offen')
    const w: WorkRhythm = {
      work_days: tage,
      start: beginn || null,
      end: ende || null,
      commute: modus ?? null,
      commute_minutes: mitRad && min >= 1 ? min : null,
    }
    try {
      await updateProfile({ work_rhythm: w })
      setZustand('gespeichert')
      onSaved?.(w)
    } catch {
      setZustand('fehler')
    } finally { setBusy(false) }
  }

  const pille = (an: boolean) => ({
    flex: 1, padding: '9px 0', borderRadius: 14, textAlign: 'center' as const,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${an ? T.acid : T.stroke}`,
    background: an ? T.acidDim : 'transparent', color: an ? T.acid : T.mid,
  })

  const feld = {
    background: 'transparent', border: `1px solid ${T.stroke}`, borderRadius: 12,
    padding: '9px 11px', color: T.ink, fontSize: 14, fontWeight: 600,
    fontFamily: FONT, minWidth: 0, width: '100%',
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>Dein Alltag</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 1.4 }}>
          Damit dein Arbeitsweg auf die Grundlage zählt — und nicht deine
          Intervalle kürzt.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Kicker>Arbeitstage</Kicker>
        <div style={{ display: 'flex', gap: 6 }}>
          {KUERZEL.map((k, i) => {
            const an = tage.includes(TAGE[i])
            return (
              <button key={k} type="button" style={pille(an)} aria-pressed={an}
                      aria-label={`${NAMEN[i]} ${an ? 'ist Arbeitstag' : 'ist frei'}`}
                      onClick={() => setTage(p => an ? p.filter(t => t !== TAGE[i]) : [...p, TAGE[i]])}>
                {k}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Kicker>Arbeitszeit</Kicker>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="time" value={beginn} onChange={e => setBeginn(e.target.value)}
                 aria-label="Arbeitsbeginn" style={feld} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, flex: 'none' }}>bis</span>
          <input type="time" value={ende} onChange={e => setEnde(e.target.value)}
                 aria-label="Arbeitsende" style={feld} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>
          Sagt dem Plan, wann überhaupt ein Fenster für eine lange oder harte
          Einheit bleibt.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Kicker>Weg zur Arbeit</Kicker>
        <div style={{ display: 'flex', gap: 6 }}>
          {MODI.map(m => (
            <button key={m.id} type="button" style={pille(modus === m.id)}
                    aria-pressed={modus === m.id}
                    onClick={() => setModus(modus === m.id ? null : m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {mitRad && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input type="number" inputMode="numeric" min={1} max={120} value={minuten}
                   onChange={e => setMinuten(e.target.value)}
                   aria-label="Minuten je Richtung"
                   style={{ ...feld, width: 92, flex: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>Minuten je Richtung</span>
          </div>
        )}
        {!minutenGueltig && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.warn }}>
            Zwischen 1 und 120 Minuten.
          </span>
        )}
      </div>

      {/* Was der Plan daraus macht -- sichtbar, bevor gespeichert wird. Eine
          Eingabe, deren Wirkung man nicht sieht, fuellt niemand zweimal aus. */}
      {erwartet != null && (
        <>
          <div style={hairline()} />
          <div style={{ ...luxTile(16), padding: '11px 13px', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid, lineHeight: 1.45 }}>
              Dein Arbeitsweg bringt rund{' '}
              <span style={{ ...TNUM, fontWeight: 700, color: T.ink }}>{erwartet} TSS</span>
              {' '}pro Woche auf die Grundlage.
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>
              Geschätzt aus Dauer und Tagen. Sobald echte Fahrten da sind, zählt
              die gemessene Intensität.
            </span>
          </div>
        </>
      )}

      <button type="button" onClick={speichern} disabled={busy || !minutenGueltig}
              // LEISE, NICHT ACID. Das Blatt, in dem dieser Abschnitt steht,
              // hat bereits eine Hauptaktion ("Plan neu berechnen") in Acid.
              // Ein zweiter Acid-Knopf macht zwei Hauptaktionen auf, und der
              // Hausstil gibt das Budget genau einmal aus. Die Tages-Pillen
              // oben sind Acid, weil das Blatt seine Pillen schon so setzt --
              // eine zweite Pillen-Sprache daneben saehe kaputt aus.
              style={{
                padding: '13px 18px', borderRadius: 100,
                border: `1px solid ${T.stroke}`, background: 'transparent',
                color: T.ink,
                fontSize: 15, fontWeight: 600, fontFamily: FONT,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}>
        {busy ? 'Speichert …' : 'Alltag speichern'}
      </button>
      {zustand === 'gespeichert' && (
        <span style={{ fontSize: 12, fontWeight: 600, color: T.mid }}>
          Gespeichert. Gilt ab der nächsten Planberechnung.
        </span>
      )}
      {zustand === 'fehler' && (
        <span style={{ fontSize: 12, fontWeight: 600, color: T.warn }}>
          Konnte nicht gespeichert werden. Versuch es noch einmal.
        </span>
      )}
    </section>
  )
}
