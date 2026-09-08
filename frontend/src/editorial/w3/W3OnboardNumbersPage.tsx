import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Check, Pencil, Scale, Zap } from 'lucide-react'
import { useAthleteProfile } from '../../hooks/useAthleteProfile'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { updateProfile } from '../../api/athletes'
import { grantConsent } from '../../api/consent'
import { useQueryClient } from '@tanstack/react-query'
import { ONBOARDING_STATUS_KEY } from '../../hooks/useOnboarding'
import { CONSENT_TYPES } from '../../types/consent'
import { estimateFtp, starterFtp, type StarterFitness } from '../../utils/trainingScience'
import { T, FONT, EASE, band, Kicker } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import W3ZoneLadder from './W3ZoneLadder'
import './w3.css'

/**
 * W3 · ONBOARDING — DEINE ZAHLEN.
 *
 * The old wizard's second screen was the best thing in the old design: it shows
 * a new rider the two numbers the whole app is built on, says where they came
 * from, and lets them be corrected by hand when the app could not find them.
 * That screen lived at `/onboarding` in the v4 language, and a W3 rider was
 * being thrown into it — and then dropped on the v4 dashboard at the end.
 *
 * So it moves here, in W3's own register, and keeps every one of its ideas:
 *
 *  · THE NUMBER LEADS, and it says how confident it is. "Aus 12 Fahrten
 *    geschätzt" and "Startwert" are different claims and must not look alike.
 *  · IT CAN ALWAYS BE CORRECTED. An estimate the rider cannot argue with is
 *    a number they will distrust for as long as they use the app.
 *  · NO DATA IS A CASE, NOT AN ERROR. With no rides at all, the rider says how
 *    they ride and their weight, and gets a conservative starting estimate —
 *    `starterFtp` is a published W/kg prior, not a guess we invented.
 *
 * ── WHY THIS SCREEN ALSO GRANTS CONSENT ──────────────────────────────────
 * The onboarding gate is satisfied by two facts: a health-data consent and a
 * filled profile. They were granted together by the old wizard's finish step.
 * Splitting them across two W3 screens would let a rider end up half-way
 * through the gate and be bounced back here forever, so the one screen that
 * writes the profile writes the consent with it.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'

/**
 * A typed number, read the way the athlete typed it.
 *
 * The app is German-first and `72,5` is how a German rider writes their
 * weight. `Number('72,5')` is `NaN`, `NaN || null` is `null`, and a null
 * weight means `starterFtp` has nothing to multiply — so the CTA stays grey
 * with no reason given. Both separators are read here.
 */
function decimal(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The bounds a typed number has to sit inside — and why exactly these.
 *
 * Nothing was checking them. `AthleteProfileUpdate` declares `ftp_watts: int |
 * None` with no `ge`/`le` at all, so a fat-fingered `2450` saved, became this
 * rider's zone ladder, and the plan engine then prescribed intervals off a
 * number no human holds. The mistake does not surface here; it surfaces a week
 * later as workouts nobody can finish.
 *
 * The FTP floor is not a taste call. `mesocycle_generator` RAISES below it —
 * "Athlete ftp_watts=… is below minimum 100 W for mesocycle generation" — so a
 * rider who types 95 clears this screen and lands on a plan that cannot be
 * built, with nothing anywhere telling them why. The ceiling is a typo guard:
 * 600 W is past what the best riders in the world hold for an hour. The weight
 * range is the one `starterFtp` already trusts (30–200) and the one
 * `rehearsal.py` validates against — not a fourth opinion.
 */
const BOUNDS = { ftp: { min: 100, max: 600 }, weight: { min: 30, max: 200 } } as const

/** What is wrong with the FTP as typed, in the rider's words — or `null`. */
function ftpProblem(raw: string): string | null {
  const val = raw.trim()
  if (val === '') return null
  const n = Number(val.replace(',', '.'))
  if (!Number.isFinite(n)) return 'Die FTP lesen wir nicht als Zahl — nur Ziffern, z. B. 245.'
  if (n < BOUNDS.ftp.min)
    return `Unter ${BOUNDS.ftp.min} Watt kann der Trainingsplan nicht rechnen. Trag deine FTP ein — oder lass uns unten einen Startwert schätzen.`
  if (n > BOUNDS.ftp.max)
    return `Über ${BOUNDS.ftp.max} Watt hält niemand eine Stunde — schau nochmal auf die Zahl.`
  return null
}

/** What is wrong with the weight as typed — or `null`. */
function weightProblem(raw: string): string | null {
  const val = raw.trim()
  if (val === '') return null
  const n = Number(val.replace(',', '.'))
  if (!Number.isFinite(n)) return 'Das Gewicht lesen wir nicht als Zahl — nur Ziffern, z. B. 72,5.'
  if (n < BOUNDS.weight.min || n > BOUNDS.weight.max)
    return `Wir rechnen mit ${BOUNDS.weight.min}–${BOUNDS.weight.max} kg — schau nochmal auf die Zahl.`
  return null
}

const FITNESS: { key: StarterFitness; label: string; sub: string }[] = [
  { key: 'new', label: 'Neu dabei', sub: 'erste Saison auf dem Rad' },
  { key: 'returning', label: 'Zurück', sub: 'war mal fit, komme wieder' },
  { key: 'seasoned', label: 'Erfahren', sub: 'fahre seit Jahren regelmäßig' },
]

function Row({ label, value, unit, onEdit }: {
  label: string; value: string; unit: string; onEdit: () => void
}) {
  return (
    <button onClick={onEdit} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
      padding: '15px 16px', borderRadius: 20, background: T.tile, border: 0,
      cursor: 'pointer', fontFamily: FONT,
    }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Kicker>{label}</Kicker>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: ARCHIVO, fontSize: 30, fontWeight: 700, letterSpacing: -1.2, color: value ? T.ink : T.quiet }}>
            {value || '—'}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.mid }}>{unit}</span>
        </span>
      </span>
      <Pencil size={15} color={T.quiet} style={{ flex: 'none' }} />
    </button>
  )
}

