import { useEffect, useRef, useState, type ReactNode } from 'react'
import RideScatter, { type Ride } from './charts/RideScatter'
import PowerCurve, { type CurvePoint } from './charts/PowerCurve'
import FitnessForm, { type PmcDay } from './charts/FitnessForm'
import Projection from './charts/Projection'
import ScrollHint from './ScrollHint'
import './archive.css'

export interface ArchiveDeckModel {
  scope: string
  period: string
  answer: { claim: string; support: string }
  openGoal: { label: string; sub: string; pct: number; right: string } | null
  wentIn: {
    hero: string; unit: string; rank: string; verdict: string
    rides: Ride[]; highlightKey: string | null
    soWhat: string; stats: [string, string][]
  }
  cameOut: {
    hero: string; unit: string; rank: string; verdict: string
    current: CurvePoint[]; previous: CurvePoint[]; highlightSeconds: number
    soWhat: string; stats: [string, string][]
  }
  cost: {
    hero: string; unit: string; rank: string; verdict: string
    days: PmcDay[]; soWhat: string; stats: [string, string][]
  }
  setsUp: {
    verdict: string
    actual: number[]; projLow: number[]; projHigh: number[]
    conditions: [string, string][]
  }
  close: { headline: string; figure: string; unit: string; footline: string; nextGoal: { label: string; right: string; sub: string; pct: number } }
  /** The pen's `Contents` block — a table of contents made of the rider's own
   *  results rather than category nouns, so the list is itself informative. */
  contents: { n: string; title: string; value: string; tone: 'ink' | 'gold' | 'cool' }[]
}

const CHAPTERS = ['The answer', 'What went in', 'What came out', 'What it cost', 'What it sets up', 'The close']

/** The rail replaces the pen's 3 px tick: it names where you are and fills as
 *  you scroll, so progress through the deck is legible without a wizard. */
function Rail({ index }: { index: number }) {
  return (
    <div
      data-testid="archive-rail"
      style={{
        position: 'fixed', top: '50%', right: 10, transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 6, zIndex: 5, pointerEvents: 'none',
      }}
    >
      {CHAPTERS.map((c, i) => (
        <span
          key={c}
          data-testid="rail-tick"
          data-active={String(i === index)}
          style={{
            width: 2, height: i === index ? 22 : 10, borderRadius: 2,
            background: i <= index ? 'var(--ar-gold)' : 'var(--ar-rule)',
            transition: 'height 260ms ease, background 260ms ease',
          }}
        />
      ))}
    </div>
  )
}

function Masthead({ scope, period }: { scope: string; period: string }) {
  const t = {
    fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-micro)', fontWeight: 700,
    letterSpacing: '0.16em', textTransform: 'uppercase' as const,
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
      <span style={{ ...t, color: 'var(--ar-quiet)' }}>{scope}</span>
      <span style={{ ...t, color: 'var(--ar-ink-2)' }}>{period}</span>
    </div>
  )
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-micro)', fontWeight: 700,
      letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ar-quiet)',
    }}>{children}</span>
  )
}

/** Rank, never a superlative. Self-determination theory: competence needs
 *  ACCURATE feedback — praise that arrives regardless of performance carries
 *  no information and displaces the rider's own reasons for riding. */
function Hero({ figure, unit, rank, tone = 'gold' }: { figure: string; unit: string; rank: string; tone?: 'gold' | 'cool' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      <span style={{
        fontFamily: 'var(--ar-num)', fontSize: 'var(--ar-t-hero)', lineHeight: 0.84,
        letterSpacing: '-0.02em', color: tone === 'gold' ? 'var(--ar-gold)' : 'var(--ar-cool)',
      }}>{figure}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 9 }}>
        <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ar-ink-2)' }}>{unit}</span>
        <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 500, color: 'var(--ar-quiet)' }}>{rank}</span>
      </span>
    </div>
  )
}

function Verdict({ children, size = 23 }: { children: ReactNode; size?: number }) {
  return (
    <p style={{
      fontFamily: 'var(--ar-serif)', fontSize: size, fontWeight: 400, lineHeight: 1.14,
      letterSpacing: '-0.01em', color: 'var(--ar-ink)', margin: 0,
    }}>{children}</p>
  )
}

/** The coaching line, in the cool hue so insight reads differently from
 *  achievement. This is the sentence the whole deck exists to earn. */
