/**
 * ExploreRoutesView.weather.test.ts — batched, session-cached weather chips
 * (audit P2-16 / routes): ONE Open-Meteo request per distinct 2dp location
 * cluster per session; 429 / network failure drops the chip silently — no
 * retry storm, no console noise, no fake values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wxClusterKey, fetchWeatherClusters, __resetWxCacheForTests } from '../ExploreRoutesView'

const ok = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response

const rateLimited = () =>
  ({ ok: false, status: 429, json: async () => ({ error: true, reason: 'Too many requests' }) }) as unknown as Response

beforeEach(() => {
  __resetWxCacheForTests()
})

describe('wxClusterKey', () => {
  it('rounds coordinates to 2dp so nearby starts share one forecast', () => {
    expect(wxClusterKey(48.13791, 11.57549)).toBe('48.14,11.58')
    expect(wxClusterKey(48.14102, 11.57991)).toBe('48.14,11.58') // same cluster
    expect(wxClusterKey(47.99, 11.58)).toBe('47.99,11.58') // different cluster
  })
})

describe('fetchWeatherClusters', () => {
  it('makes ONE batched request for all distinct clusters', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ok([
        { current: { temperature_2m: 21.4, wind_speed_10m: 14.6 } },
        { current: { temperature_2m: 18.2, wind_speed_10m: 7.1 } },
      ]),
    )
    const m = await fetchWeatherClusters(['48.14,11.58', '47.99,11.58'], fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const url = fetchFn.mock.calls[0][0] as string
    expect(url).toContain('latitude=48.14,47.99')
    expect(url).toContain('longitude=11.58,11.58')
    expect(m.get('48.14,11.58')).toEqual({ t: 21, wind: 15 })
    expect(m.get('47.99,11.58')).toEqual({ t: 18, wind: 7 })
  })

  it('caches per session — a second view never refetches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ current: { temperature_2m: 20, wind_speed_10m: 10 } }))
    await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    const again = await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(again.get('48.14,11.58')).toEqual({ t: 20, wind: 10 })
  })

  it('handles the single-location object response shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ current: { temperature_2m: 19.6, wind_speed_10m: 3.4 } }))
    const m = await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    expect(m.get('48.14,11.58')).toEqual({ t: 20, wind: 3 })
  })

  it('429 → resolves null (chip absent), never throws, never retries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(rateLimited())
    const m = await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    expect(m.get('48.14,11.58')).toBeNull()
    // The failure is cached: no retry storm against the rate limit.
    await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('network failure → resolves null silently (no unhandled rejection)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const m = await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    expect(m.get('48.14,11.58')).toBeNull()
  })

  it('drops malformed entries instead of rendering zeros', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok([{ current: { temperature_2m: 'n/a', wind_speed_10m: null } }]))
    const m = await fetchWeatherClusters(['48.14,11.58'], fetchFn)
    expect(m.get('48.14,11.58')).toBeNull()
  })
})
