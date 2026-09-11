import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import W3WeatherNudge, { upcomingWeather, windDirection } from '../W3WeatherNudge'
import type { TodayWeather } from '../../../hooks/useTodayWeather'

const now = new Date('2026-09-11T10:20:00Z')
const forecast: TodayWeather = { available:true, timezone:'Europe/Berlin', location:null, hours:[11,12,13].map(hour=>({time:`2026-09-11T${hour}:00`,temp_c:20,wind_kmh:12,wind_dir_deg:225,wind_gust_kmh:hour===13?28:21,precip_prob:hour===13?40:10,code:2,is_day:true})) }
afterEach(cleanup)
describe('Today weather', () => {
  it('offers location permission instead of showing old ride weather', () => {
    const request = vi.fn()
    render(<W3WeatherNudge requestLocation={request} locationState="idle" now={now}/> )
    fireEvent.click(screen.getByRole('button',{name:'Aktuellen Standort verwenden'}))
    expect(request).toHaveBeenCalledOnce()
    expect(screen.queryByText(/letzten GPS/)).toBeNull()
  })
  it('is compact by default and exposes hourly rain only when expanded', () => {
    render(<W3WeatherNudge forecast={forecast} now={now}/> )
    expect(screen.getByRole('button',{name:'Wetter öffnen'}).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button',{name:/13:00 Uhr/})).toBeNull()
    expect(screen.getByLabelText('Regenwahrscheinlichkeit 10 Prozent')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Wetter öffnen'}))
    expect(screen.getByRole('button',{name:/13:00 Uhr.*Regenwahrscheinlichkeit 40 Prozent/})).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Wetter schließen'}))
    expect(screen.queryByRole('button',{name:/13:00 Uhr/})).toBeNull()
  })
  it('uses the forecast timezone and drops past hours', () => {
    expect(upcomingWeather(forecast, now).map(h=>h.time)).toEqual(['2026-09-11T12:00','2026-09-11T13:00'])
    expect(upcomingWeather({...forecast,timezone:'America/New_York'},new Date('2026-09-11T16:20:00Z')).length).toBe(2)
  })
  it('does not relabel yesterday’s cached forecast as today', () => {
    expect(upcomingWeather(forecast,new Date('2026-09-11T22:10:00Z'))).toEqual([])
  })
  it('updates gusts and rain together when an hour is selected', () => {
    render(<W3WeatherNudge forecast={forecast} now={now}/> )
    fireEvent.click(screen.getByRole('button',{name:'Wetter öffnen'}))
    const hour=screen.getByRole('button',{name:/13:00 Uhr/})
    fireEvent.click(hour)
    expect(hour.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('28 km/h')).toBeTruthy()
    expect(screen.getByLabelText('Regenwahrscheinlichkeit 40 Prozent')).toBeTruthy()
    expect(screen.queryByText('21 km/h')).toBeNull()
  })
  it('shows missing values as unknown, never windstill or dry', () => {
    render(<W3WeatherNudge forecast={{...forecast,hours:[{...forecast.hours[1],wind_kmh:null,wind_gust_kmh:null,precip_prob:null,wind_dir_deg:null}]}} now={now}/> )
    expect(screen.getByText('— km/h')).toBeTruthy()
    expect(screen.getByLabelText('Regenwahrscheinlichkeit — Prozent')).toBeTruthy()
    expect(screen.queryByText(/windstill|trocken/i)).toBeNull()
  })
  it('does not claim a later hour is now when the current reading is missing', () => {
    render(<W3WeatherNudge forecast={{...forecast,hours:[forecast.hours[2]]}} now={now}/> )
    expect(screen.queryByText('Jetzt')).toBeNull()
    expect(screen.getAllByText('13 Uhr').length).toBeGreaterThan(0)
  })
  it('hides unavailable weather and shows a moon for a clear night', () => {
    const {rerender}=render(<W3WeatherNudge forecast={{...forecast,available:false}} now={now}/> )
    expect(screen.queryByRole('heading',{name:'Wetter'})).toBeNull()
    rerender(<W3WeatherNudge forecast={{...forecast,hours:[{...forecast.hours[1],code:0,is_day:false}]}} now={now}/> )
    expect(screen.getAllByRole('img',{name:'Klar'})).toHaveLength(1)
  })
  it('normalizes compass directions without mistaking missing for north', () => {
    expect(windDirection(360)).toBe('N')
    expect(windDirection(-90)).toBe('W')
    expect(windDirection(225)).toBe('SW')
    expect(windDirection(null)).toBeNull()
  })
})
