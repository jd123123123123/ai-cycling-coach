import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RuleHead from '../components/RuleHead'
import Triplet from '../components/Triplet'
import VerdictRow from '../components/VerdictRow'
import TwoWeightHead from '../components/TwoWeightHead'
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
