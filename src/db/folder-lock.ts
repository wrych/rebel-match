import {
  link,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname } from 'node:path'

/** Thrown when another live process has the folder open. */
export class FolderInUseError extends Error {
  constructor(
    readonly dir: string,
    readonly pid: number,
  ) {
    super(
      `${dir} is in use by process ${String(pid)}: PGlite allows one ` +
        'process per folder, so stop that one first',
    )
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as { code?: unknown }).code === 'EPERM'
  }
}

async function holder(lockPath: string): Promise<number | null> {
  try {
    const pid = Number((await readFile(lockPath, 'utf8')).trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

// Puts the lock in place in one step: a hard link of a file that already
// holds our pid either appears whole or fails because a lock exists, so no
// one ever reads a lock half-written.
async function claim(lockPath: string, ours: string): Promise<boolean> {
  try {
    await link(ours, lockPath)
    return true
  } catch {
    return false
  }
}

// Takes a lock whose holder died. Renaming it away is atomic, so of two
// processes doing this only one gets the file; it then checks it really was
// the dead holder's before discarding it, and both race for a fresh claim.
async function takeOver(
  lockPath: string,
  ours: string,
  dir: string,
): Promise<void> {
  const aside = `${ours}.stale`
  const moved = await rename(lockPath, aside).then(
    () => true,
    () => false,
  )
  if (moved) {
    const pid = await holder(aside)
    if (pid !== null && pid !== process.pid && isAlive(pid)) {
      await claim(lockPath, aside)
      await unlink(aside)
      throw new FolderInUseError(dir, pid)
    }
    await unlink(aside)
  }
  if (await claim(lockPath, ours)) return
  const pid = (await holder(lockPath)) ?? 0
  throw new FolderInUseError(dir, pid)
}

/** Claims a PGlite data folder for this process. PGlite runs one process per
 * folder, so a second one (a CLI while the server runs) is refused rather
 * than allowed to corrupt it; a lock left by a process that died is taken
 * over. Returns the release. */
export async function lockFolder(dir: string): Promise<() => Promise<void>> {
  const lockPath = `${dir}.lock`
  await mkdir(dirname(lockPath), { recursive: true })
  const ours = `${lockPath}.${String(process.pid)}`
  await writeFile(ours, String(process.pid))

  try {
    if (!(await claim(lockPath, ours))) {
      const pid = await holder(lockPath)
      if (pid !== null && pid !== process.pid && isAlive(pid)) {
        throw new FolderInUseError(dir, pid)
      }
      if (pid !== process.pid) await takeOver(lockPath, ours, dir)
    }
  } finally {
    await unlink(ours)
  }

  return async () => {
    if ((await holder(lockPath)) === process.pid) await unlink(lockPath)
  }
}
