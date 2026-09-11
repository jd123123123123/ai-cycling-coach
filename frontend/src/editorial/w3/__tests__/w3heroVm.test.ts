import { describe, expect, it } from 'vitest'
import { heroVm, type HeroSources } from '../w3heroVm'

const EMPTY: HeroSources = {
  stage: null, garage: null, collection: null, meso: null,
  streak: null, balance: null, displayName: null,
}

const garage = (bike: string | null) => ({ bike: bike ? { image_base64: bike, name: 'Canyon' } : null }) as never
const stage = (bike: string | null) => ({ bike_image: bike, rider_image: null, bike_name: null, changes: [], stage: 'road', stages: [] }) as never

describe('heroVm · bikeInScene is a size switch', () => {
  it('is FALSE when Today returns the very same render the garage holds', () => {
    // The regression: this is every rider who has never composed a build. Read
    // as a scene, the machine is drawn full bleed and fills the screen.
    const vm = heroVm({ ...EMPTY, stage: stage('IMG_A'), garage: garage('IMG_A') })
    expect(vm.bikeInScene).toBe(false)
    expect(vm.bike).toBe('IMG_A')
  })

  it('preserves the original bicycle when a generated scene exists', () => {
    const vm = heroVm({ ...EMPTY, stage: stage('SCENE'), garage: garage('IMG_A') })
    expect(vm.bikeInScene).toBe(false)
    expect(vm.bike).toBe('IMG_A')
  })

  it('does not substitute a generated bike while the garage loads', () => {
    expect(heroVm({ ...EMPTY, stage: stage('SCENE') }).bike).toBeNull()
  })

  it('is FALSE with no Today render at all', () => {
    expect(heroVm({ ...EMPTY, garage: garage('IMG_A') }).bikeInScene).toBe(false)
  })
})

describe('heroVm · never a stock bike presented as theirs', () => {
  it('falls back garage → collectible → nothing, in that order', () => {
    expect(heroVm({ ...EMPTY, garage: garage('OWN') }).bike).toBe('OWN')
    expect(heroVm({ ...EMPTY, collection: { render: 'CLAIMED', loadout: {} } }).bike).toBe('CLAIMED')
    expect(heroVm(EMPTY).bike).toBeNull()
  })
})

describe('heroVm · absence is stated, not invented', () => {
  it('withholds coins, streak and multiplier rather than printing a zero', () => {
    const vm = heroVm(EMPTY)
    expect(vm.coins).toBeNull()
    expect(vm.streak).toBeNull()
    expect(vm.bonus).toBeNull()
    expect(vm.role).toBeNull()
  })

  it('localises the balance and names the block once both are known', () => {
    const vm = heroVm({ ...EMPTY, balance: 2480, streak: 6,
      meso: { block_position: 'accumulation', block_index_in_meso: 1 } })
    expect(vm.coins).toBe('2.480')
    expect(vm.role).toBe('Umfangsblock · Woche 2 von 4')
    expect(vm.bonus).not.toBeNull()
  })
})
