import { describe, it, expect } from 'vitest'
import { splitLeadFigure } from '../W3CoachCard'

/**
 * The coach's job on Today is to say what the hero cannot.
 *
 * The hero shows the readiness figure and its one-word verdict on its own
 * meter. A brief that opens by restating that figure is telling the rider a
 * number they have already read; the sentence AFTER it is the one that says
 * what today's session should be.
 */

// Mirrors `coachVerdict` in W3CoachCard — exported behaviour is asserted
// through the component, this pins the rule itself.
function sentences(text: string): string[] {
  return text
    .split(/([.!?])(?=\s|$)/)
    .reduce<string[]>((acc, part, i, all) => {
      if (i % 2 === 0) {
        const joined = (part + (all[i + 1] ?? '')).trim()
        if (joined) acc.push(joined)
      }
      return acc
    }, [])
}

function coachVerdict(text: string): string {
  const parts = sentences(text)
  if (parts.length === 0) return text.trim()
  const [lead] = splitLeadFigure(parts[0])
  if (lead && parts.length > 1) return parts.slice(1).join(' ').trim()
  return parts[0]
}

describe('what the coach says', () => {
  it('DROPS A SENTENCE THAT ONLY RESTATES THE HERO', () => {
    const out = coachVerdict(
      '88 ist grünes Licht. Dein Körper verarbeitet alles, was die heutige Einheit verlangt.',
    )
    expect(out).toBe('Dein Körper verarbeitet alles, was die heutige Einheit verlangt.')
  })

  it('keeps a verdict that does not open on the figure', () => {
    const out = coachVerdict('Heute ist ein Tag zum Draufhalten. Die Beine sind da.')
    expect(out).toBe('Heute ist ein Tag zum Draufhalten.')
  })

  it('keeps the figure sentence when there is nothing else', () => {
    // Dropping it would leave the card empty, which is worse than a repeat.
    expect(coachVerdict('88 ist grünes Licht.')).toBe('88 ist grünes Licht.')
  })

  it('does not cut a line at a decimal point', () => {
    const out = coachVerdict('Schlaf 7.5 h trägt die Einheit. Fahr sie wie geplant.')
    expect(out).toBe('Schlaf 7.5 h trägt die Einheit.')
  })

  it('carries every following sentence, not just the second', () => {
    const out = coachVerdict('62 ist gelb. Halte die Intervalle kürzer. Brich ab, wenn der Puls klettert.')
    expect(out).toBe('Halte die Intervalle kürzer. Brich ab, wenn der Puls klettert.')
  })

  it('survives a brief with no punctuation at all', () => {
    expect(coachVerdict('Fahr locker')).toBe('Fahr locker')
  })

  it('survives an empty brief', () => {
    expect(coachVerdict('')).toBe('')
  })
})
