import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { useGroundColour } from '../w3/useGroundColour'

/**
 * The rule this hook exists to keep: the page continues in the colour the
 * picture ends in, and NEVER breaks when it cannot read one.
 */

function stubImage(behaviour: 'load' | 'error') {
  class Stub {
    naturalWidth = 100
    naturalHeight = 100
    decoding = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_v: string) {
      queueMicrotask(() => (behaviour === 'load' ? this.onload?.() : this.onerror?.()))
    }
  }
  vi.stubGlobal('Image', Stub as unknown as typeof Image)
}

function stubCanvas(pixel: [number, number, number] | 'throw') {
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag)
    return {
      width: 0, height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => {
          if (pixel === 'throw') throw new Error('tainted')
          return { data: [...pixel, 255] }
        },
      }),
    } as unknown as HTMLElement
  }) as typeof document.createElement)
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cleanup() })

describe('the ground colour', () => {
  it('reads the colour a picture ends in', async () => {
    stubImage('load')
    stubCanvas([18, 20, 24])
    const { result } = renderHook(() => useGroundColour('/w3/stage-studio.webp'))
    await waitFor(() => expect(result.current).toBe('#121418'))
  })

  it('pads single-digit channels so the hex is always valid', async () => {
    // #050505 would come out "#555" without padding — a completely different,
    // and much lighter, colour.
    stubImage('load')
    stubCanvas([5, 5, 5])
    const { result } = renderHook(() => useGroundColour('/w3/dark.webp'))
    await waitFor(() => expect(result.current).toBe('#050505'))
  })

  it('returns null rather than throwing when the canvas is refused', async () => {
    // A tainted canvas must cost the tint and nothing else — the caller keeps
    // its token colour and the app looks exactly as it did before.
    stubImage('load')
    stubCanvas('throw')
    const { result } = renderHook(() => useGroundColour('/w3/tainted.webp'))
    await waitFor(() => expect(result.current).toBeNull())
  })

  it('returns null when the picture does not load', async () => {
    stubImage('error')
    stubCanvas([1, 2, 3])
    const { result } = renderHook(() => useGroundColour('/w3/missing.webp'))
    await waitFor(() => expect(result.current).toBeNull())
  })

  it('has nothing to read without a source', () => {
    const { result } = renderHook(() => useGroundColour(null))
    expect(result.current).toBeNull()
  })
})
