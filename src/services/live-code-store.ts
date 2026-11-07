import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { isReachableMember } from '../db/member-predicates.js'
import { connectionRequests as r, liveCodes, members } from '../db/schema.js'
import { acceptPendingBetween, between } from './connection-store.js'
import type { LiveCodeStore, LiveCodeTimes } from './live-codes.js'
import { insertNotification } from './notification-store.js'

const seconds = (n: number): ReturnType<typeof sql> =>
  sql`now() + make_interval(secs => ${n})`

const activeAndOnboarded = (memberId: unknown): ReturnType<typeof sql> =>
  sql`exists (select 1 from ${members} where ${members.id} = ${memberId} and ${isReachableMember()})`

async function cutOlder(
  tx: Database,
  memberId: string,
  times: LiveCodeTimes,
): Promise<void> {
  await tx
    .update(liveCodes)
    .set({
      usableUntil: sql`least(${liveCodes.usableUntil}, ${seconds(times.graceSeconds)})`,
    })
    .where(and(eq(liveCodes.memberId, memberId), isNull(liveCodes.spentAt)))
}

async function takeConnected(
  tx: Database,
  memberId: string,
): Promise<{ name: string }[]> {
  const spent = await tx
    .update(liveCodes)
    .set({ reportedAt: sql`now()` })
    .where(
      and(
        eq(liveCodes.memberId, memberId),
        isNotNull(liveCodes.spentAt),
        isNull(liveCodes.reportedAt),
      ),
    )
    .returning({ spentBy: liveCodes.spentBy })
  const ids = spent.flatMap((row) =>
    row.spentBy === null ? [] : [row.spentBy],
  )
  if (ids.length === 0) return []
  const rows = await tx
    .select({ name: members.name })
    .from(members)
    .where(inArray(members.id, ids))
  return rows.flatMap((row) => (row.name === null ? [] : [{ name: row.name }]))
}

// One statement spends the code, so two scans cannot both win, and only
// while owner and scanner are both active and onboarded (R-CODE-6,
// R-CODE-10).
async function spend(
  tx: Database,
  scannerId: string,
  tokenHash: string,
): Promise<string | null> {
  const [spent] = await tx
    .update(liveCodes)
    .set({ spentAt: sql`now()`, spentBy: scannerId })
    .where(
      and(
        eq(liveCodes.tokenHash, tokenHash),
        isNull(liveCodes.spentAt),
        sql`${liveCodes.usableUntil} > now()`,
        sql`${liveCodes.memberId} <> ${scannerId}`,
        activeAndOnboarded(liveCodes.memberId),
        activeAndOnboarded(scannerId),
      ),
    )
    .returning({ ownerId: liveCodes.memberId })
  return spent?.ownerId ?? null
}

// Held to the end of the transaction, so two members scanning each other's
// codes at once connect once, not twice (R-CODE-6).
async function lockPair(tx: Database, a: string, b: string): Promise<void> {
  const pair = [a, b].sort().join(':')
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pair}))`)
}

async function directBetween(
  tx: Database,
  a: string,
  b: string,
  status: 'accepted' | 'pending',
): Promise<string | null> {
  const [row] = await tx
    .select({ id: r.id })
    .from(r)
    .where(and(between(a, b), eq(r.kind, 'direct'), eq(r.status, status)))
    .limit(1)
  return row?.id ?? null
}

// A pending direct request between the two is accepted instead of adding
// another; with every other pending one, as R-CONN-11 does (R-CODE-6).
async function connect(
  tx: Database,
  scannerId: string,
  ownerId: string,
  newId: string,
): Promise<string> {
  const pending = await directBetween(tx, scannerId, ownerId, 'pending')
  if (pending === null)
    await tx.insert(r).values({
      id: newId,
      requesterId: scannerId,
      targetId: ownerId,
      challengeId: null,
      kind: 'direct',
      message: null,
      status: 'accepted',
      respondedAt: sql`now()`,
      requesterSeenAt: sql`now()`,
    })
  await acceptPendingBetween(tx, scannerId, ownerId)
  const id = pending ?? newId
  await insertNotification(tx, {
    recipientId: ownerId,
    type: 'new_connection',
    aboutMemberId: scannerId,
    connectionId: id,
  })
  return id
}

/** Live codes over Postgres: only hashes are stored, as for sign-in tokens
 * (R-NFR-5, ADR 0063). */
export function createLiveCodeStore(db: Database): LiveCodeStore {
  return {
    issue: (memberId, tokenHash, times) =>
      db.transaction(async (tx) => {
        await cutOlder(tx, memberId, times)
        const [stored] = await tx
          .insert(liveCodes)
          .values({
            tokenHash,
            memberId,
            usableUntil: seconds(times.seconds + times.graceSeconds),
          })
          .returning({ usableUntil: liveCodes.usableUntil })
        if (stored === undefined) throw new Error('live code not stored')
        return { ...stored, connected: await takeConnected(tx, memberId) }
      }),
    redeem: (scannerId, tokenHash, newId) =>
      db.transaction(async (tx) => {
        const ownerId = await spend(tx, scannerId, tokenHash)
        if (ownerId === null) return null
        await lockPair(tx, scannerId, ownerId)
        const joined = await directBetween(tx, scannerId, ownerId, 'accepted')
        return joined ?? connect(tx, scannerId, ownerId, newId)
      }),
    purge: async (keepMinutes) => {
      const gone = await db
        .delete(liveCodes)
        .where(
          or(
            and(
              isNull(liveCodes.spentAt),
              lt(liveCodes.usableUntil, sql`now()`),
            ),
            isNotNull(liveCodes.reportedAt),
            lt(
              liveCodes.spentAt,
              sql`now() - make_interval(mins => ${keepMinutes})`,
            ),
          ),
        )
        .returning({ tokenHash: liveCodes.tokenHash })
      return gone.length
    },
  }
}