function SoWhat({ children }: { children: ReactNode }) {
  return (
    <div data-testid="so-what" style={{ display: 'flex', gap: 11, paddingTop: 13, borderTop: '1px solid var(--ar-rule)' }}>
      <span style={{ width: 2, alignSelf: 'stretch', borderRadius: 1, background: 'var(--ar-cool)', flexShrink: 0 }} />
      <p style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-body)', fontWeight: 500, lineHeight: 1.45, color: 'var(--ar-cool)', margin: 0 }}>{children}</p>
    </div>
  )
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex' }}>
      {items.map(([v, l]) => (
        <span key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-lead)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ar-ink)' }}>{v}</span>
          <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 600, color: 'var(--ar-quiet)' }}>{l}</span>
        </span>
      ))}
    </div>
  )
}

/** Goal gradient (Kivetz et al. 2006): effort measurably accelerates as a
 *  reward nears. An open, near, still-winnable target is the best-evidenced
 *  mechanic available — and it must never reset to zero (endowed progress). */
function GoalBar({ label, right, sub, pct }: { label: string; right: string; sub: string; pct: number }) {
  return (
    <div data-testid="goal-bar" style={{
      display: 'flex', flexDirection: 'column', gap: 9, padding: 15, borderRadius: 14,
      background: 'var(--ar-gold-ghost)', border: '1px solid var(--ar-gold-dim)',
    }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-micro)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ar-gold)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-micro)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ar-quiet)', flexShrink: 0 }}>{right}</span>
      </span>
      <span style={{ height: 8, borderRadius: 4, background: 'var(--ar-rule)', overflow: 'hidden', display: 'block' }}>
        <span style={{ display: 'block', height: 8, width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 4, background: 'var(--ar-gold)' }} />
      </span>
      <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 500, color: 'var(--ar-ink-2)' }}>{sub}</span>
    </div>
  )
}

/** The pen's `Contents` rows: 12px vertical padding, 1px top rule, Anton
 *  numeral, 13.5px title over a 21px result. */
