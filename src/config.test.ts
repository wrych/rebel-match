import { describe, expect, it } from 'vitest'
import { rolePermissions } from './access.js'
import { latestConsentVersion } from './consent.js'
import { clientConfig, isDevelopmentDeployment, loadConfig } from './config.js'

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

  it('purges the outbound log hourly unless told otherwise (R-MSG-6)', () => {
    expect(loadConfig(valid).outboxPurgeIntervalHours).toBe(1)
    expect(
      loadConfig({ ...valid, OUTBOX_PURGE_INTERVAL_HOURS: '6' })
        .outboxPurgeIntervalHours,
    ).toBe(6)
  })

  it('refuses a purge interval too long for a Node timer', () => {
    expect(
      loadConfig({ ...valid, OUTBOX_PURGE_INTERVAL_HOURS: '596' })
        .outboxPurgeIntervalHours,
    ).toBe(596)
    expect(() =>
      loadConfig({ ...valid, OUTBOX_PURGE_INTERVAL_HOURS: '720' }),
    ).toThrow()
  })

  it('keeps a session for 30 days unless told otherwise (R-AUTH-7)', () => {
    expect(loadConfig(valid).sessionTtlDays).toBe(30)
    expect(loadConfig({ ...valid, SESSION_TTL_DAYS: '7' }).sessionTtlDays).toBe(
      7,
    )
  })

  it('rejects a missing database url rather than failing on first query', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'x'.repeat(32) })).toThrow()
  })

  it('requires an smtp host when it is told to send over smtp', () => {
    expect(() => loadConfig({ ...valid, MAIL_DELIVERY: 'smtp' })).toThrow(
      /SMTP_HOST/,
    )
  })

  it('refuses to start in production with delivery switched off', () => {
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        MAIL_DELIVERY: 'none',
      }),
    ).toThrow(/nobody can log in/)
  })

  it('defaults to delivering nothing, so a dev run cannot email a real person', () => {
    expect(loadConfig(valid).mail.delivery).toBe('none')
  })
})

describe('CONSENT_VERSION', () => {
  it('defaults to the latest wording (R-ONB-3)', () => {
    expect(loadConfig(valid).consentVersion).toBe(latestConsentVersion)
  })

  it('refuses a version with no wording to show', () => {
    expect(() =>
      loadConfig({ ...valid, CONSENT_VERSION: '1999-01-01' }),
    ).toThrow(/no wording/)
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
      MAIL_DELIVERY: 'smtp',
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

describe('outbound message log settings', () => {
  it('pages the log 100 entries at a time unless told otherwise (R-MSG-5)', () => {
    expect(loadConfig(valid).limits.outboxPageSize).toBe(100)
  })

  it('bounds how long message records are kept', () => {
    expect(loadConfig(valid).limits.outboxRetentionDays).toBe(30)
  })

  it('lets retention be shortened without a code change', () => {
    const config = loadConfig({ ...valid, OUTBOX_RETENTION_DAYS: '7' })

    expect(config.limits.outboxRetentionDays).toBe(7)
  })
})

describe('profile text limits', () => {
  it('match the profile columns (R-AUTH-12, R-ONB-2)', () => {
    const { limits } = loadConfig(valid)

    expect(limits.nameMaxChars).toBe(120)
    expect(limits.jobTitleMaxChars).toBe(120)
    expect(limits.orgMaxChars).toBe(160)
    expect(limits.sectorMaxChars).toBe(160)
  })
})

describe('PUBLIC_URL in development', () => {
  it('defaults to Vite, which serves the screens', () => {
    expect(loadConfig(valid).publicUrl).toBe('http://localhost:5173')
  })

  it("refuses the API server's own port, saying what to use", () => {
    expect(() =>
      loadConfig({ ...valid, PUBLIC_URL: 'http://localhost:3000' }),
    ).toThrow(/use http:\/\/localhost:5173/)
    expect(() =>
      loadConfig({ ...valid, PORT: '80', PUBLIC_URL: 'http://localhost' }),
    ).toThrow(/PUBLIC_URL/)
  })

  it("allows the server's own address outside development", () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      MAIL_DELIVERY: 'smtp',
      SMTP_HOST: 'mail.example.org',
      PUBLIC_URL: 'https://match.example.org',
      PORT: '443',
    }

    expect(loadConfig(production).publicUrl).toBe('https://match.example.org')
  })
})

describe('isDevelopmentDeployment', () => {
  it('is true only for development with delivery off (R-DEV-1)', () => {
    const smtp = { MAIL_DELIVERY: 'smtp', SMTP_HOST: 'mail.example.org' }

    expect(isDevelopmentDeployment(loadConfig(valid))).toBe(true)
    expect(isDevelopmentDeployment(loadConfig({ ...valid, ...smtp }))).toBe(
      false,
    )
    expect(
      isDevelopmentDeployment(loadConfig({ ...valid, NODE_ENV: 'test' })),
    ).toBe(false)
    expect(
      isDevelopmentDeployment(
        loadConfig({ ...valid, ...smtp, NODE_ENV: 'production' }),
      ),
    ).toBe(false)
  })
})
