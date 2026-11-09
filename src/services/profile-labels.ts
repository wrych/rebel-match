import { sql } from 'drizzle-orm'
import { companySizes, memberPhotos, members, sectors } from '../db/schema.js'
import type { PersonCard } from './person-card.js'

/** A member's sector as a card shows it: the label its key points to. */
export const sectorLabel = sql<
  string | null
>`(SELECT ${sectors.label} FROM ${sectors} WHERE ${sectors.key} = ${members.sector})`

/** A member's company size as a card shows it, such as "51–250 employees". */
export const companySizeLabel = sql<
  string | null
>`(SELECT ${companySizes.label} FROM ${companySizes} WHERE ${companySizes.key} = ${members.companySize})`

/** A member's photo key as a card carries it, or null without a photo
 * (R-PROF-7, ADR 0067). */
export const photoKey = sql<
  string | null
>`(SELECT ${memberPhotos.key} FROM ${memberPhotos} WHERE ${memberPhotos.memberId} = ${members.id})`

/** The columns every person card selects, and the one place they are named:
 * no email column is ever among them (R-CONN-6). */
export const cardColumns = {
  memberId: members.id,
  name: members.name,
  jobTitle: members.jobTitle,
  org: members.org,
  sector: sectorLabel,
  companySize: companySizeLabel,
  photo: photoKey,
} satisfies Record<keyof PersonCard, unknown>