function Contents({ rows }: { rows: ArchiveDeckModel['contents'] }) {
  const tone = { ink: 'var(--ar-ink)', gold: 'var(--ar-gold)', cool: 'var(--ar-cool)' }
  return (
    <div data-testid="archive-contents" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {rows.map((r) => (
        <span key={r.n} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--ar-rule)' }}>
          <span style={{ fontFamily: 'var(--ar-num)', fontSize: 16.5, color: 'var(--ar-quiet)' }}>{r.n}</span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 600, letterSpacing: '0.2px', color: 'var(--ar-quiet)' }}>{r.title}</span>
            <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-lead)', fontWeight: 600, letterSpacing: '-0.3px', color: tone[r.tone] }}>{r.value}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

function Chapter({ children, hint, dim }: { children: ReactNode; hint?: string; dim?: boolean }) {
  return (
    <section className="archive-chapter" data-testid="archive-chapter">
      <div className="ar-wrap" style={{ paddingTop: 22 }}>{children}</div>
      <div style={{ flex: 1, minHeight: 12 }} />
      {hint && <div style={{ paddingBottom: 22, display: 'flex', justifyContent: 'center' }}><ScrollHint label={hint} dim={dim} /></div>}
    </section>
  )
}

export default function ArchiveDeckView({ model }: { model: ArchiveDeckModel }) {
  const deckRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const el = deckRef.current
    if (!el) return
    const onScroll = () => setIndex(Math.round(el.scrollTop / Math.max(el.clientHeight, 1)))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const m = model
  const head = (kicker: string) => (
    <>
      <Masthead scope={m.scope} period={m.period} />
      <Kicker>{kicker}</Kicker>
    </>
  )

  return (
    <div className="archive-root">
      <Rail index={index} />
      <div className="archive-deck" ref={deckRef} data-testid="archive-deck">

        {/* 00 — the pyramid apex: the answer BEFORE any evidence */}
        <Chapter hint="Scroll · what went in" dim={index !== 0}>
          {head('The answer')}
          <Verdict size={34}>{m.answer.claim}</Verdict>
          <p style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-body)', lineHeight: 1.5, color: 'var(--ar-ink-2)', margin: 0 }}>{m.answer.support}</p>
          <Contents rows={m.contents} />
          {m.openGoal && (<><div style={{ height: 22 }} /><GoalBar {...m.openGoal} /></>)}
        </Chapter>

        {/* 01 — MECE: what went in */}
        <Chapter hint="Scroll · what came out" dim={index !== 1}>
          {head('What went in')}
          <Hero figure={m.wentIn.hero} unit={m.wentIn.unit} rank={m.wentIn.rank} />
          <Verdict>{m.wentIn.verdict}</Verdict>
          <span style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
            <Kicker>Every ride</Kicker><Kicker>Size = load</Kicker>
          </span>
          <RideScatter rides={m.wentIn.rides} highlightKey={m.wentIn.highlightKey} />
          <SoWhat>{m.wentIn.soWhat}</SoWhat>
          <Stats items={m.wentIn.stats} />
        </Chapter>

        {/* 02 — what came out */}
        <Chapter hint="Scroll · what it cost" dim={index !== 2}>
          {head('What came out')}
          <Hero figure={m.cameOut.hero} unit={m.cameOut.unit} rank={m.cameOut.rank} />
          <Verdict>{m.cameOut.verdict}</Verdict>
          <span style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
            <Kicker>Your power curve</Kicker>
            <span style={{ display: 'flex', gap: 12 }}>
              {([['var(--ar-gold)', 'Now'], ['var(--ar-cool)', 'Before']] as const).map(([c, t]) => (
                <span key={t} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ width: 9, height: 2.5, borderRadius: 2, background: c }} />
                  <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ar-quiet)' }}>{t}</span>
                </span>
              ))}
            </span>
          </span>
          <PowerCurve current={m.cameOut.current} previous={m.cameOut.previous} highlightSeconds={m.cameOut.highlightSeconds} />
          <SoWhat>{m.cameOut.soWhat}</SoWhat>
          <Stats items={m.cameOut.stats} />
        </Chapter>

        {/* 03 — the honest chapter the old deck had no room for */}
        <Chapter hint="Scroll · what it sets up" dim={index !== 3}>
          {head('What it cost')}
          <Hero figure={m.cost.hero} unit={m.cost.unit} rank={m.cost.rank} tone="cool" />
          <Verdict>{m.cost.verdict}</Verdict>
          <span style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
            <Kicker>Fitness and form</Kicker>
          </span>
          <FitnessForm days={m.cost.days} />
          <SoWhat>{m.cost.soWhat}</SoWhat>
          <Stats items={m.cost.stats} />
        </Chapter>

        {/* 04 — the decision. History writes the plan; no competitor owns both. */}
        <Chapter hint="Scroll · the close" dim={index !== 4}>
          {head('What it sets up')}
          <Verdict size={28}>{m.setsUp.verdict}</Verdict>
          <Kicker>Projected</Kicker>
          <Projection actual={m.setsUp.actual} projLow={m.setsUp.projLow} projHigh={m.setsUp.projHigh} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 15, borderRadius: 14, background: 'var(--ar-lift)' }}>
            <Kicker>This holds if</Kicker>
            {m.setsUp.conditions.map(([k, v]) => (
              <span key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 600, color: 'var(--ar-ink)' }}>{k}</span>
                <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 'var(--ar-t-label)', fontWeight: 500, color: 'var(--ar-quiet)', flexShrink: 0 }}>{v}</span>
              </span>
            ))}
          </div>
        </Chapter>

        {/* 05 — peak–end: retrospective judgement is dominated by the ending */}
        <Chapter>
          {head(m.close.headline)}
          <div data-testid="share-card" style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--ar-lift)', border: '1px solid var(--ar-rule)' }}>
            <div style={{ padding: '20px 20px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ar-quiet)' }}>{m.period}</span>
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
                <span style={{ fontFamily: 'var(--ar-num)', fontSize: 68, lineHeight: 0.84, color: 'var(--ar-gold)' }}>{m.close.figure}</span>
                <span style={{ fontFamily: 'var(--ar-sans)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ar-ink-2)', paddingBottom: 6 }}>{m.close.unit}</span>
              </span>
              <Verdict size={21}>{m.close.footline}</Verdict>
            </div>
            <RideScatter rides={m.wentIn.rides} highlightKey={m.wentIn.highlightKey} height={104} interactive={false} />
          </div>
          <GoalBar {...m.close.nextGoal} />
        </Chapter>

      </div>
    </div>
  )
}
