import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lockFolder } from './folder-lock.js'

async function scratch(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'rebel-lock-')), 'pglite')
}

// The parent of the test runner is alive and is not this process.
const otherLivePid = process.ppid

describe('lockFolder', () => {
  it('claims the folder and lets it go', async () => {
    const dir = await scratch()
    const release = await lockFolder(dir)
    expect(await readFile(`${dir}.lock`, 'utf8')).toBe(String(process.pid))

    await release()
    await expect(readFile(`${dir}.lock`, 'utf8')).rejects.toThrow()
  })

  it('refuses a folder another live process holds (ADR 0024)', async () => {
    const dir = await scratch()
    await writeFile(`${dir}.lock`, String(otherLivePid))

    await expect(lockFolder(dir)).rejects.toThrow(/in use by process/)
  })

  it('takes over a lock its holder left behind when it died', async () => {
    const dir = await scratch()
    await writeFile(`${dir}.lock`, '999999999')

    const release = await lockFolder(dir)
    expect(await readFile(`${dir}.lock`, 'utf8')).toBe(String(process.pid))
    await release()
  })

  it('never leaves a half-written lock for another process to read', async () => {
    const dir = await scratch()
    const release = await lockFolder(dir)

    expect(await readFile(`${dir}.lock`, 'utf8')).toBe(String(process.pid))
    await release()
  })

  it('treats an unreadable lock as abandoned and takes it over', async () => {
    const dir = await scratch()
    await writeFile(`${dir}.lock`, '')

    const release = await lockFolder(dir)
    expect(await readFile(`${dir}.lock`, 'utf8')).toBe(String(process.pid))
    await release()
  })

  it('leaves no scratch files beside the folder', async () => {
    const dir = await scratch()
    await writeFile(`${dir}.lock`, '999999999')
    const release = await lockFolder(dir)
    await release()

    expect(await readdir(dirname(dir))).toEqual([])
  })

  it('leaves alone a lock someone else has since taken', async () => {
    const dir = await scratch()
    const release = await lockFolder(dir)
    await writeFile(`${dir}.lock`, String(otherLivePid))

    await release()
    expect(await readFile(`${dir}.lock`, 'utf8')).toBe(String(otherLivePid))
  })
})
