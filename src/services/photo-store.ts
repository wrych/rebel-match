import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberPhotos } from '../db/schema.js'
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
    set: async (memberId, jpeg) => {
      const updatedAt = new Date()
      await db
        .insert(memberPhotos)
        .values({ memberId, jpeg, updatedAt })
        .onConflictDoUpdate({
          target: memberPhotos.memberId,
          set: { jpeg, updatedAt },
        })
    },
    remove: async (memberId) => {
      await db.delete(memberPhotos).where(eq(memberPhotos.memberId, memberId))
    },
  }
}
