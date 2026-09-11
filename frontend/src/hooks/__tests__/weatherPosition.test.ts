import { afterEach, expect, it, vi } from 'vitest'
import { readWeatherPosition } from '../useTodayWeather'
afterEach(() => vi.unstubAllGlobals())
it('rounds device coordinates before returning them to the weather request', async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback, _failure: PositionErrorCallback, _options: PositionOptions) => success({ coords:{latitude:52.512349,longitude:13.419912} } as GeolocationPosition))
  vi.stubGlobal('navigator',{geolocation:{getCurrentPosition}})
  expect(await readWeatherPosition()).toEqual({lat:52.51,lng:13.42})
  expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({maximumAge:60000,timeout:12000,enableHighAccuracy:false})
})
it('propagates denied permission rather than supplying another location', async () => {
  vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(_success:unknown,error:(value:unknown)=>void)=>error({code:1})}})
  await expect(readWeatherPosition()).rejects.toMatchObject({code:1})
})
