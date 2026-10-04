import { describe, expect, it } from 'vitest'
import { defaultConfig, loadConfig } from './config.js'
import { settingsView } from './settings-view.js'

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
    const groups = settingsView(defaultConfig(), defaultConfig())
    const spam = groups.find((group) => group.title === 'Spam protection')

    expect(spam?.settings.map((s) => s.envVar)).toEqual(
      expect.arrayContaining([
        'LINK_EMAILS_BEFORE_CHECK',
        'LINK_EMAILS_CEILING',
        'AUTH_REQUESTS_PER_IP',
        'APPLICANTS_BEFORE_CHECK',
        'APPLICANTS_CEILING',
        'TRUST_PROXY',
      ]),
    )
  })

  it('shows each value with its unit', () => {
    const groups = settingsView(defaultConfig(), defaultConfig())

    expect(find(groups, 'Sign-in link valid for').value).toBe('15 minutes')
    expect(find(groups, 'Sign-in requests per network').value).toBe(
      '1,000 requests',
    )
    expect(find(groups, '“Saved” tick shown for').value).toBe('2.5 seconds')
  })

  it('marks what differs from the default', () => {
    const groups = settingsView(
      loadConfig({ SESSION_SECRET: 'x'.repeat(32), LINK_EMAILS_CEILING: '20' }),
      defaultConfig(),
    )

    expect(find(groups, 'Sign-in emails per address, at most')).toMatchObject({
      value: '20 emails',
      changed: true,
    })
    expect(find(groups, 'Sign-in link valid for').changed).toBe(false)
  })

  it('marks values fixed in code, with no variable to set', () => {
    const setting = find(
      settingsView(defaultConfig(), defaultConfig()),
      'Longest name',
    )

    expect(setting).toMatchObject({ fixed: true, changed: false })
    expect(setting).not.toHaveProperty('envVar')
  })

  it('shows no secret, only whether analytics is on', () => {
    const groups = settingsView(loadConfig(secrets), defaultConfig())
    const shown = JSON.stringify(groups)

    for (const secret of Object.values(secrets))
      expect(shown).not.toContain(secret)
    expect(shown).not.toContain('db.internal')
    expect(find(groups, 'Usage analytics').value).toBe('On')
    expect(find(groups, 'Database').value).toBe('Postgres')
  })

  it('names every variable once', () => {
    const vars = settingsView(defaultConfig(), defaultConfig())
      .flatMap((group) => group.settings)
      .flatMap((setting) =>
        setting.envVar === undefined ? [] : [setting.envVar],
      )

    expect(new Set(vars).size).toBe(vars.length)
  })
})
