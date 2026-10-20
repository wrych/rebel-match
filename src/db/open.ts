import type { Config } from '../config.js'
import {
  connect,
  type Connection,
  type OnIdleConnectionLost,
} from './connect.js'

/** The database the configuration names: Postgres, or local PGlite when no
 * URL is set (ADR 0024). */
export function openDatabase(
  config: Pick<Config, 'database'>,
  onIdleConnectionLost?: OnIdleConnectionLost,
): Promise<Connection> {
  return connect(config.database, onIdleConnectionLost)
}
