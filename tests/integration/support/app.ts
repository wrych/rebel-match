import type { AuthProvider } from '../../../src/auth/index.js'
import { loadConfig, type Config } from '../../../src/config.js'
import { planSeed } from '../../../src/seed/plan.js'
import { applySeed } from '../../../src/seed/run.js'
import {
  openTestDatabase,
  testDatabaseUrl,
  type TestDatabase,
} from './database.js'

const TEST_SESSION_SECRET = 'integration-session-secret-of-32-chars'

/** Configuration for an integration test: the test database, a fixed session
 * secret and NODE_ENV=test, with `overrides` winning over all three. */
export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    DATABASE_URL: testDatabaseUrl,
    SESSION_SECRET: TEST_SESSION_SECRET,
    NODE_ENV: 'test',
    ...overrides,
  })
}

/** A migrated test database holding the seed `config` plans. */
export async function openSeededDatabase(
  config: Config,
): Promise<TestDatabase> {
  const db = await openTestDatabase()
  await applySeed(db.drizzle, planSeed(config), config.consentVersion)
  return db
}

/** The id of the member with `email`, as a string ("undefined" if none). */
export async function idOf(db: TestDatabase, email: string): Promise<string> {
  const rows = await db.query('SELECT id FROM members WHERE email = ?', [email])
  return String(rows[0]?.['id'])
}

/** A `Cookie` header value for a fresh session of `memberId`. */
export async function cookieFor(
  auth: Pick<AuthProvider, 'createSession'>,
  memberId: string,
): Promise<string> {
  const session = await auth.createSession(memberId)
  return `${session.name}=${session.value}`
}
