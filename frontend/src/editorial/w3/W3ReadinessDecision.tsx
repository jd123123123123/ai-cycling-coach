import { type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'
import { T, FONT, DASH, Kicker, useInView } from './w3tokens'
import { lux, luxTile, hairline, TNUM } from './w3surfaces'
import type {
  ReadinessDecision,
  ReadinessInput,
  ReadinessSession,
} from '../../api/readinessDecision'

/**
 * W3 · THE READINESS DECISION — the verdict is the headline, the score is the
 * evidence.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THIS CARD EXISTS, AND WHY IT IS NOT ANOTHER SCORE
 *
 * Today shows "43 · BEREITSCHAFT · Locker": a number, a word, a meter. A rider
 * who wears a Whoop looked at that and said it was Whoop's recovery score with
 * less behind it — and he was right. Whoop scores the night and then lets him
 * tap through to HRV, resting heart rate, sleep stages and respiratory rate.
 * Out-scoring it is not a game this app can win.
 *
 * But Whoop does not own the training plan, and that is a STRUCTURAL blind
 * spot, not a missing feature: it can score a night, it cannot know which
 * session that night cost you, because there is no session in it. This app has
 * both, so readiness stops being a number to interpret and becomes a decision
 * that already happened, WITH ITS RECEIPT:
 *
 *     the verdict          what you are doing today            ← the headline
 *     the counterfactual   what you would have been doing       ← the feature
 *     the driver           the one measurement that moved it    ← the reason
 *     the inputs           every signal against its own baseline ← the working
 *
 * That inversion is the whole design. Today the number is the headline and the
 * instruction is a screen below it; here the instruction is the object and the
 * number is filed underneath as evidence.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR RULES THAT ARE NOT NEGOTIABLE
 *
 *  1. WITHHELD MEANS WITHHELD. `withheld` → no verdict AND no score. A
 *     confident 43 printed next to a withheld verdict is the same lie in
 *     smaller type. The reason and the dated inputs are the whole card.
 *     (The rule itself is `utils/readinessGate.ts`, ported server-side; this
 *     card obeys the server's `withheld` flag rather than re-deciding it.)
 *  2. NO NUMBER IS PRESENT TENSE UNLESS IT IS. Any input with `age_days > 0`
 *     carries its age as a pill, composed here rather than trusted to prose,
 *     so the rule holds whatever the server writes.
 *  3. NO GUESSED BASELINE. `baseline === null` means there is nothing to
 *     compare against — the deviation rail is not drawn at all and the row
 *     says the baseline is still building.
 *  4. NO INVENTED COLOUR MEANING. The current card draws 43 in RED beside the
 *     word "Locker", and three reviewers could not tell whether that meant
 *     "you are unwell" or "take it easy". So the score here is set in INK and
 *     the meter is ONE colour always: its LENGTH carries the quantity, and the
 *     verdict at the top of the card — in words — carries the meaning. There
 *     is no hue for a rider to reconcile against a word. The single warm mark
 *     on the card is reserved for `off && unfavourable`, which is not a
 *     verdict but a definition: this deviation is the kind that argues for
 *     less load, and the row's own German says so beside it.
 *
 * ACID BUDGET: spent ONCE, on the meter's lit segments. Nothing else on this
 * card is acid — on a day the session was cut, the brand's "yes" colour has no
 * business anywhere near the verdict.
 *
 * IT REPORTS, IT DOES NOT ACT. `can_modify` is deliberately not rendered as a
 * button: this card never calls `POST /workouts/today/modify`. Where the plan
 * row has not yet been rewritten it says so in words, which is information the
 * rider can act on elsewhere rather than an affordance that lies about what
 * pressing it would do.
 */

/** The pen's meter, as the dock draws it: 22 segments, 3 apart, 10 tall. */
const SEGMENTS = 22

/** How far off a signal has to be before its rail dot reaches the end stop.
 *  Two band-widths — so a dot at the edge means "twice as far off as the
 *  threshold for this signal", the same sentence for every row. */
const RAIL_SPAN = 2

// ── pure helpers, exported so the tests can pin them without a DOM ──────────

/**
 * "Ohne diese Werte: Sweetspot — 2×20 min." arrives as ONE server string, and
 * only its second half is the session that was taken away. Split at the
 * LEFTMOST colon so an em-dashed session title downstream cannot steal the
 * split (the same bug the editorial verdict splitter shipped once already),
 * and return null when there is no colon at all — then the string is printed
 * whole and unstruck rather than guessed at.
 */
export function splitCounterfactual(
  text: string | null | undefined,
): { lead: string; session: string } | null {
  if (!text) return null
  const i = text.indexOf(':')
  if (i < 0 || i === text.length - 1) return null
  const lead = text.slice(0, i + 1)
  const session = text.slice(i + 1).trim()
  if (!session) return null
  return { lead, session }
}

/** The age of a measurement, in the rider's words. Null for today, because a
 *  reading taken this morning needs no dateline. */
export function ageNote(ageDays: number | null | undefined): string | null {
  if (ageDays == null || ageDays <= 0) return null
  if (ageDays === 1) return 'Gemessen gestern'
  return `Gemessen vor ${ageDays} Tagen`
}

/** The row pill's dateline. Deliberately SHORTER than the card's: on a stale
 *  morning every row carries one, and seven repetitions of "Gemessen vor 3
 *  Tagen" is furniture the eye learns to skip — which is exactly the row it
 *  must not skip. Two words date the reading and stay out of the way. */
export function ageShort(ageDays: number | null | undefined): string | null {
  if (ageDays == null || ageDays <= 0) return null
  if (ageDays === 1) return 'gestern'
  return `vor ${ageDays} Tagen`
}

/** The card's own dateline: today's readings say so, older ones are dated. */
export function measuredStamp(ageDays: number | null | undefined): string | null {
  if (ageDays == null) return null
  if (ageDays <= 0) return 'Gemessen heute'
  return ageNote(ageDays)
}

/** An ISO day key as a German date. Parsed at UTC midnight so the runner's
 *  timezone cannot shift a day key by one. */
export function formatDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(ms))
  } catch {
    return iso
  }
}

