import { sql } from 'drizzle-orm'
import { companySizes, members, sectors } from '../db/schema.js'

/** A member's sector as a card shows it: the label its key points to. */
export const sectorLabel = sql<
  string | null
>`(SELECT ${sectors.label} FROM ${sectors} WHERE ${sectors.key} = ${members.sector})`

/** A member's company size as a card shows it, such as "51–250 employees". */
export const companySizeLabel = sql<
  string | null
>`(SELECT ${companySizes.label} FROM ${companySizes} WHERE ${companySizes.key} = ${members.companySize})`
