import Cover from '../components/Cover'
import SecHead from '../components/SecHead'
import Statement from '../components/Statement'
import QuotePlate from '../components/QuotePlate'
import Hypnogram, { type SleepStage } from '../components/Hypnogram'
import SignalRow, { type SignalReading } from '../components/SignalRow'
import DayTimeline, { type DayTask } from '../components/DayTimeline'
import { COVER_PHOTO, QUOTE_PHOTO } from '../components/plateImagery'
import { isPresent, type Value } from '../data/value'

/**
 * Flagship · Morning Wrap (pen frame `iV2fb`).
 *
 * The screen a rider meets before the day starts, on a day the plan asks for
 * nothing. Its whole argument is: the night went well, four signals agree, and
 * the correct move is to spend none of it.
 *
 * The order is deliberate and is the pen's: what happened (the night) → what it
 * means (where you stand) → what to do (today) → what it buys (tomorrow). The
 * verdict arrives in the Brief Strip near the top rather than at the end,
 * because a rider checking their phone at 06:32 should not have to scroll
 * 5 000 px to learn they are meant to rest.
 */
export interface MorningWrapModel {
  dateLabel: Value<string>
  streakDays: Value<number>
  greeting: Value<string>
  sleepScore: Value<{ score: number; context: string }>
  sleepWindow: Value<{ lightsOut: [string, string]; asleep: [string, string]; awake: [string, string] }>
  stages: Value<SleepStage[]>
  hypnogram: Value<{ stage: SleepStage['key']; minutes: number }[]>
  nightClaim: Value<string>

  brief: Value<{
    readiness: { value: number; delta: string; band: string }
    tiles: { label: string; value: string; unit?: string; sub: string; tone?: 'accent' | 'ink' }[]
  }>
  call: Value<{ agree: string; claim: string; reason: string; prescription: string }>

  signalsClaim: Value<string>
  signals: Value<SignalReading>[]

  standClaim: Value<string>
  standBody: Value<string>
  form: Value<{ fitness: number; fatigue: number; form: number; note: string; series: { ctl: number; atl: number }[] }>

  todayClaim: Value<string>
  todayBody: Value<string>
  tasks: Value<DayTask[]>

  tomorrow: Value<{ when: string; away: string; title: string; cost: string }>
  close: Value<{ kicker: string; claim: string; body: string; cta: string }>
  quote: Value<{ text: string; attribution: string }>
}

const PAD = { padding: '0 24px' }

function Kicker({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'quiet' | 'accent' }) {
  return (
    <span style={{
      fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: tone === 'accent' ? 'var(--st-active)' : 'var(--e-quiet)',
    }}>{children}</span>
  )
}

/** Fitness above the line, fatigue below it — the gap between them IS form, so
 *  the chart shows the subtraction rather than asking for it. */
function FormChart({ series, height = 132 }: { series: { ctl: number; atl: number }[]; height?: number }) {
  if (series.length < 2) return null
  const W = 342
  const max = Math.max(...series.flatMap((d) => [d.ctl, d.atl])) * 1.1
  const mid = height / 2
  const w = W / series.length

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="var(--e-rule)" strokeWidth={1} />
      {series.map((d, i) => {
        const last = i === series.length - 1
        const ch = (d.ctl / max) * (mid - 6)
        const ah = (d.atl / max) * (mid - 6)
        return (
          <g key={i}>
            <rect x={i * w} y={mid - ch} width={Math.max(w - 1.5, 1)} height={ch} fill={last ? 'var(--st-active)' : 'var(--d-2)'} />
            <rect x={i * w} y={mid} width={Math.max(w - 1.5, 1)} height={ah} fill={last ? 'var(--st-a40)' : 'var(--d-1)'} />
          </g>
        )
      })}
    </svg>
  )
}

