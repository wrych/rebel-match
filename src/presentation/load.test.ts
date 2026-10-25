import { describe, expect, it } from 'vitest'
import { presentationCast } from './load.js'
import { devCast } from './dev-cast.js'

const development = { env: 'development', mail: { delivery: 'none' } } as const
const production = { env: 'production', mail: { delivery: 'smtp' } } as const

describe('presentationCast (R-PRES-5)', () => {
  it('reads the file the deployment points to', () => {
    const cast = presentationCast(
      { ...production, presentationCastFile: '/run/cast.json' },
      (path) =>
        path === '/run/cast.json' ? '[{"handle":"pim","name":"Pim"}]' : '',
    )

    expect(cast).toEqual([{ handle: 'pim', name: 'Pim', groups: [] }])
  })

  it('stands in with the fictional cast in development without a file', () => {
    expect(presentationCast(development)).toBe(devCast)
  })

  it('names nobody elsewhere without a file', () => {
    expect(presentationCast(production)).toEqual([])
  })

  it('stops the start on a file it cannot read, naming the setting', () => {
    expect(() =>
      presentationCast({ ...production, presentationCastFile: '/nope' }, () => {
        throw new Error('ENOENT: /nope')
      }),
    ).toThrow('PRESENTATION_CAST_FILE cannot be read')
  })
})
