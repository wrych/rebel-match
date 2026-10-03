import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { lockFolder } from '../src/db/folder-lock.js'

// Deletes the local PGlite database so the next migrate rebuilds it from the
// migrations. Claiming the folder first refuses while a server still has it
// open. A Postgres in Docker is reset with `docker compose down -v` instead.
const dir = join(process.env['LOCAL_DATA_DIR'] ?? '.data', 'pglite')
const release = await lockFolder(dir)
try {
  await rm(dir, { recursive: true, force: true })
} finally {
  await release()
}
