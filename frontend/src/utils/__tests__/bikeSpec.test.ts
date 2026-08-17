import { describe, expect, it } from 'vitest'
import { parseBikeSpec } from '../bikeSpec'

/**
 * The spec sheet must only ever show what the vision pass actually wrote. These
 * lock the two halves of that promise: real structure is split correctly, and
 * anything unstructured falls back to `[]` (the caller then prints the prose)
 * rather than being forced into rows.
 */

// The shape the backend prompt asks for, as a model typically returns it.
const MARKDOWN = `**1. Frame:** Compact endurance geometry with round steel tubes, gloss British racing green with cream head tube.
**2. Cockpit:** Shallow-drop aluminium drop bars with black cork tape and a quill stem.
**3. Wheels:** Low-profile 24mm silver box-section rims, polished hubs, tan-wall 28c tyres.
**4. Components:** Black leather saddle, silver caged pedals, downtube shifters.`

describe('parseBikeSpec', () => {
  it('splits the four sections the analysis prompt asks for', () => {
    const rows = parseBikeSpec(MARKDOWN)
    expect(rows.map((r) => r.key)).toEqual(['frame', 'cockpit', 'wheels', 'components'])
    expect(rows[0].value).toBe(
      'Compact endurance geometry with round steel tubes, gloss British racing green with cream head tube',
    )
    expect(rows[3].value).toBe('Black leather saddle, silver caged pedals, downtube shifters')
  })

  it('keeps every value the model wrote, verbatim', () => {
    for (const row of parseBikeSpec(MARKDOWN)) {
      expect(MARKDOWN.replace(/\*\*/g, '')).toContain(row.value)
    }
  })

  it('handles a single-paragraph answer with parentheticals', () => {
    const rows = parseBikeSpec(
      '1. Frame (geometry, tube shapes, primary/secondary colors): aggressive aero road ' +
      'geometry, matte teal. 2. Cockpit (handlebar type, tape color): drop bars, lime tape. ' +
      '3. Wheels (rim depth, rim color): 50mm deep-section black carbon. ' +
      '4. Components (saddle color, pedals): black saddle, silver clipless pedals.',
    )
    expect(rows).toHaveLength(4)
    expect(rows[1].value).toBe('drop bars, lime tape')
    expect(rows[2].value).toBe('50mm deep-section black carbon')
  })

  it('recognises headings written as a bulleted list', () => {
    const rows = parseBikeSpec(
      '- Frame: steel, black\n- Handlebars: flat bar\n- Wheelset: 700c, silver\n- Drivetrain: 1x11',
    )
    expect(rows.map((r) => r.label)).toEqual(['Rahmen', 'Cockpit', 'Laufräder', 'Komponenten'])
  })

  it('falls back to nothing when the answer is plain prose', () => {
    expect(parseBikeSpec(
      'A matte teal road bike with lime accents, deep carbon wheels and drop bars — ' +
      'clean build, one bottle cage.',
    )).toEqual([])
  })

  it('never invents a row from a passing mention', () => {
    // "wheels" appears, but only inside a sentence — no colon, no heading.
    expect(parseBikeSpec('Frame: steel. The wheels are silver.')).toEqual([])
  })

  it('lets the first mention of a section win', () => {
    const rows = parseBikeSpec(
      'Frame: steel.\nWheels: silver box-section rims.\nComponents: the wheels: are laced 3x.',
    )
    expect(rows.find((r) => r.key === 'wheels')?.value).toBe('silver box-section rims')
  })

  it('is empty for empty input', () => {
    expect(parseBikeSpec(null)).toEqual([])
    expect(parseBikeSpec('')).toEqual([])
    expect(parseBikeSpec('   ')).toEqual([])
  })
})
