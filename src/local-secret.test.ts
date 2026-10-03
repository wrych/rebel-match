import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isLocalRun, withLocalSessionSecret } from './local-secret.js'

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rebel-secret-'))
}

describe('isLocalRun', () => {
  it.each([
    [{}, true],
    [{ DATABASE_URL: '' }, true],
    [{ DATABASE_URL: 'postgres://db/app' }, false],
    [{ NODE_ENV: 'production' }, false],
  ])('reads %j as local: %s', (env, expected) => {
    expect(isLocalRun(env)).toBe(expected)
  })
})

describe('withLocalSessionSecret (ADR 0024)', () => {
  it('generates a secret once for a local run and keeps it', async () => {
    const dir = await scratch()
    const first = await withLocalSessionSecret({ LOCAL_DATA_DIR: dir })
    const second = await withLocalSessionSecret({ LOCAL_DATA_DIR: dir })

    expect(first['SESSION_SECRET']).toMatch(/^[0-9a-f]{64}$/)
    expect(second['SESSION_SECRET']).toBe(first['SESSION_SECRET'])
    expect((await readFile(join(dir, 'session-secret'), 'utf8')).trim()).toBe(
      first['SESSION_SECRET'],
    )
  })

  it('lets only the owner read the file', async () => {
    const dir = await scratch()
    await withLocalSessionSecret({ LOCAL_DATA_DIR: dir })

    expect((await stat(join(dir, 'session-secret'))).mode & 0o077).toBe(0)
  })

  it('keeps a secret the environment already gives', async () => {
    const dir = await scratch()
    const env = { LOCAL_DATA_DIR: dir, SESSION_SECRET: 'x'.repeat(32) }

    expect(await withLocalSessionSecret(env)).toBe(env)
  })

  it.each([
    [{ DATABASE_URL: 'postgres://db/app' }],
    [{ NODE_ENV: 'production' }],
  ])('never generates one outside a local run: %j', async (env) => {
    const dir = await scratch()

    expect(
      (await withLocalSessionSecret({ ...env, LOCAL_DATA_DIR: dir }))[
        'SESSION_SECRET'
      ],
    ).toBeUndefined()
  })
})
