import type { Config } from '../config.js'
import { connect, type Connection } from './connect.js'

/** The database the configuration names (ADR 0024). */
export function openDatabase(
  config: Pick<Config, 'databaseUrl'>,
): Promise<Connection> {
  return connect({ kind: 'postgres', url: config.databaseUrl })
}
