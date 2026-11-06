import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { members } from './schema.js'

/** Whether others can see and reach a member: active, with a name and a
 * consent of any version; a newer version pending blocks only their own use
 * (R-ONB-1, R-ONB-4). Takes the alias where a query names the table so. */
export function isReachableMember(
  table: { status: AnyColumn; name: AnyColumn; consentAt: AnyColumn } = members,
): SQL<boolean> {
  return sql<boolean>`(${table.status} = 'active' and ${table.name} is not null and ${table.consentAt} is not null)`
}
