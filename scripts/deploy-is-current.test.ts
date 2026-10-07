import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'deploy-is-current.sh')

// Stands in for the GitHub CLI: answers main's head and the pull request from
// the environment, as the API would.
const FAKE_GH = `#!/usr/bin/env bash
case "$2" in
  */git/ref/heads/main) echo "$FAKE_MAIN" ;;
  */pulls/*) echo "$FAKE_PR" ;;
esac
`

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'deploy-is-current-'))
  await writeFile(join(dir, 'gh'), FAKE_GH)
  await chmod(join(dir, 'gh'), 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function isCurrent(env: Record<string, string>): Promise<string> {
  const output = join(dir, 'output')
  await writeFile(output, '')
  await promisify(execFile)('bash', [SCRIPT], {
    env: {
      PATH: `${dir}:${process.env['PATH'] ?? ''}`,
      REPO: 'owner/repo',
      GITHUB_OUTPUT: output,
      PR: '',
      ...env,
    },
  })
  return (await readFile(output, 'utf8')).trim()
}

const pullRequest = (state: string, head: string, labels: string[]): string =>
  JSON.stringify({
    state,
    head: { sha: head },
    labels: labels.map((name) => ({ name })),
  })

describe('deploy-is-current, for staging', () => {
  it("deploys main's head", async () => {
    expect(await isCurrent({ SHA: 'aaa', FAKE_MAIN: 'aaa' })).toBe(
      'current=true',
    )
  })

  it('skips a commit main has moved past', async () => {
    expect(await isCurrent({ SHA: 'aaa', FAKE_MAIN: 'bbb' })).toBe(
      'current=false',
    )
  })
})

describe('deploy-is-current, for a preview', () => {
  const preview = async (pr: string): Promise<string> =>
    isCurrent({ SHA: 'aaa', PR: '7', FAKE_PR: pr })

  it("deploys an open, labelled pull request's head", async () => {
    expect(await preview(pullRequest('open', 'aaa', ['preview']))).toBe(
      'current=true',
    )
  })

  it('skips a commit the pull request has moved past', async () => {
    expect(await preview(pullRequest('open', 'bbb', ['preview']))).toBe(
      'current=false',
    )
  })

  it('skips a closed pull request, whose preview is being cleaned up', async () => {
    expect(await preview(pullRequest('closed', 'aaa', ['preview']))).toBe(
      'current=false',
    )
  })

  it('skips a pull request whose preview label came off', async () => {
    expect(await preview(pullRequest('open', 'aaa', ['other']))).toBe(
      'current=false',
    )
  })
})
