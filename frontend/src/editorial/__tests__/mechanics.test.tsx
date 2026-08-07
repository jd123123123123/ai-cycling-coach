import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RuleHead from '../components/RuleHead'
import Triplet from '../components/Triplet'
import VerdictRow from '../components/VerdictRow'
import TwoWeightHead from '../components/TwoWeightHead'
import BlockStrip from '../components/BlockStrip'
import SegmentedMeter from '../components/SegmentedMeter'
import { missing, present, type Value } from '../data/value'
import { splitVerdict } from '../data/verdictSplit'

afterEach(cleanup)

describe('RuleHead (mechanic A)', () => {
  it('renders the name over a rule, with no chrome around it', () => {
    const { container } = render(<RuleHead title="DIE EINHEIT" />)
    expect(screen.getByText('DIE EINHEIT')).toBeTruthy()
    expect(container.querySelector('[data-rule-head-line]')).not.toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})

describe('Triplet (mechanic C)', () => {
  const cells: { label: string; value: Value<string>; unit: string }[] = [
    { label: 'FITNESS', value: present('30'), unit: '−2' },
    { label: 'FORM', value: present('+13'), unit: 'TSB' },
    { label: 'BELASTUNG', value: missing<string>('Nichts geplant.'), unit: 'TSS' },
  ]

  it('renders exactly three cells between two rules', () => {
    const { container } = render(<Triplet cells={cells} />)
    expect(container.querySelectorAll('[data-triplet-cell]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-triplet-rule]')).toHaveLength(2)
  })

  it('dashes a missing cell in place and never prints its reason', () => {
    render(<Triplet cells={cells} />)
    expect(screen.getByText('—')).toBeTruthy()
    // The screen owns reason dedupe, not the band — a reason printed here
    // would be the third copy of a sentence the hero already carries.
    expect(screen.queryByText('Nichts geplant.')).toBeNull()
  })
})

describe('VerdictRow (mechanic D)', () => {
  it('carries title, qualifier and number in one row', () => {
    render(<VerdictRow title={present('5 × 3 an der Schwelle')} qualifier={present('0:52 · IF 0,74 · 11 Teile')}
      value={present(277)} unit="WATT" />)
    expect(screen.getByText('5 × 3 an der Schwelle')).toBeTruthy()
    expect(screen.getByText('0:52 · IF 0,74 · 11 Teile')).toBeTruthy()
    expect(screen.getByText('277')).toBeTruthy()
  })

  it('spends the accent only when asked to', () => {
    const plain = render(<VerdictRow title={present('T')} qualifier={present('Q')} value={present(1)} unit="W" />)
    expect(plain.container.querySelectorAll('[data-accent]')).toHaveLength(0)
    cleanup()
    const accented = render(<VerdictRow title={present('T')} qualifier={present('Q')} value={present(1)} unit="W" accent />)
    expect(accented.container.querySelectorAll('[data-accent]')).toHaveLength(1)
  })

  it('keeps the row when the number is missing rather than collapsing it', () => {
    const { container } = render(<VerdictRow title={present('T')} qualifier={missing('Kein Ziel.')}
      value={missing('Nichts geplant.')} unit="WATT" />)
    expect(container.querySelector('[data-verdict-row]')).not.toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('renders the qualifier slot with a dash when qualifier is missing', () => {
    const { container } = render(<VerdictRow title={present('Session Name')} qualifier={missing('No duration.')}
      value={present(275)} unit="WATT" />)
    // Verify the row structure is intact and qualifier slot is not collapsed
    expect(container.querySelector('[data-verdict-row]')).not.toBeNull()
    // Exactly one dash for the missing qualifier (not one for value, which is present)
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('splitVerdict', () => {
  it('splits on an em dash', () => {
    expect(splitVerdict('VO2 heute — du bist frisch')).toEqual({ lead: 'VO2 heute', emphasis: 'du bist frisch' })
  })

  it('splits on a colon', () => {
    expect(splitVerdict('Heute zählt: die letzten drei Minuten'))
      .toEqual({ lead: 'Heute zählt', emphasis: 'die letzten drei Minuten' })
  })

  it('leaves a sentence with no separator whole rather than guessing a break', () => {
    expect(splitVerdict('Ein ruhiger Tag im Grundlagenbereich'))
      .toEqual({ lead: 'Ein ruhiger Tag im Grundlagenbereich', emphasis: null })
  })

  it('splits only once, so a second dash stays inside the emphasis', () => {
    expect(splitVerdict('A — B — C')).toEqual({ lead: 'A', emphasis: 'B — C' })
  })

  it('splits at the earliest separator, whatever kind it is', () => {
    expect(splitVerdict('Heute zählt: die Sache — jetzt zählt es'))
      .toEqual({ lead: 'Heute zählt', emphasis: 'die Sache — jetzt zählt es' })
  })
})

describe('TwoWeightHead (mechanics B + K)', () => {
  it('renders both weights and accents only the emphasis', () => {
    const { container } = render(<TwoWeightHead lead="VO2 heute" emphasis="du bist frisch" />)
    expect(screen.getByText('VO2 heute')).toBeTruthy()
    expect(screen.getByText('du bist frisch')).toBeTruthy()
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(1)
  })

  it('spends no accent at all when there is no emphasis', () => {
    const { container } = render(<TwoWeightHead lead="Ein ruhiger Tag" emphasis={null} />)
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(0)
  })
})

describe('BlockStrip (mechanic G)', () => {
  const blocks = [
    { label: 'Einfahren', minutes: 20, watts: present(180), delta: null },
    { label: '5 × 3 min @ 110%', minutes: 27, watts: present(305), delta: null },
    { label: 'Aus', minutes: 10, watts: present(120), delta: null },
  ]

  it('gives each block width in proportion to its minutes', () => {
    const { container } = render(<BlockStrip blocks={blocks} />)
    const cells = Array.from(container.querySelectorAll('[data-block]')) as HTMLElement[]
    expect(cells).toHaveLength(3)
    expect(cells.map((c) => c.style.flexGrow)).toEqual(['20', '27', '10'])
  })

  it('hatches planned work and fills done work solid', () => {
    const { container } = render(<BlockStrip blocks={blocks} doneCount={1} />)
    const cells = Array.from(container.querySelectorAll('[data-block]')) as HTMLElement[]
    expect(cells[0].getAttribute('data-done')).toBe('')
    expect(cells[1].getAttribute('data-done')).toBeNull()
  })

  it('renders nothing at all rather than an empty rail when there are no blocks', () => {
    const { container } = render(<BlockStrip blocks={[]} />)
    expect(container.querySelector('[data-block-strip]')).toBeNull()
  })
})

describe('motion on the two new charts', () => {
  // The contract WeekRail already follows (motion/useReveal.ts). These
  // assertions mirror the existing chartMotion.test.tsx ones — read that
  // file and match its technique rather than inventing a second one.
  const blocks = [
    { label: 'Einfahren', minutes: 20, watts: present(180), delta: null },
    { label: '5 × 3 min @ 110%', minutes: 27, watts: present(305), delta: null },
    { label: 'Aus', minutes: 10, watts: present(120), delta: null },
  ]

  it('BlockStrip grows its blocks on first viewport entry, staggered', () => {
    const { container } = render(<BlockStrip blocks={blocks} />)
    const cells = Array.from(container.querySelectorAll('[data-block]')) as HTMLElement[]
    expect(cells.every((c) => c.style.transition.length > 0)).toBe(true)
    const delays = cells.map((c) => c.style.transitionDelay)
    expect(new Set(delays).size).toBeGreaterThan(1)
  })

  it('SegmentedMeter fills its ticks with a transition', () => {
    const { container } = render(<SegmentedMeter label="WOCHE" spent={210} planned={420} />)
    const ticks = Array.from(container.querySelectorAll('[data-tick]')) as HTMLElement[]
    expect(ticks.every((tick) => tick.style.transition.length > 0)).toBe(true)
  })
})

describe('SegmentedMeter (mechanic J)', () => {
  it('fills ticks in proportion to the budget spent', () => {
    const { container } = render(<SegmentedMeter label="WOCHE" spent={210} planned={420} segments={20} />)
    expect(container.querySelectorAll('[data-tick]')).toHaveLength(20)
    expect(container.querySelectorAll('[data-tick][data-spent]')).toHaveLength(10)
  })

  it('clamps an over-spent week to a full meter instead of overflowing it', () => {
    const { container } = render(<SegmentedMeter label="WOCHE" spent={900} planned={420} segments={20} />)
    expect(container.querySelectorAll('[data-tick][data-spent]')).toHaveLength(20)
  })
})
