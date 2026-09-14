import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { setShareInviteCode, shareInviteCode } from '../w3share'
import { inviteUrl, inviteDisplay } from '../w3invite'

describe('invite on shared cards', () => {
  beforeAll(() => {
    vi.stubGlobal('window', { location: { origin: 'https://ridr.app', host: 'ridr.app' } })
  })
  afterAll(() => vi.unstubAllGlobals())
  it('builds the short url the register route accepts', () => {
    expect(inviteUrl('ABC123')).toBe('https://ridr.app/r/ABC123')
  })
  it('prints host + code, no scheme', () => {
    expect(inviteDisplay('ABC123')).toBe('ridr.app/r/ABC123')
  })
  it('display always ends with the raw code so the two halves reassemble', () => {
    const d = inviteDisplay('ZZ9')
    expect(d.endsWith('ZZ9')).toBe(true)
    expect(d.slice(0, d.length - 3) + 'ZZ9').toBe(d)
  })
  it('stores and clears the code', () => {
    setShareInviteCode('ABC123'); expect(shareInviteCode()).toBe('ABC123')
    setShareInviteCode('  '); expect(shareInviteCode()).toBeNull()
    setShareInviteCode(null); expect(shareInviteCode()).toBeNull()
  })
})
