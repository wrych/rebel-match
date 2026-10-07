import { describe, expect, it } from 'vitest'
import { defaultConfig, loadConfig, type Config } from './config.js'
import { settingsView, type SettingsState } from './settings-view.js'

function unchanged(config: Config): SettingsState {
  const values = { limits: config.limits, abuse: config.abuse }
  return { current: values, deployment: values, overrides: [] }
}

function view(config: Config): ReturnType<typeof settingsView> {
  return settingsView(config, defaultConfig(), unchanged(config))
}

const secrets = {
  SESSION_SECRET: 'session-secret-'.padEnd(40, 'x'),
  DATABASE_URL: 'postgres://user:db-password@db.internal:5432/rebel',
  SMTP_PASSWORD: 'smtp-password',
  SMTP_USER: 'smtp-user',
  MIXPANEL_TOKEN: 'mixpanel-token',
}

function find(
  groups: ReturnType<typeof settingsView>,
  name: string,
): ReturnType<typeof settingsView>[number]['settings'][number] {
  const setting = groups
    .flatMap((group) => group.settings)
    .find((candidate) => candidate.name === name)
  if (setting === undefined) throw new Error(`no setting named ${name}`)
  return setting
}

describe('settingsView (R-CFG-5)', () => {
  it('puts the rate limits under Spam protection', () => {
    const spam = view(defaultConfig()).find(
      (group) => group.title === 'Spam protection',
    )

    expect(spam?.settings.map((s) => s.edit?.key)).toEqual(
      expect.arrayContaining([
        'abuse.linkEmailsBeforeCheck',
        'abuse.linkEmailsCeiling',
        'abuse.authRequestsPerIp',
        'abuse.applicantsBeforeCheck',
        'abuse.applicantsCeiling',
      ]),
    )
    expect(spam?.settings.map((s) => s.name)).toContain(
      'Trusted proxies in front of the server',
    )
  })

  it('shows each value with its unit', () => {
    const groups = view(defaultConfig())

    expect(find(groups, 'Sign-in link valid for').value).toBe('15 minutes')
    expect(find(groups, 'Sign-in requests per network').value).toBe(
      '1,000 requests',
    )
    expect(find(groups, '“Saved” tick shown for').value).toBe('2.5 seconds')
    expect(find(groups, 'Scroll hint on the privacy step moves').value).toBe(
      '40%',
    )
  })

  it('marks what differs from the default', () => {
    const groups = view(
      loadConfig({ SESSION_SECRET: 'x'.repeat(32), LINK_EMAILS_CEILING: '20' }),
    )

    expect(find(groups, 'Sign-in emails per address, at most')).toMatchObject({
      value: '20 emails',
      changed: true,
    })
    expect(find(groups, 'Sign-in link valid for').changed).toBe(false)
  })

  it('marks values fixed in code, which cannot be edited', () => {
    const setting = find(view(defaultConfig()), 'Longest name')

    expect(setting).toMatchObject({ fixed: true, changed: false })
    expect(setting).not.toHaveProperty('edit')
  })

  it('offers no edit for what only a deployment changes (R-CFG-6)', () => {
    const groups = view(defaultConfig())

    expect(
      find(groups, 'Trusted proxies in front of the server'),
    ).not.toHaveProperty('edit')
    expect(find(groups, 'Sign-in link valid for')).not.toHaveProperty('edit')
    expect(find(groups, 'Shortest challenge').edit).toEqual({
      key: 'limits.challengeMinChars',
      value: 31,
      unit: 'characters',
      min: 1,
      max: 300,
    })
  })

  it('shows a value changed in the app, who changed it and the deployment’s value', () => {
    const config = defaultConfig()
    const deployment = { limits: config.limits, abuse: config.abuse }
    const groups = settingsView(config, config, {
      current: {
        ...deployment,
        limits: { ...config.limits, challengeMinChars: 50 },
      },
      deployment,
      overrides: [
        {
          key: 'limits.challengeMinChars',
          value: 50,
          changedBy: 'm-ada',
          changerName: 'Ada Host',
          changedAt: new Date('2026-11-08T09:00:00Z'),
        },
      ],
    })

    expect(find(groups, 'Shortest challenge')).toMatchObject({
      value: '50 characters',
      changed: true,
      edit: { value: 50 },
      override: {
        by: 'Ada Host',
        at: '2026-11-08T09:00:00.000Z',
        deploymentValue: '31 characters',
      },
    })
  })

  it('shows no secret, only whether analytics is on', () => {
    const groups = view(loadConfig(secrets))
    const shown = JSON.stringify(groups)

    for (const secret of Object.values(secrets))
      expect(shown).not.toContain(secret)
    expect(shown).not.toContain('db.internal')
    expect(find(groups, 'Usage analytics').value).toBe('On')
    expect(find(groups, 'Database').value).toBe('Postgres')
  })

  it('offers each changeable setting once', () => {
    const keys = view(defaultConfig())
      .flatMap((group) => group.settings)
      .flatMap((setting) =>
        setting.edit === undefined ? [] : [setting.edit.key],
      )

    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(14)
  })
})