/** Duration and load, from whichever of the two the server actually sent. */
export function sessionMeta(s: ReadinessSession | null | undefined): string | null {
  if (!s) return null
  const parts: string[] = []
  if (s.duration_minutes != null) parts.push(`${Math.round(s.duration_minutes)} min`)
  if (s.target_tss != null) parts.push(`${Math.round(s.target_tss)} TSS`)
  return parts.length ? parts.join(' · ') : null
}

/** German decimals, and never more precision than the signal has. Hours get
 *  one place; everything else is whole unless the server sent a fraction. */
export function formatValue(v: number | null | undefined, unit: string): string {
  if (v == null || Number.isNaN(v)) return DASH
  const dec = unit === 'h' || (!Number.isInteger(v) && Math.abs(v) < 10) ? 1 : 0
  return v.toFixed(dec).replace('.', ',')
}

/** Where the dot sits on the deviation rail, 0 → 1, with 0.5 the baseline.
 *  Null when there is nothing honest to draw: no baseline, no z, no band. */
export function railPosition(input: ReadinessInput): number | null {
  if (input.baseline == null) return null
  if (input.z == null || input.band == null || input.band <= 0) return null
  const spread = input.z / (input.band * RAIL_SPAN)
  return 0.5 + Math.max(-0.5, Math.min(0.5, spread))
}

// ── the pieces ──────────────────────────────────────────────────────────────

/** The dateline pill. Small, quiet, and never coloured: staleness is a fact
 *  about a number, not a warning about the rider. */
