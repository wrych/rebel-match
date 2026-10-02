import { describe, expect, it } from 'vitest'
import { clientConfig, loadConfig, rolePermissions } from './config.js'

const valid = {
  DATABASE_URL: 'mysql://user:pw@localhost:3306/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv

describe('loadConfig', () => {
  it('defaults the thresholds the spec fixes', () => {
    const config = loadConfig(valid)

    expect(config.limits.challengeMinChars).toBe(31)
    expect(config.limits.beenThereNoteMinChars).toBe(31)
    expect(config.limits.magicLinkTtlMinutes).toBe(15)
    expect(config.limits.approvalLinkTtlHours).toBe(24)
  })

  it('sends analytics to the EU ingestion host by default', () => {
    expect(loadConfig(valid).analytics.apiHost).toBe('api-eu.mixpanel.com')
  })

  it('lets a threshold be tuned without a code change', () => {
    const config = loadConfig({ ...valid, CHALLENGE_MIN_CHARS: '50' })

    expect(config.limits.challengeMinChars).toBe(50)
  })

  it('rejects a session secret too short to sign with', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'short' })).toThrow()
  })

  it('rejects a missing database url rather than failing on first query', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'x'.repeat(32) })).toThrow()
  })

  it('requires an smtp host when it is told to send over smtp', () => {
    expect(() => loadConfig({ ...valid, MAIL_TRANSPORT: 'smtp' })).toThrow(
      /SMTP_HOST/,
    )
  })

  it('refuses the outbox transport in production', () => {
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        MAIL_TRANSPORT: 'outbox',
      }),
    ).toThrow(/development-only/)
  })

  it('defaults to the outbox so a dev run cannot email a real person', () => {
    expect(loadConfig(valid).mail.transport).toBe('outbox')
  })
})

describe('clientConfig', () => {
  it('carries the limits and the consent version', () => {
    const config = loadConfig(valid)
    const forClient = clientConfig(config)

    expect(forClient.limits).toEqual(config.limits)
    expect(forClient.consentVersion).toBe(config.consentVersion)
  })

  it('carries no secret, whatever the server holds', () => {
    const config = loadConfig({
      ...valid,
      MIXPANEL_TOKEN: 'mp-secret-token',
      SMTP_PASSWORD: 'smtp-secret',
    })

    const serialized = JSON.stringify(clientConfig(config))

    expect(serialized).not.toContain('mp-secret-token')
    expect(serialized).not.toContain('smtp-secret')
    expect(serialized).not.toContain(config.sessionSecret)
    expect(serialized).not.toContain(config.databaseUrl)
  })

  it('exposes only the two documented keys', () => {
    expect(Object.keys(clientConfig(loadConfig(valid))).sort()).toEqual([
      'consentVersion',
      'limits',
    ])
  })
})

describe('rolePermissions', () => {
  it('gives a plain member no administrative permission', () => {
    const member: readonly string[] = rolePermissions.member

    expect(member).not.toContain('applicant:review')
    expect(member).not.toContain('member:delete')
    expect(member).not.toContain('invite:manage')
  })

  it('keeps invite management and the dev outbox admin-only', () => {
    expect(rolePermissions.admin).toContain('invite:manage')
    expect(rolePermissions.admin).toContain('outbox:read')
  })
})

describe('smtp configuration', () => {
  it('carries credentials through when they are supplied', () => {
    const config = loadConfig({
      ...valid,
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'mail.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'rebel',
      SMTP_PASSWORD: 'pw',
    })

    expect(config.mail.smtp).toEqual({
      host: 'mail.example.com',
      port: 465,
      user: 'rebel',
      password: 'pw',
    })
  })

  it('omits credentials entirely rather than carrying undefined', () => {
    expect(loadConfig(valid).mail.smtp).toEqual({ port: 587 })
  })
})
