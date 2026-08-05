import { afterEach, describe, expect, it } from 'vitest'
import { fromNullable, isPresent, mapValue, missing, present } from '../data/value'

describe('Value<T>', () => {
  it('present carries the value', () => {
    const v = present(42)
    expect(isPresent(v)).toBe(true)
    if (isPresent(v)) expect(v.value).toBe(42)
  })

  it('missing carries the reason and is not present', () => {
    const v = missing<number>('No wearable reading since Tue.')
    expect(isPresent(v)).toBe(false)
    expect(v).toEqual({ missing: 'No wearable reading since Tue.' })
  })

  it('fromNullable turns null and undefined into missing', () => {
    expect(isPresent(fromNullable(null, 'why'))).toBe(false)
    expect(isPresent(fromNullable(undefined, 'why'))).toBe(false)
  })

  it('fromNullable keeps falsy-but-real values', () => {
    const zero = fromNullable(0, 'why')
    expect(isPresent(zero)).toBe(true)
    if (isPresent(zero)) expect(zero.value).toBe(0)
  })

  it('mapValue transforms present and passes missing through untouched', () => {
    expect(mapValue(present(2), (n) => n * 3)).toEqual({ value: 6 })
    expect(mapValue(missing<number>('r'), (n) => n * 3)).toEqual({ missing: 'r' })
  })
})
