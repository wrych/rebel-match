import { describe, expect, it } from 'vitest'
import { networkOpen, ownLinksHint, youLine } from './network'

describe('ownLinksHint (R-NET-13)', () => {
  it('says nothing while the member’s lines show, or with no viewer', () => {
    expect(ownLinksHint({ count: 7, needed: 5, shown: true })).toBeNull()
    expect(ownLinksHint(null)).toBeNull()
  })

  it('says how many it takes, how many they have, and why', () => {
    expect(ownLinksHint({ count: 1, needed: 5, shown: false })).toBe(
      'Your own connections show once you have 5 connections. You have ' +
        '1 connection, and with so few you could tell who the dots at ' +
        'their ends are, which would say things about them they never shared.',
    )
  })

  it('says so when they have none yet', () => {
    expect(ownLinksHint({ count: 0, needed: 1, shown: false })).toMatch(
      /^Your own connections show once you have 1 connection\. You have no connections yet,/,
    )
  })
})

describe('youLine (R-NET-2)', () => {
  it('names the own connections only when they show', () => {
    expect(youLine({ count: 6, needed: 5, shown: true })).toContain(
      'with your own connections',
    )
    expect(youLine({ count: 2, needed: 5, shown: false })).toBe(
      'That’s you, in the accent colour.',
    )
  })
})

describe('networkOpen (R-NET-5, R-NET-6)', () => {
  it('opens only while on, to a member who may see it', () => {
    expect(networkOpen(1, ['network:view'])).toBe(true)
    expect(networkOpen(0, ['network:view'])).toBe(false)
    expect(networkOpen(1, [])).toBe(false)
  })
})
