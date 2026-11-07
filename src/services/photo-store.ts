import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { isReachableMember } from '../db/member-predicates.js'
import { memberPhotos, members } from '../db/schema.js'
import type { PhotoStore } from './photo.js'

/** Profile photos over `member_photos` (design §2), one row per member. */
export function createPhotoStore(db: Database): PhotoStore {
  return {
    get: async (memberId) => {
      const [row] = await db
        .select({ jpeg: memberPhotos.jpeg, updatedAt: memberPhotos.updatedAt })
        .from(memberPhotos)
        .where(eq(memberPhotos.memberId, memberId))
      return row ?? null
    },
    byKey: async (key) => {
      const [row] = await db
        .select({ jpeg: memberPhotos.jpeg, updatedAt: memberPhotos.updatedAt })
        .from(memberPhotos)
        .innerJoin(members, eq(members.id, memberPhotos.memberId))
        .where(and(eq(memberPhotos.key, key), isReachableMember()))
      return row ?? null
    },
    set: async (memberId, jpeg, key) => {
      const updatedAt = new Date()
      await db
        .insert(memberPhotos)
        .values({ memberId, jpeg, key, updatedAt })
        .onConflictDoUpdate({
          target: memberPhotos.memberId,
          set: { jpeg, key, updatedAt },
        })
    },
    remove: async (memberId) => {
      await db.delete(memberPhotos).where(eq(memberPhotos.memberId, memberId))
    },
  }
}
