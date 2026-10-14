import type { LocationQuery } from 'vue-router'
import {
  notificationKinds,
  type NotificationKind,
} from '../../src/services/notifications'

/** What an emailed notification's link carries: the kind it came from, null
 * when unknown, and the rest of the query; null without the mark (R-ANA-1). */
export function fromNotice(
  query: LocationQuery,
): { kind: NotificationKind | null; rest: LocationQuery } | null {
  if (!('notice' in query)) return null
  const { notice, ...rest } = query
  const kind = notificationKinds.find((each) => each === notice) ?? null
  return { kind, rest }
}
