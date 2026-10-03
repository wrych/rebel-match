import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SECRET_BYTES = 32
const DEFAULT_DATA_DIR = '.data'

/** Whether a run is local: no database URL, so it is on PGlite, and not
 * production, which never runs without one (ADR 0024). */
export function isLocalRun(env: NodeJS.ProcessEnv): boolean {
  const url = env['DATABASE_URL']
  return (url === undefined || url === '') && env['NODE_ENV'] !== 'production'
}

async function readOrCreate(path: string): Promise<string> {
  try {
    return (await readFile(path, 'utf8')).trim()
  } catch {
    const secret = randomBytes(SECRET_BYTES).toString('hex')
    // Only the owner may read it; `wx` refuses to replace one that a parallel
    // start wrote first, and the read below then returns that one.
    await writeFile(path, `${secret}\n`, { mode: 0o600, flag: 'wx' }).catch(
      () => undefined,
    )
    return (await readFile(path, 'utf8')).trim()
  }
}

/** The environment with a session secret filled in for a local run that has
 * none: generated once, kept in the git-ignored data folder, never committed.
 * Any other run is returned untouched, so a deployment without its secret
 * still fails configuration (R-NFR-5, ADR 0024). */
export async function withLocalSessionSecret(
  env: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  if (!isLocalRun(env) || (env['SESSION_SECRET'] ?? '') !== '') return env

  const dir = env['LOCAL_DATA_DIR'] ?? DEFAULT_DATA_DIR
  await mkdir(dir, { recursive: true })
  const secret = await readOrCreate(join(dir, 'session-secret'))
  return { ...env, SESSION_SECRET: secret }
}
