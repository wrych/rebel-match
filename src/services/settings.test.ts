import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { createMemorySettingOverrideStore } from './memory-setting-override-store.js'
import { createSettings } from './settings.js'

const config = loadConfig({
  SESSION_SECRET: 'x'.repeat(32),
  CHALLENGE_MIN_CHARS: '40',
})

function twoServers(): {
  here: ReturnType<typeof createSettings>
  there: ReturnType<typeof createSettings>
} {
  const store = createMemorySettingOverrideStore({ 'm-ada': 'Ada Host' })
  return {
    here: createSettings({ config, store }),
    there: createSettings({ config, store }),
  }
}

describe('createSettings (R-CFG-6, ADR 0031)', () => {
  it('starts from the deployment’s values', () => {
    const { here } = twoServers()

    expect(here.limits().challengeMinChars).toBe(40)
    expect(here.overrides()).toEqual([])
  })

  it('applies a change at once on the server that saved it', async () => {
    const { here } = twoServers()

    expect(await here.change('limits.challengeMinChars', 50, 'm-ada')).toBe(
      'saved',
    )
    expect(here.limits().challengeMinChars).toBe(50)
    expect(here.overrides()).toMatchObject([
      { key: 'limits.challengeMinChars', value: 50, changerName: 'Ada Host' },
    ])
  })

  it('applies it on another server at its next refresh', async () => {
    const { here, there } = twoServers()
    await here.change('limits.challengeMinChars', 50, 'm-ada')

    expect(there.limits().challengeMinChars).toBe(40)
    await there.refresh()
    expect(there.limits().challengeMinChars).toBe(50)
  })

  it('checks a change against what another server saved meanwhile', async () => {
    const { here, there } = twoServers()
    await there.change('abuse.applicantsBeforeCheck', 200, 'm-ada')

    expect(await here.change('abuse.applicantsCeiling', 100, 'm-ada')).toBe(
      'out_of_order',
    )
  })

  it('saves nothing it refuses', async () => {
    const { here } = twoServers()

    expect(await here.change('abuse.humanCheckCost', 1, 'm-ada')).toBe(
      'out_of_bounds',
    )
    expect(await here.change('trustProxy', 1, 'm-ada')).toBe('not_found')
    expect(here.overrides()).toEqual([])
  })

  it('goes back to the deployment’s value', async () => {
    const { here } = twoServers()
    await here.change('limits.challengeMinChars', 50, 'm-ada')

    expect(await here.reset('limits.challengeMinChars')).toBe('reset')
    expect(here.limits().challengeMinChars).toBe(40)
    expect(here.overrides()).toEqual([])
  })

  it('goes back to a deployment value outside the in-app bounds', async () => {
    const wide = loadConfig({
      SESSION_SECRET: 'x'.repeat(32),
      CHALLENGE_MIN_CHARS: '500',
    })
    const settings = createSettings({
      config: wide,
      store: createMemorySettingOverrideStore(),
    })
    await settings.change('limits.challengeMinChars', 50, 'm-ada')

    expect(await settings.reset('limits.challengeMinChars')).toBe('reset')
    expect(settings.limits().challengeMinChars).toBe(500)
  })

  it('refuses to go back when that leaves a ceiling below its free uses', async () => {
    const { here } = twoServers()
    await here.change('abuse.applicantsCeiling', 500, 'm-ada')
    await here.change('abuse.applicantsBeforeCheck', 400, 'm-ada')

    expect(await here.reset('abuse.applicantsCeiling')).toBe('out_of_order')
    expect(here.abuse().applicantsCeiling).toBe(500)
  })
})
