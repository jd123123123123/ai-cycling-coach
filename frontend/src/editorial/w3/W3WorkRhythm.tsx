import { useEffect, useState } from 'react'
import { T, FONT, Kicker } from './w3tokens'
import { luxTile, hairline, TNUM } from './w3surfaces'
import { getCommutePattern, getProfile, updateProfile } from '../../api/athletes'
import type { WorkRhythm } from '../../types/athlete'

/**
 * W3 · DEIN ALLTAG — die Angabe, die den Pendlerfehler an der Wurzel loest.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM ES DAS GIBT
 *
 * Der Plan erfuhr von einer Pendelfahrt bisher erst, wenn sie gefahren UND
 * synchronisiert war -- er reagierte nachtraeglich, suchte ein Opfer und fand,
 * sobald die Grundlagentage aufgebraucht waren, die Qualitaetseinheit. Wer
 * taeglich zur Arbeit radelt, verbraucht genau diese Tage zuerst.
 *
 * `docs/2026-09-19-pendlerfehler-reizkonten.md`, Abschnitt 6.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ZWEI SIEBENER-PILLENREIHEN UNTEREINANDER WAREN DER FEHLER.
 *
 * Die erste Fassung setzte "Arbeitstage" als MO DI MI DO FR SA SO -- direkt
 * unter die "Trainingstage" des Blattes, in derselben Pillenform. Zwei
 * identisch aussehende Wochenreihen, die Verschiedenes bedeuten: man musste
 * die Ueberschrift lesen, um zu wissen, welche man gerade bedient. Das ist
 * genau die Sorte Oberflaeche, die man zweimal falsch bedient und danach
 * nicht mehr anfasst.
 *
 * Jetzt beantwortet eine Vorgabe die Frage fuer fast alle: `Mo–Fr`,
 * `Jeden Tag`, `Andere`. Nur `Andere` klappt die Wochenreihe ueberhaupt auf.
 * Im Normalfall steht hier also gar keine zweite Pillenreihe mehr.
 *
 * WECHSELNDE ZEITEN. Manche arbeiten jeden Tag gleich, manche nicht. Der
 * Regelfall ist EIN Zeitpaar; wer "Unterschiedlich" waehlt, bekommt eine
 * Zeile je Arbeitstag. Die Alternative -- immer sieben Zeilen -- haette den
 * Aufwand aller an der Ausnahme ausgerichtet.
 *
 * DIE BESTE MASKE IST DIE, DIE NIEMAND AUSFUELLT. `GET /athletes/me/
 * commute-pattern` liest den Arbeitsweg aus den Fahrten der letzten acht
 * Wochen. Wird er erkannt, steht er als BEFUND da und muss nur bestaetigt
 * werden. Wird er es nicht -- und in den heutigen Produktionsdaten wird er bei
 * keinem Fahrer erkannt -- bleibt das Formular leer statt geraten vorbelegt.
 * Ein falsch vorausgefuelltes Feld prueft niemand nach.
 *
 * DER REGLER SPEICHERT SELBST, ueber `PATCH /athletes/me`. Nicht ueber
 * `onRebuild`: dessen Payload kennt kein Feld fuer den Alltag. Genau daran
 * sind die Rhythmus- und Indoor-Regler in `W3PlanView` schon einmal still
 * gescheitert.
 */

const TAGE = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const KUERZEL = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO']
const NAMEN = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const WERKTAGS = ['mon', 'tue', 'wed', 'thu', 'fri']
const TAEGLICH = [...TAGE]

type Vorgabe = 'werktags' | 'taeglich' | 'andere'

const MODI: { id: NonNullable<WorkRhythm['commute']>; label: string }[] = [
  { id: 'bike', label: 'Mit dem Rad' },
  { id: 'partly', label: 'Manchmal' },
  { id: 'none', label: 'Anders' },
]

const gleich = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

function vorgabeFuer(tage: string[]): Vorgabe {
  if (gleich(tage, WERKTAGS)) return 'werktags'
  if (gleich(tage, TAEGLICH)) return 'taeglich'
  return 'andere'
}