export default function W3OnboardNumbersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const reduce = useReducedMotion()
  const { data: profile } = useAthleteProfile()
  const ninetyAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 90); return d
  }, [])
  const { data: acts } = useActivitiesRange(ninetyAgo, new Date())

  const est = useMemo(() => estimateFtp(acts?.activities ?? []), [acts])
  const rides = (acts?.activities ?? []).filter((a) => a.sport === 'cycling').length

  const [ftpInput, setFtpInput] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [fitness, setFitness] = useState<StarterFitness>('returning')
  // ── THE FIELD DOES NOT CLOSE ITSELF ─────────────────────────────────────
  // It used to collapse back into a row on blur. Tapping the CTA blurs the
  // input, the row is shorter than the input, the page reflows UNDER the
  // finger, and the tap lands on nothing: the rider types their weight, taps
  // continue, and the app does nothing. Caught by walking the flow on a real
  // sign-up, not by any typecheck. Once opened, a field stays open.
  const [editing, setEditing] = useState<null | 'ftp' | 'weight'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed the fields from whatever the profile already knows, once it arrives.
  useEffect(() => {
    if (profile?.weight_kg != null && weightInput === '') setWeightInput(String(profile.weight_kg))
    if (profile?.ftp_watts != null && ftpInput === '') setFtpInput(String(profile.ftp_watts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  // A number the rider can see in the field must never be quietly replaced by
  // a different one behind it. While the field holds something impossible, it
  // counts as no number at all: the hero reads DASH, the fallbacks stay shut,
  // and the note below the rows says what is wrong.
  const ftpNote = ftpProblem(ftpInput)
  const weightNote = weightProblem(weightInput)
  const note = ftpNote ?? weightNote

  const weight = weightNote ? null : decimal(weightInput) ?? profile?.weight_kg ?? null
  const typedFtp = ftpNote ? null : decimal(ftpInput)
  const starter = starterFtp(weight, fitness)
  const ftp = ftpNote ? null : typedFtp ?? profile?.ftp_watts ?? est?.watts ?? starter ?? null
  // WHERE THE NUMBER CAME FROM, ranked by how much it is worth. These are
  // different claims and the screen must not let them look alike.
  const source: 'typed' | 'profile' | 'rides' | 'starter' | 'none' =
    ftp == null ? 'none'
      : typedFtp ? 'typed'
        : profile?.ftp_watts != null ? 'profile'
          : est ? 'rides'
            : starter ? 'starter' : 'none'
  const sourceLine = {
    typed: 'von dir eingetragen',
    profile: 'aus deinem Profil',
    rides: `aus ${rides} ${rides === 1 ? 'Fahrt' : 'Fahrten'} geschätzt`,
    starter: 'Startwert — verfeinert sich mit jeder Fahrt',
    none: 'brauchen wir noch',
  }[source]
  const wkg = ftp && weight ? ftp / weight : null

  const off = ftp == null || note != null || busy

  const onContinue = async () => {
    if (ftp == null || note) return
    setBusy(true); setError(null)
    try {
      // Consent and profile together — see the note at the top of this file.
      for (const c of CONSENT_TYPES) {
        if (c.required) {
          await grantConsent({
            consent_type: c.type, consent_version: '1.0',
            granted: true, consent_text: c.description,
          })
        }
      }
      await updateProfile({
        primary_sport: profile?.primary_sport ?? 'cycling',
        ftp_watts: Math.round(ftp),
        ...(weight ? { weight_kg: Number(weight) } : {}),
      })
      // ── THE GATE THIS SCREEN JUST SATISFIED ──────────────────────────
      // `useOnboarding` caches its verdict for five minutes AND the cache is
      // written to localStorage, so without this the rider who just granted
      // consent and set their numbers is still 'needs-consent' to
      // ProtectedRoute — which bounces them from /e/w3-today back to the
      // welcome screen, forever, and a reload does not help. Observed on
      // production with a fresh account: onboarding completed, app
      // unreachable. Awaited so the next route reads the truth.
      await qc.invalidateQueries({ queryKey: ONBOARDING_STATUS_KEY })
      await qc.invalidateQueries({ queryKey: ['athlete', 'me'] })
      navigate('/e/w3-onboard-rider')
    } catch (err) {
      // ── THE ERROR HAS TO NAME ITSELF ────────────────────────────────────
      // One catch-all sentence hid a 500 from POST /consent for as long as it
      // took somebody to open the network tab. A rider stuck on this screen
      // could not say what was wrong and neither could anyone reading the
      // code. The status is the difference between "sign in again", "we broke
      // something" and "your connection went".
      const status = (err as { response?: { status?: number } })?.response?.status
      setError(
        status === 401
          ? 'Deine Sitzung ist abgelaufen. Melde dich neu an.'
          : status === 422
            ? 'Diese Werte konnten wir nicht speichern. Prüf FTP und Gewicht.'
            : status != null
              ? `Das hat gerade nicht geklappt (Fehler ${status}). Versuch es nochmal.`
              : 'Keine Verbindung. Versuch es gleich noch einmal.',
      )
    } finally {
      setBusy(false)
    }
  }

  const noData = est == null && profile?.ftp_watts == null

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />

        <div style={{ ...band(28), paddingTop: 18, gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>
            {rides > 0 ? `AUS ${rides} FAHRTEN` : 'NOCH KEINE FAHRTEN'}
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.1, color: T.ink }}>
            {noData ? 'Setzen wir deine Startwerte' : 'Wir haben deine Zahlen'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.mid, lineHeight: 1.45 }}>
            Auf diesen beiden Werten steht alles andere. Sie müssen nicht perfekt
            sein — nur ungefähr richtig, und du kannst sie jederzeit ändern.
          </span>
        </div>

        {/* ── THE NUMBER ───────────────────────────────────────────────── */}
        <div style={{ ...band(20) }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              width: '100%', borderRadius: 26, padding: '20px 20px 22px',
              background: `radial-gradient(120% 90% at 50% 100%, ${T.acid}14, ${T.tile} 62%)`,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 100, background: T.acidDim, display: 'grid', placeItems: 'center' }}>
                <Zap size={14} color={T.acid} />
              </span>
              <Kicker>Schwellenleistung · FTP</Kicker>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={{
                fontFamily: ARCHIVO, fontSize: 62, fontWeight: 700, letterSpacing: -3,
                lineHeight: 0.85, color: ftp == null ? T.quiet : T.ink, fontVariantNumeric: 'tabular-nums',
              }}>{ftp == null ? '—' : Math.round(ftp)}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.mid }}>W</span>
            </div>

            <span style={{ fontSize: 12, fontWeight: 700, color: source === 'starter' || source === 'none' ? T.warn : T.acid }}>
              {sourceLine}
            </span>

            {wkg != null && (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid }}>
                {wkg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} W/kg
                {weight ? ` bei ${Math.round(Number(weight))} kg` : ''}
              </span>
            )}

            {/* ── WHAT THE NUMBER BUYS ─────────────────────────────────────
                 203 W means nothing on its own. Its entire job is to define the
                 six efforts the rider will actually be asked for, so the figure
                 is DRAWN as the ladder it creates — every band carrying the real
                 watts it starts and ends at, computed from this rider's own
                 number. Change the FTP by ten watts and every figure on the
                 ladder moves. See `W3ZoneLadder`. */}
            <W3ZoneLadder ftp={ftp} />
          </motion.div>
        </div>

        {/* ── CORRECT IT ───────────────────────────────────────────────── */}
        <div style={{ ...band(24), gap: 9 }}>
          {editing === 'ftp' ? (
            <input autoFocus type="text" inputMode="numeric" placeholder="FTP in Watt"
              value={ftpInput} onChange={(e) => setFtpInput(e.target.value)}
              style={{ width: '100%', height: 62, padding: '0 16px', borderRadius: 20, background: T.tile, border: `1px solid ${T.acid}55`, outline: 'none', color: T.ink, fontFamily: ARCHIVO, fontSize: 26, fontWeight: 700 }} />
          ) : (
            <Row label="FTP" value={ftp == null ? '' : String(Math.round(ftp))} unit="Watt" onEdit={() => setEditing('ftp')} />
          )}
          {editing === 'weight' ? (
            <input autoFocus type="text" inputMode="decimal" placeholder="Gewicht in kg"
              value={weightInput} onChange={(e) => setWeightInput(e.target.value)}
              style={{ width: '100%', height: 62, padding: '0 16px', borderRadius: 20, background: T.tile, border: `1px solid ${T.acid}55`, outline: 'none', color: T.ink, fontFamily: ARCHIVO, fontSize: 26, fontWeight: 700 }} />
          ) : (
            <Row label="Gewicht" value={weight ? String(Math.round(Number(weight))) : ''} unit="kg" onEdit={() => setEditing('weight')} />
          )}

          {/* ── WHAT IS WRONG WITH THE NUMBER ────────────────────────────
               Under the rows, because that is what it is about — not down by
               the CTA, where it would read as a failed save. */}
          {note && (
            <div role="alert" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 16, background: T.tile }}>
              <AlertTriangle size={15} color={T.warn} style={{ flex: 'none', marginTop: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, lineHeight: 1.4 }}>{note}</span>
            </div>
          )}
        </div>

        {/* ── NO RIDES YET: say how you ride ───────────────────────────── */}
        {noData && (
          <div style={{ ...band(28), gap: 10 }}>
            <Kicker>Ich kenne meine FTP nicht</Kicker>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, lineHeight: 1.4, paddingBottom: 2 }}>
              Sag uns ungefähr, wo du stehst — daraus rechnen wir einen vorsichtigen
              Startwert, und deine ersten Fahrten korrigieren ihn.
            </span>
            {/* WHY THE BUTTON IS GREY. The starting estimate is a W/kg prior,
                so without a weight there is nothing to multiply and the CTA
                stays disabled — a rider who is not told that just sees a dead
                button and no reason for it. */}
            {!weight && !weightNote && (
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 16, background: T.tile }}>
                <Scale size={15} color={T.warn} style={{ flex: 'none', marginTop: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.mid, lineHeight: 1.4 }}>
                  Trag noch dein Gewicht ein — daraus rechnen wir den Startwert.
                </span>
              </div>
            )}
            {FITNESS.map((f) => {
              const on = fitness === f.key
              return (
                <button key={f.key} onClick={() => setFitness(f.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    padding: '13px 15px', borderRadius: 18, border: 0, cursor: 'pointer', fontFamily: FONT,
                    background: on ? T.acidDim : T.tile,
                  }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{f.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{f.sub}</span>
                  </span>
                  {on && <Check size={16} color={T.acid} style={{ flex: 'none' }} />}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {error && (
          <div style={{ ...band(10) }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.warn }}>{error}</span>
          </div>
        )}

        <div style={{ ...band(24) }}>
          {/* One condition, named once: the acid pill is only ever live when a
              real number is on screen and nothing about it is wrong. */}
          <button onClick={onContinue} disabled={off}
            style={{
              width: '100%', height: 58, borderRadius: 100, border: 0,
              background: off ? T.tile : T.acid,
              color: off ? T.quiet : T.heroInk,
              fontFamily: FONT, fontSize: 15, fontWeight: 700, letterSpacing: 0.3,
              cursor: off ? 'default' : 'pointer',
            }}>
            {busy ? 'Einen Moment…' : source === 'starter' ? 'Mit Startwerten loslegen' : 'Passt so'}
          </button>
        </div>
      </div>
    </div>
  )
}
