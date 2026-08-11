import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import SecHead from '../components/SecHead'
import Claim from './Claim'
import MetricTiles from './MetricTiles'
import FormBlock from './FormBlock'
import Hypnogram from '../components/Hypnogram'
import SignalRow from '../components/SignalRow'
import DayTimeline from '../components/DayTimeline'
import { COVER_PHOTO, QUOTE_PHOTO } from '../components/plateImagery'
import { useCountUp } from '../motion/useCountUp'
import { MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'
import { isPresent } from '../data/value'
import type { MorningWrapModel } from './model'
import MorningPlate from './MorningPlate'
import ChapterRail from './ChapterRail'
import PeekStrip, { type Peek } from './PeekStrip'
import DawnAura from './DawnAura'
// tokens.css is imported HERE, not left to EditorialRoot. This deck is the one
// editorial screen that does not mount that shell, and `/e/morning` is a lazy
// route: land on it directly and EditorialRoot's chunk — the only other place
// that imports the palette — never loads, so every custom property resolves to
// nothing and the whole screen paints black on black. Caught by running the
// real deck in a browser; the HTML harness inlines tokens.css itself and so
// cannot see it.
import '../tokens.css'
import './morning.css'

/**
 * Flagship · Morning Wrap, as a deck.
 *
 * This screen used to be one 5 000px scroll of eight stacked sections. That
 * shape asks a rider at 06:32 to do the editing — to decide which of eight
 * things matters while half awake. A deck does the editing for them: one
 * chapter is one claim, `scroll-snap-stop: always` means a flick can never
 * skip one, and the whole morning is seven decisions instead of one wall.
 *
 * THE ORDER IS THE ARGUMENT, and it inverts the old page's. The evidence used
 * to come before the verdict; here the verdict is chapter 01, one flick in,
 * and the night, the signals and the form curve follow as the reasons for it.
 * A rider who reads two chapters and puts the phone down already has what
 * they woke up wanting; a rider who reads all seven learns why. Nothing is
 * hidden behind the ordering, because the rail names every chapter and takes
 * one tap to reach it.
 *
 * The last chapter is the peak-end: the photograph, the sentence they will
 * remember, and the only saturated surface in the deck.
 */

const LABELS = ['Wake', 'Call', 'Night', 'Signals', 'Form', 'Day', 'Close'] as const

const srOnly: CSSProperties = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

/** `onPhoto` is not styling for its own sake: a --e-quiet label over the light
 *  band of a photographic plate measured as effectively unreadable at 390px.
 *  The shadow reads as a scrim without painting a bar over the picture the
 *  plate exists to show — the same trick `--e-label-shadow` was added for. */
function Kicker({ children, tone = 'quiet', onPhoto }: { children: ReactNode; tone?: 'quiet' | 'accent' | 'mid'; onPhoto?: boolean }) {
  return (
    <span style={{
      fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: tone === 'accent' ? 'var(--st-active)' : tone === 'mid' ? 'var(--e-mid)' : 'var(--e-quiet)',
      textShadow: onPhoto ? 'var(--e-label-shadow)' : undefined,
    }}>{children}</span>
  )
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.5, color: 'var(--e-mid)', margin: 0 }}>
      {children}
    </p>
  )
}

function Withheld({ reason, testId }: { reason: string; testId?: string }) {
  return (
    <p data-testid={testId} style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-quiet)', margin: 0 }}>
      {reason}
    </p>
  )
}

/** The signature numeral. The glow is the accent's own hue at low alpha, so it
 *  re-tints with the deck rather than being a second, fixed light source. */
function BigNumeral({ children, size }: { children: ReactNode; size: number }) {
  return (
    <span style={{
      fontFamily: 'var(--e-display)', fontSize: size, fontWeight: 800,
      lineHeight: 0.78, letterSpacing: '-0.055em', color: 'var(--st-active)',
      textShadow: `0 0 ${Math.round(size * 0.36)}px color-mix(in srgb, var(--st-active) 34%, transparent)`,
    }}>{children}</span>
  )
}

