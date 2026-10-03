import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_LOCAL_DATA_DIR } from '../src/config.js'
import { lockFolder } from '../src/db/folder-lock.js'

// Deletes the local PGlite database so the next migrate rebuilds it from the
// migrations. Claiming the folder first refuses while a server still has it
// open. A Postgres in Docker is reset with `docker compose down -v` instead.
const dir = join(
  process.env['LOCAL_DATA_DIR'] ?? DEFAULT_LOCAL_DATA_DIR,
  'pglite',
)
const release = await lockFolder(dir)
try {
  await rm(dir, { recursive: true, force: true })
} finally {
  await release()
}
