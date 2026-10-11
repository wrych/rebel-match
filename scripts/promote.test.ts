import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'promote.sh')
const DIGEST = `sha256:${'a'.repeat(64)}`
const RUN_APP = 'https://rebel-match-42.europe-west6.run.app'

// Stand in for gcloud and curl: every gcloud call is logged, one per line
// with its arguments tab-separated; the service's URL and health come from
// the environment.
const FAKE_GCLOUD = `#!/usr/bin/env bash
(IFS=$'\\t'; echo "$*") >> "$GCLOUD_LOG"
[[ "$*" == *"services describe"* ]] && echo "$FAKE_URL"
exit 0
`
const FAKE_CURL = `#!/usr/bin/env bash
echo "$FAKE_HEALTH"
`

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'promote-'))
  await writeFile(join(dir, 'gcloud'), FAKE_GCLOUD)
  await writeFile(join(dir, 'curl'), FAKE_CURL)
  await chmod(join(dir, 'gcloud'), 0o755)
  await chmod(join(dir, 'curl'), 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const base = {
  IMAGE: `europe-west6-docker.pkg.dev/np/rebel-match/app@${DIGEST}`,
  GCP_PROJECT: 'prod',
  GCP_REGION: 'europe-west6',
  GCP_SQL_INSTANCE: 'prod:europe-west6:rebel-match',
  GCP_RUN_SA: 'rebel-match-run@prod.iam.gserviceaccount.com',
  GCP_PROJECT_NUMBER: '42',
  SMTP_HOST: 'asmtp.mail.example.org',
  SMTP_USER: 'hello@example.org',
  MAIL_FROM: 'hello@example.org',
  FEEDBACK_TO: 'team@example.org',
  FAKE_URL: RUN_APP,
  FAKE_HEALTH: '{"status":"ok","database":"up"}',
  HEALTH_WAIT_SECONDS: '0',
}

interface Call {
  args: string[]
  flag(name: string): string | undefined
}

async function promote(
  env: Record<string, string> = {},
): Promise<{ calls: Call[]; failed: boolean }> {
  const log = join(dir, 'gcloud.log')
  await writeFile(log, '')
  let failed = false
  try {
    await promisify(execFile)('bash', [SCRIPT], {
      env: {
        PATH: `${dir}:${process.env['PATH'] ?? ''}`,
        GCLOUD_LOG: log,
        ...base,
        ...env,
      },
    })
  } catch {
    failed = true
  }
  const calls = (await readFile(log, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const args = line.split('\t')
      return {
        args,
        flag: (name: string) =>
          args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3),
      }
    })
  return { calls, failed }
}

const deploy = (calls: Call[]): Call | undefined =>
  calls.find((c) => c.args.includes('deploy') && c.args.includes('rebel-match'))
const envOf = (call: Call | undefined): string[] =>
  (call?.flag('set-env-vars') ?? '').replace(/^\^\|\^/, '').split('|')

describe('promote.sh (ADR 0025)', () => {
  it("migrates and seeds, then deploys with production's configuration", async () => {
    const { calls, failed } = await promote()

    expect(failed).toBe(false)
    const prepare = calls.findIndex((c) =>
      c.args.includes('prepare-production'),
    )
    const service = calls.findIndex((c) => c === deploy(calls))
    expect(prepare).toBeGreaterThanOrEqual(0)
    expect(service).toBeGreaterThan(prepare)
    expect(envOf(deploy(calls))).toEqual(
      expect.arrayContaining([
        'NODE_ENV=production',
        'MAIL_DELIVERY=smtp',
        'SEED_PROFILE=prod',
        'TRUST_PROXY=1',
        `PUBLIC_URL=${RUN_APP}`,
        'SMTP_PORT=587',
        'MAIL_FROM=hello@example.org',
      ]),
    )
    expect(deploy(calls)?.flag('set-secrets')).toBe(
      'DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,SMTP_PASSWORD=smtp-password:latest',
    )
    expect(deploy(calls)?.flag('min-instances')).toBe('1')
    expect(deploy(calls)?.flag('max-instances')).toBe('2')
  })

  it('keeps the timers, and CPU allocated, without a tick', async () => {
    const service = deploy((await promote()).calls)

    expect(service?.args).toContain('--no-cpu-throttling')
    expect(envOf(service).some((v) => v.startsWith('SCHEDULED_WORK'))).toBe(
      false,
    )
  })

  it('hands the work to the tick, and bills per request, with TICK_INVOKER (ADR 0049)', async () => {
    const service = deploy(
      (
        await promote({
          TICK_INVOKER: 'scheduler-tick@prod.iam.gserviceaccount.com',
        })
      ).calls,
    )

    expect(service?.args).toContain('--cpu-throttling')
    expect(envOf(service)).toEqual(
      expect.arrayContaining([
        'SCHEDULED_WORK=tick',
        'TICK_INVOKER=scheduler-tick@prod.iam.gserviceaccount.com',
        `TICK_AUDIENCE=${RUN_APP}`,
      ]),
    )
  })

  it('keeps the admins whole, commas and all (R-SEED-9)', async () => {
    const service = deploy(
      (await promote({ SEED_ADMINS: 'ada@example.org,bob@example.org' })).calls,
    )

    expect(envOf(service)).toContain(
      'SEED_ADMINS=ada@example.org,bob@example.org',
    )
  })

  it('points links at the domain once PUBLIC_URL names it', async () => {
    const service = deploy(
      (await promote({ PUBLIC_URL: 'https://rebel-match.example.org' })).calls,
    )

    expect(envOf(service)).toContain(
      'PUBLIC_URL=https://rebel-match.example.org',
    )
  })

  it('fails when production does not report its database up', async () => {
    const { failed } = await promote({
      FAKE_HEALTH: '{"status":"ok","database":"down"}',
    })

    expect(failed).toBe(true)
  })

  it('refuses an image named by tag rather than by digest', async () => {
    const { calls, failed } = await promote({
      IMAGE: 'europe-west6-docker.pkg.dev/np/rebel-match/app:latest',
    })

    expect(failed).toBe(true)
    expect(calls).toEqual([])
  })
})
