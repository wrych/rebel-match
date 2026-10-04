import { createHash, randomBytes } from 'node:crypto'
import type { Limits } from '../config.js'
import { MS_PER_MINUTE } from '../time.js'
import type { TokenRecord } from './store.js'
import type { LinkKind } from './types.js'

const SECRET_BYTES = 32
const MS_PER_HOUR = 60 * MS_PER_MINUTE

/** A fresh unguessable secret, URL-safe so it can sit in a link or a cookie. */
export function newSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url')
}

/** What is stored in place of a secret, so a database read cannot sign anyone
 * in (R-NFR-5). */
export function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** How long a link of this kind stays usable. Approval links were not asked
 * for, so they outlive self-service ones (R-AUTH-5, R-AUTH-10). */
export function linkLifetimeMs(kind: LinkKind, limits: Limits): number {
  return kind === 'approval'
    ? limits.approvalLinkTtlHours * MS_PER_HOUR
    : limits.magicLinkTtlMinutes * MS_PER_MINUTE
}

export type TokenVerdict = 'valid' | 'used' | 'expired'

/** Whether a presented token may sign someone in now (R-AUTH-5, R-AUTH-6). A
 * used token reads as used even once it has also expired. */
export function judgeToken(token: TokenRecord, now: Date): TokenVerdict {
  if (token.usedAt !== null) return 'used'
  if (token.expiresAt.getTime() <= now.getTime()) return 'expired'

  return 'valid'
}