function AgePill({ text }: { text: string }) {
  return (
    <span
      style={{
        flex: 'none',
        padding: '2px 7px',
        borderRadius: 100,
        background: T.d1,
        color: T.mid,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {text}
    </span>
  )
}

/**
 * ONE ACID OBJECT: the score, drawn as a length.
 *
 * Always the same colour, filled to the value. A meter that changes hue is a
 * second verdict competing with the words above it; a meter that only changes
 * LENGTH says the one thing a meter is good at and leaves the meaning to the
 * sentence. It grows once, on arrival, via `useInView` — `whileInView`
 * resolves immediately in this app and would fill before it was ever seen.
 */
function ScoreMeter({ score }: { score: number }) {
  const reduce = useReducedMotion()
  const { ref, inView, instant } = useInView(0.2)
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * SEGMENTS)
  const still = reduce || instant
  return (
    <div
      ref={ref}
      aria-hidden
      style={{ display: 'flex', gap: 3, height: 10, width: '100%' }}
    >
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const lit = i < filled
        const shown = still || inView
        return (
          <span
            key={i}
            style={{
              flex: 1,
              height: 10,
              borderRadius: 3,
              background: lit
                ? `linear-gradient(180deg, ${T.acidLite} 0%, ${T.acid} 55%, ${T.acidDeep} 100%)`
                : T.d1,
              opacity: lit ? (shown ? 1 : 0.15) : 1,
              transition: still
                ? undefined
                : `opacity 0.28s linear ${(lit ? i * 0.02 : 0).toFixed(2)}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * The deviation rail: how far off this signal is IN ITS OWN BAND-WIDTHS.
 *
 * This is the thing seven separate metric screens cannot do. A 12 ms HRV drop
 * and a 4 bpm resting-pulse rise are not comparable as numbers, and on their
 * own tap-through screens they never have to be — but they are comparable once
 * each is expressed against its own baseline spread, and then the rider can
 * see at a glance WHICH of the seven is the one that mattered.
 */
function DeviationRail({ input }: { input: ReadinessInput }) {
  const pos = railPosition(input)
  if (pos == null) return null
  const warm = input.off && input.unfavourable
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: 46,
        height: 12,
        flex: 'none',
        alignSelf: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 5,
          height: 2,
          borderRadius: 100,
          background: T.d1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 2,
          width: 1,
          height: 8,
          background: T.d2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${(pos * 100).toFixed(1)}%`,
          top: 3,
          width: 6,
          height: 6,
          marginLeft: -3,
          borderRadius: 100,
          background: warm ? T.warn : T.d4,
        }}
      />
    </div>
  )
}

/** One measured signal, with its value, its own baseline and its age. */
function InputRow({ input, isDriver }: { input: ReadinessInput; isDriver: boolean }) {
  const age = ageShort(input.age_days)
  const noBaseline = input.baseline == null
  // Precedence, so a row never stacks three near-identical sentences: with no
  // baseline the server's note (or ours) explains the absence; otherwise the
  // note only shows when it says something the age pill has not already said.
  const secondary = noBaseline
    ? (input.note_de
      ?? (input.baseline_n > 0
        ? `Noch kein Basiswert — erst ${input.baseline_n} Messungen.`
        : 'Noch kein Basiswert.'))
    : (input.note_de && input.note_de !== ageNote(input.age_days) ? input.note_de : null)

  return (
    <div
      data-testid={`rd-input-${input.key}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontWeight: 600,
            color: isDriver ? T.ink : T.mid,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {input.label_de}
        </span>
        <DeviationRail input={input} />
        {/* A FIXED COLUMN FOR THE VALUES, so the rails beside them line up.
            Ragged rails are unreadable as a set: the whole point of drawing
            seven deviations in the same units is that the eye can compare them
            down a column, and it cannot if each column starts somewhere else. */}
        <span
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'flex-end',
            gap: 3,
            // FIXED, not `minWidth`: the unit is part of this column and "ms",
            // "bpm" and "h" are three different widths, so a min-width column
            // still lets every rail start somewhere else.
            width: 78,
          }}
        >
          <span
            style={{
              ...TNUM,
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
              // NEVER WARM. An orange numeral would be a second verdict in a
              // colour, and the card has already spent its one warm mark on
              // the rail dot — which says "off" about a DEVIATION rather than
              // about the rider.
              color: input.value == null ? T.quiet : T.ink,
            }}
          >
            {formatValue(input.value, input.unit)}
          </span>
          {input.value != null && input.unit
            ? <span style={{ fontSize: 10, fontWeight: 600, color: T.quiet }}>{input.unit}</span>
            : null}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.35,
          color: T.quiet,
        }}
      >
        <span>{input.text_de}</span>
        {age ? <AgePill text={age} /> : null}
        {secondary ? (
          <span>
            <span aria-hidden style={{ color: T.d3, paddingRight: 5 }}>·</span>
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ── the card ────────────────────────────────────────────────────────────────

export interface W3ReadinessDecisionProps {
  /** The payload from `useReadinessDecision()`. Undefined while it loads —
   *  the card then renders nothing at all rather than a skeleton verdict. */
  decision: ReadinessDecision | null | undefined
  style?: CSSProperties
}

export default function W3ReadinessDecision({
  decision,
  style,
}: W3ReadinessDecisionProps) {
  if (!decision) return null

  const d = decision
  const withheld = d.withheld === true
  // BELT AND BRACES ON THE ONE RULE THAT MATTERS. The verdict and the score are
  // read through the same flag, so no future edit can reintroduce a confident
  // number beside a withheld verdict by touching only one of the two.
  const verdict = withheld ? null : (d.verdict ?? null)
  const score = withheld ? null : (d.readiness_score ?? null)
  const driver = withheld ? null : (d.driver ?? null)
  const counterfactual =
    !withheld && d.changed === true ? (verdict?.counterfactual_text_de ?? null) : null
  const cf = splitCounterfactual(counterfactual)

  const stamp = measuredStamp(d.data_age_days)
  const measuredOn = formatDayKey(d.last_measured_on)
  const nowMeta = sessionMeta(d.session_now)
  const plannedMeta = sessionMeta(d.session_planned)

  const planNote = withheld || !d.changed
    ? null
    : d.applied
      ? 'Dein Plan von heute ist bereits angepasst.'
      : 'Dein Plan ist noch unverändert.'

  const sourceNote = counterfactual
    ? d.counterfactual_source === 'recorded'
      ? 'So stand es im Plan.'
      : d.counterfactual_source === 'recomputed'
        ? 'Neu berechnet ohne die Messwerte.'
        : null
    : null

  return (
    <article
      data-testid="rd-card"
      style={{ ...lux(28), padding: 20, gap: 14, fontFamily: FONT, ...style }}
    >
      {/* ── eyebrow + dateline ────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
        }}
      >
        <Kicker>Entscheidung</Kicker>
        {stamp ? (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: T.quiet, flex: 'none' }}>
            {stamp}
          </span>
        ) : null}
      </header>

      {withheld ? (
        /* ── HONEST ABSENCE ──────────────────────────────────────────────
           No verdict, no score, no meter, no driver. The reason is the
           headline, because "we are not going to tell you" is itself the
           answer to the question the rider asked. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            data-testid="rd-withheld"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: -0.5,
              lineHeight: 1.18,
              color: T.ink,
            }}
          >
            {d.withheld_reason_de ?? 'Für heute liegen keine Messwerte vor.'}
          </span>
          {measuredOn ? (
            <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>
              {`Letzte Messung: ${measuredOn}.`}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          {/* ── 1 · THE VERDICT — the largest thing on the card ───────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              data-testid="rd-verdict"
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: -0.8,
                lineHeight: 1.12,
                color: T.ink,
              }}
            >
              {verdict?.text_de ?? DASH}
            </span>
            {nowMeta ? (
              <span style={{ ...TNUM, fontSize: 12, fontWeight: 600, color: T.mid }}>
                {nowMeta}
              </span>
            ) : null}
          </div>

          {/* ── 2 · THE COUNTERFACTUAL — only when something changed ─────
              When the session is untouched, "Ohne diese Werte: (the same
              session)" is noise that trains the rider to skip the line on the
              day it finally says something different. */}
          {counterfactual ? (
            <div
              data-testid="rd-counterfactual"
              style={{ ...luxTile(18), padding: '12px 14px', gap: 5 }}
            >
              <span style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, color: T.quiet }}>
                {cf ? (
                  <>
                    {cf.lead}{' '}
                    <span
                      style={{
                        color: T.mid,
                        textDecoration: 'line-through',
                        textDecorationColor: T.d3,
                        textDecorationThickness: 1,
                      }}
                    >
                      {cf.session}
                    </span>
                  </>
                ) : (
                  counterfactual
                )}
              </span>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: T.quiet,
                }}
              >
                {plannedMeta ? <span style={TNUM}>{plannedMeta}</span> : null}
                {sourceNote ? <span>{sourceNote}</span> : null}
              </div>
            </div>
          ) : null}

          {planNote ? (
            <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet }}>{planNote}</span>
          ) : null}

          {/* ── 3 · THE DRIVER — the one measurement that moved it ──────
              Set against a rule rather than in a colour: it is a citation, and
              a citation should look like one. */}
          {driver?.text_de ? (
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <span
                aria-hidden
                style={{ width: 3, borderRadius: 100, background: T.d3, flex: 'none' }}
              />
              <span
                data-testid="rd-driver"
                style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: T.ink }}
              >
                {driver.text_de}
              </span>
            </div>
          ) : null}
        </>
      )}

      {/* ── the evidence, under a rule ─────────────────────────────────── */}
      {(score != null || d.inputs.length > 0) ? <div style={hairline()} /> : null}

      {/* ── 4 · THE SCORE, FILED AS EVIDENCE ──────────────────────────────
          Ink, not a hue. The meter beside it is one colour always, so nothing
          here can contradict the word next to it or the verdict above it. */}
      {score != null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              data-testid="rd-score"
              style={{
                ...TNUM,
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 0.92,
                letterSpacing: -0.9,
                color: T.ink,
                flex: 'none',
              }}
            >
              {score}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.1, color: T.quiet }}>
                BEREITSCHAFT
              </span>
              {d.readiness_tier ? (
                <span style={{ fontSize: 14, fontWeight: 600, color: T.mid }}>
                  {d.readiness_tier}
                </span>
              ) : null}
            </div>
          </div>
          <ScoreMeter score={score} />
        </div>
      ) : null}

      {/* ── 5 · THE WORKING — every signal, in one view ───────────────────
          Not behind a tap. The tap-through is the competitor's shape and it
          costs four gestures to answer one question; the whole list fits in a
          scroll because each row is two lines and its own baseline. Rendered
          in the server's order, never re-sorted: a list that reshuffles by
          severity is a list the rider has to re-read every morning. */}
      {d.inputs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Kicker>Gemessen</Kicker>
            {d.baseline_state === 'building' ? (
              <span style={{ fontSize: 11, fontWeight: 500, color: T.quiet }}>
                Deine Basiswerte bauen sich noch auf.
              </span>
            ) : null}
          </div>
          {d.inputs.map((input) => (
            <InputRow
              key={input.key}
              input={input}
              isDriver={!withheld && driver?.key === input.key}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}
