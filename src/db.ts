import mysql from 'mysql2/promise'
import type { Config } from './config.js'

export type Pool = mysql.Pool

/** The application's connection pool. `multipleStatements` stays off: the only
 * place that needs it is the migration runner, which opens its own connection. */
export function createPool(config: Config): Pool {
  return mysql.createPool({
    uri: config.databaseUrl,
    connectionLimit: 10,
    namedPlaceholders: true,
    multipleStatements: false,
    timezone: 'Z',
  })
}