export default function MorningWrapView({ model }: { model: MorningWrapModel }) {
  const m = model

  return (
    <main data-day-state="resting" data-morning-wrap style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Cover: the night's verdict, over the photograph ─────────── */}
      <Cover state="resting" photoUrl={COVER_PHOTO.resting}>
        <div style={{ ...PAD, display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Kicker>{isPresent(m.dateLabel) ? m.dateLabel.value : '—'}</Kicker>
            {isPresent(m.streakDays) && <Kicker tone="accent">{m.streakDays.value} days</Kicker>}
          </div>

          <h1 style={{ fontFamily: 'var(--e-display)', fontSize: 30, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: 'var(--e-ink)', margin: 0 }}>
            {isPresent(m.greeting) ? m.greeting.value : ''}
          </h1>

          {isPresent(m.sleepScore) ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <span style={{ fontFamily: 'var(--e-display)', fontSize: 88, fontWeight: 800, lineHeight: 0.8, letterSpacing: '-0.05em', color: 'var(--st-active)' }}>
                {m.sleepScore.value.score}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 8 }}>
                <Kicker>Sleep</Kicker>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', color: 'var(--e-quiet)' }}>out of 100</span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--st-active)' }}>
                  {m.sleepScore.value.context}
                </span>
              </span>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', color: 'var(--e-quiet)', margin: 0 }}>{m.sleepScore.missing}</p>
          )}

          <Hypnogram stages={m.stages} segments={m.hypnogram} height={72} />

          {isPresent(m.sleepWindow) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
              {([m.sleepWindow.value.lightsOut, m.sleepWindow.value.asleep, m.sleepWindow.value.awake] as const).map(([time, label], i) => (
                <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end' }}>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--e-ink)' }}>{time}</span>
                  <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--e-quiet)' }}>{label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </Cover>

      {/* ── Brief Strip (lifted above the night's detail: the verdict is
          what a rider came for at 06:32): the verdict, before any evidence ───────────── */}
      <section style={{ ...PAD, paddingBottom: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 }}>
          <Kicker>This morning's brief</Kicker>
          <Kicker>Body · Training · Today</Kicker>
        </div>

        {/* THE CALL — the one instruction, given early and stated plainly.
            Withheld, it still says why: silence would read as "no view", when
            the truth is "not enough to have one yet". */}
        {!isPresent(m.call) && (
          <p style={{ marginTop: 14, fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-quiet)' }}>
            {m.call.missing}
          </p>
        )}
        {isPresent(m.call) && (
          <div data-testid="the-call" style={{ marginTop: 14, padding: 17, borderRadius: 16, background: 'var(--st-a07)', border: '1px solid var(--st-a28)', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Kicker tone="accent">The call · model read</Kicker>
              <Kicker>{m.call.value.agree}</Kicker>
            </div>
            <p style={{ fontFamily: 'var(--e-display)', fontSize: 23, fontWeight: 700, lineHeight: 1.14, letterSpacing: '-0.02em', color: 'var(--e-ink)', margin: 0 }}>
              {m.call.value.claim}
            </p>
            <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-mid)', margin: 0 }}>
              {m.call.value.reason}
            </p>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 3 }}>
              <span style={{ color: 'var(--st-active)', fontSize: 14 }}>→</span>
              <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--st-active)' }}>
                {m.call.value.prescription}
              </span>
            </span>
          </div>
        )}

        <div style={{ height: 14 }} />
        {!isPresent(m.brief) && (
          <p data-testid="brief-missing" style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-quiet)', margin: 0 }}>
            {m.brief.missing}
          </p>
        )}
        {isPresent(m.brief) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Readiness is the day's one number, so it takes the full width
                rather than competing inside a grid cell. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 16px', borderRadius: 16, background: 'var(--e-glass)', border: '1px solid var(--e-rule)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Kicker tone="accent">Readiness</Kicker>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--e-quiet)' }}>
                  {m.brief.value.readiness.band}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ fontFamily: 'var(--e-display)', fontSize: 46, fontWeight: 800, lineHeight: 0.86, letterSpacing: '-0.04em', color: 'var(--st-active)' }}>
                  {m.brief.value.readiness.value}
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-label)', fontWeight: 800, color: 'var(--e-mid)', paddingBottom: 4 }}>
                  {m.brief.value.readiness.delta}
                </span>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {m.brief.value.tiles.slice(0, 4).map((t) => (
              <div key={t.label} style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 14, borderRadius: 16, background: 'var(--e-glass)', border: '1px solid var(--e-rule)' }}>
                <Kicker>{t.label}</Kicker>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--e-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: t.tone === 'accent' ? 'var(--st-active)' : 'var(--e-ink)' }}>{t.value}</span>
                  {t.unit && <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', color: 'var(--e-quiet)' }}>{t.unit}</span>}
                </span>
                <span style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-micro)', color: 'var(--e-quiet)' }}>{t.sub}</span>
              </div>
            ))}
            </div>
          </div>
        )}

      </section>

      {/* ── 01 The Night: four signals against the rider's own range ── */}
      <section data-section="01" style={{ ...PAD, paddingBottom: 26 }}>
        <SecHead index="01" title="The Night" sub={isPresent(m.sleepWindow) ? `${m.sleepWindow.value.lightsOut[0]} → ${m.sleepWindow.value.awake[0]}` : undefined} />
        <div style={{ height: 12 }} />
        <Statement claim={m.nightClaim} />
        <div style={{ height: 14 }} />
        <Statement claim={m.signalsClaim} showReason={false} />
        <div style={{ height: 8 }} />
        {m.signals.map((s, i) => <SignalRow key={i} signal={s} index={i} />)}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14 }}>
          <Kicker>← Lower</Kicker><Kicker>Your usual range</Kicker><Kicker>Higher →</Kicker>
        </div>
      </section>

      <QuotePlate state="resting" quote={isPresent(m.quote) ? m.quote.value.text : ''} attribution={isPresent(m.quote) ? m.quote.value.attribution : ''} photoUrl={QUOTE_PHOTO.resting} />

      {/* ── 02 Where You Stand ──────────────────────────────────────── */}
      <section data-section="02" style={{ ...PAD, paddingTop: 34, paddingBottom: 26 }}>
        <SecHead index="02" title="Where You Stand" />
        <div style={{ height: 12 }} />
        <Statement claim={m.standClaim} />
        <div style={{ height: 12 }} />
        {isPresent(m.standBody) && (
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.5, color: 'var(--e-mid)', margin: 0 }}>{m.standBody.value}</p>
        )}
        <div style={{ height: 16 }} />
        {!isPresent(m.form) && (
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-quiet)', margin: 0 }}>{m.form.missing}</p>
        )}
        {isPresent(m.form) && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10 }}>
              <Kicker>The last 42 days</Kicker>
              <Kicker>Fitness above · fatigue below</Kicker>
            </div>
            <FormChart series={m.form.value.series} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, paddingTop: 20 }}>
              {([['fitness', m.form.value.fitness, '−'], ['fatigue', m.form.value.fatigue, '='], ['form', m.form.value.form, null]] as const).map(([label, v, op]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--e-display)', fontSize: label === 'form' ? 40 : 30, fontWeight: 800, lineHeight: 0.9, letterSpacing: '-0.04em', color: label === 'form' ? 'var(--st-active)' : 'var(--e-ink)' }}>
                      {label === 'form' && v > 0 ? `+${v}` : v}
                    </span>
                    <Kicker>{label}</Kicker>
                  </span>
                  {op && <span style={{ fontFamily: 'var(--e-display)', fontSize: 19, color: 'var(--e-lo)', paddingBottom: 16 }}>{op}</span>}
                </span>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.45, color: 'var(--e-mid)', margin: '16px 0 0' }}>{m.form.value.note}</p>
          </>
        )}
      </section>

      {/* ── 03 Today: the assignment ────────────────────────────────── */}
      <section data-section="03" style={{ ...PAD, paddingBottom: 26 }}>
        <SecHead index="03" title="Today" chip="Rest day · nothing planned" />
        <div style={{ height: 12 }} />
        <Statement claim={m.todayClaim} />
        <div style={{ height: 12 }} />
        {isPresent(m.todayBody) && (
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.5, color: 'var(--e-mid)', margin: '0 0 8px' }}>{m.todayBody.value}</p>
        )}
        <DayTimeline tasks={m.tasks} />
      </section>

      {/* ── Tomorrow: what today is buying ──────────────────────────── */}
      {isPresent(m.tomorrow) && (
        <section style={{ ...PAD, paddingBottom: 26 }}>
          <div style={{ padding: 18, borderRadius: 18, background: 'var(--e-glass)', border: '1px solid var(--e-rule)', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Kicker tone="accent">Tomorrow · {m.tomorrow.value.when}</Kicker>
              <Kicker>{m.tomorrow.value.away}</Kicker>
            </div>
            <p style={{ fontFamily: 'var(--e-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--e-ink)', margin: 0 }}>
              {m.tomorrow.value.title}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Kicker>{m.tomorrow.value.cost}</Kicker>
              <Kicker>What today is buying</Kicker>
            </div>
          </div>
        </section>
      )}

      {/* ── Close: peak–end. The last thing read is what is remembered. */}
      {isPresent(m.close) && (
        <section style={{ ...PAD, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Kicker>{m.close.value.kicker}</Kicker>
          <p style={{ fontFamily: 'var(--e-display)', fontSize: 23, fontWeight: 800, lineHeight: 1.14, letterSpacing: '-0.03em', color: 'var(--e-ink)', margin: 0 }}>
            {m.close.value.claim}
          </p>
          <p style={{ fontFamily: 'var(--e-body)', fontSize: 'var(--t-body)', lineHeight: 1.5, color: 'var(--e-mid)', margin: 0 }}>
            {m.close.value.body}
          </p>
          <button
            type="button"
            data-testid="morning-cta"
            style={{
              marginTop: 6, width: '100%', height: 56, borderRadius: 'var(--radius-pill)', border: 'none',
              background: 'var(--st-active)', color: 'var(--e-ground)',
              fontFamily: 'var(--e-display)', fontSize: 15, fontWeight: 800, letterSpacing: '0.02em',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', cursor: 'pointer',
            }}
          >
            <span>{m.close.value.cta}</span><span>→</span>
          </button>
        </section>
      )}
    </main>
  )
}