export default function W3WorkRhythm({ onSaved }: {
  onSaved?: (w: WorkRhythm) => void
} = {}) {
  const [tage, setTage] = useState<string[]>(WERKTAGS)
  const [vorgabe, setVorgabe] = useState<Vorgabe>('werktags')
  const [beginn, setBeginn] = useState('')
  const [ende, setEnde] = useState('')
  const [proTag, setProTag] = useState(false)
  const [zeiten, setZeiten] = useState<Record<string, { start: string; end: string }>>({})
  const [modus, setModus] = useState<WorkRhythm['commute']>(null)
  const [minuten, setMinuten] = useState('')
  const [busy, setBusy] = useState(false)
  const [zustand, setZustand] = useState<'offen' | 'gespeichert' | 'fehler'>('offen')
  const [befund, setBefund] = useState<{
    tage: string[]; minuten: number | null; fahrten: number
    frueh: string | null; spaet: string | null; sicherheit: string
  } | null>(null)
  const [befundGenutzt, setBefundGenutzt] = useState(false)

  // LAEDT SICH SELBST. Den Anfangswert durch drei Ebenen zu faedeln waere die
  // Art Verdrahtung, die hier regelmaessig auf halbem Weg abreisst -- und dann
  // stuende ein Formular da, das die gespeicherten Angaben nicht kennt und sie
  // beim naechsten Speichern ueberschreibt.
  useEffect(() => {
    let lebt = true
    getProfile().then(p => {
      const w = p.work_rhythm
      if (!lebt || !w) return
      if (w.work_days?.length) { setTage(w.work_days); setVorgabe(vorgabeFuer(w.work_days)) }
      if (w.start) setBeginn(w.start)
      if (w.end) setEnde(w.end)
      if (w.commute) setModus(w.commute)
      if (w.commute_minutes != null) setMinuten(String(w.commute_minutes))
      const pt = (w as { day_hours?: Record<string, { start: string; end: string }> }).day_hours
      if (pt && Object.keys(pt).length) { setZeiten(pt); setProTag(true) }
    }).catch(() => { /* ohne Profil bleiben die Vorgaben stehen */ })
    getCommutePattern().then(c => {
      if (!lebt || !c.detected) return
      setBefund({
        tage: c.work_days, minuten: c.commute_minutes, fahrten: c.rides,
        frueh: c.earliest, spaet: c.latest, sicherheit: c.confidence,
      })
    }).catch(() => { /* ohne Befund bleibt es bei der Handeingabe */ })
    return () => { lebt = false }
  }, [])

  const befundUebernehmen = () => {
    if (!befund) return
    if (befund.tage.length) { setTage(befund.tage); setVorgabe(vorgabeFuer(befund.tage)) }
    if (befund.minuten) setMinuten(String(befund.minuten))
    if (befund.frueh) setBeginn(befund.frueh)
    if (befund.spaet) setEnde(befund.spaet)
    setModus('bike')
    setBefundGenutzt(true)
  }

  const setzeVorgabe = (v: Vorgabe) => {
    setVorgabe(v)
    if (v === 'werktags') setTage(WERKTAGS)
    if (v === 'taeglich') setTage(TAEGLICH)
  }

  const mitRad = modus === 'bike' || modus === 'partly'
  const min = Number(minuten)
  const minutenGueltig = !minuten || (Number.isFinite(min) && min >= 1 && min <= 120)

  // Die erwartete Wochenlast, live. PLANUNGSGROESSE, keine Messung:
  // TSS = Dauer_h · IF² · 100 mit IF 0,60 fuer lockeres Pendeln.
  //
  // DIESE FORMEL STEHT ZWEIMAL, und das soll offen stehen statt still
  // auseinanderzulaufen: `work_rhythm.erwartete_pendellast_tss` rechnet im
  // Backend dasselbe. Eine Vorschau, die erst nach dem Speichern erscheint,
  // ist keine Vorschau; ein Netzaufruf je Tastendruck waere der falsche Preis.
  // Wer eine Seite aendert, MUSS die andere mitaendern.
  const erwartet = mitRad && min >= 1 && tage.length
    ? Math.round(((min * 2) / 60) * tage.length * 0.6 * 0.6 * 100)
    : null

  const speichern = async () => {
    if (busy || !minutenGueltig) return
    setBusy(true); setZustand('offen')
    const w: WorkRhythm = {
      work_days: tage,
      start: proTag ? null : (beginn || null),
      end: proTag ? null : (ende || null),
      commute: modus ?? null,
      commute_minutes: mitRad && min >= 1 ? min : null,
      ...(proTag ? { day_hours: zeiten } : {}),
    }
    try {
      await updateProfile({ work_rhythm: w })
      setZustand('gespeichert'); onSaved?.(w)
    } catch { setZustand('fehler') } finally { setBusy(false) }
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

  const zeileFuer = (tag: string) => zeiten[tag] ?? { start: beginn, end: ende }
  const setzeZeile = (tag: string, teil: 'start' | 'end', wert: string) =>
    setZeiten(z => ({ ...z, [tag]: { ...zeileFuer(tag), [teil]: wert } }))

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: T.ink }}>Dein Alltag</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 1.4 }}>
          Damit dein Arbeitsweg auf die Grundlage zählt — und nicht deine
          Intervalle kürzt.
        </span>
      </div>

      {/* DER BEFUND AUS DEN FAHRTEN. Er steht ueber allem anderen, weil er die
          Fragen darunter meistens beantwortet -- und er behauptet nichts, er
          schlaegt vor. */}
      {befund && !befundGenutzt && (
        <div style={{ ...luxTile(16), padding: '12px 13px', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: T.mid, lineHeight: 1.45 }}>
            In deinen Fahrten sieht das nach einem Arbeitsweg aus:{' '}
            <span style={{ fontWeight: 700, color: T.ink }}>
              {befund.tage.map(t => KUERZEL[TAGE.indexOf(t as typeof TAGE[number])]).join(' · ')}
            </span>
            {befund.minuten ? <>, rund{' '}
              <span style={{ ...TNUM, fontWeight: 700, color: T.ink }}>{befund.minuten} min</span>
              {' '}je Richtung</> : null}.
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>
            Aus {befund.fahrten} Fahrten der letzten acht Wochen · Sicherheit {befund.sicherheit}
          </span>
          <button type="button" onClick={befundUebernehmen}
                  style={{ alignSelf: 'flex-start', marginTop: 2, padding: '8px 14px',
                           borderRadius: 100, border: `1px solid ${T.acid}`,
                           background: T.acidDim, color: T.acid, fontFamily: FONT,
                           fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Stimmt — übernehmen
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Kicker>Arbeitstage</Kicker>
        {/* VORGABEN STATT EINER ZWEITEN WOCHENREIHE. Die Wochenreihe erscheint
            nur unter "Andere" -- sonst stuenden hier zwei identisch aussehende
            Sieben-Tage-Zeilen untereinander, die Verschiedenes bedeuten. */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['werktags', 'Mo–Fr'], ['taeglich', 'Jeden Tag'], ['andere', 'Andere']] as const)
            .map(([id, text]) => (
              <button key={id} type="button" style={pille(vorgabe === id)}
                      aria-pressed={vorgabe === id} onClick={() => setzeVorgabe(id)}>
                {text}
              </button>
            ))}
        </div>
        {vorgabe === 'andere' && (
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
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <Kicker>Arbeitszeit</Kicker>
          {/* Der Regelfall ist EIN Zeitpaar. Sieben Zeilen fuer alle haetten
              den Aufwand aller an der Ausnahme ausgerichtet. */}
          <button type="button" onClick={() => setProTag(v => !v)}
                  aria-pressed={proTag}
                  style={{ background: 'none', border: 0, padding: '4px 0', cursor: 'pointer',
                           fontFamily: FONT, fontSize: 11.5, fontWeight: 600,
                           color: proTag ? T.ink : T.quiet, textDecoration: 'underline' }}>
            {proTag ? 'Jeden Tag gleich' : 'Tage unterschiedlich?'}
          </button>
        </div>
        {!proTag ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="time" value={beginn} onChange={e => setBeginn(e.target.value)}
                   aria-label="Arbeitsbeginn" style={feld} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, flex: 'none' }}>bis</span>
            <input type="time" value={ende} onChange={e => setEnde(e.target.value)}
                   aria-label="Arbeitsende" style={feld} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {TAGE.filter(t => tage.includes(t)).map(t => {
              const i = TAGE.indexOf(t), z = zeileFuer(t)
              return (
                <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 30, flex: 'none', fontSize: 11, fontWeight: 700,
                                 letterSpacing: 0.4, color: T.quiet }}>{KUERZEL[i]}</span>
                  <input type="time" value={z.start} aria-label={`${NAMEN[i]} Beginn`}
                         onChange={e => setzeZeile(t, 'start', e.target.value)} style={feld} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, flex: 'none' }}>bis</span>
                  <input type="time" value={z.end} aria-label={`${NAMEN[i]} Ende`}
                         onChange={e => setzeZeile(t, 'end', e.target.value)} style={feld} />
                </div>
              )
            })}
          </div>
        )}
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

      {/* LEISE, NICHT ACID. Das Blatt hat bereits eine Hauptaktion
          ("Plan neu berechnen") in Acid; ein zweiter Acid-Knopf macht zwei
          Hauptaktionen auf. */}
      <button type="button" onClick={speichern} disabled={busy || !minutenGueltig}
              style={{
                padding: '13px 18px', borderRadius: 100,
                border: `1px solid ${T.stroke}`, background: 'transparent',
                color: T.ink, fontSize: 15, fontWeight: 600, fontFamily: FONT,
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
