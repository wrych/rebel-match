import type { Config } from '../config.js'
import { connect, type Connection } from './connect.js'

/** The database the configuration names: Postgres, or local PGlite when no
 * URL is set (ADR 0024). */
export function openDatabase(
  config: Pick<Config, 'database'>,
): Promise<Connection> {
  return connect(config.database)
}
