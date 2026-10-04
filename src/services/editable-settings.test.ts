import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import {
  createEditableSettings,
  isEditableKey,
  type Override,
  type OverrideStore,
} from './editable-settings.js'

function memoryStore(
  rows: Override[] = [],
): OverrideStore & { rows: Override[] } {
  return {
    rows,
    list: () => Promise.resolve([...rows]),
    save: (key, value, memberId) => {
      const row = {
        key,
        value,
        changedBy: memberId,
        changedByName: 'Ada',
        changedAt: new Date('2026-10-04T19:00:00Z'),
      }
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) rows.push(row)
      else rows[at] = row
      return Promise.resolve()
    },
    remove: (key) => {
      const at = rows.findIndex((r) => r.key === key)
      if (at !== -1) rows.splice(at, 1)
      return Promise.resolve()
    },
  }
}

function setup(env: Record<string, string> = {}): {
  config: ReturnType<typeof loadConfig>
  store: ReturnType<typeof memoryStore>
  settings: ReturnType<typeof createEditableSettings>
} {
  const config = loadConfig({ SESSION_SECRET: 'x'.repeat(32), ...env })
  const store = memoryStore()
  return { config, store, settings: createEditableSettings({ config, store }) }
}

describe('createEditableSettings (R-CFG-6, ADR 0031)', () => {
  it('applies a change to the live configuration at once', async () => {
    const { config, settings } = setup()

    expect(await settings.set('abuse.applicantsCeiling', 500, 'm-ada')).toBe(
      'saved',
    )

    expect(config.abuse.applicantsCeiling).toBe(500)
    expect(settings.overrides().get('abuse.applicantsCeiling')).toMatchObject({
      value: 500,
      changedByName: 'Ada',
    })
  })

  it('goes back to the deployment value, environment included', async () => {
    const { config, settings } = setup({ APPLICANTS_CEILING: '400' })
    await settings.set('abuse.applicantsCeiling', 500, 'm-ada')

    await settings.reset('abuse.applicantsCeiling')

    expect(config.abuse.applicantsCeiling).toBe(400)
    expect(settings.deployed('abuse.applicantsCeiling')).toBe(400)
    expect(settings.overrides().size).toBe(0)
  })

  it.each([
    ['abuse.linkEmailsCeiling', 0],
    ['abuse.linkEmailsCeiling', 101],
    ['abuse.humanCheckCost', 50_000],
    ['limits.challengeMinChars', 1.5],
  ] as const)('refuses %s = %s, out of bounds', async (key, value) => {
    const { config, settings, store } = setup()
    const before = config.abuse.linkEmailsCeiling

    expect(await settings.set(key, value, 'm-ada')).toBe('out_of_bounds')
    expect(store.rows).toEqual([])
    expect(config.abuse.linkEmailsCeiling).toBe(before)
  })

  it('bounds a note length by the message the database can hold', async () => {
    const { config, settings } = setup()
    const widest = config.limits.connectionMessageMaxChars

    expect(
      await settings.set('limits.beenThereNoteMinChars', widest, 'm'),
    ).toBe('saved')
    expect(
      await settings.set('limits.beenThereNoteMinChars', widest + 1, 'm'),
    ).toBe('out_of_bounds')
  })

  it('refuses free uses above their ceiling, from either side', async () => {
    const { settings } = setup()

    expect(await settings.set('abuse.linkEmailsBeforeCheck', 11, 'm')).toBe(
      'out_of_order',
    )
    expect(await settings.set('abuse.applicantsCeiling', 29, 'm')).toBe(
      'out_of_order',
    )
    expect(await settings.set('abuse.linkEmailsCeiling', 3, 'm')).toBe('saved')
  })

  it('picks up a change another server saved on refresh', async () => {
    const { config, settings, store } = setup()
    await store.save('limits.inviteDefaultHours', 48, 'm-bo')

    await settings.refresh()

    expect(config.limits.inviteDefaultHours).toBe(48)
  })

  it('ignores a stored key that is not changeable', async () => {
    const { config, settings, store } = setup()
    store.rows.push({
      key: 'limits.nameMaxChars',
      value: 5,
      changedBy: null,
      changedByName: null,
      changedAt: new Date(),
    })

    await settings.refresh()

    expect(config.limits.nameMaxChars).toBe(120)
  })

  it('knows which keys are changeable', () => {
    expect(isEditableKey('abuse.applicantsCeiling')).toBe(true)
    expect(isEditableKey('abuse.trustProxy')).toBe(false)
    expect(isEditableKey('toString')).toBe(false)
  })
})
