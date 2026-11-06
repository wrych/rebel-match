import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { profileCodes } from '../db/schema.js'
import type { ProfileCode, ProfileCodeStore } from './profile-codes.js'

const shown = { token: profileCodes.token, enabled: profileCodes.enabled }

/** Profile codes over Postgres; one per member, its token unique. */
export function createProfileCodeStore(db: Database): ProfileCodeStore {
  const find = async (memberId: string): Promise<ProfileCode | null> => {
    const [row] = await db
      .select(shown)
      .from(profileCodes)
      .where(eq(profileCodes.memberId, memberId))
    return row ?? null
  }
  return {
    find,
    create: async (memberId, token) => {
      await db
        .insert(profileCodes)
        .values({ memberId, token })
        .onConflictDoNothing({ target: profileCodes.memberId })
      const held = await find(memberId)
      if (held === null) throw new Error('profile code not stored')
      return held
    },
    setEnabled: async (memberId, enabled) => {
      const [row] = await db
        .update(profileCodes)
        .set({ enabled })
        .where(eq(profileCodes.memberId, memberId))
        .returning(shown)
      return row ?? null
    },
    replaceToken: async (memberId, token) => {
      const [row] = await db
        .update(profileCodes)
        .set({ token, createdAt: new Date() })
        .where(eq(profileCodes.memberId, memberId))
        .returning(shown)
      return row ?? null
    },
    ownerOf: async (token) => {
      const [row] = await db
        .select({ memberId: profileCodes.memberId })
        .from(profileCodes)
        .where(
          and(eq(profileCodes.token, token), eq(profileCodes.enabled, true)),
        )
      return row?.memberId ?? null
    },
  }
}
