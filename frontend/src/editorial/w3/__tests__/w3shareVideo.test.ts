import { describe, it, expect, vi, afterEach } from 'vitest'
import { canRenderVideo, sharePoster, MAX_STORY_SECONDS } from '../w3share'

/**
 * The video path's two rules: never claim a capability the browser does not
 * have, and never hand the share sheet a file labelled as something it isn't.
 */

afterEach(() => { vi.unstubAllGlobals() })

describe('w3share · knowing whether a clip can be burned', () => {
  it('says no when the browser cannot record a canvas', () => {
    // jsdom has no captureStream and no MediaRecorder — the honest answer here
    // is "no", and the caller falls back to a still.
    expect(canRenderVideo()).toBe(false)
  })

  it('keeps the clip inside a story-length cap', () => {
    expect(MAX_STORY_SECONDS).toBeGreaterThan(0)
    expect(MAX_STORY_SECONDS).toBeLessThanOrEqual(15)   // what a story allows
  })
})

describe('w3share · the file that reaches the share sheet', () => {
  function captureShare() {
    const shared: { name: string; type: string }[] = []
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async ({ files }: { files: File[] }) => {
        shared.push({ name: files[0].name, type: files[0].type })
      },
      clipboard: { writeText: async () => {} },
    })
    return shared
  }

  it('labels a burned mp4 as video, not as the default png', async () => {
    const shared = captureShare()
    await sharePoster(new Blob(['x'], { type: 'video/mp4' }), 'caption', 'w3-ride.png')

    expect(shared[0].type).toBe('video/mp4')
    expect(shared[0].name).toBe('w3-ride.mp4')
  })

  it('labels a webm as webm', async () => {
    const shared = captureShare()
    await sharePoster(new Blob(['x'], { type: 'video/webm;codecs=vp9' }), 'caption')

    expect(shared[0].name.endsWith('.webm')).toBe(true)
  })

  it('still sends a png as a png', async () => {
    const shared = captureShare()
    await sharePoster(new Blob(['x'], { type: 'image/png' }), 'caption')

    expect(shared[0].type).toBe('image/png')
    expect(shared[0].name).toBe('w3-ride.png')
  })

  it('reports failure rather than sharing nothing', async () => {
    expect(await sharePoster(null, 'caption')).toBe('failed')
  })
})
