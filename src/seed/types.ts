import type { RoleKey } from '../access.js'

export interface SeedRole {
  key: RoleKey
  label: string
  description: string
}

/** A member a seed creates, keyed by email (R-SEED-7). Seeded members arrive
 * active and onboarded, consent recorded at the version in force. */
export interface SeedMember {
  email: string
  name: string
  jobTitle: string
  org: string
  sector: string
  roles: RoleKey[]
}

/** One of the 8 Corporate Rebels trends, with the matcher's keywords
 * (design §5, §6.1). */
export interface SeedTrend {
  id: string
  short: string
  from: string
  peers: number
  keywords: { strong: string[]; weak: string[] }
}

/** A curated case study for a trend (design §6.2), keyed by trend and URL. */
export interface SeedCase {
  trendId: string
  org: string
  url: string
  takeaway: string
}

/** A seeded challenge, keyed by its author and text (design §6.3). */
export interface SeedChallenge {
  authorEmail: string
  trendId: string
  body: string
}

/** A member's "been there" offer for a trend (design §2, §6.3). */
export interface SeedExpertise {
  email: string
  trendId: string
  note: string
}

export interface SeedPlan {
  roles: SeedRole[]
  trends: SeedTrend[]
  cases: SeedCase[]
  members: SeedMember[]
  challenges: SeedChallenge[]
  expertise: SeedExpertise[]
}
