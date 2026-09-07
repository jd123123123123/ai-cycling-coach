import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import W3WeekReviewView from '../W3WeekReviewView'
import { WEEK_REVIEW_FIXTURE } from '../W3WeekReviewPreview'

/**
 * The week review is THREE screen-sized pages, and "screen-sized" is a property
 * that regresses silently: one `minHeight` or one forgotten `overflow` and the
 * page grows a scrollbar again, which is exactly the shape this screen was
 * rebuilt out of. jsdom cannot measure layout, so these pin the structural
 * facts that make the guarantee true instead.
 */

afterEach(cleanup)

const draw = () => render(<W3WeekReviewView vm={WEEK_REVIEW_FIXTURE} />)

describe('the week review is three pages', () => {
  it('renders exactly three, in order: last week, this week, the plan', () => {
    draw()
    const pages = document.querySelectorAll('section[aria-label]')
    expect([...pages].map((p) => p.getAttribute('aria-label')))
      .toEqual(['Letzte Woche', 'Diese Woche', 'Der Plan'])
  })

  it('gives each page a dot to jump to', () => {
    draw()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })
})

describe('no page can grow past the screen', () => {
  it('sizes the frame by the viewport, not by its contents', () => {
    const { container } = draw()
    const frame = container.querySelector('.w3-frame') as HTMLElement
    // `minHeight: 100dvh` is what let the old screen scroll: it is a floor, so
    // eleven sections simply pushed past it. A fixed height plus hidden
    // overflow is the whole mechanism.
    expect(frame.style.height).toBe('100dvh')
    expect(frame.style.overflow).toBe('hidden')
    expect(frame.style.minHeight).toBe('')
  })

  it('clips each page rather than letting it scroll', () => {
    draw()
    for (const page of document.querySelectorAll('section[aria-label]')) {
      expect((page as HTMLElement).style.overflow).toBe('hidden')
      expect((page as HTMLElement).style.height).toBe('100%')
    }
  })
})

describe('what each page answers', () => {
  it('page 1 is what happened: the week’s real load against its plan', () => {
    draw()
    expect(screen.getByText(WEEK_REVIEW_FIXTURE.complianceLabel)).toBeTruthy()
    expect(screen.getByText(WEEK_REVIEW_FIXTURE.verdict)).toBeTruthy()
  })

  it('page 2 is the target and the levers behind it', () => {
    draw()
    expect(screen.getByText(WEEK_REVIEW_FIXTURE.nextTssNote)).toBeTruthy()
    expect(screen.getByText('WARUM GENAU SO')).toBeTruthy()
  })

  it('page 2 leaves the ramp out of the lever grid — it is already drawn as bars', () => {
    draw()
    const ramp = WEEK_REVIEW_FIXTURE.evidence.find((e) => e.key === 'ramp')!
    expect(screen.queryByText(ramp.note)).toBeNull()
  })

  it('page 3 is the plan, and every prescribed day reaches it', () => {
    draw()
    for (const d of WEEK_REVIEW_FIXTURE.planDays) {
      expect(screen.getAllByText(d.title).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Woche starten')).toBeTruthy()
  })
})
