import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'staging-image.sh')
const REPO = 'europe-west6-docker.pkg.dev/nonprod/rebel-match'
const SERVED = `sha256:${'b'.repeat(64)}`
const EARLIER = `sha256:${'c'.repeat(64)}`

// Stands in for gcloud: staging's service as JSON, and the image of whichever
// revision is asked about, from the environment.
const FAKE_GCLOUD = `#!/usr/bin/env bash
case "$*" in
  *"services describe"*) echo "$FAKE_SERVICE" ;;
  *"revisions describe $FAKE_REVISION "*) echo "$FAKE_IMAGE" ;;
esac
`

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'staging-image-'))
  await writeFile(join(dir, 'gcloud'), FAKE_GCLOUD)
  await chmod(join(dir, 'gcloud'), 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function image(env: Record<string, string>): Promise<string> {
  const output = join(dir, 'output')
  await writeFile(output, '')
  await promisify(execFile)('bash', [SCRIPT], {
    env: {
      PATH: `${dir}:${process.env['PATH'] ?? ''}`,
      GITHUB_OUTPUT: output,
      GCP_IMAGE_REPO: REPO,
      GCP_REGION: 'europe-west6',
      FAKE_REVISION: 'rebel-match-staging-00042',
      FAKE_IMAGE: `${REPO}/app@${SERVED}`,
      ...env,
    },
  })
  return (await readFile(output, 'utf8')).trim()
}

const service = (
  traffic: object[],
  latest = 'rebel-match-staging-00042',
): string =>
  JSON.stringify({ status: { traffic, latestReadyRevisionName: latest } })

describe('staging-image.sh (ADR 0025, ADR 0044)', () => {
  it('names the image the revision serving all of staging runs', async () => {
    expect(
      await image({
        FAKE_SERVICE: service(
          [{ revisionName: 'rebel-match-staging-00042', percent: 100 }],
          'rebel-match-staging-00043',
        ),
      }),
    ).toBe(`image=${REPO}/app@${SERVED}`)
  })

  it('falls back to the latest ready revision when traffic follows it', async () => {
    expect(
      await image({
        FAKE_SERVICE: service([{ latestRevision: true, percent: 100 }]),
      }),
    ).toBe(`image=${REPO}/app@${SERVED}`)
  })

  it('names an earlier digest given to roll back to', async () => {
    expect(await image({ DIGEST: EARLIER, FAKE_SERVICE: '{}' })).toBe(
      `image=${REPO}/app@${EARLIER}`,
    )
  })

  it('refuses something that is not a digest', async () => {
    await expect(
      image({ DIGEST: 'latest', FAKE_SERVICE: '{}' }),
    ).rejects.toThrow()
  })

  it('refuses when staging serves nothing', async () => {
    await expect(
      image({ FAKE_SERVICE: JSON.stringify({ status: {} }) }),
    ).rejects.toThrow()
  })
})
