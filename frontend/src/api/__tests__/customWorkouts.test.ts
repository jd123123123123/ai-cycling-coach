import { describe, it, expect } from 'vitest'
import {
  type CustomBlock,
  blockDuration,
  blocksToPreview,
  estimateDuration,
  estimateTss,
  zoneForPct,
} from '../customWorkouts'

describe('customWorkouts client computation', () => {
  it('estimateDuration expands intervals to reps × (on+off)', () => {
    const blocks: CustomBlock[] = [
      { type: 'warmup', duration_s: 600, from_pct: 0.5, to_pct: 0.75 },
      { type: 'interval', reps: 4, on_s: 180, off_s: 180, on_pct: 1.1, off_pct: 0.5 },
      { type: 'cooldown', duration_s: 300, from_pct: 0.6, to_pct: 0.4 },
    ]
    expect(blockDuration(blocks[1])).toBe(1440)
    expect(estimateDuration(blocks)).toBe(600 + 1440 + 300)
  })

  it('estimateTss for a steady block matches Σ h·IF²·100', () => {
    // 60min @ 85% → 1.0 × 0.85² × 100 = 72.25
    const tss = estimateTss([{ type: 'steady', duration_s: 3600, power_pct: 0.85 }])
    expect(tss).toBeCloseTo(72.25, 1)
  })

  it('interval TSS uses duration-weighted IF, never the peak', () => {
    const blocks: CustomBlock[] = [
      { type: 'interval', reps: 4, on_s: 180, off_s: 180, on_pct: 1.1, off_pct: 0.5 },
    ]
    const tss = estimateTss(blocks)
    // Peak-IF (1.1) would give 1440/3600 × 1.21 × 100 = 48.4 — real is lower.
    expect(tss).toBeLessThan(48.4)
    expect(tss).toBeGreaterThan(0)
  })

  it('blocksToPreview expands a ramp into sloped sub-segments', () => {
    const preview = blocksToPreview([{ type: 'warmup', duration_s: 600, from_pct: 0.5, to_pct: 1.0 }])
    expect(preview.length).toBeGreaterThan(1)
    // Ascending %FTP across the ramp.
    expect(preview[preview.length - 1].target_pct_ftp).toBeGreaterThan(preview[0].target_pct_ftp)
  })

  it('blocksToPreview passes interval structure through for BlockBars', () => {
    const preview = blocksToPreview([
      { type: 'interval', reps: 3, on_s: 60, off_s: 60, on_pct: 1.2, off_pct: 0.5 },
    ])
    expect(preview[0].reps).toBe(3)
    expect(preview[0].off_pct_ftp).toBe(0.5)
  })

  it('zoneForPct matches Coggan boundaries', () => {
    expect(zoneForPct(0.5)).toBe(1)
    expect(zoneForPct(1.0)).toBe(4)
    expect(zoneForPct(1.15)).toBe(5)
  })
})
