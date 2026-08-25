import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A sticker must be TRANSPARENT where the card would have been dark.
 *
 * The failure this guards against is silent and total: a transparent PNG that
 * actually carries a near-black ground looks fine in our preview (dark on dark)
 * and lands on somebody's story as a black rectangle.
 */

/** Records every fill so the test can ask what was painted, and where. */
function recordingCanvas() {
  const fills: { style: unknown; rect: number[] | null }[] = []
  const ctx = {
    canvas: { width: 1080, height: 1920 },
    set fillStyle(v: unknown) { this._fill = v },
    get fillStyle() { return this._fill },
    _fill: '' as unknown,
    shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    font: '', textAlign: 'left', textBaseline: '', strokeStyle: '', lineWidth: 0,
    lineJoin: '', lineCap: '',
    fillRect: function (...r: number[]) { fills.push({ style: this._fill, rect: r }) },
    fillText: () => {}, measureText: (s: string) => ({ width: s.length * 10 }),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arcTo: () => {},
    arc: () => {}, closePath: () => {}, stroke: () => {},
    fill: function () { fills.push({ style: this._fill, rect: null }) },
    save: () => {}, restore: () => {}, clip: () => {}, rect: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

const BASE = {
  handle: '@j', badge: 'W3', lead: 'Schnellste Runde', emphasis: 'seit Mai.',
  bigValue: '52,4', bigUnit: 'km',
  stats: [{ v: '1:47', l: 'ZEIT' }, { v: '612', l: 'HM' }] as [
    { v: string; l: string }, { v: string; l: string },
  ],
  series: [0.5, 0.9], footer: 'heute', photo: null,
}

beforeEach(() => {
  const { ctx, fills } = recordingCanvas()
  ;(globalThis as Record<string, unknown>).__fills = fills
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ctx,
      toDataURL: () => 'data:image/png;base64,x',
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' })),
    }),
  })
})

async function paint(opts: Record<string, unknown>) {
  // Cleared per call, not per test: a case that paints twice must compare the
  // two paints, not the first against both of them.
  ;((globalThis as Record<string, unknown>).__fills as unknown[]).length = 0
  const { renderStoryCard } = await import('../w3share')
  await renderStoryCard({ ...BASE, ...opts } as never)
  return (globalThis as Record<string, unknown>).__fills as { style: unknown; rect: number[] | null }[]
}

/** A fill covering the whole 1080×1920 frame — i.e. a ground. */
const isFullFrame = (f: { rect: number[] | null }) =>
  f.rect != null && f.rect[0] === 0 && f.rect[1] === 0 && f.rect[2] === 1080 && f.rect[3] === 1920

describe('renderStoryOverlay · the sticker is actually transparent', () => {
  it('paints a full-frame ground on a normal card', async () => {
    const fills = await paint({ layout: 'full' })
    expect(fills.some(isFullFrame)).toBe(true)
  })

  it('paints NO full-frame ground when transparent', async () => {
    const fills = await paint({ layout: 'full', transparent: true })
    expect(fills.some(isFullFrame)).toBe(false)
  })

  it('drops the scrims too, so no dark band lands on the story', async () => {
    const opaque = (await paint({ layout: 'full' })).filter((f) => f.rect != null).length
    const bare = (await paint({ layout: 'full', transparent: true })).filter((f) => f.rect != null).length
    expect(bare).toBeLessThan(opaque)
  })

  it('holds for every layout, not just the default', async () => {
    for (const layout of ['full', 'silent', 'trace', 'headline', 'viewfinder', 'effort']) {
      const fills = await paint({ layout, transparent: true, polyline: [[50, 7], [51, 8]] })
      expect(fills.some(isFullFrame), `${layout} painted a ground`).toBe(false)
    }
  })
})
