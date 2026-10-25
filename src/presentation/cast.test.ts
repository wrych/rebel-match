import { describe, expect, it } from 'vitest'
import { castOnStage, parseCast } from './cast.js'
import { devCast } from './dev-cast.js'

const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

describe('parseCast (R-PRES-5)', () => {
  it('reads handles, names, photos, emails and groups', () => {
    const cast = parseCast(
      JSON.stringify([
        { handle: 'pim', name: 'Pim', photo: PHOTO, email: 'Pim@Example.org' },
        { handle: 'dev-one', name: 'Dev', groups: ['developers'] },
      ]),
    )

    expect(cast).toEqual([
      {
        handle: 'pim',
        name: 'Pim',
        photo: PHOTO,
        email: 'pim@example.org',
        groups: [],
      },
      { handle: 'dev-one', name: 'Dev', groups: ['developers'] },
    ])
  })

  it('names where a problem is, never what the file holds (R-NFR-1)', () => {
    const run = (): unknown =>
      parseCast(
        JSON.stringify([
          { handle: 'pim', name: 'Pim', email: 'not-an-address' },
        ]),
      )

    expect(run).toThrow('presentation cast: check 0.email')
    expect(run).not.toThrow(/not-an-address|Pim/)
  })

  it('refuses a photo from elsewhere, so the stage loads nothing outside', () => {
    expect(() =>
      parseCast(
        JSON.stringify([
          { handle: 'pim', name: 'Pim', photo: 'https://example.org/p.png' },
        ]),
      ),
    ).toThrow('0.photo')
  })

  it('refuses a handle twice, and a file that is not JSON', () => {
    const twice = JSON.stringify([
      { handle: 'pim', name: 'A' },
      { handle: 'pim', name: 'B' },
    ])

    expect(() => parseCast(twice)).toThrow('presentation cast: check the list')
    expect(() => parseCast('{')).toThrow(
      'presentation cast: the file is not JSON',
    )
  })
})

describe('castOnStage (R-PRES-6)', () => {
  it('swaps each email for a node, and sends no email', () => {
    const stage = castOnStage(
      [
        { handle: 'a', name: 'A', email: 'a@example.org', groups: [] },
        {
          handle: 'b',
          name: 'B',
          email: 'b@example.org',
          groups: ['developers'],
        },
        { handle: 'c', name: 'C', groups: [] },
      ],
      (email) => (email === 'a@example.org' ? 4 : null),
    )

    expect(stage).toEqual([
      { handle: 'a', name: 'A', photo: null, groups: [], node: 4 },
      {
        handle: 'b',
        name: 'B',
        photo: null,
        groups: ['developers'],
        node: null,
      },
      { handle: 'c', name: 'C', photo: null, groups: [], node: null },
    ])
    expect(JSON.stringify(stage)).not.toContain('@')
  })
})

describe('devCast', () => {
  it('stands in with fictional people on the non-routable domain (R-SEED-2)', () => {
    for (const entry of devCast)
      if (entry.email !== undefined) expect(entry.email).toMatch(/\.invalid$/)
    expect(parseCast(JSON.stringify(devCast))).toHaveLength(devCast.length)
  })
})
