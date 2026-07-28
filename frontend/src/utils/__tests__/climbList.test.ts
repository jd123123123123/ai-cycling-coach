import { describe, it, expect } from 'vitest'
import { gradeColor, gradeBarFrac, categoryLabel } from '../climbList'

describe('gradeColor', () => {
  it('bands gradients the way a rider feels them', () => {
    expect(gradeColor(2.5)).toBe('#38B6FF')   // a drag
    expect(gradeColor(5.4)).toBe('#16E08A')   // a climb
    expect(gradeColor(8.2)).toBe('#FFB020')   // hurts
    expect(gradeColor(12.0)).toBe('#FA1E55')  // a wall
  })

  it('is stable on the band boundaries', () => {
    expect(gradeColor(4)).toBe('#16E08A')
    expect(gradeColor(7)).toBe('#FFB020')
    expect(gradeColor(10)).toBe('#FA1E55')
  })
})

describe('gradeBarFrac', () => {
  it('scales against a 15% ceiling', () => {
    expect(gradeBarFrac(7.5)).toBeCloseTo(0.5, 6)
    expect(gradeBarFrac(15)).toBe(1)
  })

  it('treats anything above the ceiling as full — 20% and 24% both max out', () => {
    expect(gradeBarFrac(20)).toBe(1)
    expect(gradeBarFrac(24)).toBe(1)
  })

  it('keeps a shallow climb visible rather than a zero-width bar', () => {
    expect(gradeBarFrac(0.1)).toBeGreaterThan(0)
    expect(gradeBarFrac(0)).toBeGreaterThan(0)
  })
})

describe('categoryLabel', () => {
  it('renders the real categories', () => {
    expect(categoryLabel('hc')).toBe('HC')
    expect(categoryLabel('1')).toBe('Kat. 1')
    expect(categoryLabel('4')).toBe('Kat. 4')
  })

  it('shows nothing for uncategorised — "uncat" means nothing to a rider', () => {
    expect(categoryLabel('uncat')).toBeNull()
    expect(categoryLabel('none')).toBeNull()
    expect(categoryLabel('')).toBeNull()
    expect(categoryLabel(null)).toBeNull()
    expect(categoryLabel(undefined)).toBeNull()
  })
})
