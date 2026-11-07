import { eq } from 'drizzle-orm'
import type { Database } from '../db/connect.js'
import { memberPhotos, members } from '../db/schema.js'
import { isOptedIn } from './analytics-consent.js'
import type { SocialLinks } from '../social-links.js'
import type { ProfileStore } from './profile.js'

async function saveLinks(
  db: Database,
  memberId: string,
  links: SocialLinks,
): Promise<void> {
  await db
    .update(members)
    .set({ linkedinUrl: links.linkedin, instagramUrl: links.instagram })
    .where(eq(members.id, memberId))
}

/** Profiles over `members` (design §2), judged against the analytics words
 * in force. */
export function createProfileStore(
  db: Database,
  analyticsVersion: string,
): ProfileStore {
  return {
    own: async (memberId) => {
      const [found] = await db
        .select({ row: members, photoAt: memberPhotos.updatedAt })
        .from(members)
        .leftJoin(memberPhotos, eq(memberPhotos.memberId, members.id))
        .where(eq(members.id, memberId))
      if (found === undefined) return null
      const { row, photoAt } = found
      return {
        name: row.name,
        jobTitle: row.jobTitle,
        org: row.org,
        sector: row.sector,
        companySize: row.companySize,
        email: row.email,
        consentVersion: row.consentVersion,
        consentAt: row.consentAt?.toISOString() ?? null,
        analyticsOptIn: isOptedIn(row, analyticsVersion),
        findable: row.findable,
        photoAt: photoAt?.toISOString() ?? null,
        socialLinks: {
          linkedin: row.linkedinUrl,
          instagram: row.instagramUrl,
        },
      }
    },
    update: async (memberId, edit) => {
      await db
        .update(members)
        .set({
          name: edit.name,
          jobTitle: edit.jobTitle ?? null,
          org: edit.org ?? null,
          sector: edit.sector ?? null,
          companySize: edit.companySize ?? null,
        })
        .where(eq(members.id, memberId))
    },
    setFindable: async (memberId, findable) => {
      await db.update(members).set({ findable }).where(eq(members.id, memberId))
    },
    setSocialLinks: (memberId, links) => saveLinks(db, memberId, links),
  }
}
