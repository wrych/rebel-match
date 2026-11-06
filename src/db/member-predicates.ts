import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { members } from './schema.js'

/** Whether a member can be reached: active and onboarded, a name being what
 * makes a row a person (R-ONB-1). Consent is not checked. Takes the alias
 * where a query names the table so. */
export function isReachableMember(
  table: { status: AnyColumn; name: AnyColumn } = members,
): SQL<boolean> {
  return sql<boolean>`(${table.status} = 'active' and ${table.name} is not null)`
}
