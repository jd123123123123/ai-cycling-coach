import { describe, it, expect } from 'vitest'
import { roadPowerInputs } from '../TodayTab'

describe('roadPowerInputs', () => {
  it('passes CP and W prime through when the model is valid', () => {
    expect(roadPowerInputs({ model_valid: true, cp_watts: 250, w_prime_j: 20000 }))
      .toEqual({ cp: 250, wPrime: 20000 })
  })

  it('withholds CP when the model is not valid — no waterline off a bad model', () => {
    expect(roadPowerInputs({ model_valid: false, cp_watts: 250, w_prime_j: 20000 }))
      .toEqual({ cp: null, wPrime: null })
  })

  it('withholds CP when model_valid is absent or the profile is missing', () => {
    expect(roadPowerInputs({ cp_watts: 250, w_prime_j: 20000 })).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs(null)).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs(undefined)).toEqual({ cp: null, wPrime: null })
  })

  it('withholds both when either value is missing', () => {
    expect(roadPowerInputs({ model_valid: true, cp_watts: 250 })).toEqual({ cp: null, wPrime: null })
    expect(roadPowerInputs({ model_valid: true, w_prime_j: 20000 })).toEqual({ cp: null, wPrime: null })
  })
})