function Chapter({ id, title, plate, children }: { id: string; title: string; plate?: ReactNode; children: ReactNode }) {
  return (
    <section className="morning-chapter" data-testid="morning-chapter" data-chapter={id} aria-label={title}>
      {plate}
      <h2 style={srOnly}>{title}</h2>
      <div className="m-wrap">{children}</div>
    </section>
  )
}

const Spacer = () => <div style={{ flex: 1, minHeight: 14 }} />

/**
 * Closes the argument at the top of a chapter, before the evidence at the
 * bottom of it.
 *
 * Not decoration. Rendered at 390×844, the flex spacer between a chapter's
 * claim and its chart left ~190px of undifferentiated black that read as an
 * unfinished screen rather than as composition. A rule under the last line of
 * the top block turns the same space into the gutter between two blocks —
 * which is what print has always done with it, and costs one line.
 */
const Rule = ({ when = true }: { when?: boolean }) =>
  when ? <div style={{ height: 1, background: 'var(--e-hairline)', marginTop: 20 }} /> : null

export default function MorningDeckView({ model }: { model: MorningWrapModel }) {
  const m = model
  const deckRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = LABELS.length

  useEffect(() => {
    const el = deckRef.current
    if (!el) return
    const onScroll = () => {
      const i = Math.round(el.scrollTop / Math.max(el.clientHeight, 1))
      setIndex(Math.min(Math.max(i, 0), count - 1))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [count])

  const goTo = useCallback((i: number) => {
    const next = Math.min(Math.max(i, 0), count - 1)
    // Set first: during a smooth scroll the rail should answer the tap
    // immediately, and the scroll listener above only corrects it afterwards.
    setIndex(next)
    const el = deckRef.current
    if (!el) return
    const top = next * el.clientHeight
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    } else {
      el.scrollTop = top
    }
  }, [count])

  // The archive deck is not keyboard-operable at all — its scroller has no
  // tabIndex and no key handler, so nothing but a mouse advances it. Fixed here.
  const onKeyDown = (e: KeyboardEvent) => {
    const map: Record<string, number | undefined> = {
      ArrowDown: index + 1, PageDown: index + 1, ' ': index + 1,
      ArrowUp: index - 1, PageUp: index - 1,
      Home: 0, End: count - 1,
    }
    const next = map[e.key]
    if (next == null) return
    e.preventDefault()
    goTo(next)
  }

  // Numerals count up when THEIR chapter arrives, not at mount — a 91 that
  // finished spinning three chapters before you got there is just a number.
  // `useCountUp` restarts whenever its target changes, so gating the target on
  // the active index is the whole mechanism.
  const sleepScore = isPresent(m.sleepScore) ? m.sleepScore.value.score : null
  const readiness = isPresent(m.brief) ? m.brief.value.readiness.value : null
  const formNow = isPresent(m.form) ? m.form.value.form : null

  const shownSleep = useCountUp(index === 0 ? sleepScore : 0, 900)
  const shownReadiness = useCountUp(index === 1 ? readiness : 0, 900)

  const signalCount = m.signals.filter(isPresent).length

  /** PEEKS[i] describes chapter i+1 — what the strip at the foot of chapter i
   *  is promising. The last chapter has none: its CTA is the ending. */
  const PEEKS: (Peek | null)[] = [
    { num: '01', title: 'Your call', value: readiness != null ? String(readiness) : null },
    { num: '02', title: 'Your night', value: isPresent(m.sleepWindow) ? m.sleepWindow.value.asleep[0] : null },
    { num: '03', title: 'Your signals', value: signalCount > 0 ? `${signalCount}` : null },
    { num: '04', title: 'Where you stand', value: formNow != null ? signed(formNow) : null },
    { num: '05', title: 'Your day', value: isPresent(m.tasks) ? `${m.tasks.value.length}` : null },
    { num: '06', title: 'Before you go', value: isPresent(m.streakDays) ? `${m.streakDays.value}d` : null },
    null,
  ]
  const peek = PEEKS[index]

  return (
    <div className="editorial-root morning-root" data-morning-wrap>
      <DawnAura progress={count > 1 ? index / (count - 1) : 0} />

      <div
        ref={deckRef}
        className="morning-deck"
        data-testid="morning-deck"
        role="region"
        aria-label={`Morning wrap, ${count} chapters`}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {/* ── 00 · The wake ─────────────────────────────────────────────
            The photograph, the greeting, and the night's one number. Nothing
            else: the first thing a rider sees should be an image and a score,
            not a dashboard. */}
        <Chapter id="wake" title="Your morning" plate={<MorningPlate photoUrl={COVER_PHOTO.resting} kind="open" />}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16 }}>
            <Kicker tone="mid" onPhoto>{isPresent(m.dateLabel) ? m.dateLabel.value : '—'}</Kicker>
            {/* The streak is the one piece of pure reward on the screen and it
                was set as a plain label, indistinguishable from the date beside
                it. A pill gives it a body, so the thing worth being pleased
                about looks like something rather than like metadata. */}
            {isPresent(m.streakDays) && (
              <span
                data-testid="streak-pill"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--st-a16)', border: '1px solid var(--st-a40)',
                  boxShadow: 'var(--e-label-shadow)',
                }}
              >
                <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--st-active)' }}>
                  {m.streakDays.value}
                </span>
                <Kicker tone="accent">days in a row</Kicker>
              </span>
            )}
          </div>

          <Spacer />

          <h1 style={{
            fontFamily: 'var(--e-display)', fontSize: 'var(--t-hero)', fontWeight: 800,
            lineHeight: 1.02, letterSpacing: '-0.04em', color: 'var(--e-ink)', margin: 0,
            whiteSpace: 'pre-line', textShadow: 'var(--e-label-shadow)',
          }}>
            {isPresent(m.greeting) ? m.greeting.value : ''}
          </h1>

          <div style={{ height: 26 }} />

          {isPresent(m.sleepScore) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                <BigNumeral size={112}>{shownSleep ?? m.sleepScore.value.score}</BigNumeral>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10 }}>
                  <Kicker tone="mid" onPhoto>Sleep</Kicker>
                  <Kicker onPhoto>out of 100</Kicker>
                </span>
              </div>
              <Kicker tone="accent" onPhoto>{m.sleepScore.value.context}</Kicker>
            </div>
          ) : (
            <Withheld reason={m.sleepScore.missing} />
          )}
        </Chapter>

        {/* ── 01 · The call ─────────────────────────────────────────────
            One flick from the photograph. Readiness is the day's one number,
            so it gets the numeral; the claim gets Statement's weight; the
            prescription is the only accent-filled surface, because it is the
            only thing on this chapter a rider has to DO. */}
        <Chapter id="call" title="Your call">
          <div style={{ paddingTop: 16 }}>
            <SecHead index="01" title="Your call" chip={isPresent(m.call) ? m.call.value.agree : undefined} />
          </div>

          {!isPresent(m.brief) ? (
            <div style={{ paddingTop: 20 }}><Withheld testId="brief-missing" reason={m.brief.missing} /></div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '22px 0 2px' }}>
              <BigNumeral size={92}>{shownReadiness ?? m.brief.value.readiness.value}</BigNumeral>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <Kicker tone="mid">Readiness</Kicker>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-label)', fontWeight: 800, color: 'var(--st-active)' }}>
                    {m.brief.value.readiness.delta}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--e-quiet)' }}>
                  {m.brief.value.readiness.band}
                </span>
              </span>
            </div>
          )}

          {isPresent(m.call) ? (
            <div data-testid="the-call" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Claim claim={{ value: m.call.value.claim }} />
              <Prose>{m.call.value.reason}</Prose>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
                padding: '13px 16px', borderRadius: 14,
                background: 'var(--st-a12)', border: '1px solid var(--st-a28)',
              }}>
                <span style={{ color: 'var(--st-active)', fontSize: 'var(--t-label)' }}>→</span>
                <span style={{
                  fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800,
                  letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--st-active)',
                }}>
                  {m.call.value.prescription}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ paddingTop: 18 }}><Withheld reason={m.call.missing} /></div>
          )}

          {/* The rule closes the argument BEFORE the evidence. With no evidence
              to close it off from, it is a line pointing at an empty page —
              rendered against the no-data fixture, that is exactly how it read. */}
          <Rule when={isPresent(m.brief)} />
          <Spacer />

          {/* Naming the bottom block is what stops the space above it reading
              as a hole: a labelled footer is composition, an unlabelled one
              floating at the bottom of the screen is a layout accident. */}
          {isPresent(m.brief) && (
            <div style={{ paddingBottom: 10 }}><Kicker>The four numbers behind it</Kicker></div>
          )}
          {isPresent(m.brief) && (
            <div style={{ paddingBottom: 6 }}>
              <MetricTiles tiles={m.brief.value.tiles.slice(0, 4)} />
            </div>
          )}
        </Chapter>

        {/* ── 02 · The night ────────────────────────────────────────────
            The evidence begins. A hypnogram given a whole chapter can finally
            be read at a size where the shape of the night is the point. */}
        <Chapter id="night" title="Your night">
          <div style={{ paddingTop: 16 }}>
            <SecHead
              index="02"
              title="Your night"
              sub={isPresent(m.sleepWindow) ? `${m.sleepWindow.value.lightsOut[0]} → ${m.sleepWindow.value.awake[0]}` : undefined}
            />
          </div>
          <Claim claim={m.nightClaim} />
          <Rule when={isPresent(m.stages)} />

          <Spacer />

          <Hypnogram
            stages={m.stages}
            segments={m.hypnogram}
            height={180}
            startTime={isPresent(m.sleepWindow) ? m.sleepWindow.value.lightsOut[0] : undefined}
          />

          {isPresent(m.sleepWindow) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 26, paddingBottom: 6 }}>
              {([m.sleepWindow.value.lightsOut, m.sleepWindow.value.asleep, m.sleepWindow.value.awake] as const).map(([time, label], i) => (
                <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end' }}>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800, letterSpacing: '-0.02em', color: i === 1 ? 'var(--st-active)' : 'var(--e-ink)' }}>{time}</span>
                  <Kicker>{label}</Kicker>
                </span>
              ))}
            </div>
          )}
        </Chapter>

        {/* ── 03 · The signals ──────────────────────────────────────────
            Each reading judged against the athlete's OWN band, never a
            population norm — the band is the claim. */}
        <Chapter id="signals" title="Your signals">
          <div style={{ paddingTop: 16 }}>
            <SecHead index="03" title="Your signals" chip="Vs your own band" />
          </div>
          <Claim claim={m.signalsClaim} showReason={false} />
          <Rule when={signalCount > 0} />

          <Spacer />

          <div>
            {m.signals.map((s, i) => <SignalRow key={i} signal={s} index={i} />)}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 6 }}>
              <Kicker>← Lower</Kicker><Kicker>Your usual range</Kicker><Kicker>Higher →</Kicker>
            </div>
          </div>
        </Chapter>

        {/* ── 04 · Where you stand ──────────────────────────────────────
            Fitness above the midline, fatigue below it: the gap IS form, so
            the chart draws the subtraction the three numerals then state. */}
        <Chapter id="stand" title="Where you stand">
          <div style={{ paddingTop: 16 }}>
            <SecHead index="04" title="Where you stand" />
          </div>
          <Claim claim={m.standClaim} />
          {isPresent(m.standBody) && <Prose>{m.standBody.value}</Prose>}
          <Rule when={isPresent(m.form)} />

          <Spacer />

          {!isPresent(m.form) ? (
            <div style={{ paddingBottom: 6 }}><Withheld reason={m.form.missing} /></div>
          ) : (
            <FormBlock form={m.form.value} />
          )}
        </Chapter>

        {/* ── 05 · Today ────────────────────────────────────────────────
            The assignment, with tomorrow folded in at the foot: on a rest day
            "what today is buying" is the reason the assignment is nothing. */}
        <Chapter id="today" title="Your day">
          <div style={{ paddingTop: 16 }}>
            <SecHead index="05" title="Your day" chip="Rest day" />
          </div>
          <Claim claim={m.todayClaim} />

          <div style={{ height: 6 }} />
          <DayTimeline tasks={m.tasks} />

          <Spacer />

          {isPresent(m.tomorrow) && (
            <div style={{
              padding: 16, borderRadius: 16, marginBottom: 6,
              background: 'var(--e-glass)', border: '1px solid var(--e-rule)',
              display: 'flex', flexDirection: 'column', gap: 9,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Kicker tone="accent">Tomorrow · {m.tomorrow.value.when}</Kicker>
                <Kicker>{m.tomorrow.value.away}</Kicker>
              </div>
              <p style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--e-ink)', margin: 0 }}>
                {m.tomorrow.value.title}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Kicker>{m.tomorrow.value.cost}</Kicker>
                <Kicker>What today is buying you</Kicker>
              </div>
            </div>
          )}
        </Chapter>

        {/* ── 06 · The close ────────────────────────────────────────────
            Peak-end. The quote plate is no longer an interruption halfway
            down a scroll — it IS the ending, and the CTA is the only
            saturated surface in the whole deck. */}
        <Chapter id="close" title="Before you go" plate={<MorningPlate photoUrl={QUOTE_PHOTO.resting} kind="close" />}>
          {isPresent(m.quote) && (
            <div style={{ paddingTop: 20 }}>
              <div style={{ width: 34, height: 2, background: 'var(--st-active)', marginBottom: 14 }} />
              <p style={{
                margin: 0, fontFamily: 'var(--e-display)', fontSize: 'var(--t-title)', fontWeight: 800,
                letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--e-ink)', textShadow: 'var(--e-label-shadow)',
              }}>
                {m.quote.value.text}
              </p>
              <div style={{ marginTop: 12 }}><Kicker tone="mid" onPhoto>{m.quote.value.attribution}</Kicker></div>
            </div>
          )}

          <Spacer />

          {isPresent(m.close) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 6 }}>
              <Kicker tone="accent">{m.close.value.kicker}</Kicker>
              <p style={{
                fontFamily: 'var(--e-display)', fontSize: 'var(--t-lead)', fontWeight: 800,
                lineHeight: 1.16, letterSpacing: '-0.03em', color: 'var(--e-ink)', margin: 0,
              }}>
                {m.close.value.claim}
              </p>
              <Prose>{m.close.value.body}</Prose>
              <button
                type="button"
                data-testid="morning-cta"
                style={{
                  marginTop: 6, width: '100%', height: 56, borderRadius: 'var(--radius-pill)', border: 'none',
                  background: 'var(--st-active)', color: 'var(--e-on-accent)',
                  fontFamily: 'var(--e-display)', fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '0.02em',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', cursor: 'pointer',
                  boxShadow: `0 10px 34px color-mix(in srgb, var(--st-active) 26%, transparent)`,
                  transition: prefersReducedMotion() ? undefined : `box-shadow 300ms ${MOTION_EASE}`,
                }}
              >
                <span>{m.close.value.cta}</span><span>→</span>
              </button>
            </div>
          )}
        </Chapter>
      </div>

      <ChapterRail labels={LABELS} index={index} onSelect={goTo} />
      {peek && <PeekStrip peek={peek} onAdvance={() => goTo(index + 1)} />}
    </div>
  )
}
