import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'
import { serverEnv } from './server-settings.js'

const valid = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/rebel_match',
  SESSION_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv

const variables = Object.keys(serverEnv)

function loads(env: NodeJS.ProcessEnv): boolean {
  try {
    loadConfig({ ...valid, ...env })
    return true
  } catch {
    return false
  }
}

describe("the server's numbers", () => {
  it.each(variables)(
    '%s refuses negatives, fractions and words (R-CFG-1)',
    (variable) => {
      for (const bad of ['-1', '1.5', 'often'])
        expect(() => loadConfig({ ...valid, [variable]: bad })).toThrow(
          variable,
        )
    },
  )

  it('allows zero only for the trusted proxies and the extra seconds of a game day', () => {
    expect(variables.filter((variable) => loads({ [variable]: '0' }))).toEqual([
      'TRUST_PROXY',
      'GAME_DAY_ALLOWANCE_SECONDS',
    ])
  })

  it('reads the notification worker, game day allowance and mail port where their users look (R-NOTE-10, R-GAME-20)', () => {
    const config = loadConfig({
      ...valid,
      NOTIFICATION_BATCH: '7',
      GAME_DAY_ALLOWANCE_FACTOR: '3',
      SMTP_PORT: '2525',
    })

    expect(config.notificationWorker.batch).toBe(7)
    expect(config.gameDayAllowance.factor).toBe(3)
    expect(config.mail.smtp.port).toBe(2525)
  })

  it('caps every timer so Node never clamps its delay to a millisecond', () => {
    const tooLong = {
      OUTBOX_PURGE_INTERVAL_HOURS: '597',
      ERASURE_SWEEP_INTERVAL_HOURS: '597',
      TOKEN_PURGE_INTERVAL_HOURS: '597',
      BADGE_CROWN_CHECK_MINUTES: '35792',
      NOTIFICATION_WORKER_SECONDS: '2147484',
    }
    for (const [variable, value] of Object.entries(tooLong))
      expect(loads({ [variable]: value })).toBe(false)
  })
})
